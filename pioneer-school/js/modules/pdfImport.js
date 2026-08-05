// pdfImport.js — извлечение табличных данных из PDF (pdf.js).
//
// ВАЖНО (по итогам разбора реальных сбоев импорта, см. CHANGELOG v1.3.0):
// Первая версия этого модуля определяла границы столбцов только по координатам X
// элементов ЗАГОЛОВОЧНОЙ строки. На практике это ломается по двум причинам,
// подтверждённым на тестовых PDF:
//   1) pdf.js иногда склеивает текст СОСЕДНИХ ячеек в один элемент без пробела
//      (например, длинное имя "заезжает" в текстовый поток соседней ячейки) —
//      тогда одна ячейка "съедает" данные другой.
//   2) Сама заголовочная строка может быть склеена в один элемент — тогда старый
//      алгоритм вообще не находил границ столбцов и весь документ схлопывался
//      в одну колонку.
//
// Решение: определять границы столбцов по РЕАЛЬНЫМ линиям таблицы (векторным
// линиям сетки, которые PDF рисует как графические примитивы, а не по тексту).
// Это не зависит от того, как именно текстовый поток PDF расставил текст, и
// устойчиво к обеим проблемам выше. Если линий сетки нет (документ без рамок),
// используется резервная эвристика по столбцу заголовка — хуже, но всё ещё
// рабочая для простых документов. В обоих случаях ячейки, чей текстовый элемент
// физически пересекает границу столбца (то есть, вероятно, содержит "склейку"
// двух ячеек), помечаются как anomaly — это единственный сбой, который в принципе
// невозможно исправить автоматически (данные утеряны уже в самом PDF), поэтому
// такие ячейки явно подсвечиваются пользователю для ручной проверки перед импортом.

