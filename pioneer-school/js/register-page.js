/* Circuit Workspace — pioneer-school/js/register-page.js
   Сценарий публичной анкеты (register.html): сборка формы, отправка, баннер.
   Стоял inline в конце <body>; вынесен ради Content-Security-Policy (CSP,
   24.10.2026). Подключается там же, после js/modules/registrationForm.js. */
(function () {
  // Разметку переводим сразу: PSDocLang.init() отработал ещё в <head>,
  // но применить перевод можно только когда разметка разобрана.
  PSDocLang.applyDoc();

  // Поля анкеты — из схемы. Обязательно ПОСЛЕ PSDocLang.init(): подписи
  // приходят из геттера sections уже на языке документа, и сборка формы до
  // инициализации языка заморозила бы её на русском.
  const regForm = document.getElementById('reg-form');
  const syncConditionals = RegistrationForm.mount(
    regForm, RegistrationSchema, document.getElementById('reg-fields')
  );

  const pageTitle = document.getElementById('page-title');
  const defaultTitle = pageTitle.textContent;
  const echoes = {
    deadline: document.getElementById('deadline-echo'),
    email: document.getElementById('email-echo'),
    whatsapp: document.getElementById('whatsapp-echo')
  };

  // Дата в языке документа (ru-RU / uk-UA / en-GB / pl-PL / de-DE).
  function formatDocDate(iso) { return PSDocLang.date(iso) || null; }

  async function loadConfigAndRender() {
    // Настройки задаются районным старейшиной в приложении (раздел «Регистрация учащихся»).
    // Если формуляр открыт на другом устройстве (например, у самого пионера), своей
    // локальной копии настроек там не будет — тогда показываем нейтральные подсказки.
    let cfg = { deadline: '', email: '', whatsapp: '', title: '' };
    try {
      cfg = await DB.getMeta('registrationConfig', cfg);
    } catch (e) { /* IndexedDB недоступна — оставляем значения по умолчанию */ }

    const askElder = D('doc.ps.send.ask_elder');
    const deadline = formatDocDate(cfg.deadline);
    echoes.deadline.textContent = deadline || askElder;
    echoes.deadline.classList.toggle('placeholder-empty', !deadline);

    echoes.email.textContent = cfg.email || askElder;
    echoes.email.classList.toggle('placeholder-empty', !cfg.email);

    echoes.whatsapp.textContent = cfg.whatsapp || askElder;
    echoes.whatsapp.classList.toggle('placeholder-empty', !cfg.whatsapp);

    pageTitle.textContent = cfg.title || defaultTitle;
    return cfg;
  }

  let currentConfig = { deadline: '', email: '', whatsapp: '', title: '' };
  loadConfigAndRender().then((cfg) => { currentConfig = cfg; });

  // Условная логика («если нет — укажите причину», «другой язык») живёт в
  // RegistrationForm.wire() и строится из showIf в схеме. Отдельных
  // обработчиков на каждое поле здесь больше нет — новое условное поле
  // включается одной строкой схемы.

  // ---- отправка формы ----
  const form = regForm;
  const successBanner = document.getElementById('success-banner');
  const shareRow = document.getElementById('share-row');

  // Сбор данных формы в одну запись — нужен и при отправке, и при выгрузке PDF
  // до отправки, поэтому вынесен из обработчика submit.
  function collectRecord() {
    const formData = new FormData(form);
    const record = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'format') {
        record.format = record.format || [];
        record.format.push(value);
      } else {
        record[key] = value;
      }
    }
    return record;
  }

  // Текст письма/сообщения, которое уходит районному старейшине.
  // Подписи вариантов — из схемы анкеты: она единственный источник и уже
  // на языке документа. Прежняя версия брала их из модуля Registration,
  // который на этой странице вообще не загружался (см. комментарий у
  // <script> ниже) — и обработчик отправки падал на этой самой строке.
  function buildSummaryText(record) {
    const opt = (field, value) => (value ? RegistrationSchema.labelForValue(field, value) : '');
    const lang = record.language === 'other'
      ? (record.languageOther || D('doc.ps.reg.opt.lang.other_lower'))
      : (opt('language', record.language) || record.language);
    const formats = (record.format || []).map((f) => opt('format', f) || f).join(', ');
    const reason = record.attending === 'no'
      ? ` (${D('doc.ps.sum.reason')}: ${record.attendReason || '-'})`
      : '';
    return `${D('doc.ps.sum.title')}
${D('doc.ps.sum.fullname')}: ${record.lastName} ${record.firstName}
${D('doc.ps.field.address')}: ${record.address || '-'}
${D('doc.ps.field.email')}: ${record.email || '-'}
${D('doc.ps.field.phone')}: ${record.phone || '-'}
${D('doc.ps.field.attending')}: ${opt('attending', record.attending) || '-'}${reason}
${D('doc.ps.field.transport')}: ${opt('transport', record.transport) || '-'}
${D('doc.ps.field.lodging')}: ${opt('lodging', record.lodging) || '-'}
${D('doc.ps.field.language')}: ${lang || '-'}
${D('doc.ps.field.format')}: ${formats || '-'}
${D('doc.ps.field.notes')}: ${record.notes || '-'}`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const record = collectRecord();
    record.id = 'reg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    record.submittedAt = new Date().toISOString();

    try {
      await DB.put('registrations', record);
    } catch (err) {
      console.warn('Не удалось сохранить локально:', err);
    }

    const summary = buildSummaryText(record);
    const subject = encodeURIComponent(D('doc.ps.mail.subject'));
    const mailtoHref = currentConfig.email
      ? `mailto:${encodeURIComponent(currentConfig.email)}?subject=${subject}&body=${encodeURIComponent(summary)}`
      : `mailto:?subject=${subject}&body=${encodeURIComponent(summary)}`;
    const waNumber = (currentConfig.whatsapp || '').replace(/[^\d+]/g, '');
    const waHref = `https://wa.me/${waNumber.replace('+', '')}?text=${encodeURIComponent(summary)}`;

    shareRow.innerHTML = `
      <a class="md-btn md-btn-filled md-btn-tonal" href="${mailtoHref}">${D('doc.ps.send.to_email')}</a>
      ${waNumber ? `<a class="md-btn md-btn-outlined md-btn-tonal" href="${waHref}" target="_blank" rel="noopener">${D('doc.ps.send.to_whatsapp')}</a>` : ''}
    `;
    /* Вторая кнопка выгрузки PDF («Скачать формуляр») удалена 30.08.2026
       вместе со всем трактом — см. комментарий у скриптов ниже. Письмо и
       WhatsApp уносят анкету текстом, и этого достаточно. */

    successBanner.classList.add('show');
    successBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.reset();
    // После reset() значения ушли, а раскрытые условные блоки остались бы
    // висеть над пустой формой — sync() приводит их в согласие с данными.
    syncConditionals();
  });

  // Раньше кнопка вызывала window.print(): результат зависел от браузера, а на
  // телефонах «сохранить как PDF» доступно не везде. Теперь формуляр собирается
  // тем же генератором, что и остальные PDF модуля (js/export/pdfExport.js).
})();
