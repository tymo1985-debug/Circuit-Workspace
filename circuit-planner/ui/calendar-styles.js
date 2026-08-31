// circuit-planner/ui/calendar-styles.js
//
// Первый срез Phase 3 (аудит контекста, 30.08.2026): пилот механизма
// window.CPParts, извлечён из circuit-planner/app.js без изменения поведения.
// Было App.ui.ensureCalendarViewStyles() внутри монолитного IIFE (строки
// 1882-2071, 190 строк CSS одной строкой). Логика не менялась ни на символ —
// перенесены только отступы (метод объекта -> функция верхнего уровня).
//
// Механизм: каждая часть регистрирует функцию в window.CPParts ДО того, как
// circuit-planner/app.js создаёт объект App. Сразу после создания App и до
// App.ui.bind() app.js применяет все зарегистрированные части, вызывая
// part(App, CPConsts) — вторым аргументом идут константы формуляра
// визита/писем (VP_I18N_DICTS и соседние), см. app.js в точке вызова.
// Эта часть его не использует и принимает только App.
//
// Подключение в circuit-planner/sw.js (APP_SHELL_URLS) обязательно —
// без него офлайн-сборка не увидит функцию и звонок ensureCalendarViewStyles()
// упадёт молча (см. shared/AGENTS.md, п.2 «Прекэш»).

