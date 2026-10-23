/**
 * Circuit Workspace — shared/geocode.js
 * Поиск координат по адресу (OpenStreetMap Nominatim). Вынесен из Клиндария
 * 23.10.2026 (фаза 4 общих настроек): дом теперь вводится в хабе, и
 * координаты для маршрутов хаб определяет сам, сразу после ввода адреса.
 * Клиндарий пользуется тем же — для адресов собраний.
 *
 * Без сети или при ошибке — null, без исключений: вызывающий показывает
 * «не найдено» и ничего не ломает.
 */
(function (global) {
  'use strict';
  var URL_BASE = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=';

  global.CWGeocode = {
    /** @returns {Promise<?{lat:number,lng:number,displayName:string}>} */
    address: function (address) {
      var q = String(address || '').trim();
      if (!q || typeof global.fetch !== 'function') return Promise.resolve(null);
      return global.fetch(URL_BASE + encodeURIComponent(q)).then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (data) {
          if (!data || !data[0]) return null;
          var lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          if (!isFinite(lat) || !isFinite(lng)) return null;
          return { lat: lat, lng: lng, displayName: data[0].display_name || '' };
        });
      }).catch(function (err) { console.warn('CWGeocode: поиск не удался', err); return null; });
    },
  };
})(typeof self !== 'undefined' ? self : this);
