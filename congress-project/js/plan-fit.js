// Автоподгонка плана под одну страницу.
// Ключевой принцип: измеряем ровно тем же CSS, которым потом печатаем,
// иначе замер разойдётся с реальным результатом печати.
import { $ } from "./dom.js";

const MM_PX = 96 / 25.4;          // CSS: 1in = 96px = 25.4mm
const SAFETY = 0.985;             // запас на расхождение экранного рендера и принтера

// Лестница уровней плотности. Порядок ужимания намеренный:
// сначала отступы -> высота строк -> служебные элементы (заголовок) ->
// только потом шрифт -> и в последнюю очередь поля страницы.
// font — минимум 7pt: ниже печатная таблица становится нечитаемой.
export const FIT_LEVELS = [
  { font: 9.5, padV: 4,   padH: 5,   line: 1.25, head: 16,   headGap: 10, pageMargin: 10 },
  { font: 9.5, padV: 3.5, padH: 5,   line: 1.22, head: 16,   headGap: 9,  pageMargin: 10 },
  { font: 9.5, padV: 3,   padH: 4.5, line: 1.20, head: 15,   headGap: 8,  pageMargin: 10 },
  { font: 9.5, padV: 2.5, padH: 4,   line: 1.18, head: 15,   headGap: 7,  pageMargin: 10 },
  { font: 9.3, padV: 2.2, padH: 4,   line: 1.16, head: 14,   headGap: 7,  pageMargin: 10 },
  { font: 9.1, padV: 2,   padH: 4,   line: 1.14, head: 14,   headGap: 6,  pageMargin: 10 },
  { font: 9.0, padV: 2,   padH: 3.5, line: 1.13, head: 13,   headGap: 6,  pageMargin: 9.5 },
  { font: 8.8, padV: 1.8, padH: 3.5, line: 1.12, head: 13,   headGap: 5,  pageMargin: 9  },
  { font: 8.6, padV: 1.7, padH: 3.5, line: 1.11, head: 12,   headGap: 5,  pageMargin: 9  },
  { font: 8.4, padV: 1.6, padH: 3,   line: 1.10, head: 12,   headGap: 4,  pageMargin: 8.5 },
  { font: 8.2, padV: 1.5, padH: 3,   line: 1.09, head: 11.5, headGap: 4,  pageMargin: 8  },
  { font: 8.0, padV: 1.4, padH: 3,   line: 1.08, head: 11,   headGap: 4,  pageMargin: 8  },
  { font: 7.8, padV: 1.3, padH: 2.5, line: 1.07, head: 11,   headGap: 3,  pageMargin: 7.5 },
  { font: 7.6, padV: 1.2, padH: 2.5, line: 1.06, head: 10.5, headGap: 3,  pageMargin: 7  },
  { font: 7.4, padV: 1.1, padH: 2,   line: 1.05, head: 10,   headGap: 3,  pageMargin: 6.5 },
  { font: 7.2, padV: 1,   padH: 2,   line: 1.05, head: 10,   headGap: 3,  pageMargin: 6  },
  { font: 7.0, padV: 1,   padH: 2,   line: 1.05, head: 9.5,  headGap: 2,  pageMargin: 6  }
];

export function pageSizeMM(orientation) {
  return orientation === "landscape" ? { w: 297, h: 210 } : { w: 210, h: 297 };
}

// CSS уровня плотности, привязанный к переданному селектору.
// Используется и для замера (#planMeasure), и для печати (#printArea).
export function planScaleCSS(scope, lv) {
  const headMargin = Math.max(2, Math.round(lv.headGap / 2));
  return `${scope} .planPrint{padding:0}` +
    `${scope} .planHead{margin-bottom:${lv.headGap}px}` +
    `${scope} .planHead h1{font-size:${lv.head}pt;margin:0 0 ${headMargin}px}` +
    `${scope} .planTable{font-size:${lv.font}pt;line-height:${lv.line}}` +
    `${scope} .planTable th,${scope} .planTable td{padding:${lv.padV}px ${lv.padH}px}`;
}

// Принудительное масштабирование (крайняя мера, только по явному выбору пользователя)
export function planZoomCSS(scope, k) {
  return `${scope} .planPrint{transform:scale(${k});transform-origin:top left;width:${(100 / k).toFixed(3)}%}`;
}

function measureHost() {
  let host = $("#planMeasure");
  if (!host) {
    host = document.createElement("div");
    host.id = "planMeasure";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }
  return host;
}

