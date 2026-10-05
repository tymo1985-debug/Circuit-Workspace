// congress-project/js/archive-logic.js
//
// Шаг A4 трека «Архив» (docs/db-migration/05-archive-schema.md): единица —
// ОДИН конгресс. Здесь только ЧИСТАЯ логика (без DOM, без state.js, без
// импортов): конверт для CWArchive.put(), отпечаток, «прошёл ли конгресс».
// Её гоняет scripts/check-archive-congress.mjs. Интерфейс — archive-congress.js.

const clone = (o) => JSON.parse(JSON.stringify(o));

/** JSON с отсортированными ключами: отпечаток не зависит от порядка вставки. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16) + '.' + str.length;
}

export const MODULE = 'congress-project';
export const ENTITY = 'congress';
export const idOf = (congressId) => MODULE + ':' + ENTITY + ':' + congressId;

/** Дата вида YYYY-MM-DD; без неё служебный год не определить. */
export const hasDate = (c) => !!c && /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || ''));
/** Конгресс прошёл: дата строго раньше сегодняшней (обе — YYYY-MM-DD). */
export const isPast = (c, todayIso) => hasDate(c) && c.date < todayIso;

/** entityKey писем задания — как в letters.js (`docRef`): module:entity:id. */
export const taskDocKey = (task) => MODULE + ':task:' + ((task && task.id) || '');

export function fingerprint(c, seriesName, docKeys) {
  return hash(stable({ congress: c, series: seriesName || '', docs: (docKeys || []).slice().sort() }));
}

/**
 * @param {Object} c конгресс из st.congresses[]
 * @param {Object} ctx { year, seriesName, tr(key, vars), fmtDate(iso), version, docKeys, isSection(task) }
 */
export function buildEnvelope(c, ctx) {
  const tr = ctx.tr;
  const docKeys = (ctx.docKeys || []).slice().sort();
  const tasks = c.tasks || [];
  const named = (p) => String((p && p.name) || '').trim();

  const infoNote = [c.place, c.notes].filter((x) => x && String(x).trim()).join('\n');
  const sections = [{
    heading: tr("sec_info"),
    rows: [{ date: ctx.fmtDate(c.date), title: (c.theme && String(c.theme).trim()) || c.name, note: infoNote, tags: ctx.seriesName ? [ctx.seriesName] : [] }],
  }];

  const rows = tasks.map((task) => {
    const people = (task.participants || []).filter((p) => named(p))
      .map((p) => named(p) + (p.congregation ? ' (' + p.congregation + ')' : ''));
    const note = [people.join(', '), task.notes].filter((x) => x && String(x).trim()).join('\n');
    const tags = [];
    if (task.type && !ctx.isSection(task)) tags.push(task.type);
    if (task.status && task.status !== 'Не назначено' && !ctx.isSection(task)) tags.push(task.status);
    return {
      date: task.time || '',
      title: (task.number ? task.number + '. ' : '') + (task.title || '—'),
      note, tags,
    };
  });
  if (rows.length) sections.push({ heading: tr("sec_program"), rows });

  const core = clone(c);
  return {
    module: MODULE,
    entity: ENTITY,
    sourceId: String(c.id),
    serviceYear: ctx.year,
    title: c.name,
    sourceVersion: ctx.version || '',
    display: { sections },
    summary: {
      tasks: tasks.filter((x) => !ctx.isSection(x)).length,
      participants: tasks.reduce((n, x) => n + (x.participants || []).filter((p) => named(p)).length, 0),
      letters: docKeys.length,
    },
    payload: { congress: core, seriesName: ctx.seriesName || '', fingerprint: fingerprint(core, ctx.seriesName, docKeys) },
    docRefs: docKeys,
  };
}

const fail = (code, field) => { const e = new Error('archive-logic: ' + code + (field ? ' ' + field : '')); e.code = code; if (field) e.field = field; return e; };

/**
 * A5: убрать конгресс из состояния (меняет `st` на месте). Письма заданий
 * остаются в «Документах», серия — в списке серий.
 * @returns {boolean} был ли конгресс
 */
export function removeCongress(st, congressId) {
  const before = (st.congresses || []).length;
  st.congresses = (st.congresses || []).filter((c) => c.id !== congressId);
  if (st.activeId === congressId) st.activeId = st.congresses[0] ? st.congresses[0].id : null;
  return st.congresses.length !== before;
}

/**
 * A5: вернуть конгресс из конверта (меняет `st` на месте). Конгресс с тем же
 * id уже есть — отказ `conflict`, ничего не трогаем (решение Алекса).
 * Серию, которой больше нет, не воскрешаем: конгресс встаёт «без серии».
 * @returns {Object} восстановленный конгресс
 */
export function restoreCongress(st, payload) {
  const src = payload && payload.congress;
  if (!src || typeof src !== 'object' || typeof src.id !== 'string' || !src.id || !Array.isArray(src.tasks)) throw fail('invalid', 'payload.congress');
  if (!Array.isArray(st.congresses)) st.congresses = [];
  if (st.congresses.some((c) => c.id === src.id)) throw fail('conflict');
  const c = clone(src);
  if (c.seriesId && !(st.series || []).some((s) => s.id === c.seriesId)) c.seriesId = null;
  st.congresses.unshift(c);
  st.activeId = c.id;
  return c;
}
