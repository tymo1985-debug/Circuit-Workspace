// review.js — ежедневное повторение пройденного (гл.3, п.13): 30 минут, по 15 на преподавателя, дни 1-5

const Review = {
  DAY_COUNT: 5,

  async list() {
    const items = await DB.list('dailyReviews');
    const existing = new Set(items.map((i) => i.day));
    const toCreate = [];
    for (let d = 1; d <= this.DAY_COUNT; d++) {
      if (!existing.has(d)) {
        toCreate.push({
          id: DB.uid(),
          day: d,
          teacherAMinutesUsed: null,
          teacherBMinutesUsed: null,
          additionalLocalQuestions: '',
          done: false
        });
      }
    }
    for (const item of toCreate) await DB.put('dailyReviews', item);
    const all = [...items, ...toCreate];
    return all.sort((a, b) => a.day - b.day);
  },

  async save(review) {
    return DB.put('dailyReviews', review);
  },

  NOTE: 'Повторение не должно проводиться в спешке. В дополнение к вопросам из учебника можно задавать вопросы по местным потребностям (гл.3, п.13).'
};

window.Review = Review;
