// app.js — роутинг и рендеринг экранов
const APP_VERSION = '1.13.8';

let LESSONS_SEED = null;

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Экранирование пользовательских данных перед вставкой в innerHTML.
// Без него введённые вручную или импортированные из PDF значения с символами
// < > & " ' молча искажались при отображении (например, «Класс <b>А</b>»
// показывался как «Класс А»), а незакрытый тег ломал вёрстку таблицы.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

const ROUTES = ['dashboard', 'anketa', 'assignment', 'registration', 'substitutes', 'students',
  'textbooks', 'schedule', 'practical', 'review', 'afterschool', 'signlanguage', 'backup',
  'docsarchive'];
const DEFAULT_ROUTE = 'dashboard';

function showRoute(route) {
  // Неизвестный маршрут (устаревшая ссылка, чужой #hash, опечатка) раньше
  // прятал все экраны и не показывал ни одного — пользователь видел пустую
  // страницу без объяснения. Теперь неизвестное имя откатывается на дашборд.
  const safeRoute = ROUTES.includes(route) ? route : DEFAULT_ROUTE;
  $all('.route').forEach((el) => el.classList.add('hidden'));
  const target = document.getElementById('route-' + safeRoute);
  if (target) target.classList.remove('hidden');
  $all('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.route === safeRoute));
  if (window.location.hash.slice(1) !== safeRoute) window.location.hash = safeRoute;
  renderRoute(safeRoute);
}

async function renderRoute(route) {
  try {
    await renderRouteInner(route);
  } catch (error) {
    // Раньше любой сбой рендера экрана оставлял пустую область без единого
    // сообщения (промис отклонялся в никуда). Теперь ошибка видна.
    console.error(T('ps.app.render_error', { screen: route }), error);
    const target = document.getElementById('route-' + route);
    if (target) {
      const box = document.createElement('p');
      box.className = 'hint';
      box.style.color = 'var(--warn)';
      box.textContent = T('ps.app.load_failed', { error: error.message });
      target.prepend(box);
    }
  }
}

async function renderRouteInner(route) {
  switch (route) {
    case 'dashboard': return renderDashboard();
    case 'anketa': return renderAnketa();
    case 'assignment': return renderAssignment();
    case 'registration': return renderRegistration();
    case 'substitutes': return renderSubstitutes();
    case 'students': return renderStudents();
    case 'textbooks': return renderTextbooks();
    case 'schedule': return renderSchedule();
    case 'practical': return renderPractical();
    case 'review': return renderReview();
    case 'afterschool': return renderAfterSchool();
    case 'signlanguage': return renderSignLanguage();
    case 'backup': return; // static
    case 'docsarchive': return renderDocsArchive();
  }
}

/* ---------- АРХИВ ВЫДАННЫХ ДОКУМЕНТОВ (задача Б3, 25.08.2026) ----------

   Модуль писал снимки в общий архив, но своего экрана не имел: увидеть
   выданное можно было только из «Документов». Карточку рисует общий
   `CWDocsView` — тот же, что в Конгрессах; модуль отвечает за отбор и за то,
   что вокруг карточки.

   Отбор — `listAll({module:'pioneer-school'})`: приглашения учащихся этого
   модуля, свежие сверху. Подпись учащегося стоит НАД карточкой, потому что
   сама карточка общая и про сущность-владельца ничего не знает. */
const docsArchive = { rows: null, search: '', bound: false };

function docsArchiveBox() { return document.getElementById('docs-archive-list'); }

function renderDocsArchiveList() {
  const box = docsArchiveBox();
  if (!box || !self.CWDocsView) return;
  if (!docsArchive.rows) { box.innerHTML = self.CWDocsView.stateHtml('loading'); return; }
  if (!docsArchive.rows.length) { box.innerHTML = self.CWDocsView.stateHtml('empty'); return; }
  const q = docsArchive.search.trim().toLowerCase();
  const rows = q ? docsArchive.rows.filter((d) =>
    String(d.entityTitle || '').toLowerCase().includes(q)
    || String(d.subject || '').toLowerCase().includes(q)
    || String(d.body || '').toLowerCase().includes(q)) : docsArchive.rows;
  if (!rows.length) { box.innerHTML = self.CWDocsView.stateHtml('nothing'); return; }
  box.innerHTML = rows.map((d) => '<div class="docs-arc__item"><div class="docs-arc__owner">'
    + esc(d.entityTitle || T('doc.archive_entity_gone'))
    + '</div>' + self.CWDocsView.cardHtml(d) + '</div>').join('');
}

async function renderDocsArchive() {
  const box = docsArchiveBox();
  if (!box) return;
  if (!self.CWDocs || !self.CWDocs.available() || !self.CWDocsView) {
    docsArchive.rows = [];
    renderDocsArchiveList();
    return;
  }
  /* Обработчики вешаются ОДИН раз за жизнь страницы: экран здесь не
     уничтожается при уходе, а только прячется классом `hidden`, поэтому
     повторный вход не должен добавлять второй слушатель — иначе удаление
     снимка сработало бы столько раз, сколько раз заходили на экран. */
  if (!docsArchive.bound) {
    docsArchive.bound = true;
    const search = document.getElementById('docs-archive-search');
    if (search) search.addEventListener('input', () => {
      docsArchive.search = search.value;
      renderDocsArchiveList();
    });
    self.CWDocsView.bind(box, () => docsArchive.rows || [], {
      /* Тостов у модуля нет, как и в Конгрессах: копирование подтверждается
         самим фактом, что текст оказался в буфере. Заводить ради этого
         механизм уведомлений — отдельная задача, не эта. */
      onCopied: () => {},
      onRemoved: () => { docsArchive.rows = null; renderDocsArchive(); },
    });
  }
  docsArchive.rows = null;
  renderDocsArchiveList();
  try {
    docsArchive.rows = await self.CWDocs.listAll({ module: 'pioneer-school' }) || [];
  } catch (error) {
    console.error('Школа: не удалось прочитать архив документов', error);
    docsArchive.rows = [];
  }
  renderDocsArchiveList();
}

// ---------- DASHBOARD ----------
async function renderDashboard() {
  const [assignment, students, order, substitutes, registrations] = await Promise.all([
    Assignment.get(), Students.list(), Textbooks.getOrder(), Substitutes.list(), Registration.list()
  ]);
  const cards = [
    { title: T('ps.ui.naznachenie'), value: assignment.startDate ? DateUtils.formatRu(assignment.startDate) : T('ps.app.ne_zapolneno'), sub: assignment.location || '—' },
    { title: T('ps.app.registracii'), value: registrations.length, sub: T('ps.app.polucheno_formulyarov') },
    { title: T('ps.ui.uchaschiesya'), value: students.length, sub: T('ps.app.vsego_v_baze') },
    { title: T('ps.ui.zamestiteli'), value: substitutes.length, sub: T('ps.app.rekomendovano') },
    { title: T('ps.app.uchebniki_k_zakazu'), value: Textbooks.calcOrderQuantity(order), sub: T('ps.app.shtuk') }
  ];
  const el = $('#dashboard-cards');
  el.innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-title">${esc(c.title)}</div>
      <div class="stat-value">${esc(c.value)}</div>
      <div class="stat-sub">${esc(c.sub)}</div>
    </div>`).join('');
}

// ---------- ANKETA ----------
async function renderAnketa() {
  const data = await Anketa.get();
  $('#location-requirements').innerHTML = Anketa.LOCATION_REQUIREMENTS.map((r) => `<li>${r}</li>`).join('');
  $('#substitute-requirements').innerHTML = Anketa.SUBSTITUTE_REQUIREMENTS.map((r) => `<li>${r}</li>`).join('');
  $('#unavailable-dates').value = data.unavailableDates || '';
  renderLocationsList(data.proposedLocations || []);

  $('#add-location-btn').onclick = async () => {
    const name = prompt(T('ps.app.nazvanie_zala_carstva'));
    if (!name) return;
    const number = prompt(T('ps.app.nomer_sobraniya_odno_sobranie')) || '';
    const d = await Anketa.get();
    d.proposedLocations = d.proposedLocations || [];
    d.proposedLocations.push({ hallName: name, hallNumber: number, notes: '' });
    await Anketa.save(d);
    renderLocationsList(d.proposedLocations);
  };

  $('#save-anketa-btn').onclick = async () => {
    const d = await Anketa.get();
    d.unavailableDates = $('#unavailable-dates').value;
    await Anketa.save(d);
    alert(T('ps.app.anketa_sohranena'));
  };
}

function renderLocationsList(locations) {
  const el = $('#locations-list');
  if (!locations.length) { el.innerHTML = `<p class="hint">${T('ps.app.mest_poka_ne_dobavleno')}</p>`; return; }
  el.innerHTML = locations.map((l, i) => `
    <div class="list-row">
      <span>${esc(l.hallName)} ${l.hallNumber ? '(' + esc(l.hallNumber) + ')' : ''}</span>
      <button class="md-btn md-btn-text remove-location" data-index="${i}">${T('ps.app.udalit')}</button>
    </div>`).join('');
  $all('.remove-location', el).forEach((btn) => {
    btn.onclick = async () => {
      const d = await Anketa.get();
      d.proposedLocations.splice(Number(btn.dataset.index), 1);
      await Anketa.save(d);
      renderLocationsList(d.proposedLocations);
    };
  });
}

// ---------- ASSIGNMENT ----------
async function renderAssignment() {
  const data = await Assignment.get();
  $('#a-start').value = data.startDate || '';
  $('#a-end').value = data.endDate || '';
  $('#a-location').value = data.location || '';
  $('#a-teacherA').value = data.teacherA || '';
  $('#a-teacherB').value = data.teacherB || '';
  $('#a-teacherB-branch').checked = !!data.teacherBAssignedByBranch;
  $('#second-teacher-note').textContent = data.secondTeacherNote || '';

  $('#save-assignment-btn').onclick = async () => {
    const payload = {
      startDate: $('#a-start').value,
      endDate: $('#a-end').value,
      location: $('#a-location').value,
      teacherA: $('#a-teacherA').value,
      teacherB: $('#a-teacherB').value,
      teacherBAssignedByBranch: $('#a-teacherB-branch').checked,
      secondTeacherNote: data.secondTeacherNote
    };
    const errors = Assignment.validate(payload);
    if (errors.length) return Validators.showErrors(errors);
    await Assignment.save(payload);
    alert(T('ps.app.naznachenie_sohraneno'));
    renderDashboard();
  };

  await renderAssignmentDocMenu();
}

// Меню «Создать документ» на экране «Назначение». Пунктами идут учащиеся:
// тип документа здесь один, а адресат без выбора неизвестен. Выбывшие в меню
// не попадают — им письмо не рассылают.
async function renderAssignmentDocMenu() {
  const btn = $('#assignment-doc-btn');
  const menu = $('#assignment-doc-menu');
  if (!btn || !menu) return;

  const fill = async () => {
    const students = (await Students.list())
      .filter((s) => (s.values || {}).status !== 'withdrawn');
    if (!students.length) {
      menu.innerHTML = `<div class="doc-menu-empty">${esc(T('ps.docs.no_students'))}</div>`;
      return;
    }
    menu.innerHTML = students.map((s) => {
      const values = s.values || {};
      const name = `${values.lastName || ''} ${values.firstName || ''}`.trim() || T('ps.docs.no_name');
      return `<button type="button" role="menuitem" data-id="${esc(s.id)}">
        <span class="doc-mi-name">${esc(name)}</span>
        <span class="doc-mi-sub">${esc(values.congregation || '—')}</span>
      </button>`;
    }).join('');
    $all('[data-id]', menu).forEach((item) => {
      item.onclick = async (e) => {
        e.stopPropagation();
        closeAssignmentDocMenu();
        const student = (await Students.list()).find((s) => s.id === item.dataset.id);
        if (student) await openLetterComposer(student);
      };
    });
  };

  btn.onclick = async (e) => {
    e.stopPropagation();
    if (!menu.hidden) return closeAssignmentDocMenu();
    // Список читается в момент открытия, а не при отрисовке экрана: учащегося
    // могли добавить на соседнем экране, не возвращаясь сюда.
    await fill();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };
  // Обработчик вешается один раз на документ, а не при каждой отрисовке
  // экрана: renderAssignment() зовётся при каждой смене языка, и накопленные
  // копии закрывали бы меню по нескольку раз подряд.
  if (!renderAssignmentDocMenu._bound) {
    document.addEventListener('click', closeAssignmentDocMenu);
    renderAssignmentDocMenu._bound = true;
  }
  closeAssignmentDocMenu();
}

function closeAssignmentDocMenu() {
  const btn = $('#assignment-doc-btn');
  const menu = $('#assignment-doc-menu');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// ---------- REGISTRATION ----------
async function renderRegistration() {
  const cfg = await Registration.getConfig();
  $('#reg-cfg-deadline').value = cfg.deadline || '';
  $('#reg-cfg-email').value = cfg.email || '';
  $('#reg-cfg-phone').value = cfg.phone || '';
  $('#reg-cfg-whatsapp').value = cfg.whatsapp || '';
  $('#reg-cfg-title').value = cfg.title || '';
  $('#reg-cfg-extra').value = cfg.extraInstructions || '';

  // Язык документа. Меняется здесь, а не в шапке: это свойство рассылаемых
  // бумаг, а не оболочки. Ссылка на онлайн-анкету получает тот же язык
  // параметром ?lang= — иначе пионер увидел бы форму на языке своего браузера.
  const docLangSelect = $('#doc-language');
  PSDocLang.fillSelect(docLangSelect);
  const renderDocLangHint = () => {
    const lang = PSDocLang.get();
    const url = new URL('register.html', location.href);
    url.searchParams.set('lang', lang);
    $('#doc-language-hint').textContent = T('ps.ui.doc_lang_hint', { link: url.href });
  };
  renderDocLangHint();
  docLangSelect.onchange = () => {
    PSDocLang.set(docLangSelect.value, { scope: 'module' });
    PSDocLang.fillSelect(docLangSelect);
    renderDocLangHint();
  };

  const collectConfig = () => ({
    deadline: $('#reg-cfg-deadline').value,
    email: $('#reg-cfg-email').value,
    phone: $('#reg-cfg-phone').value,
    whatsapp: $('#reg-cfg-whatsapp').value,
    title: $('#reg-cfg-title').value,
    extraInstructions: $('#reg-cfg-extra').value
  });

  $('#save-reg-config-btn').onclick = async () => {
    await Registration.saveConfig(collectConfig());
    alert(T('ps.app.nastroyki_sohraneny'));
  };

  $('#generate-interactive-pdf-btn').onclick = async () => {
    const status = $('#pdf-form-status');
    const btn = $('#generate-interactive-pdf-btn');
    btn.disabled = true;
    status.textContent = T('ps.app.formiruyu_pdf_anketu');
    try {
      // Сохраняем настройки заодно — чтобы сгенерированный файл всегда
      // соответствовал тому, что организатор видит на экране.
      const current = collectConfig();
      await Registration.saveConfig(current);
      await PdfFormExport.download(current, RegistrationSchema);
      status.textContent = T('ps.app.gotovo_pdf_anketa_skachana');
    } catch (e) {
      status.textContent = T('ps.app.pdf_form_failed', { error: e.message });
    } finally {
      btn.disabled = false;
    }
  };

  $('#download-reg-blank-pdf').onclick = async () => {
    try {
      await PdfExport.downloadRegistrationBlankForm(await Registration.getConfig());
    } catch (e) {
      alert(T('ps.app.pdf_failed', { error: e.message }));
    }
  };

  $('#add-registration-btn').onclick = async () => {
    const reg = {
      id: DB.uid(),
      lastName: $('#reg-lastname').value,
      firstName: $('#reg-firstname').value,
      email: $('#reg-email').value,
      phone: $('#reg-phone').value,
      address: $('#reg-address').value,
      attending: $('#reg-attending').value,
      transport: $('#reg-transport').value,
      lodging: $('#reg-lodging').value,
      language: $('#reg-language').value,
      notes: $('#reg-notes').value,
      format: []
    };
    try {
      await Registration.save(reg);
      ['#reg-lastname', '#reg-firstname', '#reg-email', '#reg-phone', '#reg-address', '#reg-notes'].forEach((s) => $(s).value = '');
      renderRegistrationsTable(await Registration.list());
      renderDashboard();
    } catch (e) { alert(e.message); }
  };

  $('#export-reg-pdf').onclick = async () => PdfExport.downloadRegistrations(await Registration.list());
  $('#export-reg-csv').onclick = async () => ExcelExport.downloadRegistrations(await Registration.list());

  renderRegistrationsTable(await Registration.list());
}

function renderRegistrationsTable(list) {
  const tbody = $('#registrations-table tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="hint">${T('ps.app.registraciy_poka_net')}</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((r) => `
    <tr>
      <td>${esc(r.lastName)} ${esc(r.firstName)}${r.convertedToStudentId ? ` <span class="badge-warn" style="background:#3E6B4F;">${T('ps.app.uchaschiysya')}</span>` : ''}</td>
      <td>${esc(r.email || '')}<br>${esc(r.phone || '')}</td>
      <td>${esc(Registration.YES_NO_LABELS[r.attending] || '—')}${r.attending === 'no' && r.attendReason ? ' — ' + esc(r.attendReason) : ''}</td>
      <td>${esc(T('ps.app.reg_transport', { car: Registration.YES_NO_LABELS[r.transport] || '—', lodging: Registration.YES_NO_LABELS[r.lodging] || '—' }))}</td>
      <td>${esc(Registration.LANGUAGE_LABELS[r.language] || r.language || '—')}${(r.format || []).length ? ' · ' + r.format.map((f) => esc(Registration.FORMAT_LABELS[f] || f)).join(', ') : ''}</td>
      <td>
        ${r.convertedToStudentId ? '' : `<button class="md-btn md-btn-text convert-reg" data-id="${esc(r.id)}" style="color:var(--accent);">${T('ps.app.v_uchaschiesya')}</button>`}
        <button class="md-btn md-btn-text remove-reg" data-id="${esc(r.id)}">${T('ps.app.udalit')}</button>
      </td>
    </tr>`).join('');

  $all('.remove-reg', tbody).forEach((btn) => {
    btn.onclick = async () => {
      await Registration.remove(btn.dataset.id);
      renderRegistrationsTable(await Registration.list());
      renderDashboard();
    };
  });
  $all('.convert-reg', tbody).forEach((btn) => {
    btn.onclick = async () => {
      const list = await Registration.list();
      const reg = list.find((r) => r.id === btn.dataset.id);
      if (!reg) return;
      if (!reg.congregation) {
        const congregation = prompt(T('ps.app.v_formulyare_net_polya'));
        if (congregation === null) return;
        reg.congregation = congregation;
      }
      await Registration.convertToStudent(reg);
      renderRegistrationsTable(await Registration.list());
      renderDashboard();
      alert(T('ps.app.uchaschiysya_dobavlen_v_razdel'));
    };
  });
}

// ---------- SUBSTITUTES ----------
async function renderSubstitutes() {
  const list = await Substitutes.list();
  $('#substitute-checklist').innerHTML = Substitutes.NOTIFICATION_CHECKLIST.map((r) => `<li>${r}</li>`).join('');
  renderSubstitutesList(list);

  $('#add-substitute-btn').onclick = async () => {
    const sub = {
      id: DB.uid(),
      fullName: $('#s-name').value,
      age: $('#s-age').value ? Number($('#s-age').value) : null,
      rank: $('#s-rank').value ? Number($('#s-rank').value) : null,
      approvedByBranch: $('#s-approved').value === 'true'
    };
    try {
      await Substitutes.save(sub);
      $('#s-name').value = ''; $('#s-age').value = ''; $('#s-rank').value = ''; $('#s-approved').value = 'false';
      renderSubstitutesList(await Substitutes.list());
    } catch (e) {
      alert(e.message);
    }
  };
}

function renderSubstitutesList(list) {
  const el = $('#substitutes-list');
  if (!list.length) { el.innerHTML = `<p class="hint">${T('ps.app.zamestiteli_poka_ne_dobavleny')}</p>`; return; }
  el.innerHTML = `<div class="panel"><table class="md-table"><thead><tr><th>#</th><th>${T('ps.ui.imya')}</th><th>${T('ps.ui.vozrast')}</th><th>${T('ps.app.utverzhden')}</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr>
      <td>${esc(s.rank ?? '—')}</td>
      <td>${esc(s.fullName)}${s.age >= 80 ? ' <span class="badge-warn">80+</span>' : ''}</td>
      <td>${esc(s.age ?? '—')}</td>
      <td>${s.approvedByBranch ? T('ps.ui.da') : T('ps.ui.net')}</td>
      <td><button class="md-btn md-btn-text remove-sub" data-id="${esc(s.id)}">${T('ps.app.udalit')}</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
  $all('.remove-sub', el).forEach((btn) => {
    btn.onclick = async () => { await Substitutes.remove(btn.dataset.id); renderSubstitutesList(await Substitutes.list()); };
  });
}

// ---------- MODAL HELPERS ----------
function openModal(innerHtml) {
  $('#modal-root').innerHTML = `<div class="modal-overlay" id="active-modal"><div class="modal-box">${innerHtml}</div></div>`;
  $('#active-modal').addEventListener('click', (e) => { if (e.target.id === 'active-modal') closeModal(); });
}
function closeModal() { $('#modal-root').innerHTML = ''; }

// ---------- ДОКУМЕНТЫ МОДУЛЯ (фаза 6) ----------
// Композер: карточка/строка учащегося → предпросмотр с подставленными данными
// → действия. Три свойства держат проектное требование «не больше двух
// действий от сущности до предпросмотра», и «улучшать» их нельзя:
//   1. Кнопка на верхнем уровне (в строке таблицы и на экране «Назначение»).
//   2. Язык не спрашивается — берётся из PSDocLang.
//   3. Источник данных не выбирается — учащийся уже известен.
//
// Из строки учащегося меню НЕТ намеренно: документ в модуле один, и меню из
// одного пункта было бы лишним кликом. Появится второй документ — появится и
// меню, как в Клиндарии.

let composerState = null;

async function openLetterComposer(student) {
  if (!Letters.available()) return alert(T('ps.docs.unavailable'));
  let doc;
  try {
    doc = await Letters.build(student);
  } catch (error) {
    console.error(error);
    return alert(T('ps.docs.build_failed'));
  }
  if (!doc) return alert(T('ps.docs.build_failed'));

  composerState = { doc, student, edited: false };

  const pending = doc.pending
    ? `<p class="doc-pending">${esc(T('ps.docs.pending', { lang: doc.lang.toUpperCase() }))}</p>`
    : '';
  openModal(`
    <h2>${esc(doc.title)}</h2>
    <p class="hint">${esc(T('ps.docs.lang_line', {
      entity: Letters.studentName(student),
      lang: doc.lang.toUpperCase()
    }))}</p>
    ${pending}
    <div class="doc-paper" id="doc-paper"></div>
    <p class="hint" id="doc-edit-hint" hidden>${esc(T('ps.docs.edit_hint'))}</p>
    <div class="modal-close-row">
      <button class="md-btn md-btn-tonal" id="doc-edit-btn">${esc(T('ps.docs.edit_once'))}</button>
      <button class="md-btn md-btn-outlined" id="doc-history-btn">${esc(T('ps.docs.to_history'))}</button>
      <button class="md-btn md-btn-outlined" id="doc-print-btn">${esc(T('ps.docs.print'))}</button>
      <button class="md-btn md-btn-filled" id="doc-pdf-btn">${esc(T('ps.docs.pdf'))}</button>
      <button class="md-btn md-btn-text" id="doc-close-btn">${esc(T('common.close'))}</button>
    </div>
  `);

  // Текст кладём через textContent, а не в шаблон строки: тело письма —
  // пользовательские данные, и любая угловая скобка в нём не должна стать
  // разметкой.
  $('#doc-paper').textContent = doc.body;

  $('#doc-close-btn').onclick = () => { composerState = null; closeModal(); };
  $('#doc-edit-btn').onclick = () => enableComposerEdit();
  $('#doc-print-btn').onclick = () => printComposerDoc();
  $('#doc-pdf-btn').onclick = () => pdfComposerDoc();
  $('#doc-history-btn').onclick = async () => {
    const saved = await Letters.snapshot(currentComposerDoc(), composerState.student, 'manual', composerState.edited);
    alert(saved ? T('ps.docs.saved') : T('ps.docs.build_failed'));
  };
}

// Правка помечает снимок edited в момент ВКЛЮЧЕНИЯ, а не по факту различий:
// знать, что документ трогали руками, полезно, даже если текст вернули как был.
function enableComposerEdit() {
  if (!composerState || composerState.edited) return;
  composerState.edited = true;
  const paper = $('#doc-paper');
  paper.contentEditable = 'true';
  paper.focus();
  $('#doc-edit-btn').textContent = T('ps.docs.edit_on');
  $('#doc-edit-btn').disabled = true;
  $('#doc-edit-hint').hidden = false;
}

// Текущее содержимое предпросмотра. После правки берём из DOM: именно
// правленый текст должен уйти и в печать, и в PDF, и в архив.
function currentComposerDoc() {
  if (!composerState) return null;
  const paper = $('#doc-paper');
  if (!composerState.edited || !paper) return composerState.doc;
  return { ...composerState.doc, body: paper.innerText || paper.textContent || '' };
}

// Печать идёт через изолированное окно, а не через @media print приложения:
// у оболочки свои правила печати, и документ в них выглядел бы как экран.
// Само окно, типографика бумаги и задержка перед печатью — в shared/print.js:
// здесь и в композере Клиндария этот код был написан дважды независимо.
function printComposerDoc() {
  const doc = currentComposerDoc();
  if (!doc) return;
  const ok = CWPrint.document({
    title: doc.title,
    lang: PSDocLang.get(),
    // Тело письма — простой текст, поэтому переносы держит сам body.
    // В общий слой это не уехало: у Клиндария документ приходит размеченным.
    css: 'body{white-space:pre-wrap}',
    html: `<h1>${esc(doc.title)}</h1>${esc(doc.body)}`,
    onBlocked: () => alert(T('ps.docs.print_blocked')),
  });
  if (!ok) return;
  Letters.snapshot(doc, composerState.student, 'print', composerState.edited);
}

function pdfComposerDoc() {
  const doc = currentComposerDoc();
  if (!doc) return;
  try {
    PdfExport.downloadLetter({
      title: doc.title,
      body: doc.body,
      filename: Letters.filename(composerState.student)
    });
  } catch (error) {
    return alert(T('ps.app.pdf_failed', { error: error.message }));
  }
  Letters.snapshot(doc, composerState.student, 'print', composerState.edited);
}

// ---------- STUDENTS ----------
async function renderStudents() {
  const [students, classes, columns] = await Promise.all([Students.list(), DB.list('classes'), Students.getColumns()]);

  renderStudentFormFields(columns);
  renderClassSelect(classes);
  renderClassesList(classes);
  renderColumnsManager(columns);
  renderStudentsTableHead(columns);
  renderStudentsTable(students, classes, columns);

  $('#new-col-type').onchange = () => {
    $('#new-col-options-wrap').classList.toggle('hidden', $('#new-col-type').value !== 'select');
  };

  $('#add-class-btn').onclick = async () => {
    const name = $('#class-name').value.trim();
    if (!name) return;
    await DB.put('classes', { name });
    $('#class-name').value = '';
    const updated = await DB.list('classes');
    renderClassSelect(updated);
    renderClassesList(updated);
    // Таблица учащихся содержит собственные селекты класса в каждой строке —
    // без перерисовки новый класс в них не появлялся до смены раздела.
    renderStudentsTable(await Students.list(), updated, await Students.getColumns());
  };

  $('#add-student-btn').onclick = async () => {
    const cols = await Students.getColumns();
    const values = collectStudentFormValues(cols);
    const student = { id: DB.uid(), classId: $('#student-class-select')?.value || null, values };
    try {
      await Students.save(student);
      renderStudentFormFields(cols); // очищаем форму
      // renderStudentFormFields пересоздаёт #student-class-select пустым,
      // поэтому список классов нужно наполнить заново — иначе после первого
      // же добавления учащегося выпадающий список классов оказывался пуст.
      const classesNow = await DB.list('classes');
      renderClassSelect(classesNow);
      const updatedStudents = await Students.list();
      renderStudentsTable(updatedStudents, classesNow, cols);
      renderDashboard();
    } catch (e) { alert(e.message); }
  };

  $('#auto-distribute-btn').onclick = async () => {
    const cls = await DB.list('classes');
    if (!cls.length) return alert(T('ps.app.snachala_dobavte_hotya_by'));
    const st = await Students.list();
    const distributed = Students.autoDistribute(st, cls);
    // Пишем только изменившееся поле поверх ПОЛНОЙ записи из базы: объекты из
    // Students.list() усечены до { id, classId, values }, и запись их целиком
    // стирала служебные поля (например, fromRegistrationId).
    for (const item of distributed) {
      const full = await DB.get('students', item.id);
      if (!full) continue;
      full.classId = item.classId;
      await DB.put('students', full);
    }
    renderStudentsTable(await Students.list(), cls, await Students.getColumns());
  };

  $('#add-column-btn').onclick = async () => {
    const label = $('#new-col-label').value.trim();
    if (!label) return alert(T('ps.app.ukazhite_nazvanie_stolbca'));
    const type = $('#new-col-type').value;
    const options = type === 'select'
      ? $('#new-col-options').value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({ value: s, label: s }))
      : [];
    try {
      await Students.addColumn({ label, type, options });
      $('#new-col-label').value = ''; $('#new-col-options').value = '';
      const newCols = await Students.getColumns();
      renderColumnsManager(newCols);
      renderStudentFormFields(newCols);
      const classesForForm = await DB.list('classes');
      renderClassSelect(classesForForm); // см. комментарий в #add-student-btn
      renderStudentsTableHead(newCols);
      renderStudentsTable(await Students.list(), classesForForm, newCols);
    } catch (e) { alert(e.message); }
  };

  $('#pdf-import-parse-btn').onclick = () => handlePdfImportParse();
  $('#open-export-picker-btn').onclick = () => openExportPicker();
  $('#export-all-formulaires-btn').onclick = async () => {
    const st = await Students.list();
    if (!st.length) return alert(T('ps.app.spisok_uchaschihsya_pust'));
    const cols = await Students.getColumns();
    const cls = await DB.list('classes');
    const byId = Object.fromEntries(cls.map((c) => [c.id, c]));
    await PdfExport.downloadAllStudentFormulaires(st, cols, byId);
  };
}

