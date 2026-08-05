// signLanguage.js — Дополнительные указания для жестового языка (гл.5)

const SignLanguage = {
  async get() {
    return DB.getMeta('signLanguage', {
      enabled: false,
      semicircleSetup: true,   // до 20-30 учащихся — полукругом (гл.5, п.1)
      nonStudentHelpersAssigned: '',
      materialsChecklist: {
        substituteTextbookAccess: false,   // п.2
        adaptedPracticalPlans: false,
        s255Access: false,
        studentJwpubTextbook: false,       // п.3
        studentNotesPdf: false,            // pt14slsh
        studentAssignmentsWordJwpub: false
      }
    });
  },

  async save(data) {
    return DB.setMeta('signLanguage', data);
  },

  NOTES: [
    T('ps.sl.stoly_polukrugom_pri_20'),
    T('ps.sl.video_polnostyu_podgotovleny_ko'),
    T('ps.sl.powerpoint_keynote_razresheny_dlya'),
    T('ps.sl.hudozhestvennoe_chtenie_biblii_zamenya'),
    T('ps.sl.dlya_slepogluhih_slabovidyaschih_gluhi')
  ]
};

window.SignLanguage = SignLanguage;
