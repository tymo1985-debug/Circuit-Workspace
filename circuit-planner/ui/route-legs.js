// circuit-planner/ui/route-legs.js
//
// «Маршрут посещений» — R3 (06.10.2026): дорожные км и время переездов.
// Провайдер — публичный OSRM (router.project-osrm.org), решение Алекса
// 06.10.2026. Отдельный файл, чтобы ui/route.js оставался без сети и
// хранилища, а весь сетевой/кэш-код был в одном месте.
//
// `window.CPRouteLegs`:
//   • ЧИСТАЯ часть (гоняет scripts/check-route.mjs): legKey, buildUrl, parse,
//     runs, totals.
//   • Кэш отрезков — ОТДЕЛЬНАЯ база IndexedDB `cp-route-legs` (не CWDB, не
//     блоб модуля): одноразовые производные данные, в бэкап не входят,
//     потеря безопасна — отрезок просто запросится снова.
//   • fetchMissing — сеть ТОЛЬКО по явному нажатию кнопки на экране
//     (координаты уходят на внешний сервер). Запросы последовательные,
//     пауза ≥1,1 с (правила демо-сервера OSRM: ≤1 запрос/с), ≤25 точек
//     в запросе, `overview=false` — геометрия не запрашивается и не хранится.
//   • Офлайн / отказ сервиса — отрезок без дорожных данных считается по
//     прямой (haversine) и помечается; ничего не падает.
(function (root) {
  'use strict';

  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  const DB_NAME = 'cp-route-legs';
  const STORE = 'legs';
  const MAX_PTS = 25;
  const GAP_MS = 1100;
  const TIMEOUT_MS = 15000;
  const STALE_MS = 180 * 86400000;

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const r5 = (x) => Math.round(x * 1e5) / 1e5;

  /** Ключ направленного отрезка; координаты округлены до ~1 м. */
  function legKey(a, b) { return `${r5(a.lat)},${r5(a.lng)}>${r5(b.lat)},${r5(b.lng)}`; }

  function samePoint(a, b) { return r5(a.lat) === r5(b.lat) && r5(a.lng) === r5(b.lng); }

  function buildUrl(points) {
    return OSRM + points.map((p) => `${r5(p.lng)},${r5(p.lat)}`).join(';') + '?overview=false&alternatives=false&steps=false';
  }

  /** Ответ OSRM → [{km, min}] длиной n−1 или null. */
  function parse(json, n) {
    if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || !json.routes[0]) return null;
    const legs = json.routes[0].legs;
    if (!Array.isArray(legs) || legs.length !== n - 1) return null;
    const out = legs.map((l) => (l && isNum(l.distance) && isNum(l.duration) ? { km: l.distance / 1000, min: l.duration / 60 } : null));
    return out.every(Boolean) ? out : null;
  }

  /**
   * points — точки маршрута по порядку; known(key) → есть ли свежие данные.
   * Возвращает списки точек для запросов: непрерывные участки с недостающими
   * отрезками, порезанные по MAX_PTS с перекрытием в одну точку. Отрезок
   * между совпадающими точками не запрашивается (0 км).
   */
  function runs(points, known) {
    const out = [];
    let cur = null;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const need = !samePoint(a, b) && !known(legKey(a, b));
      if (need) {
        if (!cur) { cur = [a]; out.push(cur); }
        if (cur.length >= MAX_PTS) { cur = [a]; out.push(cur); }
        cur.push(b);
      } else cur = null;
    }
    return out;
  }

  /**
   * Сводка: дорожные данные там, где они есть, иначе — прямая (dist).
   * legs[i] — отрезок points[i] → points[i+1]: { km, min|null, road }.
   */
  function totals(points, get, dist) {
    const legs = [];
    let km = 0, min = 0, roadLegs = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const hit = samePoint(a, b) ? { km: 0, min: 0 } : get(legKey(a, b));
      if (hit) { legs.push({ km: hit.km, min: hit.min, road: true }); km += hit.km; min += hit.min; roadLegs++; }
      else { const d = dist(a.lat, a.lng, b.lat, b.lng); legs.push({ km: d, min: null, road: false }); km += d; }
    }
    return { legs, km, min, roadLegs, count: legs.length, complete: roadLegs === legs.length };
  }

  /* ─────────── Кэш IndexedDB (только в браузере) ─────────── */

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('no idb')); return; }
      const req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'k' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => { dbPromise = null; throw e; });
    return dbPromise;
  }

  /** keys → Map(key → {km, min, at}); ошибки хранилища → пустая Map. */
  function loadMany(keys) {
    const out = new Map();
    if (!keys.length) return Promise.resolve(out);
    return openDb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      keys.forEach((k) => { const r = st.get(k); r.onsuccess = () => { if (r.result) out.set(k, r.result); }; });
      tx.oncomplete = () => resolve(out);
      tx.onerror = tx.onabort = () => resolve(out);
    })).catch(() => out);
  }

  function saveMany(recs) {
    if (!recs.length) return Promise.resolve();
    return openDb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      recs.forEach((r) => st.put(r));
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    })).catch(() => {});
  }

  const isFresh = (rec) => !!rec && isNum(rec.km) && isNum(rec.min) && (Date.now() - (rec.at || 0)) < STALE_MS;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * R5: участки для нескольких порядков сразу (календарь + черновик) —
   * отрезок, уже вошедший в план по одному порядку, по другому не
   * запрашивается повторно.
   */
  function runsMany(lists, known) {
    const planned = new Set();
    const out = [];
    (lists || []).forEach((points) => {
      runs(points, (k) => known(k) || planned.has(k)).forEach((run) => {
        for (let i = 1; i < run.length; i++) planned.add(legKey(run[i - 1], run[i]));
        out.push(run);
      });
    });
    return out;
  }

  /**
   * Запросить недостающие отрезки. lists — массив порядков точек (R5: до
   * двух — календарь и черновик). memo — Map(key → rec), пополняется на
   * месте; onProgress(done, total) после каждого запроса.
   * → { ok: число успешных запросов, failed: число неудачных, offline }.
   */
  async function fetchMissing(lists, memo, onProgress) {
    const list = runsMany(lists, (k) => isFresh(memo.get(k)));
    const total = list.length;
    const res = { ok: 0, failed: 0, total, offline: root.navigator && root.navigator.onLine === false };
    if (!total || res.offline) return res;
    for (let i = 0; i < total; i++) {
      if (i) await sleep(GAP_MS);
      const pts = list[i];
      let legs = null;
      try {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
        const r = await root.fetch(buildUrl(pts), ctrl ? { signal: ctrl.signal } : {});
        if (timer) clearTimeout(timer);
        if (r && r.ok) legs = parse(await r.json(), pts.length);
      } catch (_) { legs = null; }
      if (legs) {
        const at = Date.now();
        const recs = legs.map((l, j) => ({ k: legKey(pts[j], pts[j + 1]), km: l.km, min: l.min, at }));
        recs.forEach((rec) => memo.set(rec.k, rec));
        await saveMany(recs);
        res.ok++;
      } else res.failed++;
      if (typeof onProgress === 'function') onProgress(i + 1, total);
    }
    return res;
  }

  root.CPRouteLegs = { legKey, buildUrl, parse, runs, runsMany, totals, loadMany, fetchMissing, isFresh, MAX_PTS };
})(window);