function renderStudentFormFields(columns) {
  const el = $('#student-form-fields');
  el.innerHTML = columns.map((c) => renderFieldInput(c, '', 'sf')).join('') +
    `<label>${T('ps.app.klass')} <select id="student-class-select"></select></label>`;
  // класс select наполняется отдельно через renderClassSelect на общий #student-class-select
}

function renderFieldInput(column, value, prefix) {
  const id = `${prefix}-${column.key}`;
  const idAttr = esc(id);
  const keyAttr = esc(column.key);
  const labelHtml = esc(Students.label(column));
  if (column.type === 'select') {
    const opts = (column.options || []).map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(Students.optionLabel(o))}</option>`).join('');
    return `<label>${labelHtml}<select id="${idAttr}" data-key="${keyAttr}">${opts}</select></label>`;
  }
  if (column.type === 'textarea') {
    return `<label>${labelHtml}<textarea id="${idAttr}" data-key="${keyAttr}" rows="2">${esc(value || '')}</textarea></label>`;
  }
  return `<label>${labelHtml}<input type="text" id="${idAttr}" data-key="${keyAttr}" value="${esc(value ?? '')}"></label>`;
}

function collectStudentFormValues(columns) {
  const values = {};
  columns.forEach((c) => {
    const el = document.getElementById(`sf-${c.key}`);
    if (el) values[c.key] = el.value;
  });
  return values;
}

function renderClassSelect(classes) {
  const sel = document.getElementById('student-class-select');
  if (!sel) return;
  sel.innerHTML = `<option value="">${T('ps.app.bez_klassa')}</option>` + classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

function renderClassesList(classes) {
  const el = $('#classes-list');
  if (!classes.length) { el.innerHTML = `<p class="hint">${T('ps.app.klassov_poka_net_shkola')}</p>`; return; }
  el.innerHTML = classes.map((c) => `<div class="list-row"><span>${esc(c.name)}</span></div>`).join('');
}

function renderColumnsManager(columns) {
  const el = $('#columns-manager');
  el.innerHTML = columns.map((c) => `
    <div class="column-row">
      <input type="text" class="col-rename" data-key="${esc(c.key)}" value="${esc(Students.label(c))}">
      <span class="column-type-badge">${esc({ text: T('ps.app.tekst'), textarea: T('ps.app.dlinnyy_tekst'), select: T('ps.app.spisok') }[c.type] || c.type)}</span>
      ${c.protected ? `<span class="column-protected-badge">${T('ps.app.sistemnyy')}</span>` : `<button class="md-btn md-btn-text col-remove" data-key="${esc(c.key)}">${T('ps.app.udalit')}</button>`}
    </div>`).join('');

  $all('.col-rename', el).forEach((input) => {
    input.onblur = async () => {
      await Students.renameColumn(input.dataset.key, input.value);
      const cols = await Students.getColumns();
      renderStudentFormFields(cols);
      const classes = await DB.list('classes');
      renderClassSelect(classes);
      renderStudentsTableHead(cols);
      renderStudentsTable(await Students.list(), classes, cols);
    };
  });
  $all('.col-remove', el).forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm(T('ps.app.udalit_etot_stolbec_znacheniya'))) return;
      try {
        await Students.removeColumn(btn.dataset.key);
        const cols = await Students.getColumns();
        renderColumnsManager(cols);
        renderStudentFormFields(cols);
        const classes = await DB.list('classes');
        renderClassSelect(classes);
        renderStudentsTableHead(cols);
        renderStudentsTable(await Students.list(), classes, cols);
      } catch (e) { alert(e.message); }
    };
  });
}

function renderStudentsTableHead(columns) {
  const head = $('#students-table-head');
  head.innerHTML = columns.map((c) => `<th>${esc(Students.label(c))}</th>`).join('') + `<th>${T('ps.app.klass')}</th><th></th>`;
}

function renderStudentsTable(students, classes, columns) {
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const tbody = $('#students-table tbody');
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 2}" class="hint">${T('ps.app.uchaschihsya_poka_net')}</td></tr>`;
    return;
  }
  tbody.innerHTML = students.map((s) => {
    const cells = columns.map((c) => `<td>${renderFieldInput(c, (s.values || {})[c.key], 'row-' + s.id)}</td>`).join('');
    const classOptions = '<option value="">—</option>' + classes.map((cl) => `<option value="${esc(cl.id)}" ${cl.id === s.classId ? 'selected' : ''}>${esc(cl.name)}</option>`).join('');
    return `<tr data-student-id="${esc(s.id)}">
      ${cells}
      <td><select class="row-class-select" data-id="${esc(s.id)}">${classOptions}</select></td>
      <td>
        <button class="md-btn md-btn-text row-doc" data-id="${esc(s.id)}" style="color:var(--accent);">${T('ps.docs.document')}</button>
        <button class="md-btn md-btn-text row-formulaire" data-id="${esc(s.id)}" style="color:var(--accent);">${T('ps.app.formulyar')}</button>
        <button class="md-btn md-btn-text remove-student" data-id="${esc(s.id)}">${T('ps.app.udalit')}</button>
      </td>
    </tr>`;
  }).join('');

  // убираем обёртку <label> вокруг инпутов внутри ячеек таблицы — там label не нужен
  $all('#students-table tbody label').forEach((label) => {
    const control = label.querySelector('input, select, textarea');
    if (control) label.replaceWith(control);
  });

  columns.forEach((c) => {
    $all(`[id^="row-"][data-key="${c.key}"]`, tbody).forEach((input) => {
      const tr = input.closest('tr');
      const studentId = tr.dataset.studentId;
      const handler = async () => {
        const student = await DB.get('students', studentId);
        if (!student) return;
        student.values = student.values || {};
        student.values[c.key] = input.value;
        await Students.save(student);
        if (c.key === 'textbookFormat' || c.key === 'status') renderDashboard();
      };
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'blur', handler);
    });
  });

  $all('.row-class-select', tbody).forEach((sel) => {
    sel.onchange = async () => {
      const student = await DB.get('students', sel.dataset.id);
      if (!student) return;
      student.classId = sel.value || null;
      await Students.save(student);
    };
  });

  $all('.remove-student', tbody).forEach((btn) => {
    btn.onclick = async () => {
      await Students.remove(btn.dataset.id);
      renderStudentsTable(await Students.list(), classes, columns);
      renderDashboard();
    };
  });

  $all('.row-doc', tbody).forEach((btn) => {
    btn.onclick = async () => {
      const list = await Students.list();
      const student = list.find((s) => s.id === btn.dataset.id);
      if (student) await openLetterComposer(student);
    };
  });

  $all('.row-formulaire', tbody).forEach((btn) => {
    btn.onclick = async () => {
      const list = await Students.list();
      const student = list.find((s) => s.id === btn.dataset.id);
      if (!student) return;
      const cls = classById[student.classId];
      await PdfExport.downloadStudentFormulaire(student, columns, cls ? cls.name : '');
    };
  });
}

