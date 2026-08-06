// anketa.js — «Анкета по Школе пионерского служения» (S-257), глава 1

const Anketa = {
  async get() {
    return DB.getMeta('anketa_s257', {
      proposedLocations: [],   // [{ hallName, hallNumber, notes }] — гл.1, п.2-3
      unavailableDates: '',    // свободный текст/диапазоны, гл.1, п.4
      recommendedSubstitutesNote: 'Список заместителей ведётся в разделе «Заместители» (упорядочен по предпочтению, гл.1 п.6)'
    });
  },

  async save(data) {
    return DB.setMeta('anketa_s257', data);
  },

  // Требования из гл.1 п.5 к заместителям — используется как справка в UI
  get SUBSTITUTE_REQUIREMENTS() { return [
    T('ps.req.sub.1'),
    T('ps.req.sub.2'),
    T('ps.req.sub.3'),
    T('ps.req.sub.4')
  ]; },

  get LOCATION_REQUIREMENTS() { return [
    T('ps.req.loc.1'),
    T('ps.req.loc.2'),
    T('ps.req.loc.3'),
    T('ps.req.loc.4'),
    T('ps.req.loc.5'),
    T('ps.req.loc.6'),
    T('ps.req.loc.7')
  ]; }
};

window.Anketa = Anketa;
