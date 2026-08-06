// dateUtils.js

const DateUtils = {
  formatRu(isoDate) {
    if (!isoDate) return '—';
    // Строка вида «2026-08-03» разбирается браузером как UTC-полночь, поэтому
    // в западных часовых поясах отображалась предыдущая дата. Явно указываем
    // время, чтобы дата трактовалась как локальная.
    const raw = String(isoDate);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00') : new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  },
  todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
};

window.DateUtils = DateUtils;
