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
//  • Отправка в архив (A3) блоб только ЧИТАЕТ. Менять его могут ровно два
//    действия шага A5, оба по `confirm` и по правилам необратимого переноса
//    (docs/journal/documents.md): «Убрать год из Клиндария» — только у
//    закончившегося года с АКТУАЛЬНЫМ конвертом, перечитанным перед удалением,
//    и только после снятого снимка; «Восстановить из Архива» (переход из
//    модуля Архив с `#archive-restore=<id>`) — только если у года в блобе
//    нет содержимого, тоже после снимка. Ключ хранилища и PIN не затронуты;
//    восстановление ждёт снятия PIN.
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

  const fail = (code, field) => { const e = new Error('CPArchiveYear: ' + code + (field ? ' ' + field : '')); e.code = code; if (field) e.field = field; return e; };

  /**
   * A5: убрать год из блоба (меняет `app` на месте). Только недели года
   * (`serviceYears[year]`) и визиты с `start` в границах года. Собрания
   * (справочник) и письма («Документы») общие для всех лет и остаются.
   * @returns {{ weeks: number, entries: number }} сколько убрано
   */
  function removeYear(app, year, bounds) {
    const lo = isoOf(bounds.start);
    const hi = isoOf(bounds.end);
    const weeks = Object.keys(((app.serviceYears || {})[year] || {}).weeks || {}).filter((k) => meaningfulWeek(app.serviceYears[year].weeks[k])).length;
    if (app.serviceYears) delete app.serviceYears[year];
    const before = (app.entries || []).length;
    app.entries = (app.entries || []).filter((e) => { const d = dayOf(e && e.start); return !(d >= lo && d <= hi); });
    return { weeks, entries: before - app.entries.length };
  }

  /**
   * A5: вернуть год из конверта (меняет `app` на месте). Если в блобе у этого
   * года уже есть содержимое — отказ `conflict`, ничего не трогаем: решение
   * Алекса — не перезаписывать, человек сам решает, что убрать.
   * Пустые недели, которые блоб досоздал сам, конфликтом не считаются.
   */
  function restoreYear(app, year, payload, bounds) {
    const src = payload && payload.serviceYears && payload.serviceYears[year];
    if (!src || typeof src !== 'object' || !src.weeks || typeof src.weeks !== 'object') throw fail('invalid', 'payload.serviceYears');
    if (!Array.isArray(payload.entries)) throw fail('invalid', 'payload.entries');
    if (hasContent(collect(app, year, bounds, null), year)) throw fail('conflict');
    if (!app.serviceYears) app.serviceYears = {};
    if (!Array.isArray(app.entries)) app.entries = [];
    if (!Array.isArray(app.events)) app.events = [];
    const weeks = Object.assign({}, ((app.serviceYears[year] || {}).weeks) || {}, clone(src.weeks));
    app.serviceYears[year] = Object.assign({}, clone(src), { weeks });
    const have = new Set(app.entries.map((e) => e && e.id));
    const add = payload.entries.filter((e) => e && !have.has(e.id)).map(clone);
    app.entries.push(...add);
    /* Собрание могли удалить из справочника после архивации — возвращаем
       замороженную копию. Существующее не трогаем: его могли переименовать. */
    const known = new Set(app.events.map((e) => e && e.id));
    const evAdd = (payload.events || []).filter((e) => e && e.id && !e.missing && !known.has(e.id)).map(clone);
    app.events.push(...evAdd);
    return { weeks: Object.keys(src.weeks).length, entries: add.length, events: evAdd.length };
  }

  root.CPArchiveYear = { MODULE, ENTITY, DECLINED_KEY, collect, hasContent, fingerprint, buildEnvelope, idOf, isFinished, meaningfulWeek, removeYear, restoreYear };

  /* ═══════════════════════ Интерфейс ═══════════════════════ */

  (root.CPParts = root.CPParts || []).push(function (App) {
    const L = root.CPArchiveYear;
    const t = (k, v) => App.utils.t(k, v || {});
    const $ = (id) => document.getElementById(id);
    const RESTORE_PREFIX = 'archive-restore=';

    let bound = false;
    let booted = false;
    let busy = false;
    let panelTimer = 0;
    let panelToken = 0;
    let proposalYear = null;
    let chosenYear = null;
    let notice = null;          // { text, error } — сообщение в баннере до «ОК»
    let restoreId = null;       // намерение «восстановить» из Архива (#archive-restore=…)

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
    const bounds = (year) => App.utils.serviceYearBounds(year);
    const slice = (year) => L.collect(App.state.app, year, bounds(year), (id) => App.data.getEventById(id));
    const yearHasContent = (year) => L.hasContent(slice(year), year);

    const archiveReady = () => !!(root.CWArchive && root.CWDocs && App.ui.docsAvailable());
    /* Необратимые шаги (A5) — только когда запись в канон точно разрешена:
       режим чтения, конфликт вкладок или старая оболочка без общего слоя
       означают «не трогать». */
    const writable = () => !!(App.store && !App.store.degraded && !App.store.conflict
      && typeof App.store.canWrite === 'function' && App.store.canWrite());

    const codeError = (code, field) => { const e = new Error(code); e.code = code; if (field) e.field = field; return e; };

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
        bounds: bounds(year),
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

    function errorText(e, notDone) {
      if (e && e.code === 'unavailable') return t('arch_err_unavailable');
      if (e && e.code === 'invalid') return t('arch_err_invalid', { field: e.field || '' });
      if (e && e.code === 'readonly') return t('arch_err_readonly') + ' ' + t(notDone);
      if (e && e.code === 'backup') return t('arch_err_backup') + ' ' + t(notDone);
      if (e && e.code === 'stale') return t('arch_err_stale');
      if (e && e.code === 'conflict') return t('arch_err_conflict', { year: e.year || '' });
      if (e && e.code === 'missing') return t('arch_err_missing');
      if (e && e.code === 'current') return t('arch_err_current');
      return t('arch_err', { message: (e && e.message) || String(e) });
    }

    function setStatusLine(text, isError) {
      const el = $('archiveYearStatus');
      if (!el) return;
      el.textContent = text;
      el.style.color = isError ? 'var(--status-critical, #b3261e)' : '';
    }
    function say(text, error) {
      notice = { text, error: !!error };
      App.utils.toast(text);
      renderBanner();
    }

    function defaultYear(list) {
      const now = currentYear();
      return list.find((y) => L.isFinished(y, now) && yearHasContent(y)) || (list.includes(App.state.selectedYear) ? App.state.selectedYear : list[0]);
    }

    async function refreshPanel() {
      const card = $('archiveYearCard');
      const select = $('archiveYearSelect');
      const btn = $('archiveYearBtn');
      const rm = $('archiveYearRemoveBtn');
      if (!card || !select || !btn || busy) return;
      const token = ++panelToken;
      const list = years();
      if (rm) rm.hidden = true;
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
      /* «Убрать год» — только у закончившегося года с АКТУАЛЬНЫМ архивом. */
      if (rm) rm.hidden = !(st.state === 'ok' && L.isFinished(year, currentYear()));
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
        if (!archiveReady()) throw codeError('unavailable');
        const rec = await root.CWArchive.put(await envelopeFor(year));
        App.utils.toast(t('arch_done', { year: App.utils.serviceYearLabel(year), rev: rec.revision }));
        ok = true;
      } catch (e) {
        const msg = errorText(e, 'arch_not_sent');
        App.utils.toast(msg);
        setStatusLine(msg, true);
        if (btn) btn.disabled = false;
      } finally {
        busy = false;
      }
      if (ok) { await refreshPanel(); await refreshProposal(); }
      return ok;
    }

    /**
     * Снимок перед необратимым шагом. Правило переноса №1: без копии — ничего
     * не трогаем. Очередь записи сначала догоняется, иначе снимок оказался бы
     * старее того, что человек видит.
     */
    async function backupFirst(label) {
      App.store.flushNow(label);
      let id = null;
      try { id = await App.store.checkpointNow(label); } catch (e) { id = null; }
      if (!id) throw codeError('backup');
    }

    /* ── A5: убрать год из Клиндария (копия остаётся в Архиве) ── */
    async function removeYearFlow(year) {
      if (busy) return;
      const label = App.utils.serviceYearLabel(year);
      if (!root.confirm(t('arch_remove_confirm', { year: label }))) return;
      busy = true;
      try {
        if (!writable()) throw codeError('readonly');
        if (!archiveReady()) throw codeError('unavailable');
        if (!L.isFinished(year, currentYear())) throw codeError('current');
        /* Правило №3 (проверка чтением): конверт прочитан ЗАНОВО и совпадает
           с тем, что сейчас в Клиндарии, — иначе удалили бы то, чего в
           архиве нет. */
        const rec = await root.CWArchive.get(L.idOf(year));
        const cur = await envelopeFor(year);
        if (!rec || !rec.payload || rec.payload.fingerprint !== cur.payload.fingerprint) throw codeError('stale');
        await backupFirst('archive-remove');
        const n = L.removeYear(App.state.app, year, bounds(year));
        if (App.state.selectedYear === year) App.state.selectedYear = currentYear();
        App.store.save();
        App.store.flushNow('archive-remove');
        chosenYear = null;
        say(t('arch_removed', { year: label, visits: n.entries }), false);
        App.ui.renderAll();
      } catch (e) {
        say(errorText(e, 'arch_not_removed'), true);
      } finally {
        busy = false;
      }
      refreshPanel();
    }

    /* ── A5: восстановить год из Архива ── */
    async function restoreFlow(id) {
      restoreId = null;
      if (busy) return;
      busy = true;
      try {
        if (!archiveReady()) throw codeError('unavailable');
        const rec = await root.CWArchive.get(id);
        if (!rec || rec.module !== L.MODULE || rec.entity !== L.ENTITY || !Number.isInteger(rec.serviceYear)) throw codeError('missing');
        const year = rec.serviceYear;
        const label = App.utils.serviceYearLabel(year);
        if (yearHasContent(year)) { const e = codeError('conflict'); e.year = label; throw e; }
        busy = false;
        if (!root.confirm(t('arch_restore_confirm', { year: label }))) return;
        busy = true;
        if (!writable()) throw codeError('readonly');
        await backupFirst('archive-restore');
        L.restoreYear(App.state.app, year, rec.payload, bounds(year));
        App.state.selectedYear = year;
        App.store.save();
        App.store.flushNow('archive-restore');
        chosenYear = year;
        say(t('arch_restored', { year: label }), false);
        App.ui.renderAll();
      } catch (e) {
        say(errorText(e, 'arch_not_restored'), true);
      } finally {
        busy = false;
      }
      refreshProposal();
    }

    /** `#archive-restore=<id>` из Архива. Хэш снимается сразу: перезагрузка не должна повторять действие. */
    function takeRestoreIntent() {
      const raw = String(root.location.hash || '').replace(/^#/, '');
      if (raw.indexOf(RESTORE_PREFIX) !== 0) return null;
      let id = '';
      try { id = decodeURIComponent(raw.slice(RESTORE_PREFIX.length)); } catch (e) { id = ''; }
      try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { /* хэш останется — не критично */ }
      return id.indexOf(L.MODULE + ':' + L.ENTITY + ':') === 0 ? id : null;
    }
    /* Действие ждёт снятия PIN: подтверждение поверх экрана PIN показало бы
       название года тому, кто PIN не знает. Экран PIN включается в init()
       ПОСЛЕ первого renderAll(), поэтому смотрим не на overlay, а на сам PIN:
       задан — ждём, пока overlay покажется и снова скроется. Найдено живым
       прогоном: проверка по overlay пропускала подтверждение раньше PIN. */
    function runRestoreWhenUnlocked() {
      if (!restoreId) return;
      const needPin = typeof App.ui.getStoredPin === 'function' && !!App.ui.getStoredPin();
      const ov = App.els.pinOverlay;
      if (!needPin) { root.setTimeout(() => { if (restoreId) restoreFlow(restoreId); }, 0); return; }
      if (!ov) { restoreId = null; return; }   // PIN задан, а экрана нет — не рискуем
      let seenLocked = !ov.hidden;
      const mo = new MutationObserver(() => {
        if (!ov.hidden) { seenLocked = true; return; }
        if (!seenLocked) return;
        mo.disconnect();
        if (restoreId) restoreFlow(restoreId);
      });
      mo.observe(ov, { attributes: true, attributeFilter: ['hidden'] });
    }

    /* ── Баннер: предложение или сообщение ── */
    function renderBanner() {
      const box = $('archiveProposal');
      if (!box) return;
      const showMsg = !!notice;
      const showProp = !showMsg && proposalYear !== null;
      box.hidden = !(showMsg || showProp);
      box.classList.toggle('md-banner--error', showMsg && notice.error);
      const text = $('archiveProposalText');
      if (text) text.textContent = showMsg ? notice.text : (showProp ? t('arch_proposal', { year: App.utils.serviceYearLabel(proposalYear) }) : '');
      ['archiveProposalYesBtn', 'archiveProposalLaterBtn'].forEach((id) => { const b = $(id); if (b) b.hidden = !showProp; });
      const ok = $('archiveProposalOkBtn');
      if (ok) ok.hidden = !showMsg;
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
      renderBanner();
    }

    function bind() {
      if (bound) return;
      bound = true;
      $('archiveYearSelect')?.addEventListener('change', (e) => { chosenYear = Number(e.target.value); refreshPanel(); });
      $('archiveYearBtn')?.addEventListener('click', () => { send(chosenYear); });
      $('archiveYearRemoveBtn')?.addEventListener('click', () => { removeYearFlow(chosenYear); });
      $('archiveProposalYesBtn')?.addEventListener('click', () => {
        const year = proposalYear;
        if (year === null) return;
        chosenYear = year;
        send(year);
      });
      $('archiveProposalLaterBtn')?.addEventListener('click', () => {
        if (proposalYear !== null) decline(proposalYear);
        proposalYear = null;
        renderBanner();
      });
      $('archiveProposalOkBtn')?.addEventListener('click', () => { notice = null; renderBanner(); });
    }

    /** Из конца renderAll(): подпись баннера — синхронно, чтение базы — отложенно. */
    function archiveYearRender() {
      bind();
      renderBanner();
      if (!booted) {
        booted = true;
        restoreId = takeRestoreIntent();
        refreshProposal();
        runRestoreWhenUnlocked();
      }
      if (App.state.selectedScreen === 'settings') {
        root.clearTimeout(panelTimer);
        panelTimer = root.setTimeout(refreshPanel, 250);
      }
    }

    Object.assign(App.ui, { archiveYearRender, archiveYearSend: send, archiveYearStatus: status, archiveYearRemove: removeYearFlow });
  });
})(typeof window !== 'undefined' ? window : globalThis);
