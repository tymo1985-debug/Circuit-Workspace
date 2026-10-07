/**
 * Circuit Workspace — shared/parked.js
 *
 * Сообщение об отложенных несохранённых изменениях (аудит 03, P2-1).
 *
 * Данные откладывает shared/state.js: правку из закрытой вкладки, которую
 * нельзя применить автоматически (она основана на устаревшей версии данных),
 * он кладёт в хранилище `snapshots` вместо того, чтобы стереть первой же
 * записью. Этот файл только СООБЩАЕТ о ней — по решению Алекса (07.10.2026):
 *
 *   • announceHistory(moduleId) — Клиндарий и Конгрессы: правка уже лежит в их
 *     «Истории изменений» и восстанавливается оттуда; сообщаем, где, пока
 *     пользователь не нажмёт «Понятно».
 *   • offerChoice(moduleId, apply) — Назначения и Отправитель (истории у них
 *     нет): «Восстановить» (заменить текущие данные отложенной версией) или
 *     «Отбросить». Сообщение показывается при каждом запуске, пока решение не
 *     принято: отложенная запись ничего не стоит, а молча её потерять — та
 *     самая беда, ради которой всё затевалось.
 *
 * Полоса вверху экрана, а не снизу: снизу живёт полоса обновления
 * (shared/update.js), две полосы на одном месте перекрывали бы друг друга.
 */
(function (global) {
  'use strict';

  var BAR_ID = 'cwParkedBar';
  var STYLE_ID = 'cwParkedStyle';
  var doc = global.document;

  function t(key, vars) {
    return global.CWI18n && typeof global.CWI18n.t === 'function' ? global.CWI18n.t(key, vars) : key;
  }
  function when(at) {
    if (!at) return '';
    try {
      var lang = global.CWI18n && global.CWI18n.getLang ? global.CWI18n.getLang() : undefined;
      return new Date(at).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return new Date(at).toLocaleString(); }
  }

  function injectStyle() {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#' + BAR_ID + '{position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:10000;' +
      'max-width:640px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:12px 14px;' +
      'border-radius:14px;background:var(--md-surface-container-highest,#ece6f0);color:var(--md-on-surface,#1d1b20);' +
      'box-shadow:0 6px 24px rgba(0,0,0,.18);border-left:4px solid var(--status-important,#b26a00);font:inherit;font-size:14px;line-height:1.4}' +
      '#' + BAR_ID + ' .cw-parked__text{flex:1 1 240px}' +
      '#' + BAR_ID + ' .cw-parked__actions{display:flex;gap:8px;flex-wrap:wrap}' +
      '#' + BAR_ID + ' button{min-height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--md-outline,#79747e);' +
      'background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}' +
      '#' + BAR_ID + ' button.cw-parked__primary{background:var(--md-primary,#6750a4);color:var(--md-on-primary,#fff);border-color:transparent}';
    (doc.head || doc.documentElement).appendChild(style);
  }

  var SEEN_KEY = 'cw-parked-seen';
  function readSeen() {
    try { var v = JSON.parse(global.localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function writeSeen(list) {
    try { global.localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-50))); } catch (e) { /* no-op */ }
  }

  function hide() {
    var bar = doc && doc.getElementById(BAR_ID);
    if (bar) bar.remove();
  }

  function show(text, actions) {
    if (!doc || !doc.body) return;
    injectStyle();
    hide();
    var bar = doc.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'alert');
    var span = doc.createElement('span');
    span.className = 'cw-parked__text';
    span.textContent = text;
    bar.appendChild(span);
    var box = doc.createElement('div');
    box.className = 'cw-parked__actions';
    actions.forEach(function (a) {
      var b = doc.createElement('button');
      b.type = 'button';
      if (a.primary) b.className = 'cw-parked__primary';
      b.textContent = t(a.key);
      b.addEventListener('click', a.onClick);
      box.appendChild(b);
    });
    bar.appendChild(box);
    doc.body.appendChild(bar);
  }

  var CWParked = {
    /** Клиндарий/Конгрессы: правка отложена в «Историю изменений» —
     *  сообщить, пока пользователь не нажал «Понятно». Не «один раз за
     *  запуск»: перезагрузка сразу после старта (активация worker'а) иначе
     *  съедала бы сообщение. Просмотренные id — в localStorage. */
    announceHistory: function (moduleId) {
      if (!global.CWState || typeof global.CWState.parkedFor !== 'function') return Promise.resolve(false);
      var seen = readSeen();
      return global.CWState.parkedFor(moduleId).then(function (list) {
        var fresh = list.filter(function (item) { return seen.indexOf(item.id) < 0; });
        if (!fresh.length) return false;
        show(t('parked.history', { time: when(fresh[0].at) }), [{ key: 'parked.ok', primary: true, onClick: function () {
          writeSeen(readSeen().concat(fresh.map(function (item) { return item.id; })));
          hide();
        } }]);
        return true;
      });
    },

    /**
     * Назначения/Отправитель: предложить «Восстановить / Отбросить» для
     * самой новой отложенной правки модуля. `apply(payload)` заменяет
     * текущие данные модуля; вернуть false (или отклонённый промис) — не
     * получилось, отложенная запись тогда остаётся на месте.
     */
    offerChoice: function (moduleId, apply) {
      if (!global.CWState || typeof global.CWState.parkedFor !== 'function') return Promise.resolve(false);
      return global.CWState.parkedFor(moduleId).then(function (list) {
        if (!list.length) return false;
        var item = list[0];
        var next = function () { hide(); CWParked.offerChoice(moduleId, apply); };
        show(t('parked.choose', { time: when(item.at) }), [
          { key: 'parked.restore', primary: true, onClick: function () {
            if (!global.confirm(t('parked.restore_confirm'))) return;
            global.CWState.readParked(item.id).then(function (payload) {
              if (payload === null) return false;
              return Promise.resolve(apply(payload));
            }).then(function (ok) {
              if (ok === false) { show(t('parked.restore_failed'), [{ key: 'parked.ok', primary: true, onClick: hide }]); return; }
              return global.CWState.discardParked(item.id).then(next);
            }, function (e) {
              console.error('CWParked: восстановление не удалось', e);
              show(t('parked.restore_failed'), [{ key: 'parked.ok', primary: true, onClick: hide }]);
            });
          } },
          { key: 'parked.discard', onClick: function () {
            if (!global.confirm(t('parked.discard_confirm'))) return;
            global.CWState.discardParked(item.id).then(next);
          } },
        ]);
        return true;
      });
    },

    hide: hide,
  };

  global.CWParked = CWParked;
})(typeof self !== 'undefined' ? self : this);
