/**
 * Circuit Workspace — shared/precache.js
 *
 * Установка прекэша с переносом неизменённых файлов (аудит 04, вариант A).
 * Подключается в КАЖДОМ service worker'е через importScripts() вместе с
 * shared/precache-manifest.js — не в страницах.
 *
 * ЗАЧЕМ. Имя кэша модуля содержит версию хаба (решение 24.09.2026 против
 * смешения кэшей), поэтому любой выпуск переустанавливает все восемь
 * worker'ов. Прежде установка заново качала весь прекэш — 18,5 МБ (≈ 8,4 МБ
 * по сети) за выпуск, из которых новыми были ≈ 2,6 %. Отличить неизменённый
 * файл по ETag нельзя: GitHub Pages строит его из времени деплоя (аудит 04,
 * §3). Поэтому знание о содержимом едет с приложением — в манифесте хешей.
 *
 * КАК. Для каждого адреса прекэша:
 *   - в одном из СВОИХ прежних кэшей (тот же префикс) лежит файл с тем же
 *     хешем — он перекладывается в новый кэш, без сети. Хеш переносимого
 *     тела пересчитывается: в кэш пишет не только установка (фоновая
 *     ревалидация, докачка офлайн-самопроверки), и запись карты могла
 *     устареть — тогда файл просто скачивается;
 *   - иначе файл скачивается мимо HTTP-кэша (`cache: 'reload'`) и его хеш
 *     СВЕРЯЕТСЯ с манифестом. Несовпадение — установка проваливается: край
 *     CDN отдал прошлую версию файла, и класть её под новым хешем нельзя —
 *     иначе перенос тащил бы устаревший файл из выпуска в выпуск.
 * Последней записью в кэш ложится карта «адрес → хеш» (с итогом: что
 * перенесено, что скачано) — признак завершённой установки, источник для
 * переноса в следующем выпуске и диагностика для живого прогона.
 *
 * ЧТО НЕ МЕНЯЕТСЯ. Имя кэша, изоляция активного и ожидающего worker'а,
 * активация по кнопке, офлайн-самопроверка. Установка атомарна, как прежде с
 * addAll(): сначала собирается всё, потом пишется; при сбое записи созданный
 * этой установкой кэш удаляется целиком, прежняя версия остаётся нетронутой.
 * Чужие кэши (другой префикс) не читаются и не трогаются.
 *
 * БЕЗ МАНИФЕСТА ИЛИ БЕЗ crypto.subtle — поведение прежнее: всё скачивается,
 * карта не пишется, перенос в следующий раз не сработает (безопасная сторона).
 */
