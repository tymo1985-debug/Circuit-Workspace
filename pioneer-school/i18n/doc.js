/**
 * Circuit Workspace — pioneer-school/i18n/doc.js
 * Словарь ДОКУМЕНТОВ Школы пионеров: анкета пионера, печатный бланк,
 * интерактивный PDF, формуляры учащихся, списки, заказ учебников, S-253, CSV.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ dict.js. Во-первых, это другой язык: язык
 * документа (shared/doclang.js) не связан с языком интерфейса — секретарь
 * может работать в польском интерфейсе и печатать украинские анкеты.
 * Во-вторых, register.html — публичная страница, которую открывает сам пионер
 * по ссылке; ей нужны эти двадцать строк, а не 140 КБ админского словаря.
 *
 * ЯЗЫКИ. Заполнены все пять (17.08.2026, тексты носителей языка). Русская
 * колонка совпадает с прежними захардкоженными строками байт в байт.
 * PS_DOC_LANGS_READY внизу файла перечисляет все пять — переключатель больше
 * не помечает ни один язык как «пока по-русски».
 *
 * КАК ДОБАВИТЬ ЯЗЫК:
 *   1. заполнить соответствующий блок ниже (ключи скопировать из `ru`);
 *   2. добавить код языка в PS_DOC_LANGS_READY внизу файла — иначе
 *      переключатель пометит его как «пока по-русски».
 * Логику при этом трогать не нужно нигде.
 *
 * НОМЕРА РАЗДЕЛОВ АНКЕТЫ В СЛОВАРЕ НЕ ХРАНЯТСЯ. `doc.ps.reg.section.*` — это
 * чистое название («Личные данные»), номер приписывает схема
 * (`registrationSchema.js` → `section.heading`). Перевод, пришедший с
 * номером («1. Personal data»), даст на бланке «1. 1. Personal data».
 *
 * ДУБЛИ СВЕДЕНЫ (решение Алекса, 09.08.2026). Раньше печатный бланк
 * формулировал часть вопросов короче онлайн-анкеты: «Адрес проживания»
 * против «Почтовый адрес проживания», «Телефон (WhatsApp)» против «Номер
 * мобильного телефона». Двенадцать таких ключей doc.ps.blank.* удалены —
 * бланк берёт подписи из общего набора doc.ps.reg.*. Переводчик переводит
 * каждый вопрос один раз, а не дважды на каждом из языков.
 *
 * ПОБЕДИТЕЛЬ ВЫБИРАЛСЯ ПО КАЖДОЙ ПАРЕ ОТДЕЛЬНО, и короткая формулировка
 * бланка выигрывала чаще: на бумаге место под ответ конечно. «Номер
 * мобильного телефона» вместо «Телефон (WhatsApp)» ужал бы линию для ответа
 * с 94 до 43 пунктов (~15 мм) — номер туда не пишется. Замерено на реальном
 * шрифте бланка, не на глаз.
 *
 * ПУНКТУАЦИИ В СТРОКАХ НЕТ. Двоеточие после подписи дорисовывает генератор
 * (_withColon в pdfExport.js), в словаре лежит чистая подпись. Иначе
 * переводчик обязан помнить про пунктуацию, а она не везде одинаковая.
 */
