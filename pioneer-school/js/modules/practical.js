// practical.js — 4 практических занятия (гл.3, п.11-12)

const Practical = {
  SESSION_COUNT: 4,

  async list() {
    const items = await DB.list('practicalSessions');
    if (items.length >= this.SESSION_COUNT) {
      return items.sort((a, b) => a.sessionNumber - b.sessionNumber);
    }
    // инициализация 4 карточек при первом заходе
    const existingNumbers = new Set(items.map((i) => i.sessionNumber));
    const toCreate = [];
    for (let n = 1; n <= this.SESSION_COUNT; n++) {
      if (!existingNumbers.has(n)) {
        toCreate.push({
          id: DB.uid(),
          sessionNumber: n,
          assignedStudents: [],   // [{studentId, role: 'demonstration'|'question'|'example'}]
          rehearsed: false,
          generalRehearsalDone: false, // "генеральная репетиция в день выступления" (гл.3, п.11)
          keyTakeaway: '',            // "чему мы научились из него" — преподаватель фиксирует в конце
          notes: ''
        });
      }
    }
    for (const item of toCreate) await DB.put('practicalSessions', item);
    return [...items, ...toCreate].sort((a, b) => a.sessionNumber - b.sessionNumber);
  },

  async save(session) {
    return DB.put('practicalSessions', session);
  },

  RULES: [
    'Примеры/случаи/рекомендации из плана озвучивает преподаватель (гл.3, п.11.1)',
    'Вопросы, обозначенные в плане, задаются учащимся (гл.3, п.11.2)',
    'В демонстрациях участвуют пионеры с хорошими учительскими способностями (гл.3, п.11.3)',
    'Демонстрации можно адаптировать под местные условия',
    'Если преподаватели не могут лично провести репетицию — можно поручить местным старейшинам',
    'В день выступления обязательна генеральная репетиция',
    'В конце занятия преподаватель подводит итог — чему научились',
    'Перед вопросом на основании Писания преподаватель сначала называет библейские стихи из плана (учащиеся не имеют доступа к плану) (гл.3, п.12)'
  ]
};

window.Practical = Practical;
