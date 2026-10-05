// congress-project/js/archive-congress.js
//
// Шаг A4 трека «Архив»: пункт «В архив» в меню конгресса и предложение для
// прошедшего конгресса. Единица — один конгресс; год — по его дате.
// Чистая логика — archive-logic.js; здесь интерфейс. Точка входа из
// render.js — archiveRender().
//
// ИНВАРИАНТЫ
//  • Отправка в архив (A4) данные только ЧИТАЕТ. Менять их могут ровно два
//    действия шага A5, оба по `confirm` и по правилам необратимого переноса
//    (docs/journal/documents.md): «Убрать из Конгрессов» — только при
//    АКТУАЛЬНОМ конверте, перечитанном перед удалением, и после makeBackup();
//    «Восстановить из Архива» (переход из модуля Архив с
//    `#archive-restore=<id>`) — только если такого конгресса нет, тоже после
//    makeBackup(). Без копии — ничего не трогаем.
//  • Отказ CWArchive.put() не глотается: баннер «НЕ отправлен» остаётся, пока
//    его не закроют.
//  • Конгресс без даты не отправляется; причина показывается.
//  • «Не сейчас» запоминается по id конгресса (localStorage — флаг
//    интерфейса, не данные). Устаревший архив не предлагается баннером, а
//    подписывается в меню: «Обновить архив».
import { t } from "./i18n.js";
import { A, makeBackup, save, store } from "./state.js";
import { isDegradedUI } from "./degraded.js";
/* Цикл render.js ↔ этот файл безопасен: render() вызывается только из
   обработчиков, после того как оба модуля уже вычислены. */
import { render } from "./render.js";
import { isSection, today, fmt } from "./utils.js";
import { MODULE, ENTITY, buildEnvelope, hasDate, idOf, isPast, removeCongress, restoreCongress, taskDocKey } from "./archive-logic.js";

const DECLINED_KEY = "cw-congress-archive-declined";
const $ = (s) => document.querySelector(s);
const tk = (k, v) => t("cong.arch." + k, v);

let bound = false;
let busy = false;
let message = null;       // { text, error } — результат отправки, живёт до закрытия
let messageFor = null;    // id конгресса, к которому относится сообщение
let proposalFor = null;
let token = 0;
let timer = 0;

