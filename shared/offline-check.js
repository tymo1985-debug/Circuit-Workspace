/**
 * Circuit Workspace — shared/offline-check.js
 *
 * Самопроверка офлайн-готовности (аудит 03, P1-5). Подключается в КАЖДОМ
 * service worker'е через importScripts() — не в страницах.
 *
 * ЗАЧЕМ. Пустой или неполный офлайн-кэш онлайн незаметен: страница берёт
 * недостающее из сети. Пользователь узнаёт о нём в поле, без интернета, когда
 * модуль не открывается. Кэш теряется без участия приложения: автоочистка
 * браузера, чужое приложение на том же origin (инцидент Current-Exchange,
 * аудит 03, P0-1), обрыв при установке.
 *
 * ПРОТОКОЛ. Хаб шлёт активному worker'у сообщение
 *   { type: 'CW_OFFLINE', repair: boolean }  + MessagePort
 * Worker сверяет СВОЙ текущий versioned cache со своим списком прекэша и
 * отвечает в порт:
 *   { module, version, total, missing: [url…], repaired: boolean }
 * При repair:true недостающие файлы докачиваются (cache: 'reload', мимо
 * HTTP-кэша) в тот же кэш одним addAll() — атомарно для докачки, — после
 * чего сверка повторяется и в ответе остаётся то, чего всё ещё нет.
 *
 * Чего модуль НЕ делает: не трогает чужие кэши, не меняет имя кэша, не
 * активирует worker'ы и не проверяет обновления — это дело shared/update.js.
 */
(function (self) {
  'use strict';

  function abs(url) { return new URL(url, self.location.href).href; }

  self.CWOfflineCheck = {
    /**
     * @param {string} module   id модуля ('hub', 'journal', …)
     * @param {string} version  версия этого worker'а
     * @param {string} cacheName имя versioned cache, куда кладёт install
     * @param {string[]} urls   список прекэша (как в install)
     */
    listen: function (module, version, cacheName, urls) {
      var list = urls.slice();

      function missingIn(cache) {
        return Promise.all(list.map(function (url) {
          return cache.match(abs(url)).then(function (hit) { return hit ? null : url; });
        })).then(function (all) { return all.filter(Boolean); });
      }

      function run(repair) {
        return caches.open(cacheName).then(function (cache) {
          return missingIn(cache).then(function (missing) {
            if (!missing.length || !repair) return { missing: missing, repaired: false };
            return cache.addAll(missing.map(function (url) { return new Request(abs(url), { cache: 'reload' }); }))
              .then(function () { return missingIn(cache); }, function () { return missingIn(cache); })
              .then(function (left) { return { missing: left, repaired: true }; });
          });
        }).then(function (r) {
          return { module: module, version: version, total: list.length, missing: r.missing, repaired: r.repaired };
        });
      }

      self.addEventListener('message', function (event) {
        var data = event.data;
        if (!data || data.type !== 'CW_OFFLINE' || !event.ports || !event.ports[0]) return;
        var port = event.ports[0];
        event.waitUntil(run(!!data.repair).then(
          function (result) { port.postMessage(result); },
          function (err) { port.postMessage({ module: module, version: version, total: list.length, error: String((err && err.message) || err) }); }
        ));
      });
    },
  };
})(self);
