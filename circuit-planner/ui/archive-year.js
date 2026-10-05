// circuit-planner/ui/archive-year.js
//
// Шаг A3 трека «Архив» (05.10.2026; docs/db-migration/05-archive-schema.md).
// Единица архивации Клиндария — ВЕСЬ служебный год: кнопка «Отправить год в
// архив» в настройках («Данные и бэкап») и ненавязчивое предложение для года,
// который уже закончился.
//
// Файл из двух слоёв.
//
//  1. `window.CPArchiveYear` — ЧИСТАЯ логика без DOM и без App: собрать срез
//     года, отпечаток, конверт для `CWArchive.put()`. Её гоняет
//     scripts/check-archive-year.mjs напрямую.
//  2. Часть `CPParts` — интерфейс: панель в настройках, баннер-предложение,
//     обработчики. Единственная точка входа из app.js — `App.ui.archiveYearRender()`
//     в конце `renderAll()`.
//
// ИНВАРИАНТЫ
//  • Оригинал НЕ меняется и НЕ удаляется (это шаг A5). Архив — копия.
//  • Блоб `App.state.app` здесь только читается: ни одной записи, ключ
//    хранилища и PIN не затронуты.
//  • Отказ `CWArchive.put()` не глотается: пользователь видит, что год НЕ
//    отправлен (тост + постоянная строка состояния).
//  • «Архив недоступен» ≠ «года нет в архиве»: при сбое чтения состояние
//    «неизвестно», а не «ещё не в архиве».
//  • Устаревший конверт (год правили после архивации, либо выдали новое
//    письмо) определяется по отпечатку в `payload.fingerprint`; предлагается
//    «Обновить архив» — повторный `put()` поверх (revision растёт).
//  • Предложение — только для закончившегося года с содержимым, которого ещё
//    нет в архиве; «Не сейчас» запоминается по году (localStorage, это не
//    данные, а флаг интерфейса) и больше не показывается. Кнопка в настройках
//    остаётся всегда.

