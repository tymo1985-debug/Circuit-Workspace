// textbooks.js — расчёт и учёт заказа учебников (гл.2, п.12-17)
// Формула из п.12: к количеству, запрошенному учащимися, добавить 5
// и вычесть количество учебников, уже имеющихся в наличии у районного старейшины.

const Textbooks = {
  calcOrderQuantity({ requestedByStudents = 0, alreadyInStock = 0 }) {
    const qty = Number(requestedByStudents || 0) + 5 - Number(alreadyInStock || 0);
    return Math.max(0, qty);
  },

  async getOrder() {
    const order = await DB.get('textbookOrder', 'main');
    return order || {
      id: 'main',
      requestedByStudents: 0,
      alreadyInStock: 0,
      otherLanguageRequests: [],   // [{language, qty}] — п.13
      brailleRequests: [],         // [{studentId, format}] — п.15, оформляется через S-59
      received: false,
      receivedCount: null,
      recountedOnReceipt: false
    };
  },

  async save(order) {
    order.id = 'main';
    order.orderQuantity = this.calcOrderQuantity(order);
    return DB.put('textbookOrder', order);
  },

  // Напоминание из п.14: заказ нужно оформить через месяц после получения
  // «Списка для Школы пионерского служения»; учебники должны быть присланы
  // минимум за месяц до начала Школы.
  REMINDERS: [
    'Заказать учебники через месяц после получения «Списка для Школы пионерского служения» (гл.2, п.12)',
    'Учебники должны прийти минимум за месяц до начала Школы — если не пришли, срочно обратиться в отдел отправки (гл.2, п.14)',
    'Пересчитать учебники сразу после получения (гл.2, п.14)',
    'Учебники для Брайля/слабовидящих оформляются отдельным «Бланком заказа публикаций в шрифте Брайля» (S-59) с пометкой «Брайль» в теме сообщения (гл.2, п.15)',
    'Пионер, прекративший служение до начала Школы, не обязан возвращать полученный учебник (гл.2, п.17)'
  ]
};

window.Textbooks = Textbooks;