// ---------- PDF IMPORT WIZARD ----------
let importState = null;

async function handlePdfImportParse() {
  const input = $('#pdf-import-input');
  const status = $('#pdf-import-status');
  const file = input.files[0];
  if (!file) { alert(T('ps.app.vyberite_pdf_fayl')); return; }
  status.textContent = T('ps.app.razbirayu_pdf');
  try {
    const { headers, rows, anomalies, usedLineDetection } = await PdfImport.extractTable(file);
    if (!headers.length) { status.textContent = T('ps.app.ne_udalos_nayti_tablicu'); return; }
    const existingColumns = await Students.getColumns();
    const norm = (s) => String(s || '').replace(/[\u00A0\u2007\u202F]/g, ' ').normalize('NFC').trim().toLowerCase();
    importState = {
      headers,
      rows,
      anomalies,
      mappings: headers.map((h) => {
        const match = existingColumns.find((c) => norm(Students.label(c)) === norm(h) || norm(c.label) === norm(h));
        return match ? match.key : '__new__';
      })
    };
    status.textContent = usedLineDetection
      ? T('ps.app.import_lines_found', { rows: rows.length })
      : T('ps.app.import_lines_missing', { rows: rows.length });
    await openImportPreviewModal(existingColumns);
  } catch (e) {
    status.textContent = T('ps.app.pdf_read_failed', { error: e.message });
  }
}

