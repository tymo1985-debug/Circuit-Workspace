// circuit-planner/ui/map.js
//
// Карта собраний (desktop-only, фаза «Карта собраний в Клиндарии»).
// Отдельный open/close-переключатель РЯДОМ со List/Cards — НЕ третий
// eventsViewMode. App.state.app.settings.eventsViewMode остаётся строго
// 'list' | 'cards' (см. app.js, renderEvents). Состояние карты не
// персистентно и намеренно не сохраняется между сессиями (по ТЗ фазы).
//
// Leaflet — модуль-локальная зависимость (circuit-planner/vendor/leaflet.js
// + leaflet.css), НЕ shared/vendor/: карта нужна только Клиндарию, и
// локальное размещение держит blast radius будущих апдейтов Leaflet в
// границах этого модуля, не задевая cache-first-модули и их каскад бампов
// (shared/AGENTS.md, check-shared-bump.mjs).
//
// Маркеры — L.circleMarker(), никаких PNG-иконок: L.Icon.Default тянет
// marker-icon.png/marker-shadow.png с путей, которые в собранном dist не
// совпадают с нашей структурой без сборки, а нам нужен только круг цвета
// события. circleMarker — чистый SVG/Canvas, лишних сетевых запросов не
// делает вообще.
//
// Offline: сам Leaflet (JS+CSS) и этот файл лежат в прекэше SW (cache-first,
// как шрифты) — значит карта ИНИЦИАЛИЗИРУЕТСЯ офлайн исправно, включая
// маркеры (координаты уже в IndexedDB). Тайлы OSM — обычные runtime-запросы
// tileLayer, они никогда не прекэшируются (объём/лицензия OSM) и просто не
// придут офлайн. Слушаем 'tileerror' на слое: как только он стреляет —
// показываем ненавязчивый оверлей поверх карты, ничего не ломая — List/Cards
// и весь остальной экран работают как обычно.

(window.CPParts = window.CPParts || []).push(function (App) {

  let map = null;
  let markersLayer = null;
  let tileLayer = null;
  let tileErrorShown = false;
  let leafletLoadPromise = null;

  function loadLeafletAssets() {
    if (leafletLoadPromise) return leafletLoadPromise;
    leafletLoadPromise = new Promise((resolve, reject) => {
      if (window.L) { resolve(window.L); return; }
      if (!document.getElementById('cpLeafletCss')) {
        const link = document.createElement('link');
        link.id = 'cpLeafletCss';
        link.rel = 'stylesheet';
        link.href = './vendor/leaflet.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = './vendor/leaflet.js';
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('leaflet load failed'));
      document.head.appendChild(script);
    });
    return leafletLoadPromise;
  }

  function eventsWithCoords() {
    const all = (App.state.app.events || []);
    return all.filter((ev) => typeof ev.lat === 'number' && typeof ev.lng === 'number');
  }

  function showTileOfflineNotice(show) {
    const pane = App.els.eventsMapPane;
    if (!pane) return;
    let notice = pane.querySelector('.map-offline-notice');
    if (show) {
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'map-offline-notice';
        notice.textContent = App.utils.t('map_offline_notice');
        pane.appendChild(notice);
      }
    } else if (notice) {
      notice.remove();
    }
  }

  function renderMarkers() {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();
    const pts = eventsWithCoords();
    const emptyState = App.els.eventsMapEmpty;
    if (!pts.length) {
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    const latlngs = [];
    pts.forEach((ev) => {
      const marker = L.circleMarker([ev.lat, ev.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: App.utils.clampColor(ev.color) || '#1f7a45',
        fillOpacity: 0.95,
      });
      marker.bindTooltip(App.utils.escapeHtml ? App.utils.escapeHtml(ev.name || '') : String(ev.name || ''));
      marker.on('click', () => App.actions.openEventEditorFor(ev.id));
      marker.addTo(markersLayer);
      latlngs.push([ev.lat, ev.lng]);
    });
    if (latlngs.length === 1) {
      map.setView(latlngs[0], 14);
    } else if (latlngs.length > 1) {
      map.fitBounds(latlngs, { padding: [24, 24] });
    }
  }

  function ensureMap() {
    if (map) { renderMarkers(); map.invalidateSize(); return; }
    map = L.map(App.els.eventsMapContainer, { attributionControl: true });
    map.setView([0, 0], 2);
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    tileLayer.on('tileerror', () => {
      if (!tileErrorShown) { tileErrorShown = true; showTileOfflineNotice(true); }
    });
    tileLayer.on('load', () => {
      // Успешная подгрузка тайлов после ошибки (например, сеть вернулась) —
      // убираем уведомление, чтобы оно не висело ложным сигналом.
      if (tileErrorShown) { tileErrorShown = false; showTileOfflineNotice(false); }
    });
    tileLayer.addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    renderMarkers();
  }

  function openMap() {
    if (!App.els.eventsMapPane || !App.els.eventsMapContainer) return;
    App.els.eventsMapPane.hidden = false;
    App.els.eventsPanelLayout?.classList.add('is-map-open');
    if (App.els.showMapBtn) {
      App.els.showMapBtn.setAttribute('aria-pressed', 'true');
      App.els.showMapBtn.classList.add('md-btn-filled');
      App.els.showMapBtn.classList.remove('md-btn-outlined');
    }
    loadLeafletAssets().then(() => {
      // requestAnimationFrame: контейнер только что стал видимым (hidden
      // снят выше в этом же тике), Leaflet должен мерить его ПОСЛЕ layout,
      // иначе offsetWidth/Height читаются нулевыми и карта рисуется в угол.
      requestAnimationFrame(() => { ensureMap(); });
    }).catch(() => {
      // Библиотека не прекэширована/не загрузилась (первый онлайн-запуск без
      // сохранённого прекэша) — не ломаем экран, просто оставляем пустую
      // область с уведомлением; List/Cards слева продолжают работать.
      if (App.els.eventsMapContainer) {
        App.els.eventsMapContainer.textContent = App.utils.t('map_offline_notice');
      }
    });
  }

  function closeMap() {
    if (!App.els.eventsMapPane) return;
    App.els.eventsMapPane.hidden = true;
    App.els.eventsPanelLayout?.classList.remove('is-map-open');
    if (App.els.showMapBtn) {
      App.els.showMapBtn.setAttribute('aria-pressed', 'false');
      App.els.showMapBtn.classList.remove('md-btn-filled');
      App.els.showMapBtn.classList.add('md-btn-outlined');
    }
  }

  App.state.mapOpen = false;

  App.ui.toggleEventsMap = function toggleEventsMap() {
    App.state.mapOpen = !App.state.mapOpen;
    if (App.state.mapOpen) openMap(); else closeMap();
  };

  // Карта обновляется вместе со списком: renderEvents уже вызывается после
  // любого изменения events (save/delete/import/geocode) — достаточно
  // перерисовывать маркеры внутри уже существующего цикла рендера, не
  // заводя отдельный источник истины.
  const originalRenderEvents = App.ui.renderEvents;
  App.ui.renderEvents = function renderEventsWithMap() {
    originalRenderEvents.apply(App.ui, arguments);
    if (App.state.mapOpen && map) renderMarkers();
  };

  // ВАЖНО: CPParts выполняются ДО App.ui.cacheElements() (см. app.js,
  // порядок вызовов вокруг App.init()) — App.els.showMapBtn на этот момент
  // ещё undefined. Слушатель поэтому вешаем не здесь, а в App.ui.bind()
  // (app.js), как и остальные кнопки экрана событий; здесь только сама
  // функция-переключатель App.ui.toggleEventsMap, которую bind() вызывает.
});