(function (global) {
  'use strict';

  if (!global.CWI18n) {
    console.error('pioneer-school/i18n/doc.js подключён раньше shared/i18n.js');
    return;
  }

  global.CWI18n.register({ ru: {
    /* ── Подписи полей, общие для всех документов ──────────────────────────
       Одна подпись = одна строка словаря. Раньше «Фамилия» лежала тремя
       ключами (анкета, карточка регистрации, выгрузка), «Телефон» — четырьмя,
       и носитель языка переводил одно и то же слово по нескольку раз на
       каждом из четырёх языков. Сведено 14.08.2026 по таблице, согласованной
       с Алексом.

       ГРАНИЦА, ПО КОТОРОЙ СВЕДЕНО НЕ ВСЁ: подпись и вопрос — разные вещи.
       «Ночлег» в выгрузке и «Нуждаетесь ли вы в месте для ночлега?» в анкете
       остаются двумя ключами; свести их значило бы испортить и то, и другое.
       По той же причине живут отдельно сокращения `doc.ps.regs.*` («тел»,
       «авто») — это подписи внутри строки списка, а не заголовки. */
    'doc.ps.field.lastName': 'Фамилия',
    'doc.ps.field.firstName': 'Имя',
    'doc.ps.field.address': 'Адрес проживания',
    'doc.ps.field.email': 'Email',
    'doc.ps.field.phone': 'Телефон',
    'doc.ps.field.language': 'Язык учебника',
    'doc.ps.field.format': 'Формат учебника',
    'doc.ps.field.attending': 'Присутствие',
    'doc.ps.field.lodging': 'Ночлег',
    'doc.ps.field.transport': 'Транспорт',
    'doc.ps.field.notes': 'Доп. сведения',

    /* ── Куда и до какого числа сдавать формуляр ───────────────────────────
       Один и тот же текст печатается на бланке, показывается на онлайн-
       странице и вставляется в интерактивный PDF. До сведения это были три
       набора ключей с тремя слегка разными формулировками одной мысли.

       ПУНКТУАЦИИ И ПЛЕЙСХОЛДЕРОВ ЗДЕСЬ НЕТ НАМЕРЕННО. Двоеточие, дефис
       списка и подстановку значения дорисовывает тот, кто выводит строку
       (`_withColon` в генераторе, разметка в register.html). Переводчик
       получает чистую подпись: в части языков пунктуация другая, и помнить
       про неё он не обязан. */
    'doc.ps.send.deadline': 'Заполненный формуляр необходимо отправить не позднее',
    'doc.ps.send.how': 'Способ отправки',
    'doc.ps.send.by_email': 'на адрес электронной почты',
    'doc.ps.send.by_whatsapp': 'через WhatsApp',
    'doc.ps.send.ask_elder': 'уточните у районного старейшины',
    'doc.ps.send.to_email': 'Отправить по email',
    'doc.ps.send.to_whatsapp': 'Отправить в WhatsApp',
    /* ---- Онлайн-анкета и интерактивный PDF: разделы ---- */
    'doc.ps.reg.section.personal': 'Личные данные',
    'doc.ps.reg.section.attendance': 'Участие в школе',
    'doc.ps.reg.section.transport': 'Транспорт',
    'doc.ps.reg.section.lodging': 'Проживание',
    'doc.ps.reg.section.textbook': 'Учебник для школы',
    'doc.ps.reg.section.extra': 'Дополнительные сведения',

    /* ---- Онлайн-анкета: поля ---- */
    'doc.ps.reg.field.phone': 'Телефон (WhatsApp)',
    'doc.ps.reg.field.attending': 'Будете ли вы присутствовать на Школе пионерского служения?',
    'doc.ps.reg.field.attendReason': 'Если нет — укажите причину',
    'doc.ps.reg.field.transport': 'Есть ли у вас автомобиль, на котором вы сможете самостоятельно добираться до Школы?',
    'doc.ps.reg.field.lodging': 'Нуждаетесь ли вы в месте для ночлега?',
    'doc.ps.reg.field.languageOther': 'Укажите необходимый язык',
    'doc.ps.reg.field.format': 'Формат учебника (можно выбрать несколько)',
    'doc.ps.reg.field.notes': 'Аллергии, особенности питания, состояние здоровья, другие важные замечания',
    'doc.ps.reg.hint.phone': 'Желательно указать номер, привязанный к WhatsApp — так с вами будет проще связаться.',

    /* ---- Подписи вариантов. ЗНАЧЕНИЯ (yes/no/ru/print/…) не переводятся
           никогда: они лежат в IndexedDB и ездят в резервных копиях. ---- */
    'doc.ps.reg.opt.yes': 'Да',
    'doc.ps.reg.opt.no': 'Нет',
    'doc.ps.reg.opt.lang.ru': 'Русский',
    'doc.ps.reg.opt.lang.uk': 'Украинский',
    'doc.ps.reg.opt.lang.pl': 'Польский',
    'doc.ps.reg.opt.lang.de': 'Немецкий',
    'doc.ps.reg.opt.lang.other': 'Другой',
    'doc.ps.reg.opt.lang.other_lower': 'другой',
    'doc.ps.reg.opt.format.print': 'Печатный экземпляр',
    'doc.ps.reg.opt.format.jwpub': 'Электронный JWPub',
    'doc.ps.reg.opt.format.pdf': 'PDF',
    'doc.ps.reg.opt.format.epub': 'EPUB',

    /* ---- Общая обвязка анкеты ---- */
    'doc.ps.reg.title': 'Формуляр регистрации — Школа пионерского служения',
    'doc.ps.reg.title_page': 'Формуляр для Школы пионерского служения',
    'doc.ps.reg.closing': 'Пожалуйста, заполните и отправьте этот формуляр как можно скорее. Это поможет своевременно подготовить всё необходимое для проведения школы. Благодарим за сотрудничество!',
    'doc.ps.reg.cond_hint': '(только если выше выбрано «{option}»)',

    /* ---- Интерактивный PDF (pdfFormExport) ---- */
    'doc.ps.pdf.lead': 'Заполните поля прямо в этом PDF, сохраните файл и отправьте его обратно (см. контакты в конце документа).',
    'doc.ps.pdf.contact.email': 'Эл. почта',
    'doc.ps.pdf.contact.whatsapp': 'WhatsApp',
    'doc.ps.pdf.contact_line': '- {label}: {value}',

    /* ---- Печатный бланк (pdfExport.downloadRegistrationBlankForm) ----
       Подписи полей бланк НЕ дублирует: он берёт те же ключи
       doc.ps.reg.field.* / doc.ps.reg.opt.*, что и онлайн-анкета, и сам
       дорисовывает двоеточие (см. _withColon в pdfExport.js). Здесь остаётся
       только то, чего в онлайн-анкете нет в принципе: сопроводительный текст
       бумаги и инструкция по отправке. */
    'doc.ps.blank.lead': 'Пожалуйста, заполните и передайте районному старейшине как можно скорее.',

    /* ---- Заполненный формуляр одной регистрации ---- */

    /* ---- Списки и формуляры учащихся ---- */
    'doc.ps.list.students_title': 'Список учащихся — Школа пионерского служения',
    'doc.ps.list.class': 'Класс',
    'doc.ps.list.no_class': 'без класса',
    'doc.ps.form.student_title': 'Формуляр учащегося: {name}',
    'doc.ps.form.no_name': 'Без имени',

    /* ---- Заказ учебников ---- */
    'doc.ps.order.title': 'Заказ учебников — Школа пионерского служения',
    'doc.ps.order.requested': 'Запрошено учащимися',
    'doc.ps.order.in_stock': 'Уже в наличии',
    'doc.ps.order.to_order_full': 'К заказу (запрошено + 5 - в наличии)',
    'doc.ps.order.to_order': 'К заказу',
    'doc.ps.order.received': 'Получено',
    'doc.ps.order.recounted': 'Пересчитано при получении',
    'doc.ps.order.other_langs': 'Иноязычные заявки:',
    'doc.ps.order.braille': 'Заявки Брайль/спецформат (оформляются через S-59):',
    'doc.ps.yes_short': 'да',
    'doc.ps.no_short': 'нет',

    /* ---- Сводка регистраций ---- */
    'doc.ps.regs.title': 'Регистрации учащихся — Школа пионерского служения',
    'doc.ps.regs.phone': 'тел',
    'doc.ps.regs.email': 'email',
    'doc.ps.regs.attending': 'присутствие',
    'doc.ps.regs.reason': 'причина',
    'doc.ps.regs.car': 'авто',
    'doc.ps.regs.lodging': 'ночлег',
    'doc.ps.regs.language': 'язык',
    'doc.ps.regs.format': 'формат',

    /* ---- S-253 ---- */
    'doc.ps.s253.title': 'S-253 — Прошедшие обучение в Школе пионерского служения',
    'doc.ps.s253.page1': 'Страница 1 — из «Списка», но НЕ прошли обучение в этом районе в этом году:',
    'doc.ps.s253.page2': 'Страница 2 — прошли обучение, но НЕ были в «Списке»:',
    'doc.ps.s253.no_comment': 'без комментария',

    /* ---- CSV / XLSX ---- */
    'doc.ps.csv.sheet_students': 'Учащиеся',
    'doc.ps.csv.metric': 'Показатель',
    'doc.ps.csv.value': 'Значение',
    'doc.ps.csv.reason': 'Причина отсутствия',
    'doc.ps.csv.language': 'Язык',
    'doc.ps.csv.languageOther': 'Другой язык',
    'doc.ps.csv.submittedAt': 'Дата отправки',

    /* ---- Публичная страница register.html ---- */
    'doc.ps.page.title': 'Регистрация — Школа пионерского служения',
    'doc.ps.page.eyebrow': 'Регистрация учащегося',
    'doc.ps.page.lead': 'Пожалуйста, заполните все поля как можно точнее — это поможет организаторам вовремя подготовить всё необходимое для Школы.',
    'doc.ps.page.success': 'Спасибо! Формуляр заполнен и сохранён на этом устройстве. Пожалуйста, дополнительно отправьте копию районному старейшине — кнопки ниже откроют готовое письмо или сообщение WhatsApp с вашими данными.',
    'doc.ps.page.submit': 'Отправить формуляр',

    /* ---- Текст письма/сообщения, который уходит старейшине ---- */
    'doc.ps.mail.subject': 'Регистрация — Школа пионерского служения',
    'doc.ps.sum.title': 'Регистрация на Школу пионерского служения',
    'doc.ps.sum.fullname': 'Фамилия Имя',
    'doc.ps.sum.reason': 'причина',
  } });

  /* ------------------------------------------------------------------
     ЖДУТ НОСИТЕЛЯ ЯЗЫКА.
     Блоки ниже заполнены носителями языка (17.08.2026). Добавляя ключ,
     заводить его во всех пяти блоках; подписи вариантов (Да/Нет,
     Русский/Украинский/…) и названия разделов обязательно согласовывать с
     тем, как эти документы называются в соответствующем языке на практике,
     а не переводить дословно.

     ВНИМАНИЕ ПРИ ЗАПОЛНЕНИИ pl/de: ł ż ą ę ś ć ń ź ä ö ü ß проходят в PDF
     только начиная с версии шрифта, собранной scripts/build-pdf-font-subset.mjs
     (586 глифов). Если бланк печатает дефисы вместо букв — значит,
     dejavu-sans-subset.js откатился на старую сборку.
     ------------------------------------------------------------------ */
  global.CWI18n.register({ uk: {
    'doc.ps.field.lastName': 'Прізвище',
    'doc.ps.field.firstName': 'Ім’я',
    'doc.ps.field.address': 'Адреса проживання',
    'doc.ps.field.email': 'Email',
    'doc.ps.field.phone': 'Телефон',
    'doc.ps.field.language': 'Мова підручника',
    'doc.ps.field.format': 'Формат підручника',
    'doc.ps.field.attending': 'Присутність',
    'doc.ps.field.lodging': 'Ночівля',
    'doc.ps.field.transport': 'Транспорт',
    'doc.ps.field.notes': 'Дод. відомості',
    'doc.ps.send.deadline': 'Заповнений формуляр необхідно надіслати не пізніше',
    'doc.ps.send.how': 'Спосіб надсилання',
    'doc.ps.send.by_email': 'на електронну адресу',
    'doc.ps.send.by_whatsapp': 'через WhatsApp',
    'doc.ps.send.ask_elder': 'уточніть у районного старійшини',
    'doc.ps.send.to_email': 'Надіслати по email',
    'doc.ps.send.to_whatsapp': 'Надіслати в WhatsApp',
    'doc.ps.reg.section.personal': 'Особисті дані',
    'doc.ps.reg.section.attendance': 'Участь у школі',
    'doc.ps.reg.section.transport': 'Транспорт',
    'doc.ps.reg.section.lodging': 'Проживання',
    'doc.ps.reg.section.textbook': 'Підручник для школи',
    'doc.ps.reg.section.extra': 'Додаткова інформація',
    'doc.ps.reg.field.phone': 'Телефон (WhatsApp)',
    'doc.ps.reg.field.attending': 'Чи будете ви присутні на Школі піонерського служіння?',
    'doc.ps.reg.field.attendReason': 'Якщо ні — вкажіть причину',
    'doc.ps.reg.field.transport': 'Чи є у вас автомобіль, на якому ви зможете самостійно добиратися до Школи?',
    'doc.ps.reg.field.lodging': 'Вам потрібне місце для ночівлі?',
    'doc.ps.reg.field.languageOther': 'Вкажіть необхідну мову',
    'doc.ps.reg.field.format': 'Формат підручника (можна вибрати кілька)',
    'doc.ps.reg.field.notes': 'Алергії, особливості харчування, стан здоров’я, інші важливі зауваження',
    'doc.ps.reg.hint.phone': 'Бажано вказати номер, прив’язаний до WhatsApp — так з вами буде легше зв’язатися.',
    'doc.ps.reg.opt.yes': 'Так',
    'doc.ps.reg.opt.no': 'Ні',
    'doc.ps.reg.opt.lang.ru': 'Російська',
    'doc.ps.reg.opt.lang.uk': 'Українська',
    'doc.ps.reg.opt.lang.pl': 'Польська',
    'doc.ps.reg.opt.lang.de': 'Німецька',
    'doc.ps.reg.opt.lang.other': 'Інший',
    'doc.ps.reg.opt.lang.other_lower': 'інший',
    'doc.ps.reg.opt.format.print': 'Друкований примірник',
    'doc.ps.reg.opt.format.jwpub': 'Електронний JWPub',
    'doc.ps.reg.opt.format.pdf': 'PDF',
    'doc.ps.reg.opt.format.epub': 'EPUB',
    'doc.ps.reg.title': 'Форма реєстрації — Школа піонерського служіння',
    'doc.ps.reg.title_page': 'Форма для Школи піонерського служіння',
    'doc.ps.reg.closing': 'Будь ласка, заповніть і надішліть цей формуляр якнайшвидше. Це допоможе вчасно підготувати все необхідне для проведення школи. Дякуємо за співпрацю!',
    'doc.ps.reg.cond_hint': '(тільки якщо вище обрано «{option}»)',
    'doc.ps.pdf.lead': 'Заповніть поля прямо в цьому PDF, збережіть файл і надішліть його назад (див. контакти в кінці документа).',
    'doc.ps.pdf.contact.email': 'Ел. пошта',
    'doc.ps.pdf.contact.whatsapp': 'WhatsApp',
    'doc.ps.pdf.contact_line': '- {label}: {value}',
    'doc.ps.blank.lead': 'Будь ласка, заповніть і передайте районному старійшині якнайшвидше.',
    'doc.ps.list.students_title': 'Список учнів — Школа піонерського служіння',
    'doc.ps.list.class': 'Клас',
    'doc.ps.list.no_class': 'без класу',
    'doc.ps.form.student_title': 'Формуляр учня: {name}',
    'doc.ps.form.no_name': 'Без імені',
    'doc.ps.order.title': 'Замовлення підручників — Школа піонерського служіння',
    'doc.ps.order.requested': 'Запитано учнями',
    'doc.ps.order.in_stock': 'Вже є в наявності',
    'doc.ps.order.to_order_full': 'До замовлення (запитано + 5 - в наявності)',
    'doc.ps.order.to_order': 'До замовлення',
    'doc.ps.order.received': 'Отримано',
    'doc.ps.order.recounted': 'Перераховано при отриманні',
    'doc.ps.order.other_langs': 'Іноземні заявки:',
    'doc.ps.order.braille': 'Заявки Брайль/спецформат (оформляються через S-59):',
    'doc.ps.yes_short': 'так',
    'doc.ps.no_short': 'немає',
    'doc.ps.regs.title': 'Реєстрації учнів — Школа піонерського служіння',
    'doc.ps.regs.phone': 'тел',
    'doc.ps.regs.email': 'email',
    'doc.ps.regs.attending': 'присутність',
    'doc.ps.regs.reason': 'причина',
    'doc.ps.regs.car': 'авто',
    'doc.ps.regs.lodging': 'ночівля',
    'doc.ps.regs.language': 'мова',
    'doc.ps.regs.format': 'формат',
    'doc.ps.s253.title': 'S-253 — Пройшли навчання в Школі піонерського служіння',
    'doc.ps.s253.page1': 'Сторінка 1 — зі «Списку», але НЕ проходили навчання в цьому районі цього року:',
    'doc.ps.s253.page2': 'Сторінка 2 — пройшли навчання, але НЕ були в «Списку»:',
    'doc.ps.s253.no_comment': 'без коментарів',
    'doc.ps.csv.sheet_students': 'Учні',
    'doc.ps.csv.metric': 'Показник',
    'doc.ps.csv.value': 'Значення',
    'doc.ps.csv.reason': 'Причина відсутності',
    'doc.ps.csv.language': 'Мова',
    'doc.ps.csv.languageOther': 'Інша мова',
    'doc.ps.csv.submittedAt': 'Дата відправлення',
    'doc.ps.page.title': 'Реєстрація — Школа піонерського служіння',
    'doc.ps.page.eyebrow': 'Реєстрація учня',
    'doc.ps.page.lead': 'Будь ласка, заповніть усі поля максимально точно — це допоможе організаторам вчасно підготувати все необхідне для Школи.',
    'doc.ps.page.success': 'Дякуємо! Формуляр заповнено і збережено на цьому пристрої. Будь ласка, додатково надішліть копію районному старійшині — кнопки нижче відкриють готовий лист або повідомлення WhatsApp з вашими даними.',
    'doc.ps.page.submit': 'Відправити формуляр',
    'doc.ps.mail.subject': 'Реєстрація — Школа піонерського служіння',
    'doc.ps.sum.title': 'Реєстрація на Школу піонерського служіння',
    'doc.ps.sum.fullname': 'Прізвище Ім\'я',
    'doc.ps.sum.reason': 'причина',
  } });
  global.CWI18n.register({ en: {
    'doc.ps.field.lastName': 'Last name',
    'doc.ps.field.firstName': 'First name',
    'doc.ps.field.address': 'Home address',
    'doc.ps.field.email': 'Email',
    'doc.ps.field.phone': 'Phone',
    'doc.ps.field.language': 'Textbook language',
    'doc.ps.field.format': 'Textbook format',
    'doc.ps.field.attending': 'Attendance',
    'doc.ps.field.lodging': 'Overnight stay',
    'doc.ps.field.transport': 'Transportation',
    'doc.ps.field.notes': 'Additional information',
    'doc.ps.send.deadline': 'The completed form must be sent no later than',
    'doc.ps.send.how': 'Method of sending',
    'doc.ps.send.by_email': 'to the email address',
    'doc.ps.send.by_whatsapp': 'via WhatsApp',
    'doc.ps.send.ask_elder': 'check with the circuit elder',
    'doc.ps.send.to_email': 'Send by email',
    'doc.ps.send.to_whatsapp': 'Send via WhatsApp',
    'doc.ps.reg.section.personal': 'Personal data',
    'doc.ps.reg.section.attendance': 'Participation in school',
    'doc.ps.reg.section.transport': 'Transport',
    'doc.ps.reg.section.lodging': 'Accommodation',
    'doc.ps.reg.section.textbook': 'School textbook',
    'doc.ps.reg.section.extra': 'Additional information',
    'doc.ps.reg.field.phone': 'Phone (WhatsApp)',
    'doc.ps.reg.field.attending': 'Will you attend the Pioneer Service School?',
    'doc.ps.reg.field.attendReason': 'If not — please specify the reason',
    'doc.ps.reg.field.transport': 'Do you have a car you can use to get to the School on your own?',
    'doc.ps.reg.field.lodging': 'Do you need a place to stay overnight?',
    'doc.ps.reg.field.languageOther': 'Specify the required language',
    'doc.ps.reg.field.format': 'Textbook format (you can select multiple)',
    'doc.ps.reg.field.notes': 'Allergies, dietary restrictions, health conditions, other important notes',
    'doc.ps.reg.hint.phone': 'It’s recommended to provide a number linked to WhatsApp — that way it will be easier to reach you.',
    'doc.ps.reg.opt.yes': 'Yes',
    'doc.ps.reg.opt.no': 'No',
    'doc.ps.reg.opt.lang.ru': 'Russian',
    'doc.ps.reg.opt.lang.uk': 'Ukrainian',
    'doc.ps.reg.opt.lang.pl': 'Polish',
    'doc.ps.reg.opt.lang.de': 'German',
    'doc.ps.reg.opt.lang.other': 'Other',
    'doc.ps.reg.opt.lang.other_lower': 'other',
    'doc.ps.reg.opt.format.print': 'Printed copy',
    'doc.ps.reg.opt.format.jwpub': 'Electronic JWPub',
    'doc.ps.reg.opt.format.pdf': 'PDF',
    'doc.ps.reg.opt.format.epub': 'EPUB',
    'doc.ps.reg.title': 'Registration form — Pioneer Service School',
    'doc.ps.reg.title_page': 'Form for Pioneer Service School',
    'doc.ps.reg.closing': 'Please fill out and submit this form as soon as possible. This will help prepare everything needed for the school in a timely manner. Thank you for your cooperation!',
    'doc.ps.reg.cond_hint': '(only if \'{option}\' was selected above)',
    'doc.ps.pdf.lead': 'Fill in the fields directly in this PDF, save the file, and send it back (see contacts at the end of the document).',
    'doc.ps.pdf.contact.email': 'Email',
    'doc.ps.pdf.contact.whatsapp': 'WhatsApp',
    'doc.ps.pdf.contact_line': '- {label}: {value}',
    'doc.ps.blank.lead': 'Please fill it out and submit it to the circuit elder as soon as possible.',
    'doc.ps.list.students_title': 'Student list — Pioneer Service School',
    'doc.ps.list.class': 'Class',
    'doc.ps.list.no_class': 'No class',
    'doc.ps.form.student_title': 'Student form: {name}',
    'doc.ps.form.no_name': 'Unnamed',
    'doc.ps.order.title': 'Textbook order — Pioneer Service School',
    'doc.ps.order.requested': 'Requested by students',
    'doc.ps.order.in_stock': 'Already available',
    'doc.ps.order.to_order_full': 'To order (requested + 5 - available)',
    'doc.ps.order.to_order': 'To order',
    'doc.ps.order.received': 'Received',
    'doc.ps.order.recounted': 'Recounted upon receipt',
    'doc.ps.order.other_langs': 'Foreign language requests:',
    'doc.ps.order.braille': 'Braille/special format requests (processed through S-59):',
    'doc.ps.yes_short': 'Yes',
    'doc.ps.no_short': 'no',
    'doc.ps.regs.title': 'Registration of students — Pioneer Service School',
    'doc.ps.regs.phone': 'phone',
    'doc.ps.regs.email': 'email',
    'doc.ps.regs.attending': 'attendance',
    'doc.ps.regs.reason': 'reason',
    'doc.ps.regs.car': 'car',
    'doc.ps.regs.lodging': 'lodging',
    'doc.ps.regs.language': 'language',
    'doc.ps.regs.format': 'format',
    'doc.ps.s253.title': 'S-253 — Those who attended the Pioneer Service School',
    'doc.ps.s253.page1': 'Page 1 — from the “List,” but did NOT attend training in this district this year:',
    'doc.ps.s253.page2': 'Page 2 — attended training, but were NOT on the “List”:',
    'doc.ps.s253.no_comment': 'no comment',
    'doc.ps.csv.sheet_students': 'Students',
    'doc.ps.csv.metric': 'Indicator',
    'doc.ps.csv.value': 'Value',
    'doc.ps.csv.reason': 'Reason for absence',
    'doc.ps.csv.language': 'Language',
    'doc.ps.csv.languageOther': 'Other language',
    'doc.ps.csv.submittedAt': 'Date sent',
    'doc.ps.page.title': 'Registration — Pioneer Service School',
    'doc.ps.page.eyebrow': 'Student registration',
    'doc.ps.page.lead': 'Please fill in all fields as accurately as possible — this will help the organizers prepare everything needed for the School on time.',
    'doc.ps.page.success': 'Thank you! The form has been filled out and saved on this device. Please also send a copy to the circuit elder — the buttons below will open a ready-made email or WhatsApp message with your details.',
    'doc.ps.page.submit': 'Submit the form',
    'doc.ps.mail.subject': 'Registration — Pioneer Service School',
    'doc.ps.sum.title': 'Registration for the Pioneer Service School',
    'doc.ps.sum.fullname': 'Last Name First Name',
    'doc.ps.sum.reason': 'reason',
  } });
  global.CWI18n.register({ pl: {
    'doc.ps.field.lastName': 'Nazwisko',
    'doc.ps.field.firstName': 'Imię',
    'doc.ps.field.address': 'Adres zamieszkania',
    'doc.ps.field.email': 'Email',
    'doc.ps.field.phone': 'Telefon',
    'doc.ps.field.language': 'Język podręcznika',
    'doc.ps.field.format': 'Format podręcznika',
    'doc.ps.field.attending': 'Obecność',
    'doc.ps.field.lodging': 'Nocleg',
    'doc.ps.field.transport': 'Transport',
    'doc.ps.field.notes': 'Dodatkowe informacje',
    'doc.ps.send.deadline': 'Wypełniony formularz należy wysłać najpóźniej',
    'doc.ps.send.how': 'Sposób wysyłki',
    'doc.ps.send.by_email': 'na adres e-mail',
    'doc.ps.send.by_whatsapp': 'przez WhatsApp',
    'doc.ps.send.ask_elder': 'skonsultuj z starszym obwodu',
    'doc.ps.send.to_email': 'Wyślij e-mailem',
    'doc.ps.send.to_whatsapp': 'Wyślij na WhatsApp',
    'doc.ps.reg.section.personal': 'Dane osobowe',
    'doc.ps.reg.section.attendance': 'Udział w szkole',
    'doc.ps.reg.section.transport': 'Transport',
    'doc.ps.reg.section.lodging': 'Mieszkanie',
    'doc.ps.reg.section.textbook': 'Podręcznik do szkoły',
    'doc.ps.reg.section.extra': 'Dodatkowe informacje',
    'doc.ps.reg.field.phone': 'Telefon (WhatsApp)',
    'doc.ps.reg.field.attending': 'Czy będziesz obecny na Kursie Służby Pionierskiej?',
    'doc.ps.reg.field.attendReason': 'Jeśli nie — podaj powód',
    'doc.ps.reg.field.transport': 'Czy masz samochód, którym możesz samodzielnie dojeżdżać do Szkoły?',
    'doc.ps.reg.field.lodging': 'Czy potrzebujesz miejsca na nocleg?',
    'doc.ps.reg.field.languageOther': 'Podaj potrzebny język',
    'doc.ps.reg.field.format': 'Format podręcznika (można wybrać kilka)',
    'doc.ps.reg.field.notes': 'Alergie, wymagania dietetyczne, stan zdrowia, inne ważne uwagi',
    'doc.ps.reg.hint.phone': 'Wskazane jest podanie numeru powiązanego z WhatsApp — wtedy łatwiej będzie się z Tobą skontaktować.',
    'doc.ps.reg.opt.yes': 'Tak',
    'doc.ps.reg.opt.no': 'Nie',
    'doc.ps.reg.opt.lang.ru': 'Rosyjski',
    'doc.ps.reg.opt.lang.uk': 'Ukraiński',
    'doc.ps.reg.opt.lang.pl': 'Polski',
    'doc.ps.reg.opt.lang.de': 'Niemiecki',
    'doc.ps.reg.opt.lang.other': 'Inny',
    'doc.ps.reg.opt.lang.other_lower': 'inny',
    'doc.ps.reg.opt.format.print': 'Egzemplarz drukowany',
    'doc.ps.reg.opt.format.jwpub': 'Elektroniczny JWPub',
    'doc.ps.reg.opt.format.pdf': 'PDF',
    'doc.ps.reg.opt.format.epub': 'EPUB',
    'doc.ps.reg.title': 'Formularz rejestracyjny — Kurs Służby Pionierskiej',
    'doc.ps.reg.title_page': 'Formularz do Kursu Służby Pionierskiej',
    'doc.ps.reg.closing': 'Proszę wypełnić i wysłać ten formularz jak najszybciej. To pomoże w terminowym przygotowaniu wszystkiego, co potrzebne do przeprowadzenia szkoły. Dziękujemy za współpracę!',
    'doc.ps.reg.cond_hint': '(tylko jeśli wybrano powyżej „{option}”)',
    'doc.ps.pdf.lead': 'Wypełnij pola bezpośrednio w tym PDF, zapisz plik i odeślij go (patrz dane kontaktowe na końcu dokumentu).',
    'doc.ps.pdf.contact.email': 'E-mail',
    'doc.ps.pdf.contact.whatsapp': 'WhatsApp',
    'doc.ps.pdf.contact_line': '- {label}: {value}',
    'doc.ps.blank.lead': 'Proszę wypełnić i przekazać starszemu obwodu jak najszybciej.',
    'doc.ps.list.students_title': 'Lista uczniów — Kurs Służby Pionierskiej',
    'doc.ps.list.class': 'Klasa',
    'doc.ps.list.no_class': 'bez klasy',
    'doc.ps.form.student_title': 'Formularz ucznia: {name}',
    'doc.ps.form.no_name': 'Bez imienia',
    'doc.ps.order.title': 'Zamówienie podręczników — Kurs Służby Pionierskiej',
    'doc.ps.order.requested': 'Zamówione przez uczniów',
    'doc.ps.order.in_stock': 'Już dostępne',
    'doc.ps.order.to_order_full': 'Do zamówienia (zamówione + 5 - dostępne)',
    'doc.ps.order.to_order': 'Do zamówienia',
    'doc.ps.order.received': 'Otrzymano',
    'doc.ps.order.recounted': 'Przeliczone przy odbiorze',
    'doc.ps.order.other_langs': 'Wnioski w języku obcym:',
    'doc.ps.order.braille': 'Wnioski Braille\'a/specjalny format (składane przez S-59):',
    'doc.ps.yes_short': 'tak',
    'doc.ps.no_short': 'nie',
    'doc.ps.regs.title': 'Rejestracja uczniów — Kurs Służby Pionierskiej',
    'doc.ps.regs.phone': 'tel',
    'doc.ps.regs.email': 'email',
    'doc.ps.regs.attending': 'obecność',
    'doc.ps.regs.reason': 'powód',
    'doc.ps.regs.car': 'auto',
    'doc.ps.regs.lodging': 'nocleg',
    'doc.ps.regs.language': 'język',
    'doc.ps.regs.format': 'format',
    'doc.ps.s253.title': 'S-253 — Przeszli szkolenie w Kursie Służby Pionierskiej',
    'doc.ps.s253.page1': 'Strona 1 — z „Listy”, ale NIE przeszli szkolenia w tym rejonie w tym roku:',
    'doc.ps.s253.page2': 'Strona 2 — przeszli szkolenie, ale NIE byli na „Liście”:',
    'doc.ps.s253.no_comment': 'bez komentarza',
    'doc.ps.csv.sheet_students': 'Uczniowie',
    'doc.ps.csv.metric': 'Wskaźnik',
    'doc.ps.csv.value': 'Wartość',
    'doc.ps.csv.reason': 'Powód nieobecności',
    'doc.ps.csv.language': 'Język',
    'doc.ps.csv.languageOther': 'Inny język',
    'doc.ps.csv.submittedAt': 'Data wysłania',
    'doc.ps.page.title': 'Rejestracja — Kurs Służby Pionierskiej',
    'doc.ps.page.eyebrow': 'Rejestracja uczestnika',
    'doc.ps.page.lead': 'Proszę wypełnić wszystkie pola jak najdokładniej — to pomoże organizatorom przygotować wszystko, co potrzebne do Szkoły na czas.',
    'doc.ps.page.success': 'Dziękujemy! Formularz został wypełniony i zapisany na tym urządzeniu. Prosimy dodatkowo wysłać kopię do lokalnego starszego — przyciski poniżej otworzą gotowy e-mail lub wiadomość WhatsApp z twoimi danymi.',
    'doc.ps.page.submit': 'Wyślij formularz',
    'doc.ps.mail.subject': 'Rejestracja — Kurs Służby Pionierskiej',
    'doc.ps.sum.title': 'Rejestracja do Szkoły pionierskiej służby',
    'doc.ps.sum.fullname': 'Nazwisko Imię',
    'doc.ps.sum.reason': 'powód',
  } });
  global.CWI18n.register({ de: {
    'doc.ps.field.lastName': 'Nachname',
    'doc.ps.field.firstName': 'Vorname',
    'doc.ps.field.address': 'Wohnadresse',
    'doc.ps.field.email': 'E-Mail',
    'doc.ps.field.phone': 'Telefon',
    'doc.ps.field.language': 'Lehrbuchsprache',
    'doc.ps.field.format': 'Lehrbuchformat',
    'doc.ps.field.attending': 'Anwesenheit',
    'doc.ps.field.lodging': 'Unterkunft',
    'doc.ps.field.transport': 'Transport',
    'doc.ps.field.notes': 'Zusätzliche Informationen',
    'doc.ps.send.deadline': 'Das ausgefüllte Formular muss spätestens gesendet werden',
    'doc.ps.send.how': 'Versandart',
    'doc.ps.send.by_email': 'an die E-Mail-Adresse',
    'doc.ps.send.by_whatsapp': 'über WhatsApp',
    'doc.ps.send.ask_elder': 'beim Kreisältesten nachfragen',
    'doc.ps.send.to_email': 'Per E-Mail senden',
    'doc.ps.send.to_whatsapp': 'Über WhatsApp senden',
    'doc.ps.reg.section.personal': 'Persönliche Daten',
    'doc.ps.reg.section.attendance': 'Teilnahme an der Schule',
    'doc.ps.reg.section.transport': 'Transport',
    'doc.ps.reg.section.lodging': 'Unterkunft',
    'doc.ps.reg.section.textbook': 'Schulbuch',
    'doc.ps.reg.section.extra': 'Zusätzliche Informationen',
    'doc.ps.reg.field.phone': 'Telefon (WhatsApp)',
    'doc.ps.reg.field.attending': 'Werden Sie an der Pionierdienstschule teilnehmen?',
    'doc.ps.reg.field.attendReason': 'Wenn nicht – geben Sie bitte den Grund an',
    'doc.ps.reg.field.transport': 'Haben Sie ein Auto, mit dem Sie selbstständig zur Schule fahren können?',
    'doc.ps.reg.field.lodging': 'Benötigen Sie eine Unterkunft?',
    'doc.ps.reg.field.languageOther': 'Geben Sie die benötigte Sprache an',
    'doc.ps.reg.field.format': 'Format des Lehrbuchs (mehrere Auswahlmöglichkeiten möglich)',
    'doc.ps.reg.field.notes': 'Allergien, Ernährungsgewohnheiten, Gesundheitszustand, andere wichtige Hinweise',
    'doc.ps.reg.hint.phone': 'Es ist wünschenswert, eine Nummer anzugeben, die mit WhatsApp verbunden ist – so ist es einfacher, mit Ihnen in Kontakt zu treten.',
    'doc.ps.reg.opt.yes': 'Ja',
    'doc.ps.reg.opt.no': 'Nein',
    'doc.ps.reg.opt.lang.ru': 'Russisch',
    'doc.ps.reg.opt.lang.uk': 'Ukrainisch',
    'doc.ps.reg.opt.lang.pl': 'Polnisch',
    'doc.ps.reg.opt.lang.de': 'Deutsch',
    'doc.ps.reg.opt.lang.other': 'Andere',
    'doc.ps.reg.opt.lang.other_lower': 'anderer',
    'doc.ps.reg.opt.format.print': 'Gedrucktes Exemplar',
    'doc.ps.reg.opt.format.jwpub': 'Elektronisches JWPub',
    'doc.ps.reg.opt.format.pdf': 'PDF',
    'doc.ps.reg.opt.format.epub': 'EPUB',
    'doc.ps.reg.title': 'Registrierungsformular – Pionierdienstschule',
    'doc.ps.reg.title_page': 'Formular für die Pionierdienstschule',
    'doc.ps.reg.closing': 'Bitte füllen Sie dieses Formular aus und senden Sie es so schnell wie möglich zurück. Das hilft, alles Notwendige rechtzeitig für die Durchführung der Schule vorzubereiten. Vielen Dank für Ihre Mitarbeit!',
    'doc.ps.reg.cond_hint': '(nur wenn oben „{option}“ ausgewählt wurde)',
    'doc.ps.pdf.lead': 'Füllen Sie die Felder direkt in diesem PDF aus, speichern Sie die Datei und senden Sie sie zurück (siehe Kontakte am Ende des Dokuments).',
    'doc.ps.pdf.contact.email': 'E-Mail',
    'doc.ps.pdf.contact.whatsapp': 'WhatsApp',
    'doc.ps.pdf.contact_line': '- {label}: {value}',
    'doc.ps.blank.lead': 'Bitte füllen Sie das Formular aus und leiten Sie es so schnell wie möglich an den Kreisältesten weiter.',
    'doc.ps.list.students_title': 'Schülerliste – Pionierdienstschule',
    'doc.ps.list.class': 'Klasse',
    'doc.ps.list.no_class': 'ohne Klasse',
    'doc.ps.form.student_title': 'Schülerformular: {name}',
    'doc.ps.form.no_name': 'Ohne Namen',
    'doc.ps.order.title': 'Lehrbuchbestellung – Pionierdienstschule',
    'doc.ps.order.requested': 'Von Schülern angefragt',
    'doc.ps.order.in_stock': 'Bereits verfügbar',
    'doc.ps.order.to_order_full': 'Zur Bestellung (angefragt + 5 - verfügbar)',
    'doc.ps.order.to_order': 'Zur Bestellung',
    'doc.ps.order.received': 'Erhalten',
    'doc.ps.order.recounted': 'Bei Erhalt nachgezählt',
    'doc.ps.order.other_langs': 'Fremdsprachige Anträge:',
    'doc.ps.order.braille': 'Braille-/Spezialformat-Anträge (über S-59 zu bearbeiten):',
    'doc.ps.yes_short': 'ja',
    'doc.ps.no_short': 'nein',
    'doc.ps.regs.title': 'Registrierung der Schüler — Pionierdienstschule',
    'doc.ps.regs.phone': 'Telefon',
    'doc.ps.regs.email': 'E-Mail',
    'doc.ps.regs.attending': 'Anwesenheit',
    'doc.ps.regs.reason': 'Grund',
    'doc.ps.regs.car': 'Auto',
    'doc.ps.regs.lodging': 'Unterkunft',
    'doc.ps.regs.language': 'Sprache',
    'doc.ps.regs.format': 'Format',
    'doc.ps.s253.title': 'S-253 — Schulung absolviert in der Pionierdienstschule',
    'doc.ps.s253.page1': 'Seite 1 — aus der „Liste“, aber in diesem Jahr nicht in diesem Gebiet geschult:',
    'doc.ps.s253.page2': 'Seite 2 — geschult, aber nicht auf der „Liste“:',
    'doc.ps.s253.no_comment': 'ohne Kommentar',
    'doc.ps.csv.sheet_students': 'Schüler',
    'doc.ps.csv.metric': 'Indikator',
    'doc.ps.csv.value': 'Wert',
    'doc.ps.csv.reason': 'Grund für Abwesenheit',
    'doc.ps.csv.language': 'Sprache',
    'doc.ps.csv.languageOther': 'Andere Sprache',
    'doc.ps.csv.submittedAt': 'Versanddatum',
    'doc.ps.page.title': 'Registrierung – Pionierdienstschule',
    'doc.ps.page.eyebrow': 'Schülerregistrierung',
    'doc.ps.page.lead': 'Bitte füllen Sie alle Felder so genau wie möglich aus – das hilft den Organisatoren, alles Notwendige rechtzeitig für die Schule vorzubereiten.',
    'doc.ps.page.success': 'Danke! Das Formular ist ausgefüllt und auf diesem Gerät gespeichert. Bitte senden Sie zusätzlich eine Kopie an den Kreisältesten – die untenstehenden Schaltflächen öffnen einen fertigen Brief oder WhatsApp-Nachricht mit Ihren Daten.',
    'doc.ps.page.submit': 'Formular absenden',
    'doc.ps.mail.subject': 'Registrierung – Pionierdienstschule',
    'doc.ps.sum.title': 'Anmeldung für die Pionierdienstschule',
    'doc.ps.sum.fullname': 'Nachname Vorname',
    'doc.ps.sum.reason': 'Grund',
  } });

  /**
   * Языки, для которых документные строки РЕАЛЬНО переведены. Переключатель
   * языка документа помечает остальные как «пока по-русски» — иначе выбор
   * «Polski» молча отдавал бы русскую анкету, и это выглядело бы как баг.
   * Добавляя переводы выше — добавить код и сюда.
   */
  global.PS_DOC_LANGS_READY = ['ru', 'uk', 'en', 'pl', 'de'];
})(typeof self !== 'undefined' ? self : this);