async function openImportPreviewModal(existingColumns) {
  renderImportModal(existingColumns);
}

function currentMappingHasNameFields() {
  const keys = importState.mappings.map((m, i) => (m === '__new__' ? null : m));
  return keys.includes('lastName') && keys.includes('firstName');
}

function renderImportModal(existingColumns, resultPanelHtml) {
  const { headers, rows, mappings, anomalies } = importState;
  const mappingOptions = (currentKey) => {
    const opts = existingColumns.map((c) => `<option value="${esc(c.key)}" ${c.key === currentKey ? 'selected' : ''}>${esc(Students.label(c))}</option>`).join('');
    return `<option value="__new__" ${currentKey === '__new__' ? 'selected' : ''}>${T('ps.app.novyy_stolbec')}</option>${opts}`;
  };

  const headerRow = headers.map((h, i) => `
    <th>
      <div contenteditable="true" class="import-header-edit" data-idx="${i}">${esc(h)}</div>
      <select class="import-mapping-select" data-idx="${i}" style="width:100%;font-size:11px;border:none;border-top:1px solid var(--line);">
        ${mappingOptions(mappings[i])}
      </select>
      <button class="md-btn md-btn-text import-remove-col" data-idx="${i}" style="font-size:10px;">${T('ps.app.udalit_stolbec')}</button>
    </th>`).join('') + '<th class="col-remove-cell"></th>';

  const bodyRows = rows.map((row, rIdx) => `
    <tr data-row="${rIdx}">
      ${headers.map((_, cIdx) => {
        const isAnomaly = anomalies && anomalies[rIdx] && anomalies[rIdx][cIdx];
        return `<td class="${isAnomaly ? 'import-anomaly-cell' : ''}" ${isAnomaly ? `title="${T('ps.app.pohozhe_na_skleyku_dvuh')}"` : ''}><div contenteditable="true" class="import-cell" data-row="${rIdx}" data-col="${cIdx}">${esc(row[cIdx] || '')}</div></td>`;
      }).join('')}
      <td class="row-remove-cell"><button class="md-btn md-btn-text import-remove-row" data-idx="${rIdx}">✕</button></td>
    </tr>`).join('');

  const hasNameMapping = currentMappingHasNameFields();
  const anyAnomalies = anomalies && anomalies.some((rowFlags) => rowFlags.some(Boolean));

  openModal(`
    <h2>${T('ps.app.proverte_raspoznannuyu_tablicu')}</h2>
    <p class="hint">${T('ps.app.avtomaticheskoe_raspoznavanie_mozhet_o')}</p>
    ${anyAnomalies ? `<p class="hint" style="color:var(--warn);">${T('ps.app.yacheyki_s_oranzhevym_fonom')}</p>` : ''}
    ${!hasNameMapping ? `<p class="hint" style="color:var(--warn);">${T('ps.app.sopostavte_odin_iz_stolbcov')}</p>` : ''}
    <div class="editable-table-wrap">
      <table class="editable-table">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="btn-row">
      <button class="md-btn md-btn-outlined" id="import-add-row">${T('ps.app.stroka')}</button>
      <button class="md-btn md-btn-outlined" id="import-add-col">${T('ps.app.stolbec')}</button>
    </div>
    ${resultPanelHtml || ''}
    <div class="modal-close-row">
      <button class="md-btn md-btn-outlined" id="import-cancel-btn">${resultPanelHtml ? T('ps.app.zakryt') : T('ps.app.otmena')}</button>
      ${resultPanelHtml ? '' : `<button class="md-btn md-btn-filled" id="import-confirm-btn" ${hasNameMapping ? '' : 'disabled'}>${T('ps.app.import_btn', { n: rows.length })}</button>`}
    </div>
  `);

  $all('.import-header-edit').forEach((el) => {
    el.onblur = () => { importState.headers[Number(el.dataset.idx)] = el.textContent.trim(); };
  });
  $all('.import-mapping-select').forEach((sel) => {
    sel.onchange = () => {
      importState.mappings[Number(sel.dataset.idx)] = sel.value;
      renderImportModal(existingColumns); // перерисовать, чтобы обновить блокировку кнопки импорта
    };
  });
  $all('.import-cell').forEach((el) => {
    el.onblur = () => { importState.rows[Number(el.dataset.row)][Number(el.dataset.col)] = el.textContent; };
  });
  $all('.import-remove-row').forEach((btn) => {
    btn.onclick = () => {
      importState.rows.splice(Number(btn.dataset.idx), 1);
      importState.anomalies.splice(Number(btn.dataset.idx), 1);
      renderImportModal(existingColumns);
    };
  });
  $all('.import-remove-col').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.idx);
      importState.headers.splice(idx, 1);
      importState.mappings.splice(idx, 1);
      importState.rows.forEach((r) => r.splice(idx, 1));
      importState.anomalies.forEach((r) => r.splice(idx, 1));
      renderImportModal(existingColumns);
    };
  });
  $('#import-add-row').onclick = () => {
    importState.rows.push(new Array(importState.headers.length).fill(''));
    importState.anomalies.push(new Array(importState.headers.length).fill(false));
    renderImportModal(existingColumns);
  };
  $('#import-add-col').onclick = () => {
    importState.headers.push(T('ps.app.column_new'));
    importState.mappings.push('__new__');
    importState.rows.forEach((r) => r.push(''));
    importState.anomalies.forEach((r) => r.push(false));
    renderImportModal(existingColumns);
  };
  $('#import-cancel-btn').onclick = () => { importState = null; closeModal(); };
  if (!resultPanelHtml) {
    const confirmBtn = $('#import-confirm-btn');
    if (confirmBtn) confirmBtn.onclick = () => confirmPdfImport(existingColumns);
  }
}

