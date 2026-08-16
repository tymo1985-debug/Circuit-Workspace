// Сверка списка собраний Конгрессов с общим справочником.
//
// Фаза 5, шаг 6, кусок 2. Разбор — docs/db-migration/03-matching-audit.md
//
// ⚠️ ЭКРАН НИЧЕГО НЕ МЕНЯЕТ. Ни данных модуля, ни справочника: только читает и
// показывает. Порядок «сначала показать, потом применить» здесь не
// осторожность ради осторожности — связывание строки с карточкой меняет то,
// кому уйдёт письмо, и человек обязан увидеть предложение до того, как оно
// станет ссылкой.
import { $ } from "./dom.js";
import { S, save, store } from "./state.js";
import { clean, esc } from "./utils.js";
import { t } from "./i18n.js";

/**
 * Все строки собраний, которые в модуле реально есть.
 *
 * Источников ДВА, и они не совпадают: список автодополнения
 * (`settings.congregations`) и то, что стоит у участников программы. Строка
 * может быть в списке и нигде не использоваться (мусор), а может стоять у
 * участника, но отсутствовать в списке (напечатали руками). Показывать надо
 * оба случая, поэтому источник помечается.
 *
 * Счёт использований ведётся по НОРМАЛИЗОВАННОЙ строке: «Warszawa-Bemowo» и
 * «warszawa-bemowo» это одно и то же собрание, и разводить их в отчёте
 * значило бы показать человеку различие, которого нет.
 */
export function collectCongregationStrings() {
  const key = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const own = clean(S().congregations || []);
  const uses = Object.create(null);
  (store.st.congresses || []).forEach((c) => (c.tasks || []).forEach((task) =>
    (task.participants || []).forEach((p) => {
      const k = key(p.congregation);
      if (k) uses[k] = (uses[k] || 0) + 1;
    })));

  const seen = Object.create(null);
  const out = [];
  const push = (value, inList) => {
    const k = key(value);
    if (!k) return;
    if (seen[k]) { seen[k].inList = seen[k].inList || inList; return; }
    seen[k] = { value: String(value).trim(), inList, uses: uses[k] || 0 };
    out.push(seen[k]);
  };
  own.forEach((v) => push(v, true));
  (store.st.congresses || []).forEach((c) => (c.tasks || []).forEach((task) =>
    (task.participants || []).forEach((p) => push(p.congregation, false))));
  return out.sort((a, b) => a.value.localeCompare(b.value, "uk"));
}

/* Исходы, при которых машина имеет право быть уверенной, — из аудита §2.
   Всё остальное показывается человеку как вопрос, а не как вывод. */
const SURE = ["exact", "number", "name"];

const key = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Строки, помеченные человеком как НЕ собрания: названия районов (EU-K-01),
 * места проведения (SCO Gunzenhausen). Машине отличить их не от чего —
 * «Group (Ukrainian) Neratovice» тоже без номера и тоже законная запись, —
 * поэтому это список, а не правило.
 *
 * ⚠️ Пометка влияет ТОЛЬКО на этот отчёт. В автодополнении строка остаётся:
 * EU-K-01 стоит в двенадцати заданиях программы, и убрать её из подсказок
 * значило бы сломать рабочий процесс ради чистоты отчёта.
 */
function notCongregations() {
  const list = S().notCongregations;
  return Array.isArray(list) ? list : [];
}

function isNotCongregation(value) {
  const k = key(value);
  return notCongregations().some((item) => key(item) === k);
}

/** Пометить строку как не-собрание или снять пометку. Пишет в настройки. */
export function toggleNotCongregation(value) {
  const s = S();
  if (!Array.isArray(s.notCongregations)) s.notCongregations = [];
  const k = key(value);
  const at = s.notCongregations.findIndex((item) => key(item) === k);
  if (at >= 0) s.notCongregations.splice(at, 1);
  else s.notCongregations.push(String(value).trim());
  save();
  openMatchReport();
}

function confidenceLabel(confidence) {
  return t("cong.match.conf_" + confidence);
}

/**
 * Подпись карточки справочника.
 *
 * Номер приписывается ТОЛЬКО если его нет внутри названия. На настоящих
 * данных выяснилось, что у части карточек номер вшит в само название
 * («Praha-ukrajinský-jih (15545)») и продублирован в поле номера — отчёт
 * показывал «Praha-ukrajinský-jih (15545) (15545)» и выглядел сломанным.
 */
function cardLabel(card) {
  const name = String(card.name || "");
  const num = String(card.congNumber || "").trim();
  if (!num || name.trim().endsWith("(" + num + ")")) return name;
  return name + " (" + num + ")";
}

/** Кнопка пометки. type="button" обязателен: окно лежит внутри
    <form method="dialog">, и кнопка по умолчанию закрыла бы его. */
function markButton(value, marked) {
  return `<button type="button" class="tiny light match-mark" data-mark="${esc(value)}">${esc(t(marked ? "cong.match.unmark" : "cong.match.mark"))}</button>`;
}

function rowHTML(item, result) {
  const where = item.uses
    ? t("cong.match.used_in", { count: item.uses })
    : t("cong.match.only_list");
  const target = result.record
    ? `<span class="match-target">→ ${esc(cardLabel(result.record))}</span>`
    : (result.candidates || []).length
      ? `<span class="match-target">→ ${result.candidates.map((c) => esc(cardLabel(c))).join(" / ")}</span>`
      : "";
  /* Пометить имеет смысл только то, чему соответствия не нашлось: если
     строка уже связалась с карточкой справочника, она заведомо собрание. */
  const mark = result.confidence === "none" ? markButton(item.value, false) : "";
  return `<div class="match-row">
    <div class="match-main"><b>${esc(item.value)}</b> ${target}</div>
    <div class="match-meta small">${esc(confidenceLabel(result.confidence))} · ${esc(where)}${mark ? " " + mark : ""}</div>
  </div>`;
}