// Замер: рендерим план за пределами экрана в контейнер шириной ровно с полезную
// область страницы и сравниваем высоту содержимого с полезной высотой.
export function measurePlan(html, orientation, lv, widthPx) {
  const page = pageSizeMM(orientation);
  // widthPx — ширина раскладки; при масштабировании она шире полезной области страницы
  const usableW = widthPx || (page.w - 2 * lv.pageMargin) * MM_PX;
  const usableH = (page.h - 2 * lv.pageMargin) * MM_PX;

  const host = measureHost();
  // display:flow-root — чтобы внешние отступы потомков не «схлопывались» наружу
  // и попадали в измеряемую высоту.
  host.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;" +
    "pointer-events:none;background:#fff;display:flow-root;width:" + usableW + "px";

  let stl = $("#planMeasureStyle");
  if (!stl) { stl = document.createElement("style"); stl.id = "planMeasureStyle"; document.head.appendChild(stl); }
  stl.textContent = planScaleCSS("#planMeasure", lv);

  host.innerHTML = html;
  const height = Math.ceil(Math.max(host.scrollHeight, host.getBoundingClientRect().height));

  return { height, usableH, usableW, fits: height <= usableH * SAFETY };
}

export function clearMeasure() {
  const host = $("#planMeasure");
  if (host) host.innerHTML = "";
}

// Подбор минимально необходимого уровня ужимания.
// Если план и так помещается — возвращает уровень 0, ничего не меняя.
// Подбор для печати на нескольких страницах: раз уж пользователь согласился на вторую
// страницу, ужимать текст незачем — берём максимально читаемый уровень, который укладывается
// в отведённое число страниц. Если не укладывается ни один — печатаем в исходном виде.
export function fitPlanPages(html, orientation, pages) {
  for (let i = 0; i < FIT_LEVELS.length; i++) {
    const m = measurePlan(html, orientation, FIT_LEVELS[i]);
    if (m.height <= m.usableH * pages * SAFETY) {
      clearMeasure();
      return { index: i, level: FIT_LEVELS[i], fits: true, measured: m };
    }
  }
  const m = measurePlan(html, orientation, FIT_LEVELS[0]);
  clearMeasure();
  return { index: 0, level: FIT_LEVELS[0], fits: false, measured: m, pagesNeeded: Math.ceil(m.height / m.usableH) };
}


// Подбор коэффициента масштабирования для принудительного размещения на одной странице.
// Считать просто 1/overflow нельзя: при scale(k) макет раскладывается на ширине W/k,
// текст переносится меньше и реальная высота получается иной. Поэтому — бинарный поиск
// по k с настоящим замером на каждой итерации (берём максимально возможный, т.е. самый читаемый).
export function fitByZoom(html, orientation, lv) {
  const page = pageSizeMM(orientation);
  const usableW = (page.w - 2 * lv.pageMargin) * MM_PX;
  const usableH = (page.h - 2 * lv.pageMargin) * MM_PX;
  let lo = 0.2, hi = 1.0, best = 0.2;
  for (let i = 0; i < 8; i++) {
    const k = (lo + hi) / 2;
    const m = measurePlan(html, orientation, lv, usableW / k);
    if (m.height * k <= usableH * SAFETY) { best = k; lo = k; } else { hi = k; }
  }
  clearMeasure();
  return Math.min(0.999, best);
}

export function fitPlan(html, orientation) {
  const last = FIT_LEVELS.length - 1;

  // 1) Самый частый случай: план и так помещается — ничего не меняем.
  const m0 = measurePlan(html, orientation, FIT_LEVELS[0]);
  if (m0.fits) { clearMeasure(); return { index: 0, level: FIT_LEVELS[0], fits: true, measured: m0 }; }

  // 2) Быстрая отсечка: если не влезает даже при минимально допустимых размерах,
  //    нет смысла перебирать промежуточные уровни (на больших планах это заметно экономит время).
  const mMin = measurePlan(html, orientation, FIT_LEVELS[last]);
  if (!mMin.fits) {
    clearMeasure();
    // во сколько раз содержимое всё ещё выше страницы даже при минимуме
    const overflow = mMin.height / (mMin.usableH * SAFETY);
    return { index: last, level: FIT_LEVELS[last], fits: false, measured: mMin, overflow };
  }

  // 3) Подходящий уровень существует — ищем минимально необходимый (последовательно,
  //    чтобы гарантированно взять наименьшее ужимание, а не «примерно подходящее»).
  for (let i = 1; i < last; i++) {
    const m = measurePlan(html, orientation, FIT_LEVELS[i]);
    if (m.fits) { clearMeasure(); return { index: i, level: FIT_LEVELS[i], fits: true, measured: m }; }
  }
  clearMeasure();
  return { index: last, level: FIT_LEVELS[last], fits: true, measured: mMin };
}