async function confirmPdfImport(existingColumns) {
  try {
    const { headers, rows, mappings } = importState;
    const keys = [];
    for (let i = 0; i < headers.length; i++) {
      if (mappings[i] === '__new__') {
        keys.push(await Students.resolveColumnByLabel(headers[i] || T('ps.app.column_n', { n: i + 1 })));
      } else {
        keys.push(mappings[i]);
      }
    }
    let imported = 0;
    const errors = [];
    for (const row of rows) {
      if (row.every((cell) => !cell || !cell.trim())) continue;
      const values = {};
      keys.forEach((key, idx) => { values[key] = row[idx] || ''; });
      try {
        await Students.save({ id: DB.uid(), classId: null, values });
        imported++;
      } catch (e) {
        errors.push(`«${values.lastName || row[0] || '?'} ${values.firstName || ''}»: ${e.message}`);
      }
    }

    const cols = await Students.getColumns();
    renderStudentFormFields(cols);
    renderColumnsManager(cols);
    const classesAfterImport = await DB.list('classes');
    renderClassSelect(classesAfterImport); // см. комментарий в #add-student-btn
    renderStudentsTableHead(cols);
    renderStudentsTable(await Students.list(), classesAfterImport, cols);
    renderDashboard();

    const resultHtml = `
      <div class="panel" style="margin-top:14px;background:${errors.length ? '#FBEFE9' : '#EAF3EC'};">
        <h3 style="margin-top:0;">${T('ps.app.import_zavershen')}</h3>
        <p>${T('ps.app.imported_ok', { ok: imported, total: rows.length })}</p>
        ${errors.length ? `<p>${T('ps.app.not_imported', { n: errors.length })}</p><ul class="simple-list">${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      </div>`;
    $('#pdf-import-status').textContent = (errors.length ? T('ps.app.import_summary_errors', { ok: imported, err: errors.length }) : T('ps.app.import_summary', { ok: imported })) + '.';
    renderImportModal(existingColumns, resultHtml);
  } catch (e) {
    // Любая непредвиденная ошибка теперь видна пользователю внутри окна,
    // а не приводит к «зависшему» модальному окну без обратной связи.
    renderImportModal(existingColumns, `
      <div class="panel" style="margin-top:14px;background:#FBEFE9;">
        <h3 style="margin-top:0;">${T('ps.app.ne_udalos_zavershit_import')}</h3>
        <p>${esc(e.message)}</p>
      </div>`);
  }
}

// ---------- EXPORT PICKER ----------
async function openExportPicker() {
  const columns = await Students.getColumns();
  const saved = await DB.getMeta('studentExportColumns', columns.map((c) => c.key));
  openModal(`
    <h2>${T('ps.app.eksport_spiska_uchaschihsya')}</h2>
    <p class="hint">${T('ps.app.vyberite_kakie_stolbcy_vklyuchit')}</p>
    <div class="export-columns-grid">
      ${columns.map((c) => `
        <label class="export-col-check">
          <input type="checkbox" class="export-col-cb" value="${esc(c.key)}" ${saved.includes(c.key) ? 'checked' : ''}>
          ${esc(Students.label(c))}
        </label>`).join('')}
    </div>
    <div class="btn-row">
      <button class="md-btn md-btn-filled" id="export-do-pdf">${T('ps.app.skachat_pdf_spisok')}</button>
      <button class="md-btn md-btn-filled" id="export-do-xlsx">${T('ps.app.skachat_excel_xlsx')}</button>
      <button class="md-btn md-btn-outlined" id="export-do-csv">${T('ps.app.skachat_csv')}</button>
    </div>
    <p class="hint">${T('ps.app.fayl_xlsx_otkryvaetsya_v')}</p>
    <div class="modal-close-row"><button class="md-btn md-btn-outlined" id="export-close-btn">${T('ps.app.zakryt')}</button></div>
  `);

  const getSelectedColumns = async () => {
    const keys = $all('.export-col-cb').filter((cb) => cb.checked).map((cb) => cb.value);
    await DB.setMeta('studentExportColumns', keys);
    return columns.filter((c) => keys.includes(c.key));
  };

  const getClassesById = async () => {
    const cls = await DB.list('classes');
    return Object.fromEntries(cls.map((c) => [c.id, c]));
  };

  $('#export-do-pdf').onclick = async () => {
    const cols = await getSelectedColumns();
    const students = await Students.list();
    await PdfExport.downloadStudentList(students, cols, await getClassesById());
  };
  $('#export-do-xlsx').onclick = async () => {
    const cols = await getSelectedColumns();
    const students = await Students.list();
    ExcelExport.downloadStudentsXlsx(students, cols, await getClassesById());
  };
  $('#export-do-csv').onclick = async () => {
    const cols = await getSelectedColumns();
    const students = await Students.list();
    ExcelExport.downloadStudentsCsv(students, cols, await getClassesById());
  };
  $('#export-close-btn').onclick = closeModal;
}

// ---------- TEXTBOOKS ----------
async function renderTextbooks() {
  const order = await Textbooks.getOrder();
  $('#tb-requested').value = order.requestedByStudents || 0;
  $('#tb-stock').value = order.alreadyInStock || 0;
  $('#tb-received').checked = !!order.received;
  $('#tb-recounted').checked = !!order.recountedOnReceipt;
  $('#textbook-reminders').innerHTML = Textbooks.REMINDERS.map((r) => `<li>${r}</li>`).join('');
  updateTextbookQty();

  ['#tb-requested', '#tb-stock'].forEach((sel) => $(sel).oninput = updateTextbookQty);

  $('#save-textbooks-btn').onclick = async () => {
    const payload = {
      ...order,
      requestedByStudents: Number($('#tb-requested').value || 0),
      alreadyInStock: Number($('#tb-stock').value || 0),
      received: $('#tb-received').checked,
      recountedOnReceipt: $('#tb-recounted').checked
    };
    await Textbooks.save(payload);
    alert(T('ps.app.dannye_po_uchebnikam_sohraneny'));
    renderDashboard();
  };

  $('#export-textbooks-pdf').onclick = async () => {
    await PdfExport.downloadTextbookOrder(await Textbooks.getOrder());
  };
  $('#export-textbooks-csv').onclick = async () => {
    ExcelExport.downloadTextbookOrder(await Textbooks.getOrder());
  };
}

function updateTextbookQty() {
  const requested = Number($('#tb-requested').value || 0);
  const stock = Number($('#tb-stock').value || 0);
  $('#tb-order-qty').textContent = Textbooks.calcOrderQuantity({ requestedByStudents: requested, alreadyInStock: stock });
}

// ---------- SCHEDULE / LESSONS ----------
async function loadLessonsSeed() {
  if (LESSONS_SEED) return LESSONS_SEED;
  const res = await fetch('data/seed-lessons.json');
  // Без проверки res.ok ответ 404 уходил в res.json(), падал с невнятной
  // ошибкой парсинга и оставлял раздел «Расписание» пустым.
  if (!res.ok) throw new Error(T('ps.app.lessons_seed_missing', { error: res.status }));
  LESSONS_SEED = await res.json();
  return LESSONS_SEED;
}

async function renderSchedule() {
  const seed = await loadLessonsSeed();
  const stored = await DB.list('lessons');
  const doneMap = Object.fromEntries(stored.map((l) => [l.key, l.done]));

  const el = $('#lessons-list');
  el.innerHTML = seed.lessons.map((lesson) => {
    const key = `${lesson.number}${lesson.letter || ''}`;
    const teacherLabel = lesson.teacher === 'A' ? T('ps.app.prepodavatel_a') : lesson.teacher === 'Б' ? T('ps.ui.prepodavatel_b') : lesson.teacher;
    let mediaHtml = '';
    if (lesson.videoBefore) mediaHtml += mediaBlock(T('ps.app.video_do_uroka'), lesson.videoBefore);
    if (lesson.videoAfterIntro) mediaHtml += mediaBlock(T('ps.app.video_posle_vstupleniya'), lesson.videoAfterIntro);
    if (lesson.videoBeforeSection) mediaHtml += mediaBlock(T('ps.app.video_pered_razdelom'), lesson.videoBeforeSection);
    if (lesson.videoAfterSection) mediaHtml += mediaBlock(T('ps.app.video_posle_razdela'), lesson.videoAfterSection);
    if (lesson.videoAfter) mediaHtml += mediaBlock(T('ps.app.video_v_konce_uroka'), lesson.videoAfter);
    if (lesson.bibleReadings) {
      mediaHtml += lesson.bibleReadings.map((r) => mediaBlock(T('ps.app.hudozh_chtenie_biblii'), { title: r.passage, duration: r.duration, cue: r.cue })).join('');
    }
    return `
      <div class="panel lesson-card">
        <div class="lesson-head">
          <div class="lesson-number">${T('ps.app.lesson_n', { n: esc(lesson.number) })}${lesson.letter ? esc(lesson.letter) : ''}</div>
          <div class="lesson-teacher">${esc(teacherLabel)} ${T('ps.app.day_suffix', { n: esc(lesson.day) })}</div>
          <label class="checkbox-label lesson-done">
            <input type="checkbox" class="lesson-done-cb" data-key="${esc(key)}" ${doneMap[key] ? 'checked' : ''}> ${T('ps.app.provedeno')}
          </label>
        </div>
        ${lesson.note ? `<p class="hint">${esc(lesson.note)}</p>` : ''}
        ${lesson.signLanguageNote ? `<p class="hint">${esc(lesson.signLanguageNote)}</p>` : ''}
        ${mediaHtml || `<p class="hint">${T('ps.app.naglyadnye_materialy_dlya_etogo')}</p>`}
      </div>`;
  }).join('') + `
    <div class="panel">
      <h3>${T('ps.app.pravilo_po_naglyadnym_posobiyam')}</h3>
      <ul class="fact-list">
        <li>${T('ps.app.max_images', { n: seed.visualAidsRule.maxImagesPerLesson })}</li>
        <li>${T('ps.app.video_powerpoint_keynote_zaprescheny')}</li>
        <li>${T('ps.app.markernye_doski_razresheny')}</li>
      </ul>
    </div>`;

  $all('.lesson-done-cb', el).forEach((cb) => {
    cb.onchange = async () => {
      await DB.put('lessons', { id: cb.dataset.key, key: cb.dataset.key, done: cb.checked });
    };
  });
}

function mediaBlock(label, media) {
  return `<div class="media-block">
    <div class="media-label">${esc(label)}: ${esc(media.title)}${media.duration ? ' (' + esc(media.duration) + ')' : ''}</div>
    ${media.cue ? `<div class="media-cue">${esc(media.cue)}</div>` : ''}
    ${media.note ? `<div class="media-cue">${esc(media.note)}</div>` : ''}
  </div>`;
}

// ---------- PRACTICAL ----------
async function renderPractical() {
  $('#practical-rules').innerHTML = Practical.RULES.map((r) => `<li>${r}</li>`).join('');
  const sessions = await Practical.list();
  const el = $('#practical-list');
  el.innerHTML = sessions.map((s) => `
    <div class="panel">
      <h3>${T('ps.app.practical_n', { n: esc(s.sessionNumber) })}</h3>
      <label class="checkbox-label"><input type="checkbox" class="pr-rehearsed" data-id="${esc(s.id)}" ${s.rehearsed ? 'checked' : ''}> ${T('ps.app.otrepetirovano_zaranee')}</label>
      <label class="checkbox-label"><input type="checkbox" class="pr-general" data-id="${esc(s.id)}" ${s.generalRehearsalDone ? 'checked' : ''}> ${T('ps.app.generalnaya_repeticiya_v_den')}</label>
      <label>${T('ps.app.chemu_nauchilis_itog_zanyatiya')}
        <textarea class="pr-takeaway" data-id="${esc(s.id)}" rows="2">${esc(s.keyTakeaway || '')}</textarea>
      </label>
    </div>`).join('');

  $all('.pr-rehearsed', el).forEach((cb) => cb.onchange = () => savePracticalField(cb.dataset.id, 'rehearsed', cb.checked));
  $all('.pr-general', el).forEach((cb) => cb.onchange = () => savePracticalField(cb.dataset.id, 'generalRehearsalDone', cb.checked));
  $all('.pr-takeaway', el).forEach((ta) => ta.onblur = () => savePracticalField(ta.dataset.id, 'keyTakeaway', ta.value));
}

async function savePracticalField(id, field, value) {
  const session = await DB.get('practicalSessions', id);
  if (!session) return;
  session[field] = value;
  await Practical.save(session);
}

// ---------- REVIEW ----------
async function renderReview() {
  const reviews = await Review.list();
  const el = $('#review-list');
  el.innerHTML = `<div class="panel"><p class="hint">${esc(Review.NOTE)}</p></div>` + reviews.map((r) => `
    <div class="panel">
      <h3>${T('ps.app.day_n', { n: esc(r.day) })}</h3>
      <div class="form-grid">
        <label>${T('ps.app.minut_u_prepodavatelya_a')} <input type="number" class="rv-a" data-id="${esc(r.id)}" value="${esc(r.teacherAMinutesUsed ?? '')}" max="15"></label>
        <label>${T('ps.app.minut_u_prepodavatelya_b')} <input type="number" class="rv-b" data-id="${esc(r.id)}" value="${esc(r.teacherBMinutesUsed ?? '')}" max="15"></label>
        <label class="checkbox-label"><input type="checkbox" class="rv-done" data-id="${esc(r.id)}" ${r.done ? 'checked' : ''}> ${T('ps.app.provedeno')}</label>
      </div>
      <label>${T('ps.app.dopolnitelnye_mestnye_voprosy')}
        <textarea class="rv-notes" data-id="${esc(r.id)}" rows="2">${esc(r.additionalLocalQuestions || '')}</textarea>
      </label>
    </div>`).join('');

  $all('.rv-a', el).forEach((i) => i.onblur = () => saveReviewField(i.dataset.id, 'teacherAMinutesUsed', Number(i.value) || null));
  $all('.rv-b', el).forEach((i) => i.onblur = () => saveReviewField(i.dataset.id, 'teacherBMinutesUsed', Number(i.value) || null));
  $all('.rv-done', el).forEach((cb) => cb.onchange = () => saveReviewField(cb.dataset.id, 'done', cb.checked));
  $all('.rv-notes', el).forEach((ta) => ta.onblur = () => saveReviewField(ta.dataset.id, 'additionalLocalQuestions', ta.value));
}

async function saveReviewField(id, field, value) {
  const r = await DB.get('dailyReviews', id);
  if (!r) return;
  r[field] = value;
  await Review.save(r);
}

// ---------- AFTER SCHOOL ----------
async function renderAfterSchool() {
  const data = await AfterSchool.get();
  $('#expenses-note').textContent = AfterSchool.EXPENSES_NOTE;
  renderNaList(data.notAttendedFromList || []);
  renderAoList(data.attendedNotOnList || []);

  $('#add-na-btn').onclick = async () => {
    const name = $('#na-name').value.trim();
    if (!name) return;
    const d = await AfterSchool.get();
    d.notAttendedFromList = d.notAttendedFromList || [];
    d.notAttendedFromList.push({ name, reason: $('#na-reason').value.trim() });
    await AfterSchool.save(d);
    $('#na-name').value = ''; $('#na-reason').value = '';
    renderNaList(d.notAttendedFromList);
  };

  $('#add-ao-btn').onclick = async () => {
    const name = $('#ao-name').value.trim();
    if (!name) return;
    const d = await AfterSchool.get();
    d.attendedNotOnList = d.attendedNotOnList || [];
    d.attendedNotOnList.push({ name, congregation: $('#ao-congregation').value.trim() });
    await AfterSchool.save(d);
    $('#ao-name').value = ''; $('#ao-congregation').value = '';
    renderAoList(d.attendedNotOnList);
  };

  $('#save-s253-btn').onclick = async () => {
    const d = await AfterSchool.get();
    d.submitted = true;
    d.submittedDate = DateUtils.todayIso();
    await AfterSchool.save(d);
    alert(T('ps.app.s_253_sohranen'));
  };

  $('#export-s253-pdf').onclick = async () => {
    await PdfExport.downloadS253(await AfterSchool.get());
  };
}

function renderNaList(items) {
  $('#na-list').innerHTML = items.map((i) => `<li>${esc(i.name)}${i.reason ? ' — ' + esc(i.reason) : ''}</li>`).join('') || `<li class="hint">${T('ps.app.pusto')}</li>`;
}
function renderAoList(items) {
  $('#ao-list').innerHTML = items.map((i) => `<li>${esc(i.name)}${i.congregation ? ' — ' + esc(i.congregation) : ''}</li>`).join('') || `<li class="hint">${T('ps.app.pusto')}</li>`;
}

// ---------- SIGN LANGUAGE ----------
async function renderSignLanguage() {
  const data = await SignLanguage.get();
  $('#sl-enabled').checked = !!data.enabled;
  $('#sl-notes').innerHTML = SignLanguage.NOTES.map((n) => `<li>${n}</li>`).join('');

  const checklistItems = [
    ['substituteTextbookAccess', T('ps.app.dostup_zamestitelya_k_uchebniku')],
    ['adaptedPracticalPlans', T('ps.app.adaptirovannye_plany_prakticheskih_zan')],
    ['s255Access', T('ps.app.dostup_k_s_255')],
    ['studentJwpubTextbook', T('ps.app.uchebnik_jwpub_na_zhestovom')],
    ['studentNotesPdf', T('ps.app.zametki_k_uchebniku_pdf')],
    ['studentAssignmentsWordJwpub', T('ps.app.zadaniya_word_jwpub_uchaschimsya')]
  ];
  $('#sl-checklist').innerHTML = checklistItems.map(([key, label]) => `
    <label class="checkbox-label"><input type="checkbox" class="sl-check" data-key="${esc(key)}" ${data.materialsChecklist?.[key] ? 'checked' : ''}> ${esc(label)}</label>
  `).join('');

  $('#save-sl-btn').onclick = async () => {
    const d = await SignLanguage.get();
    d.enabled = $('#sl-enabled').checked;
    d.materialsChecklist = d.materialsChecklist || {};
    $all('.sl-check').forEach((cb) => { d.materialsChecklist[cb.dataset.key] = cb.checked; });
    await SignLanguage.save(d);
    alert(T('ps.app.sohraneno'));
  };
}

// ---------- BACKUP ----------
function initBackup() {
  $('#export-backup-btn').onclick = async () => {
    const dump = await DB.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pioneer-school-backup-${DateUtils.todayIso()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  $('#import-backup-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(T('ps.app.import_zamenit_tekuschie_dannye'))) return;
    const text = await file.text();
    try {
      const dump = JSON.parse(text);
      await DB.importAll(dump);
      alert(T('ps.app.dannye_vosstanovleny'));
      showRoute('dashboard');
    } catch (err) {
      alert(T('ps.app.backup_read_failed', { error: err.message }));
    }
  };
}

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', () => {
  $('#version-sub').textContent = `v${APP_VERSION} · S-255-U`;
  // Язык поднимаем ДО первого showRoute(): экраны строятся в JS, и язык должен
  // быть известен раньше первой отрисовки. Перерисовку при смене языка делает
  // тот же showRoute — статическую разметку переводит CWI18n.apply().
  // Язык ДОКУМЕНТА поднимаем рядом с языком интерфейса, но независимо: у него
  // своё хранилище и свой жизненный цикл. allowUrlOverride здесь намеренно
  // выключен — параметр ?lang= работает только на публичной register.html,
  // чтобы случайная ссылка не поменяла язык рассылаемых бумаг.
  PSDocLang.init();

  // Общий слой документов (фаза 6). Хранилище шаблонов вычитывается в память
  // один раз — дальше CWTemplates.text() синхронна. Отсутствие общей базы не
  // ломает модуль: Letters.available() вернёт false, и кнопки документов
  // честно скажут, что слой недоступен, вместо тихого показа системного
  // текста вместо пользовательского.
  if (typeof CWTemplates !== 'undefined') {
    CWTemplates.init().catch((error) => {
      console.error('pioneer-school: хранилище шаблонов недоступно', error);
    });
  }

  PSI18n.init(() => {
    const current = $all('.route').find((el) => !el.classList.contains('hidden'));
    if (current) showRoute(current.id.replace('route-', ''));
  });
  $all('.nav-item').forEach((btn) => btn.addEventListener('click', () => showRoute(btn.dataset.route)));
  initBackup();

  // Регистрация SW и отслеживание обновлений — общий слой (shared/update.js).
  // Раньше модуль просто регистрировал worker и не следил за обновлениями
  // вовсе: пользователь мог неделями работать на старой оболочке.
  if (typeof CWUpdate !== 'undefined') CWUpdate.init({ swUrl: 'sw.js' });

  // Реакция на смену #hash: раньше кнопки «Назад»/«Вперёд» в браузере меняли
  // адрес, но экран не переключался — приложение выглядело зависшим.
  window.addEventListener('hashchange', () => {
    const route = window.location.hash.slice(1) || DEFAULT_ROUTE;
    const current = $all('.route').find((el) => !el.classList.contains('hidden'));
    if (current && current.id === 'route-' + route) return;
    showRoute(route);
  });

  const initialRoute = (window.location.hash || '#' + DEFAULT_ROUTE).slice(1);
  showRoute(initialRoute || DEFAULT_ROUTE);
});