function sectionHTML(title, rows) {
  if (!rows.length) return "";
  return `<div class="match-section"><h3>${esc(title)} <span class="chip">${rows.length}</span></h3>${rows.join("")}</div>`;
}

/**
 * Собрать и показать отчёт. Справочник читается из живого кэша `CWDirectory`;
 * если он не поднялся, отчёт честно говорит об этом вместо того, чтобы
 * показать «соответствия нет» по каждой строке — это выглядело бы как вывод
 * о данных, а на деле означало бы, что мы просто не смотрели.
 */
/**
 * Показать окно, если оно ещё не открыто.
 *
 * Отчёт перестраивается после каждой пометки, и безусловный `showModal()`
 * закрывал бы и открывал уже открытое окно — видимое мигание. Заодно это
 * делает проверку «окно не закрылось от нажатия кнопки внутри формы»
 * осмысленной: без этого повторный `showModal()` прятал бы такую ошибку.
 */
function showReport() {
  const dlg = $("#matchDialog");
  if (dlg && !dlg.open) dlg.showModal();
}

export function openMatchReport() {
  const body = $("#matchBody");
  const D = self.CWDirectory;
  if (!body) return;

  if (!D || !D.ready) {
    body.innerHTML = `<p class="hint">${esc(t("cong.match.no_directory"))}</p>`;
    showReport();
    return;
  }

  const cards = D.all();
  const items = collectCongregationStrings();

  if (!cards.length) {
    body.innerHTML = `<p class="hint">${esc(t("cong.match.empty_directory"))}</p>`;
    showReport();
    return;
  }
  if (!items.length) {
    body.innerHTML = `<p class="hint">${esc(t("cong.match.no_strings"))}</p>`;
    showReport();
    return;
  }

  const sure = [], ask = [], none = [], excluded = [];
  items.forEach((item) => {
    if (isNotCongregation(item.value)) {
      const where = item.uses ? t("cong.match.used_in", { count: item.uses }) : t("cong.match.only_list");
      excluded.push(`<div class="match-row"><div class="match-main"><b>${esc(item.value)}</b></div>
        <div class="match-meta small">${esc(where)} ${markButton(item.value, true)}</div></div>`);
      return;
    }
    const result = D.matchName(item.value, cards);
    const row = rowHTML(item, result);
    if (SURE.indexOf(result.confidence) >= 0) sure.push(row);
    else if (result.confidence === "none") none.push(row);
    else ask.push(row);
  });

  /* Номер внутри названия. Это не косметика: пока номер лежит в названии, а
     поле номера пустое, сопоставление по номеру — самый надёжный признак из
     всех — не работает вовсе, и остаётся только точное совпадение строк.
     Отдельная секция нужна, чтобы человек увидел масштаб и решил, наводить ли
     порядок: расщепление названия — догадка, и само оно применяться не имеет
     права (аудит §3). */
  const embedded = cards.map((card) => {
    const parsed = D.parseName(card.name);
    if (!parsed.congNumber) return null;
    const own = String(card.congNumber || "").trim();
    /* Совпадение номера в названии и в поле — это НОРМА, а не дефект:
       название официальное, поле служебное. Показываем только то, что
       требует внимания, иначе секция висела бы вечно и её перестали бы
       читать. */
    const state = !own ? "empty" : (own === parsed.congNumber ? "ok" : "differs");
    if (state === "ok") return null;
    return `<div class="match-row"><div class="match-main"><b>${esc(card.name)}</b></div>
      <div class="match-meta small">${esc(t("cong.match.embedded_" + state, { value: own || parsed.congNumber }))}</div></div>`;
  }).filter(Boolean);

  const dupes = D.findDuplicates(cards).map((group) => {
    const names = group.ids.map((id) => {
      const card = cards.find((c) => c.id === id);
      return card ? cardLabel(card) : id;
    });
    const label = group.reason === "number"
      ? t("cong.match.dupe_number", { value: group.value })
      : t("cong.match.dupe_name", { value: group.value });
    return `<div class="match-row"><div class="match-main"><b>${esc(names.join(" · "))}</b></div>
      <div class="match-meta small">${esc(label)}</div></div>`;
  });

  body.innerHTML = `
    <p class="hint">${esc(t("cong.match.hint"))}</p>
    <p class="hint">${esc(t("cong.match.summary", {
      total: items.length - excluded.length, sure: sure.length, ask: ask.length, none: none.length,
    }))}</p>
    ${sectionHTML(t("cong.match.group_ask"), ask)}
    ${sectionHTML(t("cong.match.group_none"), none)}
    ${sectionHTML(t("cong.match.group_sure"), sure)}
    ${sectionHTML(t("cong.match.group_dupes"), dupes)}
    ${sectionHTML(t("cong.match.group_embedded"), embedded)}
    ${sectionHTML(t("cong.match.group_excluded"), excluded)}`;

  /* Делегирование: строки перерисовываются целиком после каждой пометки,
     поэтому обработчики на самих кнопках пришлось бы вешать заново каждый
     раз — и один забытый раз означал бы молча мёртвую кнопку. */
  body.onclick = (event) => {
    const btn = event.target.closest("[data-mark]");
    if (!btn) return;
    event.preventDefault();
    toggleNotCongregation(btn.getAttribute("data-mark"));
  };
  showReport();
}
