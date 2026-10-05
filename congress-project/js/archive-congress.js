// congress-project/js/archive-congress.js
//
// Шаг A4 трека «Архив»: пункт «В архив» в меню конгресса и предложение для
// прошедшего конгресса. Единица — один конгресс; год — по его дате.
// Чистая логика — archive-logic.js; здесь интерфейс. Точка входа из
// render.js — archiveRender().
//
// ИНВАРИАНТЫ
//  • Данные конгресса только ЧИТАЮТСЯ; оригинал не удаляется и не меняется
//    (удаление — шаг A5).
//  • Отказ CWArchive.put() не глотается: баннер «НЕ отправлен» остаётся, пока
//    его не закроют.
//  • Конгресс без даты не отправляется; причина показывается.
//  • «Не сейчас» запоминается по id конгресса (localStorage — флаг
//    интерфейса, не данные). Устаревший архив не предлагается баннером, а
//    подписывается в меню: «Обновить архив».
import { t } from "./i18n.js";
import { A, store } from "./state.js";
import { isSection, today, fmt } from "./utils.js";
import { buildEnvelope, hasDate, idOf, isPast, taskDocKey } from "./archive-logic.js";

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

function errorText(e) {
  if (e && e.code === "unavailable") return tk("err_unavailable");
  if (e && e.code === "invalid") return tk("err_invalid", { field: e.field || "" });
  return tk("err", { message: (e && e.message) || String(e) });
}

function paint() {
  const box = $("#archiveBanner");
  if (!box) return;
  const c = A();
  const text = $("#archiveBannerText");
  const yes = $("#archiveYesBtn"), later = $("#archiveLaterBtn"), ok = $("#archiveOkBtn");
  const showMsg = !!message && c && messageFor === c.id;
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
  if (!c) { paint(); return; }
  let st = "unknown";
  try {
    st = await status(c);
    if (ready() && hasDate(c) && isPast(c, today()) && st === "none" && !declined().includes(c.id)) proposalFor = c.id;
  } catch (e) { proposalFor = null; }
  if (my !== token) return;
  const label = btn && btn.querySelector("span");
  if (label) label.textContent = tk(st === "stale" ? "btn_update" : "btn_send");
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
    message = { text: errorText(e), error: true };
  } finally { busy = false; }
  messageFor = c.id;
  paint();
  refresh();
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
}

/** Из render(): подпись и показ — сразу, чтение базы — отложенно. */
export function archiveRender() {
  bind();
  paint();
  clearTimeout(timer);
  timer = setTimeout(refresh, 300);
}
