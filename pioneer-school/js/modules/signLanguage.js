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
    'Столы полукругом при 20–30 учащихся; больше — как на встрече собрания (гл.5, п.1)',
    'Видео «Полностью подготовлены „ко всякому доброму делу“» НЕ входит в жестовый курс (гл.5, п.7)',
    'PowerPoint/Keynote РАЗРЕШЕНЫ для Писания/видео/иллюстраций (в отличие от обычного класса) (гл.5, п.7)',
    'Художественное чтение Библии заменяется прямым показом текста Писания (гл.5, п.8)',
    'Для слепоглухих/слабовидящих глухих пионеров — S-59 с пометкой «Учебник для слепоглухого пионера» (гл.5, п.6)'
  ]
};

window.SignLanguage = SignLanguage;