const PdfImport = {
  async extractTable(file) {
    if (!window.pdfjsLib) throw new Error(T('ps.imp.biblioteka_dlya_chteniya_pdf'));
    const OPS = window.pdfjsLib.OPS;
    const NUM_ARGS = {
      [OPS.moveTo]: 2, [OPS.lineTo]: 2, [OPS.curveTo]: 6, [OPS.rectangle]: 4, [OPS.closePath]: 0
    };

    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

    const allRows = [];
    const verticalLines = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);

      // ---- текстовый слой ----
      const content = await page.getTextContent();
      const items = content.items
        .map((it) => ({
          text: this._clean(it.str),
          x: it.transform[4],
          y: it.transform[5],
          width: it.width || (it.str.length * 5)
        }))
        .filter((it) => it.text !== '');

      if (items.length) {
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const tolerance = 4;
        const pageRows = [];
        items.forEach((it) => {
          let row = pageRows.find((r) => Math.abs(r.y - it.y) <= tolerance);
          if (!row) { row = { y: it.y, items: [], page: p }; pageRows.push(row); }
          row.items.push(it);
        });
        pageRows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
        allRows.push(...pageRows);
      }

      // ---- векторные линии сетки (для определения истинных границ столбцов) ----
      const opList = await page.getOperatorList();
      let stack = [];
      let ctm = [1, 0, 0, 1, 0, 0];
      let cur = null, start = null;
      const mul = (a, b) => [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]
      ];
      const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      const checkSeg = (a, b) => {
        if (!a || !b) return;
        if (Math.abs(a[0] - b[0]) < 0.3 && Math.abs(a[1] - b[1]) > 3) {
          verticalLines.push((a[0] + b[0]) / 2);
        }
      };

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === OPS.transform) ctm = mul(args, ctm);
        else if (fn === OPS.constructPath) {
          const [ops, coords] = args;
          let ptr = 0;
          ops.forEach((op) => {
            const n = NUM_ARGS[op] ?? 0;
            if (op === OPS.rectangle) {
              const [x, y, w, h] = coords.slice(ptr, ptr + 4);
              const pts = [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h), apply(ctm, x, y)];
              for (let k = 0; k < 4; k++) checkSeg(pts[k], pts[k + 1]);
            } else if (op === OPS.moveTo) {
              const [x, y] = coords.slice(ptr, ptr + 2);
              cur = apply(ctm, x, y); start = cur;
            } else if (op === OPS.lineTo) {
              const [x, y] = coords.slice(ptr, ptr + 2);
              const p2 = apply(ctm, x, y);
              checkSeg(cur, p2);
              cur = p2;
            } else if (op === OPS.closePath) {
              if (cur && start) checkSeg(cur, start);
            }
            ptr += n;
          });
        }
      }
    }

    if (!allRows.length) return { headers: [], rows: [], anomalies: [], usedLineDetection: false };

    // ---- границы столбцов: сначала пробуем реальные линии сетки ----
    const sortedX = [...verticalLines].sort((a, b) => a - b);
    const lineBoundaries = [];
    sortedX.forEach((x) => {
      if (!lineBoundaries.length || x - lineBoundaries[lineBoundaries.length - 1] > 1.5) lineBoundaries.push(x);
    });

    let colRanges;
    let usedLineDetection = false;
    if (lineBoundaries.length >= 3) {
      colRanges = [];
      for (let i = 0; i < lineBoundaries.length - 1; i++) colRanges.push([lineBoundaries[i], lineBoundaries[i + 1]]);
      usedLineDetection = true;
    } else {
      // Резервный вариант: линий сетки нет (документ без рамок таблицы) —
      // используем позиции элементов заголовочной строки, как раньше.
      // Менее надёжно, поэтому пользователь обязательно должен проверить результат.
      const headerRow = allRows[0];
      colRanges = headerRow.items.map((it, idx) => {
        const nextX = headerRow.items[idx + 1] ? headerRow.items[idx + 1].x : Infinity;
        return [it.x - 20, (it.x + nextX) / 2];
      });
      if (!colRanges.length) colRanges = [[-Infinity, Infinity]];
    }

    function columnIndexFor(x, width) {
      const mid = x + width / 2;
      for (let k = 0; k < colRanges.length; k++) {
        if (mid >= colRanges[k][0] && mid <= colRanges[k][1]) return k;
      }
      let best = 0, bestDist = Infinity;
      colRanges.forEach((r, k) => {
        const d = Math.min(Math.abs(mid - r[0]), Math.abs(mid - r[1]));
        if (d < bestDist) { bestDist = d; best = k; }
      });
      return best;
    }

    function rowToCells(row) {
      const cells = new Array(colRanges.length).fill('');
      const anomalies = new Array(colRanges.length).fill(false);
      row.items.forEach((it) => {
        const col = columnIndexFor(it.x, it.width);
        // если сам текстовый элемент физически пересекает границу столбца —
        // вероятная склейка содержимого двух ячеек в одну строку PDF.
        const startCol = columnIndexFor(it.x, 0);
        const endCol = columnIndexFor(it.x + it.width, 0);
        if (startCol !== endCol) anomalies[col] = true;
        cells[col] = cells[col] ? cells[col] + ' ' + it.text : it.text;
      });
      return { cells, anomalies };
    }

    const headerResult = rowToCells(allRows[0]);
    const headers = headerResult.cells.map((h, i) => h || T('ps.imp.column_n', { n: i + 1 }));

    const dataRowsRaw = allRows.slice(1).map(rowToCells);
    const rows = [];
    const anomalies = [];
    dataRowsRaw.forEach((r) => {
      const isBlank = r.cells.every((c) => c.trim() === '');
      if (isBlank) return;
      // Повторяющаяся на следующих страницах шапка таблицы — пропускаем как данные,
      // чтобы не создать "учащегося" с именем вроде T('ps.ui.familiya').
      const isRepeatedHeader = r.cells.every((c, i) => this._normEq(c, headerResult.cells[i]));
      if (isRepeatedHeader) return;
      rows.push(r.cells);
      anomalies.push(r.anomalies);
    });

    return { headers, rows, anomalies, usedLineDetection };
  },

  // Убирает артефакты, часто встречающиеся в PDF: неразрывные пробелы, мягкие
  // переносы, разные формы Unicode-нормализации кириллицы — иначе сопоставление
  // заголовков со столбцами приложения может не сработать даже при визуально
  // одинаковом тексте.
  _clean(str) {
    return String(str || '')
      .replace(/\u00AD/g, '')        // мягкий перенос
      .replace(/[\u00A0\u2007\u202F]/g, ' ') // неразрывные пробелы → обычный
      .normalize('NFC')
      .trim();
  },

  _normEq(a, b) {
    return this._clean(a).toLowerCase() === this._clean(b).toLowerCase();
  }
};

window.PdfImport = PdfImport;