(function (root) {
  'use strict';

  const MODULE = 'circuit-planner';
  const ENTITY = 'serviceYear';
  const DECLINED_KEY = 'cp-archive-declined';

  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOf = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');
  const clone = (v) => JSON.parse(JSON.stringify(v));

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

  /* Неделя попадает в архив, только если в ней что-то есть. Пустые недели
     блоб досоздаёт сам (getWeek / getWeeksForYear) — без этого фильтра
     просмотр календаря менял бы отпечаток и «устаревал» архив ни с чего. */
  function meaningfulWeek(w) {
    return !!w && !!(w.eventId || w.note || w.flagLetter || w.flagS302 || (w.priority && w.priority !== 'normal'));
  }

  /**
   * Срез года из блоба: недели с содержимым, визиты в границах года,
   * замороженные копии событий, на которые они ссылаются.
   * @param {Object} app      App.state.app
   * @param {number} year     год начала служебного года
   * @param {{start: Date, end: Date}} bounds  CWServiceYear.bounds(year)
   * @param {(id: string) => (Object|null)} getEvent  чтение события (объединённый вид)
   */
  function collect(app, year, bounds, getEvent) {
    const src = (app && app.serviceYears && app.serviceYears[year]) || { weeks: {} };
    const weeks = {};
    Object.keys(src.weeks || {}).sort().forEach((id) => {
      if (meaningfulWeek(src.weeks[id])) weeks[id] = clone(src.weeks[id]);
    });
    const yearObj = {};
    Object.keys(src).forEach((k) => { if (k !== 'weeks') yearObj[k] = clone(src[k]); });
    yearObj.weeks = weeks;

    const lo = isoOf(bounds.start);
    const hi = isoOf(bounds.end);
    const entries = ((app && app.entries) || [])
      .filter((e) => { const d = dayOf(e && e.start); return d >= lo && d <= hi; })
      .sort((a, b) => (String(a.start) + String(a.id)).localeCompare(String(b.start) + String(b.id)))
      .map(clone);

    const ids = {};
    Object.keys(weeks).forEach((k) => { if (weeks[k].eventId) ids[weeks[k].eventId] = true; });
    entries.forEach((e) => { if (e.eventId) ids[e.eventId] = true; });
    const events = Object.keys(ids).sort().map((id) => {
      const ev = getEvent ? getEvent(id) : null;
      return ev ? clone(ev) : { id, missing: true };
    });

    return { serviceYears: { [year]: yearObj }, entries, events };
  }

  const hasContent = (core, year) =>
    Object.keys(core.serviceYears[year].weeks).length > 0 || core.entries.length > 0;

  /** Отпечаток данных года и писем: меняется при любой правке недели, визита, события, письма. */
  function fingerprint(core, docKeys) {
    return hash(stable({ core, docs: (docKeys || []).slice().sort() }));
  }

  /**
   * Конверт для CWArchive.put().
   * @param {Object} ctx { bounds, label, getEvent, t(key, vars), fmtDate(iso), priorityKey(p), version, docKeys }
   *   docKeys — entityKey писем (`module:entity:id`), только у визитов этого года.
   */
  function buildEnvelope(app, year, ctx) {
    const core = collect(app, year, ctx.bounds, ctx.getEvent);
    const docKeys = (ctx.docKeys || []).slice().sort();
    const t = ctx.t;
    const evName = (id) => {
      const ev = core.events.find((e) => e.id === id);
      return ev && ev.name ? ev.name : '';
    };
    const range = (s, e) => {
      const a = ctx.fmtDate(s);
      const b = e && dayOf(e) !== dayOf(s) ? ctx.fmtDate(e) : '';
      return b ? a + ' – ' + b : a;
    };

    const weekRows = Object.keys(core.serviceYears[year].weeks).sort().map((id) => {
      const w = core.serviceYears[year].weeks[id];
      const tags = [];
      if (w.priority && w.priority !== 'normal') tags.push(t(ctx.priorityKey(w.priority)));
      if (w.flagS302) tags.push(t('arch_tag_s302'));
      if (w.flagLetter) tags.push(t('arch_tag_letter'));
      return { date: range(w.start, w.end), title: evName(w.eventId) || '—', note: w.note || '', tags };
    });

    const visitRows = core.entries.map((e) => {
      const tags = [];
      if (e.flags && e.flags.f302) tags.push(t('arch_tag_s302'));
      if (e.flags && e.flags.letter) tags.push(t('arch_tag_letter'));
      const note = [e.note, e.resultNote ? t('arch_result', { text: e.resultNote }) : '']
        .filter(Boolean).join('\n');
      return { date: range(e.start, e.end), title: e.title || evName(e.eventId) || '—', note, tags };
    });

    const sections = [];
    if (weekRows.length) sections.push({ heading: t('arch_sec_weeks'), rows: weekRows });
    if (visitRows.length) sections.push({ heading: t('arch_sec_visits'), rows: visitRows });

    return {
      module: MODULE,
      entity: ENTITY,
      sourceId: String(year),
      serviceYear: year,
      title: ctx.label,
      sourceVersion: ctx.version || '',
      display: { sections },
      summary: {
        weeks: Object.keys(core.serviceYears[year].weeks).filter((id) => core.serviceYears[year].weeks[id].eventId).length,
        visits: core.entries.length,
        letters: docKeys.length,
      },
      payload: Object.assign({}, core, { fingerprint: fingerprint(core, docKeys) }),
      docRefs: docKeys,
    };
  }

  const idOf = (year) => MODULE + ':' + ENTITY + ':' + year;

  /** Закончившийся год: начался раньше текущего служебного года. */
  const isFinished = (year, currentYear) => Number.isInteger(year) && year < currentYear;

  root.CPArchiveYear = { MODULE, ENTITY, DECLINED_KEY, collect, hasContent, fingerprint, buildEnvelope, idOf, isFinished, meaningfulWeek };

  /* ═══════════════════════ Интерфейс ═══════════════════════ */

  (root.CPParts = root.CPParts || []).push(function (App) {
    const L = root.CPArchiveYear;
    const t = (k, v) => App.utils.t(k, v || {});
    const $ = (id) => document.getElementById(id);
    const sy = () => root.CWServiceYear;

    let bound = false;
    let booted = false;
    let busy = false;
    let panelTimer = 0;
    let panelToken = 0;
    let proposalYear = null;
    let chosenYear = null;

    function declined() {
      try { const v = JSON.parse(root.localStorage.getItem(L.DECLINED_KEY) || '[]'); return Array.isArray(v) ? v : []; }
      catch (e) { return []; }
    }
    function decline(year) {
      try { root.localStorage.setItem(L.DECLINED_KEY, JSON.stringify(declined().concat([year]))); }
      catch (e) { /* без хранилища баннер вернётся при следующем запуске — не критично */ }
    }

    const currentYear = () => App.utils.getServiceYearForDate(new Date());
    const years = () => Object.keys(App.state.app.serviceYears || {}).map(Number)
      .filter(Number.isInteger).sort((a, b) => b - a);
    const slice = (year) => L.collect(App.state.app, year, App.utils.serviceYearBounds(year), (id) => App.data.getEventById(id));
    const yearHasContent = (year) => L.hasContent(slice(year), year);

    const archiveReady = () => !!(root.CWArchive && root.CWDocs && App.ui.docsAvailable());

    /** entityKey писем визитов года. listStrict: сбой чтения — это ошибка, а не «писем нет». */
    async function docKeysFor(year) {
      const core = slice(year);
      const keys = await Promise.all(core.entries.map((e) => {
        const ref = App.ui.docRef(e);
        return root.CWDocs.listStrict(ref).then((rows) => (rows.length ? root.CWDocs.refKey(ref) : ''));
      }));
      return keys.filter(Boolean);
    }

    async function envelopeFor(year) {
      const docKeys = await docKeysFor(year);
      return L.buildEnvelope(App.state.app, year, {
        bounds: App.utils.serviceYearBounds(year),
        label: App.utils.serviceYearLabel(year),
        getEvent: (id) => App.data.getEventById(id),
        t,
        fmtDate: (iso) => {
          const d = App.utils.parseLocalDate(iso);
          return d ? d.toLocaleDateString(App.utils.lang(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : String(iso || '');
        },
        priorityKey: (p) => App.config.priorities[p] || 'priority_normal',
        version: App.config.version,
        docKeys,
      });
    }

    /** { state: 'none' | 'ok' | 'stale' | 'unknown', revision, archivedAt } */
    async function status(year) {
      if (!archiveReady()) return { state: 'unknown' };
      try {
        const rec = await root.CWArchive.get(L.idOf(year));
        if (!rec) return { state: 'none' };
        const current = await envelopeFor(year);
        const fresh = !!(rec.payload && rec.payload.fingerprint === current.payload.fingerprint);
        return { state: fresh ? 'ok' : 'stale', revision: rec.revision, archivedAt: rec.archivedAt };
      } catch (e) {
        return { state: 'unknown' };
      }
    }

    const fmtStamp = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(App.utils.lang(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    function errorText(e) {
      if (e && e.code === 'unavailable') return t('arch_err_unavailable');
      if (e && e.code === 'invalid') return t('arch_err_invalid', { field: e.field || '' });
      return t('arch_err', { message: (e && e.message) || String(e) });
    }

    function setStatusLine(text, isError) {
      const el = $('archiveYearStatus');
      if (!el) return;
      el.textContent = text;
      el.style.color = isError ? 'var(--status-critical, #b3261e)' : '';
    }

    function defaultYear(list) {
      const now = currentYear();
      return list.find((y) => L.isFinished(y, now) && yearHasContent(y)) || (list.includes(App.state.selectedYear) ? App.state.selectedYear : list[0]);
    }

    async function refreshPanel() {
      const card = $('archiveYearCard');
      const select = $('archiveYearSelect');
      const btn = $('archiveYearBtn');
      if (!card || !select || !btn || busy) return;
      const token = ++panelToken;
      const list = years();
      if (!list.length) { card.hidden = true; return; }
      card.hidden = false;
      if (!list.includes(chosenYear)) chosenYear = defaultYear(list);
      select.innerHTML = list.map((y) => `<option value="${y}">${App.utils.escapeHtml(App.utils.serviceYearLabel(y))}</option>`).join('');
      select.value = String(chosenYear);

      const year = chosenYear;
      if (!yearHasContent(year)) {
        btn.disabled = true;
        btn.textContent = t('arch_send');
        setStatusLine(t('arch_state_empty'), false);
        return;
      }
      setStatusLine('…', false);
      btn.disabled = true;
      const st = await status(year);
      if (token !== panelToken) return;   // за время чтения выбрали другой год
      btn.textContent = t(st.state === 'stale' ? 'arch_update' : 'arch_send');
      btn.disabled = st.state === 'ok';
      const text = {
        none: t('arch_state_none'),
        ok: t('arch_state_ok', { rev: st.revision, date: fmtStamp(st.archivedAt) }),
        stale: t('arch_state_stale', { rev: st.revision, date: fmtStamp(st.archivedAt) }),
        unknown: t('arch_state_unknown'),
      }[st.state];
      setStatusLine(text, st.state === 'unknown');
    }

    async function send(year) {
      if (busy) return false;
      busy = true;
      const btn = $('archiveYearBtn');
      if (btn) btn.disabled = true;
      let ok = false;
      try {
        if (!archiveReady()) { const e = new Error('CWArchive'); e.code = 'unavailable'; throw e; }
        const rec = await root.CWArchive.put(await envelopeFor(year));
        const msg = t('arch_done', { year: App.utils.serviceYearLabel(year), rev: rec.revision });
        App.utils.toast(msg);
        ok = true;
      } catch (e) {
        const msg = errorText(e);
        App.utils.toast(msg);
        setStatusLine(msg, true);
        if (btn) btn.disabled = false;
      } finally {
        busy = false;
      }
      if (ok) { await refreshPanel(); await refreshProposal(); }
      return ok;
    }

    /* ── Предложение ── */
    function renderProposalText() {
      const box = $('archiveProposal');
      if (!box) return;
      box.hidden = proposalYear === null;
      const text = $('archiveProposalText');
      if (text && proposalYear !== null) text.textContent = t('arch_proposal', { year: App.utils.serviceYearLabel(proposalYear) });
    }

    async function refreshProposal() {
      proposalYear = null;
      try {
        if (archiveReady()) {
          const skip = declined();
          const now = currentYear();
          for (const y of years()) {
            if (!L.isFinished(y, now) || skip.includes(y) || !yearHasContent(y)) continue;
            if (!(await root.CWArchive.has(L.idOf(y)))) { proposalYear = y; break; }
          }
        }
      } catch (e) {
        proposalYear = null;   // базы нет — не предлагаем; кнопка в настройках покажет причину
      }
      renderProposalText();
    }

    function bind() {
      if (bound) return;
      bound = true;
      $('archiveYearSelect')?.addEventListener('change', (e) => { chosenYear = Number(e.target.value); refreshPanel(); });
      $('archiveYearBtn')?.addEventListener('click', () => { send(chosenYear); });
      $('archiveProposalYesBtn')?.addEventListener('click', () => {
        const year = proposalYear;
        if (year === null) return;
        chosenYear = year;
        send(year);
      });
      $('archiveProposalLaterBtn')?.addEventListener('click', () => {
        if (proposalYear !== null) decline(proposalYear);
        proposalYear = null;
        renderProposalText();
      });
    }

    /** Из конца renderAll(): подпись баннера — синхронно, чтение базы — отложенно. */
    function archiveYearRender() {
      bind();
      renderProposalText();
      if (!booted) { booted = true; refreshProposal(); }
      if (App.state.selectedScreen === 'settings') {
        root.clearTimeout(panelTimer);
        panelTimer = root.setTimeout(refreshPanel, 250);
      }
    }

    Object.assign(App.ui, { archiveYearRender, archiveYearSend: send, archiveYearStatus: status });
  });
})(typeof window !== 'undefined' ? window : globalThis);