function declined() {
  try { const v = JSON.parse(localStorage.getItem(DECLINED_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function decline(id) {
  try { localStorage.setItem(DECLINED_KEY, JSON.stringify(declined().concat([id]))); }
  catch (e) { /* без хранилища баннер вернётся при следующем запуске */ }
}

const ready = () => !!(self.CWArchive && self.CWDocs && self.CWServiceYear && self.CWDocs.available());
const seriesNameOf = (c) => {
  const s = (store.st.series || []).find((x) => x.id === c.seriesId);
  return s ? s.name : "";
};

/** Письма заданий конгресса. listStrict: сбой чтения — ошибка, а не «писем нет». */
async function docKeysFor(c) {
  const keys = await Promise.all((c.tasks || []).map((task) => {
    const ref = { module: "congress-project", entity: "task", id: task.id || "" };
    return self.CWDocs.listStrict(ref).then((rows) => (rows.length ? taskDocKey(task) : ""));
  }));
  return keys.filter(Boolean);
}

async function envelopeFor(c) {
  const docKeys = await docKeysFor(c);
  return buildEnvelope(c, {
    year: self.CWServiceYear.forDate(c.date),
    seriesName: seriesNameOf(c),
    tr: tk,
    fmtDate: fmt,
    version: (self.CW_MODULES && self.CW_MODULES["congress-project"] && self.CW_MODULES["congress-project"].version) || "",
    docKeys,
    isSection,
  });
}

/** 'none' | 'ok' | 'stale' | 'unknown' */
async function status(c) {
  if (!ready() || !hasDate(c)) return "unknown";
  try {
    const rec = await self.CWArchive.get(idOf(c.id));
    if (!rec) return "none";
    const cur = await envelopeFor(c);
    return rec.payload && rec.payload.fingerprint === cur.payload.fingerprint ? "ok" : "stale";
  } catch (e) { return "unknown"; }
}

function errorText(e, notDone) {
  if (e && e.code === "unavailable") return tk("err_unavailable");
  if (e && e.code === "invalid") return tk("err_invalid", { field: e.field || "" });
  if (e && e.code === "readonly") return tk("err_readonly") + " " + tk(notDone);
  if (e && e.code === "backup") return tk("err_backup") + " " + tk(notDone);
  if (e && e.code === "stale") return tk("err_stale");
  if (e && e.code === "conflict") return tk("err_conflict");
  if (e && e.code === "missing") return tk("err_missing");
  return tk("err", { message: (e && e.message) || String(e) });
}
const codeError = (code) => { const e = new Error(code); e.code = code; return e; };

function paint() {
  const box = $("#archiveBanner");
  if (!box) return;
  const c = A();
  const text = $("#archiveBannerText");
  const yes = $("#archiveYesBtn"), later = $("#archiveLaterBtn"), ok = $("#archiveOkBtn");
  const showMsg = !!message && (c ? messageFor === c.id : messageFor === null);
  const showProp = !showMsg && !!c && proposalFor === c.id;
  box.hidden = !(showMsg || showProp);
  if (box.hidden) return;
  box.classList.toggle("md-banner--error", showMsg && message.error);
  text.textContent = showMsg ? message.text : tk("proposal", { name: c.name });
  yes.hidden = later.hidden = !showProp;
  ok.hidden = !showMsg;
}

async function refresh() {
  const c = A();
  const my = ++token;
  const btn = $("#archiveCongressBtn");
  proposalFor = null;
  if (!c) { const rm = $("#archiveRemoveCongressBtn"); if (rm) rm.hidden = true; paint(); return; }
  let st = "unknown";
  try {
    st = await status(c);
    if (ready() && hasDate(c) && isPast(c, today()) && st === "none" && !declined().includes(c.id)) proposalFor = c.id;
  } catch (e) { proposalFor = null; }
  if (my !== token) return;
  const label = btn && btn.querySelector("span");
  if (label) label.textContent = tk(st === "stale" ? "btn_update" : "btn_send");
  const rm = $("#archiveRemoveCongressBtn");
  if (rm) rm.hidden = st !== "ok";
  paint();
}

async function send() {
  const c = A();
  if (!c || busy) return;
  if (!hasDate(c)) { message = { text: tk("no_date"), error: true }; messageFor = c.id; paint(); return; }
  busy = true;
  try {
    if (!ready()) { const e = new Error("CWArchive"); e.code = "unavailable"; throw e; }
    const env = await envelopeFor(c);
    const rec = await self.CWArchive.put(env);
    message = { text: tk("done", { name: c.name, rev: rec.revision, year: self.CWServiceYear.label(env.serviceYear) }), error: false };
  } catch (e) {
    message = { text: errorText(e, "not_sent"), error: true };
  } finally { busy = false; }
  messageFor = c.id;
  paint();
  refresh();
}

/** Правило №1 переноса: без снятой копии — ничего не трогаем. */
async function backupFirst(labelKey) {
  let id = null;
  try { id = await makeBackup(labelKey); } catch (e) { id = null; }
  if (!id) throw codeError("backup");
}

/* ── A5: убрать конгресс (копия остаётся в Архиве) ── */
async function removeFlow() {
  const c = A();
  if (!c || busy) return;
  if (!confirm(tk("remove_confirm", { name: c.name }))) return;
  busy = true;
  const id = c.id, name = c.name;
  try {
    if (isDegradedUI()) throw codeError("readonly");
    if (!ready()) throw codeError("unavailable");
    /* Правило №3: конверт перечитан и совпадает с тем, что сейчас в модуле. */
    const rec = await self.CWArchive.get(idOf(id));
    const cur = await envelopeFor(c);
    if (!rec || !rec.payload || rec.payload.fingerprint !== cur.payload.fingerprint) throw codeError("stale");
    await backupFirst("cong.backup.before_archive_remove");
    removeCongress(store.st, id);
    store.sel = A()?.tasks?.[0]?.id || null;
    save();
    message = { text: tk("removed", { name }), error: false };
    messageFor = store.st.activeId;
  } catch (e) {
    message = { text: errorText(e, "not_removed"), error: true };
    messageFor = id;
  } finally { busy = false; }
  render();
}

/* ── A5: восстановить конгресс из Архива ── */
let restoreId = null;
async function restoreFlow(id) {
  restoreId = null;
  if (busy) return;
  try {
    if (!ready()) throw codeError("unavailable");
    const rec = await self.CWArchive.get(id);
    if (!rec || rec.module !== MODULE || rec.entity !== ENTITY || !rec.payload || !rec.payload.congress) throw codeError("missing");
    if ((store.st.congresses || []).some((x) => x.id === rec.payload.congress.id)) throw codeError("conflict");
    if (!confirm(tk("restore_confirm", { name: rec.title }))) return;
    busy = true;
    if (isDegradedUI()) throw codeError("readonly");
    await backupFirst("cong.backup.before_archive_restore");
    const c = restoreCongress(store.st, rec.payload);
    store.sel = c.tasks[0]?.id || null;
    save();
    message = { text: tk("restored", { name: c.name }), error: false };
    messageFor = c.id;
  } catch (e) {
    message = { text: errorText(e, "not_restored"), error: true };
    messageFor = A()?.id || null;
  } finally { busy = false; }
  render();
}

/** `#archive-restore=<id>` из Архива; хэш снимается сразу, перезагрузка не повторяет действие. */
function takeRestoreIntent() {
  const raw = String(location.hash || "").replace(/^#/, "");
  const P = "archive-restore=";
  if (raw.indexOf(P) !== 0) return null;
  let id = "";
  try { id = decodeURIComponent(raw.slice(P.length)); } catch (e) { id = ""; }
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* не критично */ }
  return id.indexOf(MODULE + ":" + ENTITY + ":") === 0 ? id : null;
}

function bind() {
  if (bound) return;
  bound = true;
  $("#archiveCongressBtn")?.addEventListener("click", send);
  $("#archiveYesBtn")?.addEventListener("click", send);
  $("#archiveLaterBtn")?.addEventListener("click", () => {
    const c = A(); if (c) decline(c.id);
    proposalFor = null; paint();
  });
  $("#archiveOkBtn")?.addEventListener("click", () => { message = null; paint(); });
  $("#archiveRemoveCongressBtn")?.addEventListener("click", removeFlow);
  restoreId = takeRestoreIntent();
  if (restoreId) setTimeout(() => restoreFlow(restoreId), 0);
}

/** Из render(): подпись и показ — сразу, чтение базы — отложенно. */
export function archiveRender() {
  bind();
  paint();
  clearTimeout(timer);
  timer = setTimeout(refresh, 300);
}
