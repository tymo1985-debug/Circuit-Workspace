// dateUtils.js

const DateUtils = {
  formatRu(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  },
  todayIso() {
    return new Date().toISOString().slice(0, 10);
  }
};

window.DateUtils = DateUtils;
