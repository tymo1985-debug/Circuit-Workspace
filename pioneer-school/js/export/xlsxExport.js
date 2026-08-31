// xlsxExport.js — настоящий .xlsx (SheetJS), догружается по требованию.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ (30.08.2026, находка N-3). Эта функция жила в
// excelExport.js рядом с тремя выгрузками CSV. SheetJS весит 864 КБ и нужен
// только ей; пока файл был один, ленивым пришлось бы делать весь модуль
// выгрузок — и скачивание обычного CSV тянуло бы за собой всю библиотеку.
// Поэтому разрез прошёл ровно по зависимости: CSV остался на старте и не
// требует ни одной библиотеки, .xlsx уехал сюда и в набор `excel`.
//
// СТРОКИ ЛИСТА СОБИРАЕТ ExcelExport, А НЕ ЭТОТ ФАЙЛ. `_buildStudentAoa()`
// один в один нужен и CSV, и .xlsx: состав колонок, подписи и порядок обязаны
// совпадать, иначе две выгрузки одних и тех же данных разошлись бы при первой
// же правке. Вызов «наружу» здесь дешевле копии.

const XlsxExport = {
  /**
   * Настоящий .xlsx — открывается в Excel, Google Таблицах и Apple Numbers.
   * Отдельного формата для Numbers как открытого стандарта для генерации на
   * клиенте не существует, а .xlsx Numbers открывает полностью и корректно,
   * поэтому один файл покрывает оба случая.
   *
   * @param {Array<Object>} students
   * @param {Array<Object>} columns
   * @param {Object} classesById
   */
  downloadStudents(students, columns, classesById) {
    if (!window.XLSX) throw new Error('Библиотека для Excel не загрузилась.');
    if (!window.ExcelExport) throw new Error('Модуль выгрузок не загрузился.');

    // В .xlsx экранирование кавычкой не нужно и мешало бы — SheetJS пишет
    // значения как текстовые ячейки, формулой они не станут.
    const { headers, rows } = window.ExcelExport._buildStudentAoa(students, columns, classesById);
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, D('doc.ps.csv.sheet_students'));
    window.XLSX.writeFile(wb, 'students.xlsx');
  },
};

window.XlsxExport = XlsxExport;
