// afterSchool.js — «Прошедшие обучение в Школе пионерского служения» (S-253), гл.4

const AfterSchool = {
  async get() {
    return DB.getMeta('afterSchool_s253', {
      notAttendedFromList: [],   // стр.1: из «Списка», но НЕ прошли обучение в этом районе в этом году
      attendedNotOnList: [],     // стр.2: прошли обучение, но не были в «Списке»
      submitted: false,
      submittedDate: ''
    });
  },

  async save(data) {
    return DB.setMeta('afterSchool_s253', data);
  },

  EXPENSES_NOTE: 'Расходы районного старейшины — по «Руководству для районных старейшин» (tg) и чек-листу S-256. Старейшина-пионер, преподававший вместо районного старейшины, тоже может подать расходы вместе с расходами районного старейшины (гл.4, п.2).'
};

window.AfterSchool = AfterSchool;