(window.CPParts = window.CPParts || []).push(function (App) {
  function ensureCalendarViewStyles() {
    if (document.getElementById('calendarViewStyles')) return;
    const style = document.createElement('style');
    style.id = 'calendarViewStyles';
    style.textContent = `
      .service-year-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:18px;background:var(--md-surface-container)}
      .sy-month-card{background:var(--md-surface-container-low);border:1px solid var(--md-outline-variant);border-radius:20px;box-shadow:var(--md-elevation-2);padding:12px;min-width:0}
      .sy-month-title{font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
      .sy-month-title small{color:var(--md-on-surface-variant);font-weight:500}
      .sy-dow,.sy-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
      .sy-dow span{font-size:10px;color:var(--md-on-surface-variant);text-align:center;padding:2px 0}
      .sy-day{appearance:none;border:1px solid transparent;background:transparent;color:var(--md-on-surface);border-radius:9px;min-height:30px;padding:2px;display:grid;place-items:center;gap:1px;cursor:pointer;font:inherit;font-size:11px;position:relative}
      .sy-day:hover{background:var(--md-surface-container);border-color:var(--md-outline-variant)}
      .sy-day.today{background:var(--md-primary);color:var(--md-on-primary)}
      .sy-day.weekend:not(.today){background:var(--cal-weekend-bg)}
      .sy-day.has-events:not(.today){border-color:color-mix(in srgb, var(--md-primary) 25%, transparent)}
      .sy-event-dots{display:flex;gap:2px;justify-content:center;min-height:4px}
      .sy-event-dot{width:4px;height:4px;border-radius:999px;display:block}
      .sy-empty{min-height:30px}
      .sy-day.sy-outside{color:var(--md-on-surface-variant);opacity:.55}
      .sy-day.sy-outside:hover{opacity:.85;background:var(--md-surface-container)}
      .sy-day.selected{outline:2px solid var(--md-primary);outline-offset:1px;background:color-mix(in srgb, var(--md-primary) 10%, transparent)}
      .sy-day .sy-count{position:absolute;right:3px;top:2px;font-size:9px;color:var(--md-on-surface-variant)}
      .sy-month-summary{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;min-height:16px}
      .sy-month-summary .dot{width:7px;height:7px}
      .sy-legend{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 18px 0;background:var(--md-surface-container)}
      .sy-legend-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--md-outline-variant);background:var(--md-surface-container-low);border-radius:999px;padding:6px 10px;font-size:12px;color:var(--md-on-surface)}
      .sy-legend-sample{width:12px;height:12px;border-radius:999px;display:inline-block;background:var(--md-primary)}
      .sy-legend-sample.outline{background:transparent;border:2px solid color-mix(in srgb, var(--md-primary) 35%, transparent)}
      .sy-legend-sample.today{background:var(--md-primary)}
      .sy-compact-hint{display:none;padding:8px 18px 0;background:var(--md-surface-container)}
      @media (max-width:1100px){.service-year-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media (max-width:680px){.service-year-grid{grid-template-columns:1fr;padding:10px;gap:10px}.sy-month-card{padding:10px;border-radius:16px}.sy-day{min-height:30px;font-size:10px}.sy-dow span{font-size:9px}.sy-legend{padding:10px 10px 0;gap:6px}.sy-legend-chip{font-size:11px;padding:5px 8px}.sy-compact-hint{display:block;padding:8px 10px 0}.calendar-side{gap:10px}.side-card{padding:14px}}
      @media (max-width:420px){.sy-days,.sy-dow{gap:2px}.sy-day{min-height:26px;border-radius:7px}.sy-month-title{font-size:13px;margin-bottom:6px}.sy-event-dot{width:3px;height:3px}.sy-day .sy-count{display:none}.service-year-grid{padding:8px}.sy-month-card{padding:8px}}
    
      /* Mobile modal scrolling fix */
      .modal{overflow:auto;-webkit-overflow-scrolling:touch;align-items:flex-start}
      .modal-card{max-height:calc(100dvh - 36px);overflow:auto}
      /* Mobile menu click-through reliability */
      .app.menu-open .sidebar{z-index:2000 !important}
      .app.menu-open .sidebar{left:0 !important;z-index:2500 !important;pointer-events:auto !important}
      .calendar-layout{grid-template-columns:minmax(0,1fr) minmax(320px,380px) !important;align-items:start}
      .calendar-side{display:block !important;position:sticky;top:var(--calendar-side-top, calc(var(--topbar-h, 88px) + 10px));align-self:start;max-height:calc(100dvh - var(--topbar-h, 88px) - 24px);overflow:auto;-webkit-overflow-scrolling:touch}
      .calendar-side .team-panel-card{display:none !important}
      .calendar-layout.team-hidden{grid-template-columns:minmax(0,1fr) minmax(320px,380px) !important}
      .calendar-layout.team-hidden .calendar-side{display:block !important}
      .day-cell{cursor:pointer}
      .day-cell.selected-day{outline:2px solid var(--md-primary);outline-offset:-2px;background:color-mix(in srgb, var(--md-primary) 10%, transparent)}
      .day-cell.selected-day.weekend{background:color-mix(in srgb, var(--md-primary) 14%, transparent)}
      @media (max-width:820px){.calendar-layout{grid-template-columns:1fr !important}.calendar-side{position:static;max-height:none;overflow:visible}.calendar-side .side-card:not(:first-child){margin-top:12px}}

      /* v9.5.2 layout cleanup */
      .legend,.sy-legend,.sy-compact-hint{display:none !important}
      .app{grid-template-columns:1fr !important}
      body::before{display:none !important}
      .main{padding:18px 22px 30px !important}
      .mobile-menu-btn{display:inline-flex !important}
      .sidebar{position:fixed !important;left:-300px !important;top:0 !important;bottom:0 !important;width:280px !important;z-index:2500 !important;transition:left .22s ease !important;box-shadow:0 20px 60px rgba(0,0,0,.24)}
      .app.menu-open .sidebar{left:0 !important}
      .calendar-layout{grid-template-columns:minmax(0,1fr) minmax(320px,360px) !important;gap:22px !important}
      .service-year-grid{grid-template-columns:repeat(3,minmax(190px,1fr)) !important;gap:18px !important}
 [data-font-size="80"]{--ui-font-scale:.80}
 [data-font-size="85"]{--ui-font-scale:.85}
 [data-font-size="90"]{--ui-font-scale:.90}
 [data-font-size="95"]{--ui-font-scale:.95}
 [data-font-size="100"]{--ui-font-scale:1}
 [data-font-size="105"]{--ui-font-scale:1.05}
 [data-font-size="110"]{--ui-font-scale:1.10}
 [data-font-size="115"]{--ui-font-scale:1.15}
 [data-font-size="120"]{--ui-font-scale:1.20}
 [data-font-size="125"]{--ui-font-scale:1.25}

      html{font-size:calc(16px * var(--ui-font-scale,1))}

      /* v9.5.2 responsive polish: fixes screenshot overlap and cleans calendar header */
      :root{--ui-font-scale:1;--sidebar-width:280px;--calendar-side-width:360px}
      html{font-size:calc(16px * var(--ui-font-scale,1))}
      body::before{display:none !important}
      .app{grid-template-columns:1fr !important}
      .main{padding:18px 22px 30px !important;width:100%;max-width:none !important}
      .topbar{display:grid !important;grid-template-columns:minmax(160px,1fr) auto !important;align-items:start !important;gap:12px !important;margin-bottom:10px !important;padding:8px 0 8px !important;position:sticky;top:0;z-index:1200;background:var(--md-background)}
      .topbar h2{font-size:1.55rem !important;line-height:1.12 !important;margin-top:4px !important}
      .topbar p{display:none !important}
      .mobile-menu-btn{display:inline-flex !important;padding:10px 14px !important;border-radius:18px !important;white-space:nowrap !important}
      .sidebar{position:fixed !important;left:calc(-1 * var(--sidebar-width) - 20px) !important;top:0 !important;bottom:0 !important;width:var(--sidebar-width) !important;z-index:2500 !important;transition:left .22s ease !important;box-shadow:0 20px 60px rgba(0,0,0,.24);display:flex !important;pointer-events:auto !important}
      .app.menu-open .sidebar{left:0 !important}
      .calendar-toolbar{display:grid !important;grid-template-columns:minmax(220px,1fr) auto !important;align-items:center !important;gap:12px !important;padding:16px 18px 12px !important}
      .calendar-controls{justify-content:flex-end !important;gap:8px !important}
      .calendar-controls .chip,.calendar-controls select{min-height:42px}
      .calendar-title{font-size:1.35rem !important;line-height:1.15 !important}
      .calendar-sub{font-size:.82rem !important;margin-top:4px !important}
      .calendar-layout{grid-template-columns:minmax(0,1fr) minmax(310px,360px) !important;gap:18px !important;align-items:start}
      .calendar-side{min-width:0 !important;position:sticky !important;top:var(--calendar-side-top, calc(var(--topbar-h, 88px) + 10px)) !important;max-height:calc(100dvh - var(--topbar-h, 88px) - 20px) !important;overflow:auto !important;-webkit-overflow-scrolling:touch !important;display:block !important}
      .calendar-details-card{max-width:100% !important;display:block !important}
      .legend,.sy-legend,.sy-compact-hint{display:none !important}
      .calendar-side .team-panel-card{display:none !important}
      .service-year-grid{padding:18px !important;gap:18px !important;grid-template-columns:repeat(3,minmax(190px,1fr)) !important}
      .sy-month-card{padding:14px !important;border-radius:22px !important}
      .sy-day{min-height:34px !important;font-size:.78rem !important}
      .sy-dow span{font-size:.72rem !important}
      .sy-month-title{font-size:1.02rem !important}
      .day-cell{min-height:108px}
      /* Compact empty weeks: a week with no visit only needs to show day numbers, not a
         full-height empty row — this was the main source of wasted whitespace on wide screens. */
      .week-row.week-empty,.week-row.week-empty .week-days,.week-row.week-empty .week-num{min-height:34px !important}
      .week-row.week-empty .day-cell{min-height:34px !important;padding:4px 6px 4px 8px !important}
      .week-row.week-empty .day-month{display:none}
      :root[data-layout="compact"] .week-row.week-empty,:root[data-layout="compact"] .week-row.week-empty .week-days,:root[data-layout="compact"] .week-row.week-empty .week-num,:root[data-layout="compact"] .week-row.week-empty .day-cell{min-height:26px !important}
      :root[data-layout="spacious"] .week-row.week-empty,:root[data-layout="spacious"] .week-row.week-empty .week-days,:root[data-layout="spacious"] .week-row.week-empty .week-num,:root[data-layout="spacious"] .week-row.week-empty .day-cell{min-height:40px !important}
      /* Layout presets — placed here (not in the main stylesheet) because this whole block
         is injected after it and uses !important, so a preset rule here is the only way to
         reliably win. Higher specificity (the [data-layout] attribute selector) lets these
         override the unconditional !important rules above them for the same properties. */
      :root[data-layout="compact"] .sy-month-card{padding:8px !important}
      :root[data-layout="compact"] .sy-day{min-height:24px !important;font-size:.68rem !important}
      :root[data-layout="compact"] .sy-period-bar{font-size:8px !important;height:13px !important;line-height:13px !important;top:calc(16px + (var(--bar-lane) * 14px)) !important}
      :root[data-layout="compact"] .day-cell{min-height:72px !important;padding:6px 6px 6px 8px !important}
      :root[data-layout="compact"] .week-row,:root[data-layout="compact"] .week-days,:root[data-layout="compact"] .week-num{min-height:72px !important}
      :root[data-layout="compact"] .event-bar{font-size:11px !important;padding:2px 8px !important}
      :root[data-layout="spacious"] .sy-month-card{padding:20px !important}
      :root[data-layout="spacious"] .sy-day{min-height:44px !important;font-size:.88rem !important}
      :root[data-layout="spacious"] .sy-period-bar{height:19px !important;line-height:19px !important;font-size:10px !important;top:calc(28px + (var(--bar-lane) * 21px)) !important}
      :root[data-layout="spacious"] .day-cell{min-height:140px !important;padding:14px !important}
      :root[data-layout="spacious"] .week-row,:root[data-layout="spacious"] .week-days,:root[data-layout="spacious"] .week-num{min-height:140px !important}
      :root[data-layout="spacious"] .event-bar{font-size:14px !important;padding:5px 14px !important}
      @media (min-width:1600px){:root{--calendar-side-width:390px}.service-year-grid{grid-template-columns:repeat(4,minmax(190px,1fr)) !important}}
      @media (max-width:1180px){.calendar-layout{grid-template-columns:1fr !important;gap:14px !important}.calendar-side{position:static !important;top:auto !important;max-height:none !important;overflow:visible !important;width:100% !important;display:block !important}.calendar-details-card{width:100% !important;max-width:none !important;margin-top:0 !important}.calendar-toolbar{grid-template-columns:1fr !important;align-items:start !important}.calendar-controls{justify-content:flex-start !important}}
      @media (max-width:900px){.main{padding:14px 12px 86px !important}.calendar-shell{border-radius:22px !important}.calendar-toolbar{padding:14px !important}.calendar-controls{display:grid !important;grid-template-columns:1fr 1fr !important;width:100% !important;gap:8px !important}.calendar-nav{width:100%;justify-content:space-between}.calendar-controls select,.calendar-controls .chip{width:100% !important}#calendarServiceYearLabel{display:none !important}.calendar-sub{font-size:.8rem !important}.service-year-grid{grid-template-columns:repeat(2,minmax(150px,1fr)) !important;padding:12px !important;gap:12px !important}.sy-month-card{padding:10px !important}.sy-day{min-height:30px !important}.calendar-side{margin-top:12px !important}}
      @media (max-width:560px){.service-year-grid{grid-template-columns:1fr !important}.topbar{grid-template-columns:1fr !important}.actions{justify-content:flex-start}.bottom-nav-btn .label{font-size:.68rem}}
 [data-font-size="80"]{--ui-font-scale:.80}
 [data-font-size="85"]{--ui-font-scale:.85}
 [data-font-size="90"]{--ui-font-scale:.90}
 [data-font-size="95"]{--ui-font-scale:.95}
 [data-font-size="100"]{--ui-font-scale:1}
 [data-font-size="105"]{--ui-font-scale:1.05}
 [data-font-size="110"]{--ui-font-scale:1.10}
 [data-font-size="115"]{--ui-font-scale:1.15}
 [data-font-size="120"]{--ui-font-scale:1.20}
 [data-font-size="125"]{--ui-font-scale:1.25}



 #events .event-templates-title{display:none !important}
 /* v9.5.2 sent flags and calendar actions */
 .sent-flags{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
 .flag-toggle{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--md-outline-variant);background:var(--md-surface-container);border-radius:999px;padding:7px 10px;font-size:12px;color:var(--md-on-surface);cursor:pointer;user-select:none}
 .flag-toggle input{width:auto;margin:0;accent-color:var(--md-primary)}
 .flag-badges{display:inline-flex;gap:5px;flex-wrap:wrap;margin-left:6px;vertical-align:middle}
 .flag-badge{display:inline-flex;align-items:center;border:1px solid var(--md-outline-variant);background:var(--md-surface-container);border-radius:999px;padding:2px 6px;font-size:10px;font-weight:700;color:var(--md-on-surface)}
 .calendar-action-grid{display:grid;gap:8px;margin-top:12px}.entry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.entry-actions .btn{padding:8px 10px;border-radius:12px;font-size:12px;box-shadow:none}.side-item-card{padding:10px 12px;border-radius:14px;background:var(--md-surface-container);border:1px solid var(--md-outline-variant)}
 
 /* v9.5.9-year-week-bars: day popover for service-year mini calendar */
 .day-popover{position:fixed;z-index:3200;min-width:260px;max-width:min(340px,calc(100vw - 24px));background:var(--md-surface-container-low);color:var(--md-on-surface);border:1px solid var(--md-outline-variant);border-radius:18px;box-shadow:0 22px 55px rgba(0,0,0,.22);padding:14px;font-size:13px;line-height:1.35}
 .day-popover[hidden]{display:none !important}
 .day-popover-title{font-weight:800;font-size:14px;margin-bottom:3px}
 .day-popover-meta{color:var(--md-on-surface-variant);font-size:12px;margin-bottom:10px}
 .day-popover-list{display:grid;gap:8px;margin-top:8px}
 .day-popover-event{display:grid;grid-template-columns:10px 1fr;gap:8px;align-items:start;padding:8px;border:1px solid var(--md-outline-variant);background:var(--md-surface-container);border-radius:13px}
 .day-popover-dot{width:10px;height:10px;border-radius:999px;margin-top:4px;display:block}
 .day-popover-event strong{display:block;font-size:13px}
 .day-popover-event span{display:block;color:var(--md-on-surface-variant);font-size:12px;margin-top:2px}
 .day-popover-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
 .day-popover-actions .btn{padding:8px 10px;border-radius:12px;font-size:12px;box-shadow:none}
 .sy-day.has-events:hover{outline:2px solid var(--md-primary);outline-offset:1px}
 
 /* v9.5.9-year-week-bars: stable popover + sending workflow */
 .calendar-details-card #calendarSideDetails .side-item-card:has(.entry-actions){display:none !important}

 .day-popover{pointer-events:auto !important}
 .day-popover.is-hovered{box-shadow:0 24px 60px rgba(0,0,0,.26) !important}
 .send-control{margin-top:12px;padding:12px;border:1px solid var(--md-outline-variant);border-radius:16px;background:var(--md-surface-container)}
 .send-control-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
 .send-control-title{font-weight:800;font-size:13px}
 .send-control-hint{color:var(--md-on-surface-variant);font-size:11px;margin-top:2px}
 .send-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
 .send-card{display:grid;gap:6px;padding:10px;border:1px solid var(--md-outline-variant);border-radius:14px;background:var(--md-surface-container-low)}
 .send-card.is-pending{border-color:rgba(185,28,28,.45);background:rgba(185,28,28,.07)}
 .send-card.is-done{border-color:color-mix(in srgb, var(--md-primary) 35%, transparent);background:color-mix(in srgb, var(--md-primary) 8%, transparent)}
 .send-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:12px}
 .send-status{font-size:11px;color:var(--md-on-surface-variant)}
 .send-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;user-select:none}
 .send-toggle input{width:auto;margin:0;accent-color:var(--md-primary)}
 @media (max-width:680px){.send-control-grid{grid-template-columns:1fr}}
 
 @media (max-width:680px){.day-popover{left:12px !important;right:12px !important;top:auto !important;bottom:86px !important;max-width:none;width:auto}.day-popover-actions .btn{flex:1 1 auto}}
 

`;
    document.head.appendChild(style);
  }

  Object.assign(App.ui, { ensureCalendarViewStyles });
});