(function (self) {
  'use strict';

  var REVS = '__cw-precache-revs.json';

  function hex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function hash(buf) {
    return self.crypto.subtle.digest('SHA-256', buf).then(function (d) { return hex(d).slice(0, 16); });
  }

  /** Путь от корня приложения — ключ манифеста: `journal/index.html`. */
  function relOf(abs, root) {
    var u = new URL(abs);
    var p = u.origin + u.pathname;
    if (p.indexOf(root) !== 0) return null;
    p = p.slice(root.length);
    if (p === '' || p.charAt(p.length - 1) === '/') p += 'index.html';
    try { return decodeURIComponent(p); } catch (e) { return p; }
  }

  function readRevs(cache, key) {
    return cache.match(key).then(function (r) { return r ? r.json() : null; })
      .then(function (m) { return m && m.v === 1 && m.revs && typeof m.revs === 'object' ? m.revs : null; },
        function () { return null; });
  }

  /* Тело без заголовков сжатия и длины: они относились к байтам в сети. */
  function rebuild(res, buf) {
    var headers = new Headers(res.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(buf, { status: res.status, statusText: res.statusText, headers: headers });
  }

  /**
   * @param {object} o
   * @param {string} o.cacheName  имя нового versioned cache (как прежде у addAll)
   * @param {string[]} o.urls     список прекэша (тот же, что у CWOfflineCheck.listen)
   * @param {string|string[]} o.prefix  префикс(ы) СВОИХ кэшей — источники переноса
   * @param {string} o.root       корень приложения относительно worker'а ('./' или '../')
   * @returns {Promise<{copied:number, fetched:number}>}
   */
  function install(o) {
    var here = self.location.href;
    var root = new URL(o.root, here).href;
    var revKey = new URL(REVS, here).href;
    var prefixes = [].concat(o.prefix);
    var manifest = self.CW_PRECACHE || {};
    var canHash = !!(self.crypto && self.crypto.subtle);
    var stats = { copied: 0, fetched: 0, fetchedUrls: [] };

    var sourcesP = !canHash ? Promise.resolve([]) : caches.keys().then(function (names) {
      /* Одноимённый кэш тоже источник: повторная установка той же версии
         (другой ?cw-release у той же регистрации) переложит его же файлы. */
      var own = names.filter(function (n) {
        return prefixes.some(function (p) { return n.indexOf(p) === 0; });
      });
      return Promise.all(own.map(function (n) {
        return caches.open(n).then(function (c) {
          return readRevs(c, revKey).then(function (m) { return m ? { cache: c, map: m } : null; });
        });
      })).then(function (all) { return all.filter(Boolean); });
    });

    function fromSources(sources, abs, want) {
      var i = 0;
      function next() {
        if (i >= sources.length) return Promise.resolve(null);
        var s = sources[i++];
        if (s.map[abs] !== want) return next();
        return s.cache.match(abs).then(function (hit) {
          if (!hit || !hit.ok) return next();
          return hit.arrayBuffer().then(function (buf) {
            return hash(buf).then(function (got) { return got === want ? rebuild(hit, buf) : next(); });
          });
        });
      }
      return next();
    }

    function one(sources, url) {
      var abs = new URL(url, here).href;
      var rel = relOf(abs, root);
      var want = canHash && rel ? manifest[rel] || null : null;
      var copy = want ? fromSources(sources, abs, want) : Promise.resolve(null);
      return copy.then(function (hit) {
        if (hit) { stats.copied++; return { abs: abs, res: hit, rev: want }; }
        return fetch(new Request(abs, { cache: 'reload' })).then(function (res) {
          if (!res.ok) throw new Error('precache: ' + res.status + ' ' + abs);
          stats.fetched++;
          stats.fetchedUrls.push(rel || abs);
          if (!want) return { abs: abs, res: res, rev: null };
          return res.arrayBuffer().then(function (buf) {
            return hash(buf).then(function (got) {
              if (got !== want) throw new Error('precache: содержимое не совпало с манифестом — ' + rel);
              return { abs: abs, rev: want, res: rebuild(res, buf) };
            });
          });
        });
      });
    }

    return sourcesP.then(function (sources) {
      return Promise.all(o.urls.map(function (u) { return one(sources, u); }));
    }).then(function (entries) {
      return caches.has(o.cacheName).then(function (existed) {
        return caches.open(o.cacheName).then(function (cache) {
          return Promise.all(entries.map(function (e) { return cache.put(e.abs, e.res); }))
            .then(function () {
              var revs = {};
              entries.forEach(function (e) { if (e.rev) revs[e.abs] = e.rev; });
              var record = { v: 1, revs: revs, copied: stats.copied, fetched: stats.fetchedUrls };
              return cache.put(revKey, new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } }));
            })
            .then(function () { return { copied: stats.copied, fetched: stats.fetched }; }, function (err) {
              /* Удаляется только кэш, созданный этой установкой: одноимённый
                 существовавший мог быть кэшем активного worker'а. */
              var drop = existed ? Promise.resolve() : caches.delete(o.cacheName).catch(function () {});
              return drop.then(function () { throw err; });
            });
        });
      });
    }).catch(function (err) {
      /* Провал установки виден только в консоли worker'а — пишем причину. */
      try { console.warn('[CWPrecache] установка ' + o.cacheName + ' не удалась: ' + (err && err.message || err)); } catch (e) { /* no-op */ }
      throw err;
    });
  }

  self.CWPrecache = { install: install, relOf: relOf, REVS: REVS };
})(self);
