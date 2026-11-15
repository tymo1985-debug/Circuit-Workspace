// app.js — роутинг и рендеринг экранов
/* Из единого источника, как уже читает js/i18n.js. Число здесь было третьим
   местом объявления версии Школы. */
const APP_VERSION = (self.CW_MODULES && self.CW_MODULES['pioneer-school']
  ? self.CW_MODULES['pioneer-school'].version
  : '');

let LESSONS_SEED = null;

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Экранирование пользовательских данных перед вставкой в innerHTML.
// Без него введённые вручную или импортированные из PDF значения с символами
// < > & " ' молча искажались при отображении (например, «Класс <b>А</b>»
// показывался как «Класс А»), а незакрытый тег ломал вёрстку таблицы.
/* Делегирование в общий слой (28.08.2026), см. shared/escape.js. */
function esc(value) {
  return self.CWEscape.html(value);
}

const ROUTES = ['dashboard', 'anketa', 'assignment', 'registration', 'substitutes', 'students',
  'dispatch', 'textbooks', 'tasks', 'schedule', 'practical', 'review', 'afterschool', 'signlanguage', 'backup',
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
  syncGroupNav(safeRoute);
  if (window.location.hash.slice(1) !== safeRoute) window.location.hash = safeRoute;
  renderRoute(safeRoute);
}

/* Нижняя панель групп (≤900px, Ф4). Группы — это подписи .nav-group-label
   и кнопки разделов под каждой из них; отдельного списка в коде нет, поэтому
   новый раздел в .nav сам попадает в нужную группу. */
function navGroups() {
  const groups = [];
  [...document.querySelectorAll('.nav > *')].forEach((el) => {
    if (el.classList.contains('nav-group-label')) groups.push([]);
    else if (el.dataset.route && groups.length) groups[groups.length - 1].push(el);
  });
  return groups;
}
function syncGroupNav(route) {
  const groups = navGroups();
  document.querySelectorAll('#psGroupNav [data-group]').forEach((btn) => {
    const g = groups[+btn.dataset.group] || [];
    btn.classList.toggle('active', g.some((el) => el.dataset.route === route));
  });
  closeGroupSheet();
}
function closeGroupSheet() {
  const sheet = document.getElementById('psGroupSheet');
  if (sheet && !sheet.hidden) {
    sheet.hidden = true;
    document.querySelectorAll('#psGroupNav [aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
}
function openGroupSheet(btn) {
  const sheet = document.getElementById('psGroupSheet');
  const g = navGroups()[+btn.dataset.group] || [];
  if (g.length === 1) { showRoute(g[0].dataset.route); return; }
  if (!sheet.hidden && sheet.dataset.group === btn.dataset.group) { closeGroupSheet(); return; }
  const current = (document.querySelector('.nav-item.active') || {}).dataset?.route;
  sheet.innerHTML = g.map((el) => `<button type="button" class="md-menu__item${el.dataset.route === current ? ' active' : ''}" role="menuitem" data-route="${esc(el.dataset.route)}">${esc(el.textContent.trim())}</button>`).join('');
  sheet.dataset.group = btn.dataset.group;
  sheet.hidden = false;
  document.querySelectorAll('#psGroupNav [data-group]').forEach((b) => b.setAttribute('aria-expanded', String(b === btn)));
  const first = sheet.querySelector('.md-menu__item');
  if (first) first.focus();
}

async function renderRoute(route) {
  try {
    await renderRouteInner(route);
    applyReadOnly(route);
  } catch (error) {
    // Раньше любой сбой рендера экрана оставлял пустую область без единого
    // сообщения (промис отклонялся в никуда). Теперь ошибка видна.
    console.error(T('ps.app.render_error', { screen: route }), error);
    const target = document.getElementById('route-' + route);
    if (target) {
      const box = document.createElement('p');
      box.className = 'hint';
      box.style.color = 'var(--md-error)';
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
    case 'dispatch': return renderDispatch();
    case 'textbooks': return renderTextbooks();
    case 'tasks': return renderTasks();
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

// ---------- ОБЗОР (Ф4): этапы школы ----------
// Доска «0 · Мастер-макет › Stages». Решения Алекса 15.11.2026: этапы
// вычисляются по данным (PSOverview.stages), экран заменил прежние пять
// карточек с цифрами. Кнопка «Что сделать сейчас» ведёт в раздел этапа.

// Дата для показа: ISO-время журнала или YYYY-MM-DD рассылки.
function psDate(iso) {
  if (!iso) return '—';
  const value = String(iso);
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString(document.documentElement.lang || 'ru');
}

function navLabel(route) {
  const btn = document.querySelector(`.nav-item[data-route="${route}"]`);
  return btn ? btn.textContent.trim() : route;
}

function stageNote(stage) {
  const d = stage.data;
  switch (stage.key) {
    case 'assignment':
      return d.start || d.location
        ? T('ps.stage.note.assignment', { dates: [psDate(d.start), d.end ? psDate(d.end) : ''].filter(Boolean).join(' – '), location: d.location || '—' })
        : T('ps.stage.note.assignment_empty');
    case 'dispatch':
      return T('ps.stage.note.dispatch', d) + (d.orphans ? ' · ' + T('ps.stage.note.dispatch_orphans', { n: d.orphans }) : '');
    case 'answers':
      return T('ps.stage.note.answers', d) + (d.overdue ? ' · ' + T('ps.stage.note.answers_overdue', { n: d.overdue }) : '');
    case 'report':
      return T(stage.state === 'done' ? 'ps.stage.note.report_done' : 'ps.stage.note.report');
    default:
      return T('ps.stage.note.' + stage.key, d);
  }
}

function stageExtra(stage) {
  if (stage.key !== 'answers' || !stage.data.total) return '';
  const d = stage.data;
  const pct = (n) => Math.round((n / d.total) * 100);
  return `<div class="ps-ov-bar" aria-hidden="true">
      <span class="ps-ov-bar__ok" style="width:${pct(d.coming)}%"></span>
      <span class="ps-ov-bar__bad" style="width:${pct(d.refused)}%"></span>
    </div>
    <div class="ps-card-chips">
      <span class="ps-status ps-status--willCome">${esc(T('ps.stage.chip.coming', { n: d.coming }))}</span>
      <span class="ps-status ps-status--wontCome">${esc(T('ps.stage.chip.refused', { n: d.refused }))}</span>
      <span class="ps-status ps-status--invited">${esc(T('ps.stage.chip.waiting', { n: d.waiting }))}</span>
    </div>`;
}

async function renderDashboard() {
  const [anketa, substitutes, assignment, students, classes, order, state, config] = await Promise.all([
    Anketa.get(), Substitutes.list(), Assignment.get(), Students.list(), DB.list('classes'),
    Textbooks.getOrder(), Dispatch.getState(), Registration.getConfig()
  ]);
  const taskProgress = PSTasks.progress(await PSTasks.library(), await PSTasks.assignments(), classes);
  const groups = Dispatch.groups(students, state, config);
  const school = Schools.current();
  const orderQty = Textbooks.compute({ students, classes, order, schoolLanguage: Students._schoolLanguage() }).total.order;
  const { stages, current } = PSOverview.stages({
    anketa, substitutes, assignment, students, groups, orphans: Dispatch.orphans(students), classes, orderQty, school, taskProgress
  });
  const cur = stages.find((st) => st.key === current);

  const dates = assignment.startDate ? [psDate(assignment.startDate), assignment.endDate ? psDate(assignment.endDate) : ''].filter(Boolean).join(' – ') : '';
  const title = [Schools.label(school), dates, assignment.location].filter(Boolean).join(' · ');
  const teachers = [assignment.teacherA, assignment.teacherB].map((t) => String(t || '').trim()).filter(Boolean);
  const chip = cur ? T('ps.stage.chip', { n: cur.n, total: stages.length, name: T('ps.stage.' + cur.key) }) : T('ps.stage.all_done');
  $('#ov-head').innerHTML = `
    <div class="ps-ov-head__text">
      <h2>${esc(title || T('ps.app.ne_zapolneno'))}</h2>
      ${teachers.length ? `<p class="hint">${esc(T('ps.stage.teachers', { names: teachers.join(', ') }))}</p>` : ''}
    </div>
    <span class="ps-chip ps-chip--accent">${esc(chip)}</span>`;

  const nowBox = $('#ov-now');
  if (cur) {
    const route = PSOverview.STAGE_ROUTE[cur.key];
    nowBox.innerHTML = `
      <div>
        <h3>${esc(T('ps.stage.now_title'))}</h3>
        <p class="hint">${esc(T('ps.stage.now.' + cur.key, cur.data))}</p>
      </div>
      <button type="button" class="md-btn md-btn-filled" id="ov-now-go" data-ro-allow>${esc(T('ps.stage.go', { screen: navLabel(route) }))}</button>`;
    $('#ov-now-go').onclick = () => {
      if (cur.key === 'list') studentsTab = 'overview';
      showRoute(route);
    };
  } else {
    nowBox.innerHTML = `<div><h3>${esc(T('ps.stage.all_done'))}</h3></div>`;
  }

  $('#ov-stages').innerHTML = stages.map((st) => `
    <li class="ps-ov-stage ps-ov-stage--${st.state}" ${st.state === 'current' ? 'aria-current="step"' : ''}>
      <div class="ps-ov-stage__top">
        <span class="ps-ov-dot ps-ov-dot--${st.state}" aria-hidden="true">${st.state === 'done' ? '✓' : st.n}</span>
        <h3>${st.n} · ${esc(T('ps.stage.' + st.key))}</h3>
        <span class="sr-only">${esc(T('ps.stage.state.' + st.state))}</span>
      </div>
      <p class="hint">${esc(stageNote(st))}</p>
      ${stageExtra(st)}
    </li>`).join('');
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
      .filter((s) => Students.isExpected(s));
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
      if (!(await PSPdf.ensure('form'))) return;
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
      if (!(await PSPdf.ensure('pdf'))) return;
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
      congregation: $('#reg-congregation').value.trim(),
      attending: $('#reg-attending').value,
      attendReason: $('#reg-attending').value === 'no' ? $('#reg-reason').value.trim() : '',
      transport: $('#reg-transport').value,
      lodging: $('#reg-lodging').value,
      languages: [$('#reg-language').value],
      specialNeeds: $('#reg-special-needs').value.trim(),
      notes: $('#reg-notes').value,
      format: [],
      schemaVersion: RegistrationSchema.version
    };
    try {
      await Registration.save(reg);
      ['#reg-lastname', '#reg-firstname', '#reg-email', '#reg-phone', '#reg-address', '#reg-congregation', '#reg-reason', '#reg-special-needs', '#reg-notes'].forEach((s) => $(s).value = '');
      renderRegistrationsTable(await Registration.list());
      renderDashboard();
    } catch (e) { alert(e.message); }
  };

  // Причина — только при «Нет» (Ф2: тогда она обязательна, см. validate).
  const syncManualReason = () => { $('#reg-reason-wrap').hidden = $('#reg-attending').value !== 'no'; };
  $('#reg-attending').onchange = syncManualReason;
  syncManualReason();

  // Ф2: заполненная PDF-анкета → регистрация → карточка пионера.
  $('#import-filled-pdf-btn').onclick = () => $('#import-filled-pdf-input').click();
  $('#import-filled-pdf-input').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) await importFilledRegistrationPdf(file);
  };

  $('#export-reg-pdf').onclick = async () => {
    if (!(await PSPdf.ensure('pdf'))) return;
    await PdfExport.downloadRegistrations(await Registration.list());
  };
  $('#export-reg-csv').onclick = async () => ExcelExport.downloadRegistrations(await Registration.list());

  renderRegistrationsTable(await Registration.list());
}

// Ф2: импорт заполненной PDF-анкеты. Совпадение по фамилии и имени с
// пионером этой школы — спросить: обновить его карточку или завести нового.
// Молча не сливаем: однофамильцы и ошибки в имени бывают.
async function importFilledRegistrationPdf(file) {
  const status = $('#import-filled-pdf-status');
  status.textContent = '';
  let parsed;
  try {
    if (!(await PSPdf.ensure('form'))) return;
    parsed = await PdfFormExport.readFilled(await file.arrayBuffer(), RegistrationSchema);
  } catch (err) {
    status.textContent = T('ps.reg.import.failed', { error: err.message });
    return;
  }
  if (!parsed.fields) { status.textContent = T('ps.reg.import.not_form'); return; }
  const record = parsed.record;
  if (!String(record.lastName || '').trim() || !String(record.firstName || '').trim()) {
    status.textContent = T('ps.reg.import.empty');
    return;
  }
  const match = await Registration.findStudentMatch(record);
  const choice = match ? await askImportTarget(Students.fullName(match)) : 'create';
  if (choice === 'cancel') return;
  try {
    const reg = await Registration.saveImported(record, file.name);
    const { student, warnings } = await Registration.applyToStudent(reg, choice === 'update' ? match.id : null);
    status.textContent = T('ps.reg.import.done', { name: Students.fullName(student) })
      + (warnings.length ? ' ' + T('ps.reg.import.check', { list: warnings.join('; ') }) : '');
    renderRegistrationsTable(await Registration.list());
    renderDashboard();
    await openPioneerCard(student.id);
  } catch (err) {
    status.textContent = T('ps.reg.import.failed', { error: err.message });
  }
}

function askImportTarget(name) {
  return new Promise((resolve) => {
    openModal(`
      <h2>${T('ps.reg.import.match_title')}</h2>
      <p>${esc(T('ps.reg.import.match_text', { name }))}</p>
      <div class="modal-close-row">
        <button type="button" class="md-btn md-btn-text" data-choice="cancel">${T('ps.app.otmena')}</button>
        <button type="button" class="md-btn md-btn-outlined" data-choice="create">${T('ps.reg.import.create')}</button>
        <button type="button" class="md-btn md-btn-filled" data-choice="update">${T('ps.reg.import.update')}</button>
      </div>
    `);
    const root = $('#active-modal');
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-choice]');
      if (e.target.id === 'active-modal') { resolve('cancel'); return; }
      if (!btn) return;
      closeModal();
      resolve(btn.dataset.choice);
    });
  });
}

function renderRegistrationsTable(list) {
  const tbody = $('#registrations-table tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="hint">${T('ps.app.registraciy_poka_net')}</td></tr>`;
    return;
  }
  /* Подписи для режима карточек (.md-table--cards): на узком экране шапка
     таблицы скрыта, и каждая ячейка подписывается сама через
     `td::before { content: attr(data-label) }`. Берутся из тех же ключей
     перевода, что и <th>, — иначе на телефоне и на десктопе колонка
     называлась бы по-разному, и это разошлось бы молча при первой же правке
     формулировки. */
  const L = {
    name: T('ps.ui.familiya_imya'),
    contacts: T('ps.ui.kontakty'),
    attending: T('ps.ui.prisutstvie'),
    transport: T('ps.ui.transport_nochleg'),
    book: T('ps.ui.uchebnik'),
  };
  tbody.innerHTML = list.map((r) => `
    <tr>
      <td data-label="${esc(L.name)}">${esc(r.lastName)} ${esc(r.firstName)}${r.convertedToStudentId ? ` <span class="badge-warn" style="background:#3E6B4F;">${T('ps.app.uchaschiysya')}</span>` : ''}</td>
      <td data-label="${esc(L.contacts)}">${esc(r.email || '')}<br>${esc(r.phone || '')}</td>
      <td data-label="${esc(L.attending)}">${esc(Registration.YES_NO_LABELS[r.attending] || '—')}${r.attending === 'no' && r.attendReason ? ' — ' + esc(r.attendReason) : ''}</td>
      <td data-label="${esc(L.transport)}">${esc(T('ps.app.reg_transport', { car: Registration.YES_NO_LABELS[r.transport] || '—', lodging: Registration.YES_NO_LABELS[r.lodging] || '—' }))}</td>
      <td data-label="${esc(L.book)}">${esc(Registration.languageText(r) || '—')}${(r.format || []).length ? ' · ' + r.format.map((f) => esc(Registration.FORMAT_LABELS[f] || f)).join(', ') : ''}</td>
      <td class="md-table__rowactions">
        ${r.convertedToStudentId ? '' : `<button class="md-btn md-btn-text convert-reg" data-id="${esc(r.id)}" style="color:var(--md-primary);">${T('ps.app.v_uchaschiesya')}</button>`}
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

/* Стала асинхронной 30.08.2026: ПДФ-стек догружается по требованию, и ждать
   его нужно ДО сборки письма. Единственный вызывающий — обработчик кнопки
   #doc-pdf-btn, он ничего не делает с возвращаемым значением. */
async function pdfComposerDoc() {
  const doc = currentComposerDoc();
  if (!doc) return;
  if (!(await PSPdf.ensure('pdf'))) return;
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

// ---------- ВСЕ ПИОНЕРЫ (Ф4): список с фильтрами ----------
// Доска «List». Решение Алекса 15.11.2026: просмотр с фильтрами и счётчиками,
// строка → карточка; прежняя редактируемая таблица — вкладка «Редактирование».

let studentsTab = 'overview';
const ovFilter = {};
const OV_FILTERS = ['congregation', 'status', 'classId', 'gender', 'language', 'format', 'transport', 'lodging', 'origin'];

function setStudentsTab(tab) {
  studentsTab = tab === 'edit' ? 'edit' : 'overview';
  const edit = studentsTab === 'edit';
  $('#students-overview').hidden = edit;
  $('#students-edit').hidden = !edit;
  [['#st-tab-overview', !edit], ['#st-tab-edit', edit]].forEach(([sel, on]) => {
    const btn = $(sel);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
  });
}

function bindStudentsTabs() {
  const tabs = [$('#st-tab-overview'), $('#st-tab-edit')];
  // Правки во вкладке «Редактирование» перерисовывают только её таблицу —
  // список пересобирается из базы при возврате на «Все пионеры».
  const show = async (tab) => {
    setStudentsTab(tab);
    if (tab !== 'overview') return;
    const [list, cls, cols] = await Promise.all([Students.list(), DB.list('classes'), Students.getColumns()]);
    renderStudentsOverview(list, cls, cols);
    applyReadOnly('students');
  };
  tabs[0].onclick = () => show('overview');
  tabs[1].onclick = () => show('edit');
  tabs.forEach((btn, i) => {
    btn.onkeydown = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + 1) % 2];
      show(next === tabs[1] ? 'edit' : 'overview');
      next.focus();
    };
  });
  setStudentsTab(studentsTab);
}

function ovYesNo(value) {
  return value === 'yes' ? T('ps.ui.da') : (value === 'no' ? T('ps.ui.net') : '—');
}

function ovFilterOptions(key, students, classes, columns) {
  const opt = (value, label) => ({ value, label });
  const data = PSOverview.options(students);
  switch (key) {
    case 'congregation': return data.congregation.map((c) => opt(c, c));
    case 'status': return [opt('_waiting', T('ps.ov.waiting'))].concat(Students.STATUSES.map((v) => opt(v, Students.statusLabel(v))));
    case 'classId': return classes.map((c) => opt(c.id, c.name)).concat(opt('_none', T('ps.app.bez_klassa')));
    case 'gender': return Students.GENDERS.map((v) => opt(v, Students.genderLabel(v))).concat(opt('_none', T('ps.ov.not_set')));
    case 'language': return data.language.map((l) => opt(l, Students.languageName(l)));
    case 'format': {
      const col = columns.find((c) => c.key === 'textbookFormat');
      return ((col && col.options) || []).map((o) => opt(o.value, Students.optionLabel(o)));
    }
    case 'transport':
    case 'lodging': return [opt('yes', T('ps.ui.da')), opt('no', T('ps.ui.net'))];
    case 'origin': return Students.ORIGINS.map((v) => opt(v, Students.originLabel(v)));
    default: return [];
  }
}

function renderStudentsOverview(students, classes, columns) {
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const st = PSOverview.stats(students);
  $('#ov-stats').innerHTML = ['coming', 'refused', 'waiting', 'lodging', 'special'].map((k) => `
    <div class="ps-ov-stat"><b>${st[k]}</b><span>${esc(T('ps.ov.stat.' + k))}</span></div>`).join('');

  // Фильтр, чьего значения больше нет в данных (удалённый класс), снимается.
  OV_FILTERS.forEach((key) => {
    if (ovFilter[key] && !ovFilterOptions(key, students, classes, columns).some((o) => o.value === ovFilter[key])) delete ovFilter[key];
  });
  const active = OV_FILTERS.some((k) => ovFilter[k]);
  const activeCount = OV_FILTERS.filter((k) => ovFilter[k]).length;
  // Телефон: девять фильтров свёрнуты, пока ни один не выбран; шире — открыты.
  const box = $('#ov-filterbox');
  if (!box.dataset.touched) box.open = active || window.matchMedia('(min-width: 901px)').matches;
  box.ontoggle = () => { box.dataset.touched = '1'; };
  $('#ov-filters-summary').textContent = activeCount ? T('ps.ov.filters_on', { n: activeCount }) : T('ps.ov.filters');
  $('#ov-filters').innerHTML = OV_FILTERS.map((key) => {
    const options = ovFilterOptions(key, students, classes, columns);
    return `<label class="ps-ov-filter${ovFilter[key] ? ' ps-ov-filter--on' : ''}"><span>${esc(T('ps.ov.f.' + key))}</span>
      <select data-ov-filter="${key}" data-ro-allow>
        <option value="">${esc(T('ps.ov.all'))}</option>
        ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === ovFilter[key] ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select></label>`;
  }).join('') + (active ? `<button type="button" class="md-btn md-btn-text" id="ov-reset" data-ro-allow>${esc(T('ps.ov.reset'))}</button>` : '');
  $all('[data-ov-filter]', $('#ov-filters')).forEach((sel) => {
    sel.onchange = () => {
      if (sel.value) ovFilter[sel.dataset.ovFilter] = sel.value; else delete ovFilter[sel.dataset.ovFilter];
      renderStudentsOverview(students, classes, columns);
      const again = document.querySelector(`[data-ov-filter="${sel.dataset.ovFilter}"]`);
      if (again) again.focus();
    };
  });
  const reset = $('#ov-reset');
  if (reset) reset.onclick = () => { OV_FILTERS.forEach((k) => delete ovFilter[k]); renderStudentsOverview(students, classes, columns); };

  const rows = PSOverview.filter(students, ovFilter);
  $('#ov-list-title').textContent = active
    ? T('ps.ov.title_filtered', { n: rows.length, total: students.length })
    : T('ps.ov.title', { n: students.length });

  const heads = ['name', 'congregation', 'gender', 'origin', 'status', 'class', 'textbook', 'transport', 'lodging'];
  $('#ov-table-head').innerHTML = heads.map((h) => `<th scope="col">${esc(T('ps.ov.col.' + h))}</th>`).join('');
  const formatCol = columns.find((c) => c.key === 'textbookFormat');
  const formatLabel = (value) => {
    const o = ((formatCol && formatCol.options) || []).find((x) => x.value === (value || 'standard'));
    return o ? Students.optionLabel(o) : (value || '');
  };
  const tbody = $('#ov-table tbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${heads.length}" class="hint">${esc(T(students.length ? 'ps.ov.empty_filtered' : 'ps.app.uchaschihsya_poka_net'))}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((s) => {
    const v = s.values || {};
    const cls = classById[s.classId];
    const langs = (s.textbookLanguages || []).join(', ');
    const reason = Students.REASON_REQUIRED.includes(s.status) && s.statusReason ? `<span class="ps-reason">${esc(s.statusReason)}</span>` : '';
    return `<tr>
      <td><button type="button" class="md-btn md-btn-text ov-open" data-id="${esc(s.id)}" data-ro-allow>${esc(Students.fullName(s))}</button></td>
      <td>${esc(v.congregation || '—')}</td>
      <td>${esc(s.gender ? T('ps.ov.gender_short.' + s.gender) : '—')}</td>
      <td>${esc(Students.originLabel(s.origin))}</td>
      <td><span class="ps-status ps-status--${esc(s.status)}">${esc(Students.statusLabel(s.status))}</span>${reason}</td>
      <td>${cls ? `<span class="ps-chip">${esc(cls.name)}</span>` : '—'}</td>
      <td class="hint">${esc([formatLabel(v.textbookFormat), langs].filter(Boolean).join(' · '))}</td>
      <td>${esc(ovYesNo(v.transport))}</td>
      <td>${esc(ovYesNo(v.lodging))}</td>
    </tr>`;
  }).join('');
  $all('.ov-open', tbody).forEach((btn) => { btn.onclick = () => openPioneerCard(btn.dataset.id); });
}

async function refreshStudentsViews() {
  if ($('#route-students').classList.contains('hidden')) return;
  const [list, cls, cols] = await Promise.all([Students.list(), DB.list('classes'), Students.getColumns()]);
  renderStudentsOverview(list, cls, cols);
  renderStudentsTable(list, cls, cols);
  applyReadOnly('students');
}

// ---------- STUDENTS ----------
async function renderStudents() {
  const [students, classes, columns] = await Promise.all([Students.list(), DB.list('classes'), Students.getColumns()]);

  bindStudentsTabs();
  renderStudentsOverview(students, classes, columns);
  $('#ov-export-btn').onclick = () => openExportPicker();
  $('#ov-add-btn').onclick = () => {
    setStudentsTab('edit');
    const first = $('#student-form-fields input, #student-form-fields select');
    if (first) first.focus();
  };

  renderStudentFormFields(columns);
  renderClassSelect(classes);
  renderColumnsManager(columns);
  renderStudentsTableHead(columns);
  renderStudentsTable(students, classes, columns);

  $('#new-col-type').onchange = () => {
    $('#new-col-options-wrap').classList.toggle('hidden', $('#new-col-type').value !== 'select');
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
    if (!(await PSPdf.ensure('pdf'))) return;
    await PdfExport.downloadAllStudentFormulaires(st, Students.exportColumns(cols), byId);
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
    /* Пустой вариант первым: без него у нового учащегося по умолчанию «Да» (автомобиль,
       ночлег) завышало подсчёты, а у строки без значения таблица показывала «Да» вместо пустоты. */
    const blank = `<option value="" ${!value || !(column.options || []).some((o) => o.value === value) ? 'selected' : ''}>—</option>`;
    const opts = blank + (column.options || []).map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(Students.optionLabel(o))}</option>`).join('');
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
  head.innerHTML = columns.map((c) => `<th>${esc(Students.label(c))}</th>`).join('')
    + `<th>${esc(T('ps.pioneer.f.origin'))}</th><th>${esc(T('ps.pioneer.f.status'))}</th><th>${T('ps.app.klass')}</th><th></th>`;
}

function renderStudentsTable(students, classes, columns) {
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const tbody = $('#students-table tbody');
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 4}" class="hint">${T('ps.app.uchaschihsya_poka_net')}</td></tr>`;
    return;
  }
  tbody.innerHTML = students.map((s) => {
    const cells = columns.map((c) => `<td>${renderFieldInput(c, (s.values || {})[c.key], 'row-' + s.id)}</td>`).join('');
    const classOptions = '<option value="">—</option>' + classes.map((cl) => `<option value="${esc(cl.id)}" ${cl.id === s.classId ? 'selected' : ''}>${esc(cl.name)}</option>`).join('');
    const reason = Students.REASON_REQUIRED.includes(s.status) && s.statusReason ? `<span class="ps-reason">${esc(s.statusReason)}</span>` : '';
    return `<tr data-student-id="${esc(s.id)}">
      ${cells}
      <td>${esc(Students.originLabel(s.origin))}</td>
      <td><span class="ps-status ps-status--${esc(s.status)}">${esc(Students.statusLabel(s.status))}</span>${reason}</td>
      <td><select class="row-class-select" data-id="${esc(s.id)}">${classOptions}</select></td>
      <td>
        <button class="md-btn md-btn-text row-card" data-id="${esc(s.id)}" style="color:var(--md-primary);">${T('ps.pioneer.card')}</button>
        <button class="md-btn md-btn-text row-doc" data-id="${esc(s.id)}" style="color:var(--md-primary);">${T('ps.docs.document')}</button>
        <button class="md-btn md-btn-text row-formulaire" data-id="${esc(s.id)}" style="color:var(--md-primary);">${T('ps.app.formulyar')}</button>
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
        // Название собрания правят вручную — связь со справочником снимается,
        // иначе снимок и карточка справочника разошлись бы молча.
        if (c.key === 'congregation') student.congregationId = null;
        try {
          await Students.save(student);
        } catch (e) {
          /* Проверка (например, пустая фамилия) раньше падала молча: поле выглядело
             сохранённым, а в базе оставалось старое. Говорим причину и возвращаем значение. */
          alert(e.message);
          const stored = await DB.get('students', studentId);
          input.value = ((stored && stored.values) || {})[c.key] ?? '';
          return;
        }
        if (c.key === 'textbookFormat') renderDashboard();
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

  $all('.row-card', tbody).forEach((btn) => {
    btn.onclick = () => openPioneerCard(btn.dataset.id);
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
      if (!(await PSPdf.ensure('pdf'))) return;
      await PdfExport.downloadStudentFormulaire(student, Students.exportColumns(columns), cls ? cls.name : '');
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
  if (!(await PSPdf.ensure('import'))) { status.textContent = ''; return; }
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
      <select class="import-mapping-select" data-idx="${i}" style="width:100%;font-size:11px;border:none;border-top:1px solid var(--md-outline-variant);">
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
    ${anyAnomalies ? `<p class="hint" style="color:var(--md-error);">${T('ps.app.yacheyki_s_oranzhevym_fonom')}</p>` : ''}
    ${!hasNameMapping ? `<p class="hint" style="color:var(--md-error);">${T('ps.app.sopostavte_odin_iz_stolbcov')}</p>` : ''}
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
        await Students.save({ id: DB.uid(), classId: null, values }, { source: 'import' });
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
  const columns = Students.exportColumns(await Students.getColumns());
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
    if (!(await PSPdf.ensure('pdf'))) return;
    await PdfExport.downloadStudentList(students, cols, await getClassesById());
  };
  $('#export-do-xlsx').onclick = async () => {
    const cols = await getSelectedColumns();
    const students = await Students.list();
    if (!(await PSPdf.ensure('excel'))) return;
    XlsxExport.downloadStudents(students, cols, await getClassesById());
  };
  $('#export-do-csv').onclick = async () => {
    const cols = await getSelectedColumns();
    const students = await Students.list();
    ExcelExport.downloadStudentsCsv(students, cols, await getClassesById());
  };
  $('#export-close-btn').onclick = closeModal;
}

// ---------- РАССЫЛКА (Ф3) ----------
// Экран «0 · Мастер-макет › Dispatch». Решения Алекса 14.11.2026: пакет —
// ZIP с отдельными PDF; «Напомнить» — готовый текст старейшинам (WhatsApp,
// почта, копирование); «письмо отправлено» — только кнопкой; срок ответа —
// срок формуляра с правкой по собранию. Логика и хранение — Dispatch.

let dispatchSelected = null;

function dispatchDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso) + 'T00:00:00');
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(document.documentElement.lang || 'ru');
}

function dispatchContact(group) {
  const rec = group.record;
  if (!rec) return '';
  return [rec.contactName, rec.contactPhone, rec.contactEmail].filter(Boolean).join(' · ');
}

function dispatchAnswersChip(group) {
  const count = `${group.responded} / ${group.total}`;
  if (group.overdue) return `<span class="ps-dispatch-chip ps-dispatch-chip--bad">${esc(T('ps.dispatch.overdue_chip', { n: count }))}</span>`;
  const mod = group.complete ? 'ok' : (group.sent ? 'warn' : 'idle');
  return `<span class="ps-dispatch-chip ps-dispatch-chip--${mod}">${esc(count)}</span>`;
}

async function renderDispatch() {
  const [students, state, config] = await Promise.all([Students.list(), Dispatch.getState(), Registration.getConfig()]);
  const groups = Dispatch.groups(students, state, config);
  const orphans = Dispatch.orphans(students);

  $('#dispatch-hint').textContent = orphans.length ? T('ps.dispatch.orphans', { n: orphans.length }) : '';
  $('#dispatch-zip-all').disabled = !groups.some((g) => g.invitees.length);
  $('#dispatch-zip-all').onclick = () => downloadDispatchZip(groups.filter((g) => g.invitees.length), true);
  $('#dispatch-remind-all').disabled = !groups.some((g) => g.overdue);
  $('#dispatch-remind-all').onclick = () => openDispatchReminder(groups.filter((g) => g.overdue));

  if (!groups.length) {
    $('#dispatch-table').innerHTML = `<p class="hint">${esc(T('ps.dispatch.empty'))}</p>`;
    $('#dispatch-detail').innerHTML = '';
    $('#dispatch-detail').hidden = true;
    return;
  }
  $('#dispatch-detail').hidden = false;
  if (!groups.some((g) => g.key === dispatchSelected)) dispatchSelected = groups[0].key;

  $('#dispatch-table').innerHTML = `<div class="ps-dispatch__scroll"><table class="md-table md-table--cards ps-dispatch-table">
    <thead><tr>
      <th>${esc(T('ps.dispatch.col_cong'))}</th><th>${esc(T('ps.dispatch.col_count'))}</th>
      <th>${esc(T('ps.dispatch.col_contact'))}</th><th>${esc(T('ps.dispatch.col_sent'))}</th>
      <th>${esc(T('ps.dispatch.col_deadline'))}</th><th>${esc(T('ps.dispatch.col_answers'))}</th>
    </tr></thead>
    <tbody>${groups.map((g) => `<tr class="${g.key === dispatchSelected ? 'ps-dispatch-row--sel' : ''}">
      <td data-label="${esc(T('ps.dispatch.col_cong'))}"><button type="button" class="md-btn md-btn-text dispatch-pick" data-ro-allow data-key="${esc(g.key)}" aria-pressed="${g.key === dispatchSelected}">${esc(g.name)}</button></td>
      <td data-label="${esc(T('ps.dispatch.col_count'))}">${g.invitees.length}</td>
      <td data-label="${esc(T('ps.dispatch.col_contact'))}">${g.record ? esc(dispatchContact(g) || '—') : `<span class="ps-reason">${esc(T('ps.dispatch.no_contact'))}</span>`}</td>
      <td data-label="${esc(T('ps.dispatch.col_sent'))}">${esc(dispatchDate(g.entry.sentAt))}</td>
      <td data-label="${esc(T('ps.dispatch.col_deadline'))}">${esc(dispatchDate(g.deadline))}</td>
      <td data-label="${esc(T('ps.dispatch.col_answers'))}">${dispatchAnswersChip(g)}</td>
    </tr>`).join('')}</tbody></table></div>`;

  $all('.dispatch-pick').forEach((btn) => {
    btn.onclick = () => { dispatchSelected = btn.dataset.key; renderDispatch(); };
  });

  renderDispatchDetail(groups.find((g) => g.key === dispatchSelected), config);
}

function renderDispatchDetail(group, config) {
  const el = $('#dispatch-detail');
  const n = group.invitees.length;
  const contact = dispatchContact(group);
  const sentBlock = group.sent
    ? `<p class="ps-dispatch__status">${esc(T('ps.dispatch.sent_on', { date: dispatchDate(group.entry.sentAt) }))}
        ${group.entry.remindedAt ? `<span class="ps-reason">${esc(T('ps.dispatch.reminded_on', { date: dispatchDate(group.entry.remindedAt) }))}</span>` : ''}</p>
       <div class="ps-dispatch-actions">
         ${group.complete ? '' : `<button type="button" class="md-btn md-btn-tonal" id="dispatch-remind">${esc(T('ps.dispatch.remind'))}</button>`}
         <button type="button" class="md-btn md-btn-text" id="dispatch-unmark">${esc(T('ps.dispatch.unmark'))}</button>
       </div>`
    : `<div class="ps-dispatch-actions ps-dispatch-actions--end">
         <label class="field"><span>${esc(T('ps.dispatch.sent_date'))}</span><input type="date" id="dispatch-sent-date" value="${esc(DateUtils.todayIso())}"></label>
         <button type="button" class="md-btn md-btn-tonal" id="dispatch-mark" ${n ? '' : 'disabled'}>${esc(T('ps.dispatch.mark_sent'))}</button>
       </div>`;

  el.innerHTML = `
    <h3>${esc(T('ps.dispatch.package', { name: group.name }))}</h3>
    ${n ? `<ul class="ps-dispatch__docs">
      <li>${esc(T('ps.dispatch.item_elders', { n }))}</li>
      <li>${esc(T('ps.dispatch.item_invites', { n }))}</li>
      <li>${esc(T('ps.dispatch.item_forms', { n }))}</li>
    </ul>` : `<p class="hint">${esc(T('ps.dispatch.no_invitees'))}</p>`}
    <p class="hint">${esc(contact ? T('ps.dispatch.contact', { contact }) : T('ps.dispatch.contact_missing'))}</p>
    <label class="field"><span>${esc(T('ps.dispatch.deadline_label'))}</span>
      <input type="date" id="dispatch-deadline" value="${esc(group.entry.deadline || '')}"></label>
    <p class="hint">${esc(config.deadline ? T('ps.dispatch.deadline_default', { date: dispatchDate(config.deadline) }) : T('ps.dispatch.deadline_none'))}</p>
    <div class="ps-dispatch-actions">
      <button type="button" class="md-btn md-btn-outlined" id="dispatch-preview" data-ro-allow ${n ? '' : 'disabled'}>${esc(T('ps.dispatch.preview'))}</button>
      <button type="button" class="md-btn md-btn-filled" id="dispatch-zip" data-ro-allow ${n ? '' : 'disabled'}>${esc(T('ps.dispatch.zip'))}</button>
    </div>
    <p class="hint" id="dispatch-status" role="status"></p>
    ${sentBlock}`;

  $('#dispatch-deadline').onchange = async (e) => { await Dispatch.setDeadline(group, e.target.value); renderDispatch(); };
  $('#dispatch-preview').onclick = async () => {
    const names = group.invitees.map((s) => Students.fullName(s));
    const doc = await Letters.buildFor(Letters.ELDERS, await Letters.congregationData(group, names, { deadline: group.deadline }));
    if (!doc) return alert(T('ps.docs.build_failed'));
    openModal(`<h2>${esc(doc.title)}</h2><div class="doc-paper" id="doc-paper"></div>
      <div class="modal-close-row"><button class="md-btn md-btn-text" id="doc-close-btn">${esc(T('common.close'))}</button></div>`);
    $('#doc-paper').textContent = doc.body;
    $('#doc-close-btn').onclick = closeModal;
  };
  $('#dispatch-zip').onclick = () => downloadDispatchZip([group], false);
  if ($('#dispatch-mark')) {
    $('#dispatch-mark').onclick = async () => {
      await Dispatch.markSent(group, $('#dispatch-sent-date').value);
      renderDispatch();
    };
  }
  if ($('#dispatch-unmark')) {
    $('#dispatch-unmark').onclick = async () => {
      if (!confirm(T('ps.dispatch.unmark_confirm'))) return;
      await Dispatch.unmarkSent(group);
      renderDispatch();
    };
  }
  if ($('#dispatch-remind')) $('#dispatch-remind').onclick = () => openDispatchReminder([group]);
  applyReadOnly('dispatch');
}

async function downloadDispatchZip(groups, all) {
  const status = $('#dispatch-status');
  if (status) status.textContent = T('ps.dispatch.building');
  try {
    const files = [];
    const docs = [];
    for (const group of groups) {
      const pack = await Dispatch.packageFiles(group, group.name);
      if (!pack) { if (status) status.textContent = ''; return; }
      files.push(...pack.files);
      docs.push(...pack.docs);
    }
    // Имя архива — латиницей: кириллицу в атрибуте download часть браузеров
    // заменяет на «download» (проверено живым прогоном). Внутри архива
    // папка собрания названа полностью.
    const number = !all && groups[0].record && String(groups[0].record.congNumber || '').replace(/[^0-9A-Za-z-]+/g, '');
    const name = all ? 'pioneer-school-packages.zip' : `pioneer-school-package${number ? '-' + number : ''}.zip`;
    PSZip.download(PSZip.build(files), name);
    Dispatch.snapshot(docs);
    if (status) status.textContent = '';
  } catch (error) {
    console.error(error);
    if (status) status.textContent = '';
    alert(T('ps.dispatch.zip_failed', { error: error.message }));
  }
}

async function openDispatchReminder(groups) {
  if (!groups.length) return alert(T('ps.dispatch.no_overdue'));
  const items = [];
  for (const group of groups) {
    const doc = await Dispatch.reminder(group);
    if (!doc) return alert(T('ps.docs.build_failed'));
    items.push({ group, doc, links: Dispatch.links(group, doc) });
  }
  openModal(`
    <h2>${esc(T('ps.dispatch.doc_reminder'))}</h2>
    ${items.map((it, i) => `<section class="ps-dispatch-remind">
      <h3>${esc(it.group.name)}</h3>
      <div class="doc-paper" id="dispatch-remind-text-${i}"></div>
      <div class="ps-dispatch-actions">
        ${it.links.whatsapp ? `<a class="md-btn md-btn-tonal dispatch-send" data-i="${i}" href="${esc(it.links.whatsapp)}" target="_blank" rel="noopener">${esc(T('ps.dispatch.whatsapp'))}</a>` : ''}
        ${it.links.email ? `<a class="md-btn md-btn-tonal dispatch-send" data-i="${i}" href="${esc(it.links.email)}">${esc(T('ps.dispatch.email'))}</a>` : ''}
        <button type="button" class="md-btn md-btn-outlined dispatch-copy" data-i="${i}">${esc(T('ps.dispatch.copy'))}</button>
      </div>
    </section>`).join('')}
    <div class="modal-close-row"><button class="md-btn md-btn-text" id="doc-close-btn">${esc(T('common.close'))}</button></div>`);

  items.forEach((it, i) => { $('#dispatch-remind-text-' + i).textContent = it.doc.body; });
  const done = async (i) => {
    await Dispatch.markReminded(items[i].group);
    Letters.snapshotFor(items[i].doc, { entity: Letters.REMINDER.entity, id: items[i].group.key, title: items[i].group.name }, 'manual', false);
  };
  $all('.dispatch-send').forEach((a) => { a.addEventListener('click', () => done(Number(a.dataset.i))); });
  $all('.dispatch-copy').forEach((btn) => {
    btn.onclick = async () => {
      const i = Number(btn.dataset.i);
      try { await navigator.clipboard.writeText(items[i].doc.body); } catch (e) { return alert(e.message); }
      btn.textContent = T('ps.dispatch.copied');
      done(i);
    };
  });
  $('#doc-close-btn').onclick = () => { closeModal(); renderDispatch(); };
}

// ---------- TEXTBOOKS ----------
// ---------- КЛАССЫ И УЧЕБНИКИ (Ф5) ----------
// Доска «Classes». Решения Алекса 15.11.2026: раздел «Учебники» стал
// «Классы и учебники»; «Предложить» распределяет только тех, кто без класса
// (предпросмотр → «Применить»); супруги и родственники вместе; заказ — язык ×
// формат из ответов, «+5» только к печатным. Логика — js/modules/classes.js,
// Textbooks.compute().

let clsProposal = null;

function clsMemberHtml(s, ctx) {
  const cong = String((s.values || {}).congregation || '').trim();
  const moved = ctx.moved && ctx.moved.has(s.id);
  const opts = [`<option value="">${esc(T('ps.app.bez_klassa'))}</option>`]
    .concat(ctx.classes.filter((c) => !c.isNew).map((c) => `<option value="${esc(c.id)}" ${c.id === s.classId ? 'selected' : ''}>${esc(c.name)}</option>`));
  return `<li class="ps-cls-member${moved ? ' ps-cls-member--new' : ''}">
    <button type="button" class="md-btn md-btn-text ov-open" data-id="${esc(s.id)}" data-ro-allow>${esc(Students.fullName(s))}</button>
    ${cong ? `<small>${esc(cong)}</small>` : ''}
    ${moved ? `<span class="ps-chip ps-chip--accent">${esc(T('ps.cls.proposed'))}</span>` : ''}
    ${ctx.preview ? '' : `<select class="cls-move" data-id="${esc(s.id)}" aria-label="${esc(T('ps.cls.move', { name: Students.fullName(s) }))}">${opts.join('')}</select>`}
  </li>`;
}

function clsMembersHtml(members, ctx) {
  if (!members.length) return `<p class="hint">${esc(T('ps.cls.empty'))}</p>`;
  return `<ul class="ps-cls-members">${PSClasses.groups(members).map((group) => {
    if (group.length < 2) return clsMemberHtml(group[0], ctx);
    const spouses = group.length === 2 && (group[0].relations || []).some((r) => r.type === 'spouse' && r.studentId === group[1].id);
    return `<li class="ps-cls-group"><span class="ps-cls-group__label">${esc(T(spouses ? 'ps.cls.spouses' : 'ps.cls.together'))}</span>
      <ul>${group.map((s) => clsMemberHtml(s, ctx)).join('')}</ul></li>`;
  }).join('')}</ul>`;
}

async function renderTextbooks() {
  const [students, classes, order, assignment] = await Promise.all([
    Students.list(), PSClasses.list(), Textbooks.getOrder(), Assignment.get()
  ]);
  const ro = DB.isReadOnly();
  const confirmed = students.filter((s) => PSClasses.isConfirmed(s));
  const waiting = students.filter((s) => Textbooks.WAITING.includes(s.status));
  const preview = clsProposal;

  // ----- Классы -----
  const countInput = $('#cls-count');
  if (!countInput.dataset.touched) countInput.value = Math.max(1, classes.length);
  countInput.oninput = () => { countInput.dataset.touched = '1'; };
  const shown = preview ? preview.classes : classes;
  const placeOf = new Map(students.map((s) => [s.id, s.classId || null]));
  if (preview) preview.moves.forEach((m) => placeOf.set(m.id, m.to));
  const ctx = { classes: shown, preview: !!preview, moved: preview ? new Set(preview.moves.map((m) => m.id)) : null };
  const view = (s) => ({ ...s, classId: placeOf.get(s.id) });
  const known = new Set(shown.map((c) => c.id));

  const cards = shown.map((c, i) => {
    const members = confirmed.map(view).filter((s) => s.classId === c.id);
    const st = PSClasses.stats(members);
    const others = students.filter((s) => s.classId === c.id && !PSClasses.isConfirmed(s)).length;
    const phA = i === 0 ? assignment.teacherA || '' : '';
    const phB = i === 0 ? assignment.teacherB || '' : '';
    return `<section class="ps-cls-card${c.isNew ? ' ps-cls-card--new' : ''}" aria-label="${esc(c.name)}">
      <div class="ps-cls-card__head">
        ${c.isNew || preview ? `<h3>${esc(c.name)}${c.isNew ? ` <span class="ps-chip ps-chip--accent">${esc(T('ps.cls.new'))}</span>` : ''}</h3>`
          : `<input type="text" class="cls-name" data-id="${esc(c.id)}" value="${esc(c.name)}" aria-label="${esc(T('ps.cls.name'))}">`}
        <span class="hint">${esc(T('ps.cls.stats', { n: st.total, b: st.brothers, s: st.sisters }))}</span>
      </div>
      ${c.isNew ? '' : `<div class="ps-cls-teachers">
        <label><span>${esc(T('ps.app.prepodavatel_a'))}</span><input type="text" class="cls-teacher" data-id="${esc(c.id)}" data-key="teacherA" value="${esc(c.teacherA || '')}" placeholder="${esc(phA)}" ${preview ? 'disabled' : ''}></label>
        <label><span>${esc(T('ps.ui.prepodavatel_b'))}</span><input type="text" class="cls-teacher" data-id="${esc(c.id)}" data-key="teacherB" value="${esc(c.teacherB || '')}" placeholder="${esc(phB)}" ${preview ? 'disabled' : ''}></label>
      </div>`}
      ${clsMembersHtml(members, ctx)}
      ${others ? `<p class="hint">${esc(T('ps.cls.others', { n: others }))}</p>` : ''}
      ${!preview && !c.isNew && !members.length && !others ? `<button type="button" class="md-btn md-btn-text cls-remove" data-id="${esc(c.id)}">${esc(T('ps.app.udalit'))}</button>` : ''}
    </section>`;
  });
  const unclassed = confirmed.map(view).filter((s) => !s.classId || !known.has(s.classId));
  cards.push(`<section class="ps-cls-card ps-cls-card--none" aria-label="${esc(T('ps.tb2.col.none'))}">
    <div class="ps-cls-card__head"><h3>${esc(T('ps.tb2.col.none'))}</h3>
      <span class="hint">${esc(T('ps.cls.waiting', { n: waiting.length }))}</span></div>
    ${unclassed.length ? clsMembersHtml(unclassed, ctx) : ''}
    <p class="hint">${esc(T(classes.length || preview ? 'ps.cls.none_hint' : 'ps.app.klassov_poka_net_shkola'))}</p>
  </section>`);
  $('#cls-cols').innerHTML = cards.join('');

  const box = $('#cls-preview');
  box.hidden = !preview;
  if (preview) {
    const newCount = preview.classes.filter((c) => c.isNew && preview.moves.some((m) => m.to === c.id)).length;
    box.innerHTML = `<p>${esc(T(preview.moves.length ? 'ps.cls.preview' : 'ps.cls.preview_none', { n: preview.moves.length, k: newCount }))}</p>
      <div class="btn-row">
        ${preview.moves.length ? `<button type="button" class="md-btn md-btn-filled" id="cls-apply">${esc(T('ps.cls.apply'))}</button>` : ''}
        <button type="button" class="md-btn md-btn-outlined" id="cls-cancel" data-ro-allow>${esc(T('ps.cls.cancel'))}</button>
      </div>`;
    const apply = $('#cls-apply');
    if (apply) apply.onclick = async () => {
      apply.disabled = true;
      await PSClasses.apply(preview);
      clsProposal = null;
      await renderTextbooks();
      renderDashboard();
    };
    $('#cls-cancel').onclick = () => { clsProposal = null; renderTextbooks(); };
  }
  ['#cls-propose', '#cls-redistribute', '#cls-add'].forEach((sel) => { $(sel).disabled = !!preview || ro; });

  const propose = async (mode) => {
    const fresh = await Students.list();
    clsProposal = PSClasses.propose({
      students: fresh, classes: await PSClasses.list(), count: Number(countInput.value) || 1, mode,
      newName: (n) => T('ps.cls.default_name', { n })
    });
    await renderTextbooks();
    $('#cls-preview').focus && $('#cls-preview').scrollIntoView({ block: 'nearest' });
  };
  $('#cls-propose').onclick = () => propose('unclassed');
  $('#cls-redistribute').onclick = () => { if (confirm(T('ps.cls.redistribute_confirm'))) propose('all'); };
  $('#cls-add').onclick = async () => {
    const list = await PSClasses.list();
    await PSClasses.add(T('ps.cls.default_name', { n: list.length + 1 }));
    countInput.dataset.touched = '';
    await renderTextbooks();
  };

  const cols = $('#cls-cols');
  $all('.ov-open', cols).forEach((b) => { b.onclick = () => openPioneerCard(b.dataset.id); });
  $all('.cls-move', cols).forEach((sel) => {
    sel.onchange = async () => {
      await Students.setClass(sel.dataset.id, sel.value || null, 'manual');
      await renderTextbooks();
      renderDashboard();
    };
  });
  $all('.cls-name', cols).forEach((inp) => { inp.onchange = async () => { await PSClasses.update(inp.dataset.id, { name: inp.value }); renderTextbooks(); }; });
  $all('.cls-teacher', cols).forEach((inp) => { inp.onchange = () => PSClasses.update(inp.dataset.id, { [inp.dataset.key]: inp.value }); });
  $all('.cls-remove', cols).forEach((b) => {
    b.onclick = async () => {
      try { await PSClasses.remove(b.dataset.id, await Students.list()); } catch (e) { alert(e.message); }
      countInput.dataset.touched = '';
      renderTextbooks();
    };
  });

  // ----- Заказ учебников -----
  renderTextbookOrder(students, classes, order);
  $('#tb-received').checked = !!order.received;
  $('#tb-recounted').checked = !!order.recountedOnReceipt;
  const saveFlags = async () => {
    const current = await Textbooks.getOrder();
    await DB.put('textbookOrder', { ...current, id: 'main', received: $('#tb-received').checked, recountedOnReceipt: $('#tb-recounted').checked });
  };
  $('#tb-received').onchange = saveFlags;
  $('#tb-recounted').onchange = saveFlags;
  $('#textbook-reminders').innerHTML = Textbooks.REMINDERS.map((r) => `<li>${r}</li>`).join('');

  $('#export-textbooks-pdf').onclick = async () => {
    if (!(await PSPdf.ensure('pdf'))) return;
    await PdfExport.downloadTextbookOrder(await Textbooks.getOrder());
  };
  $('#export-textbooks-csv').onclick = async () => {
    ExcelExport.downloadTextbookOrder(await Textbooks.getOrder());
  };
  applyReadOnly('textbooks');
}

function textbookFormatLabel(format) { return T('ps.tb2.format.' + format); }

function renderTextbookOrder(students, classes, order) {
  const schoolLanguage = Students._schoolLanguage();
  const result = Textbooks.compute({ students, classes, order, schoolLanguage });
  $('#tb-basis').value = result.basis;
  const heads = [T('ps.ov.f.language'), T('ps.ov.f.format')]
    .concat(classes.map((c) => c.name), [T('ps.tb2.col.none'), T('ps.tb2.col.reserve'), T('ps.ui.uzhe_v_nalichii'), T('ps.ui.k_zakazu')]);
  $('#tb-head').innerHTML = heads.map((h, i) => `<th scope="col"${i > 1 ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
  const tbody = $('#tb-table tbody');
  if (!result.rows.length) {
    tbody.innerHTML = `<tr><td colspan="${heads.length}" class="hint">${esc(T('ps.tb2.empty'))}</td></tr>`;
  } else {
    tbody.innerHTML = result.rows.map((r) => `<tr>
      <td>${esc(Students.languageName(r.language))}</td>
      <td>${esc(textbookFormatLabel(r.format))}</td>
      ${classes.map((c) => `<td class="num">${r.byClass[c.id] || 0}</td>`).join('')}
      <td class="num">${r.none}</td>
      <td class="num">${r.reserve ? '+' + r.reserve : '—'}</td>
      <td class="num"><input type="number" class="tb-stock" min="0" inputmode="numeric" data-key="${esc(r.key)}" value="${r.stock || ''}" placeholder="0"
        aria-label="${esc(T('ps.tb2.stock_for', { row: Students.languageName(r.language) + ' · ' + textbookFormatLabel(r.format) }))}"></td>
      <td class="num"><b>${r.order}</b></td>
    </tr>`).join('');
  }
  const t = result.total;
  $('#tb-table tfoot').innerHTML = `<tr class="ps-tb-total"><th scope="row" colspan="2">${esc(T('ps.tb2.total'))}</th>
    ${classes.map((c) => `<td class="num">${t.byClass[c.id] || 0}</td>`).join('')}
    <td class="num">${t.none}</td><td class="num">${t.reserve ? '+' + t.reserve : '—'}</td>
    <td class="num">${t.stock}</td><td class="num"><b>${t.order}</b></td></tr>`;

  // Наличие и основа сохраняются сразу; суммы — в прежние поля для PDF/CSV.
  const persist = async (patch) => {
    const current = await Textbooks.getOrder();
    const next = { ...current, ...patch, stock: { ...(current.stock || {}), ...(patch.stock || {}) } };
    const fresh = await Students.list();
    await Textbooks.saveComputed(next, Textbooks.compute({ students: fresh, classes, order: next, schoolLanguage }));
    renderTextbookOrder(fresh, classes, await Textbooks.getOrder());
    applyReadOnly('textbooks');
    renderDashboard();
  };
  $all('.tb-stock', tbody).forEach((inp) => {
    inp.onchange = () => persist({ stock: { [inp.dataset.key]: Math.max(0, Number(inp.value) || 0) } });
  });
  $('#tb-basis').onchange = () => persist({ basis: $('#tb-basis').value });
}

// ---------- ЗАДАНИЯ (Ф6) ----------
// Доска «Tasks» и раздел G мастер-макета. Решения Алекса 15.11.2026: правило
// участников — на задание; каждое задание один раз в каждом классе; день и
// преподаватель — ручная правка → план школы → таблица уроков; библиотека
// общая, тексты всегда текущие. Логика — js/modules/tasks.js.

const taskUi = { no: 1, classId: null, lang: null };

function taskStatus(text) { const el = $('#task-status'); if (el) el.textContent = text || ''; }

function taskSchoolLang() { return Students._schoolLanguage() || PSTasks.FALLBACK_LANG; }

function taskTeacherName(cls, letter, assignment) {
  if (!letter) return '';
  const own = String((cls || {})[letter === 'A' ? 'teacherA' : 'teacherB'] || '').trim();
  if (own) return own;
  return String((assignment || {})[letter === 'A' ? 'teacherA' : 'teacherB'] || '').trim();
}

function taskTeacherLabel(letter) {
  return letter === 'A' ? T('ps.app.prepodavatel_a') : letter === 'Б' ? T('ps.ui.prepodavatel_b') : '—';
}

async function taskContext() {
  const [library, all, classes, students, plan, seed, assignment] = await Promise.all([
    PSTasks.library(), PSTasks.assignments(), PSClasses.list(), Students.list(), PSTasks.plan(), loadLessonsSeed(), Assignment.get()
  ]);
  const lessons = await PSTasks.lessonTable(seed);
  return { library, all, classes, students, plan, lessons, assignment, planIdx: PSTasks.planIndex(plan) };
}

function taskMembers(ctx, classId) {
  return ctx.students.filter((s) => s.classId === classId && PSClasses.isConfirmed(s));
}

async function renderTasks() {
  const ctx = await taskContext();
  if (!taskUi.lang) taskUi.lang = taskSchoolLang();
  if (!ctx.classes.some((c) => c.id === taskUi.classId)) taskUi.classId = ctx.classes.length ? ctx.classes[0].id : null;
  const cls = ctx.classes.find((c) => c.id === taskUi.classId) || null;

  const sel = $('#task-class');
  sel.innerHTML = ctx.classes.length
    ? ctx.classes.map((c) => `<option value="${esc(c.id)}" ${c.id === taskUi.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    : `<option value="">${esc(T('ps.task.no_classes'))}</option>`;
  sel.disabled = !ctx.classes.length;
  sel.onchange = () => { taskUi.classId = sel.value; renderTasks(); };
  $('#task-auto').disabled = !cls;
  $('#export-task-slips').disabled = !cls;
  $('#task-auto').onclick = () => taskAutoFill(ctx, cls);
  $('#export-task-slips').onclick = () => taskPrintSlips(ctx, cls);

  const lang = taskSchoolLang();
  $('#task-list').innerHTML = ctx.library.map((t) => {
    const txt = PSTasks.text(t, lang);
    return `<li><button type="button" class="ps-task-li${t.no === taskUi.no ? ' ps-task-li--on' : ''}" data-no="${t.no}" data-ro-allow aria-current="${t.no === taskUi.no}">
      <b>${t.no}</b><span>${esc(txt.title || T('ps.task.untitled'))}</span>${t.lesson ? `<small>${esc(T('ps.task.lesson_n', { n: t.lesson }))}</small>` : ''}</button></li>`;
  }).join('');
  $all('.ps-task-li').forEach((b) => { b.onclick = () => { taskUi.no = Number(b.dataset.no); renderTasks(); }; });

  renderTaskEditor(ctx);
  renderTaskDistribution(ctx, cls);
  renderTaskPlan(ctx);
  applyReadOnly('tasks');
}

function renderTaskEditor(ctx) {
  const t = ctx.library.find((x) => x.no === taskUi.no) || ctx.library[0];
  const lang = taskUi.lang;
  const own = (t.texts || {})[lang] || {};
  const langs = Students.LANGUAGE_PRESETS.slice();
  if (!langs.includes(lang)) langs.push(lang);
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  $('#task-edit').innerHTML = `
    <h3>${esc(T('ps.task.edit_title', { n: t.no }))}</h3>
    <label><span>${esc(T('ps.task.text_lang'))}</span><select id="te-lang" data-ro-allow>${langs.map((c) => opt(c, Students.languageName(c), lang)).join('')}</select></label>
    <label><span>${esc(T('ps.task.f.title'))}</span><input type="text" id="te-title" value="${esc(own.title || '')}"></label>
    <label><span>${esc(T('ps.task.f.situation'))}</span><textarea id="te-situation" rows="3">${esc(own.situation || '')}</textarea></label>
    <label><span>${esc(T('ps.task.f.description'))}</span><textarea id="te-description" rows="5">${esc(own.description || '')}</textarea></label>
    <div class="ps-task-row">
      <label><span>${esc(T('ps.task.f.lesson'))}</span><select id="te-lesson">${opt('', '—', t.lesson || '')}${Array.from({ length: PSTasks.LESSONS }, (_, i) => opt(i + 1, String(i + 1), t.lesson)).join('')}</select></label>
      <label><span>${esc(T('ps.task.f.participants'))}</span><select id="te-count">${[2, 3, 4].map((n) => opt(n, String(n), t.participants)).join('')}</select></label>
    </div>
    <label><span>${esc(T('ps.task.f.rule'))}</span><select id="te-rule">${PSTasks.RULES.map((r) => opt(r, T('ps.task.rule.' + r), t.rule)).join('')}</select></label>
    <p class="hint">${esc(T('ps.task.shared_hint'))}</p>`;
  $('#te-lang').onchange = (e) => { taskUi.lang = e.target.value; renderTasks(); };
  const save = async () => {
    const texts = { ...(t.texts || {}) };
    texts[lang] = { title: $('#te-title').value.trim(), situation: $('#te-situation').value.trim(), description: $('#te-description').value.trim() };
    await PSTasks.saveTask({ ...t, texts, lesson: Number($('#te-lesson').value) || null, participants: Number($('#te-count').value), rule: $('#te-rule').value });
    renderTasks();
  };
  ['#te-title', '#te-situation', '#te-description', '#te-lesson', '#te-count', '#te-rule'].forEach((id) => { $(id).onchange = save; });
}

function renderTaskDistribution(ctx, cls) {
  const box = $('#task-dist');
  $('#task-dist-title').textContent = cls ? T('ps.task.dist_title', { name: cls.name }) : T('ps.task.dist');
  if (!cls) { box.innerHTML = `<p class="hint">${esc(T('ps.task.no_classes_hint'))}</p>`; return; }
  const members = taskMembers(ctx, cls.id);
  const byId = new Map(members.map((s) => [s.id, s]));
  const allById = new Map(ctx.students.map((s) => [s.id, s]));
  const lang = taskSchoolLang();
  const dayOpt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;

  box.innerHTML = ctx.library.map((t) => {
    const slot = PSTasks.slot(ctx.all, cls.id, t.no);
    const res = PSTasks.resolve(t, slot, ctx.planIdx, ctx.lessons);
    const auto = PSTasks.resolve(t, { people: [], teacher: null, day: null }, ctx.planIdx, ctx.lessons);
    const probs = PSTasks.problems(t, slot, byId);
    const names = slot.people.map((id) => allById.get(id)).filter(Boolean).map((s) => Students.fullName(s));
    const txt = PSTasks.text(t, lang);
    const chips = probs.length
      ? probs.map((p) => `<span class="ps-chip ps-chip--warn">${esc(T('ps.task.prob.' + p))}</span>`).join('')
      : `<span class="ps-chip ps-chip--ok">✓</span>`;
    const when = [res.day ? T('ps.task.day_n', { n: res.day }) : '', res.teacher ? taskTeacherName(cls, res.teacher, ctx.assignment) || taskTeacherLabel(res.teacher) : ''].filter(Boolean).join(' · ');
    const pickers = Array.from({ length: t.participants }, (_, i) => {
      const cur = slot.people[i] || '';
      const opts = [`<option value="">—</option>`].concat(members.map((s) => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc(Students.fullName(s))}</option>`));
      if (cur && !byId.has(cur)) opts.push(`<option value="${esc(cur)}" selected>${esc(allById.has(cur) ? Students.fullName(allById.get(cur)) : '?')}</option>`);
      return `<label><span>${esc(T(i === 0 ? 'ps.task.role.main' : 'ps.task.role.helper'))}</span><select class="td-person" data-no="${t.no}" data-i="${i}">${opts.join('')}</select></label>`;
    }).join('');
    return `<details class="ps-task-slot">
      <summary><b>${esc(T('ps.task.short', { n: t.no }))}</b> <span>${esc(names.join(' + ') || '—')}</span>
        <span class="ps-task-slot__meta">${esc(when)}</span> ${chips}</summary>
      ${txt.title ? `<p class="hint">${esc(txt.title)}${txt.fallback ? ' · ' + esc(T('ps.task.fallback', { lang: Students.languageName(txt.lang) })) : ''}</p>` : `<p class="hint">${esc(T('ps.task.no_text'))}</p>`}
      <p class="hint">${esc(T('ps.task.rule_label', { rule: T('ps.task.rule.' + t.rule) }))}</p>
      <div class="ps-task-row">${pickers}</div>
      <div class="ps-task-row">
        <label><span>${esc(T('ps.task.f.day'))}</span><select class="td-day" data-no="${t.no}">
          ${dayOpt('', T('ps.task.auto_value', { v: auto.day ? T('ps.task.day_n', { n: auto.day }) : '—' }), slot.day || '')}
          ${Array.from({ length: PSTasks.DAYS }, (_, i) => dayOpt(i + 1, T('ps.task.day_n', { n: i + 1 }), slot.day)).join('')}</select></label>
        <label><span>${esc(T('ps.task.f.teacher'))}</span><select class="td-teacher" data-no="${t.no}">
          ${dayOpt('', T('ps.task.auto_value', { v: auto.teacher ? taskTeacherLabel(auto.teacher) : '—' }), slot.teacher || '')}
          ${PSTasks.TEACHERS.map((l) => dayOpt(l, taskTeacherLabel(l) + (taskTeacherName(cls, l, ctx.assignment) ? ' · ' + taskTeacherName(cls, l, ctx.assignment) : ''), slot.teacher)).join('')}</select></label>
      </div>
    </details>`;
  }).join('');

  const update = async (no, fn) => {
    const all = await PSTasks.assignments();
    const slot = PSTasks.slot(all, cls.id, no);
    fn(slot);
    await PSTasks.saveAssignments(PSTasks.setSlot(all, cls.id, no, slot));
    renderTasks();
  };
  $all('.td-person', box).forEach((s) => {
    s.onchange = () => update(Number(s.dataset.no), (slot) => {
      const i = Number(s.dataset.i);
      const people = slot.people.slice();
      while (people.length <= i) people.push('');
      const prev = people.indexOf(s.value);
      if (s.value && prev >= 0 && prev !== i) people[prev] = people[i];
      people[i] = s.value;
      slot.people = people.filter(Boolean);
    });
  });
  $all('.td-day', box).forEach((s) => { s.onchange = () => update(Number(s.dataset.no), (slot) => { slot.day = Number(s.value) || null; }); });
  $all('.td-teacher', box).forEach((s) => { s.onchange = () => update(Number(s.dataset.no), (slot) => { slot.teacher = s.value || null; }); });
}

async function taskAutoFill(ctx, cls) {
  if (!cls) return;
  const members = taskMembers(ctx, cls.id);
  const all = await PSTasks.assignments();
  const { slots, filled } = PSTasks.propose(ctx.library, all[cls.id] || {}, members);
  await PSTasks.saveAssignments({ ...all, [cls.id]: slots });
  await renderTasks();
  taskStatus(T('ps.task.auto_done', { n: filled }));
}

function taskPrintSlips(ctx, cls) {
  if (!cls) return;
  const lang = taskSchoolLang();
  const docLang = PSDocLang.LANGS.includes(lang) ? lang : PSDocLang.get();
  const L = (k, v) => (typeof CWI18n !== 'undefined' ? CWI18n.t(k, v, docLang) : k);
  const byId = new Map(ctx.students.map((s) => [s.id, s]));
  const date = (iso) => { try { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString(PSDocLang.LOCALES[docLang] || 'ru-RU') : ''; } catch (e) { return iso; } };
  const slips = ctx.library.map((t) => {
    const slot = PSTasks.slot(ctx.all, cls.id, t.no);
    if (!slot.people.length) return '';
    const res = PSTasks.resolve(t, slot, ctx.planIdx, ctx.lessons);
    const txt = PSTasks.text(t, lang);
    const people = slot.people.map((id) => byId.get(id)).filter(Boolean).map((s) => esc(Students.fullName(s)));
    const when = [t.lesson ? L('doc.ps.task.lesson', { n: t.lesson }) : '', res.day ? L('doc.ps.task.day', { n: res.day }) : '', res.date ? date(res.date) : ''].filter(Boolean).join(' · ');
    const teacher = taskTeacherName(cls, res.teacher, ctx.assignment);
    return `<section class="slip">
      <h2>${esc(L('doc.ps.task.head', { n: t.no }))}${txt.title ? ' · ' + esc(txt.title) : ''}</h2>
      <p class="ln"><b>${esc(L('doc.ps.task.people'))}:</b> ${people.join(', ')}</p>
      ${when ? `<p class="ln">${esc(when)}</p>` : ''}
      ${teacher ? `<p class="ln"><b>${esc(L('doc.ps.task.teacher'))}:</b> ${esc(teacher)}</p>` : ''}
      ${txt.situation ? `<p><b>${esc(L('doc.ps.task.situation'))}:</b> ${esc(txt.situation)}</p>` : ''}
      ${txt.description ? `<p class="pre">${esc(txt.description)}</p>` : ''}
    </section>`;
  }).filter(Boolean);
  if (!slips.length) return alert(T('ps.task.print_empty'));
  CWPrint.document({
    title: L('doc.ps.task.title') + ' · ' + cls.name,
    lang: docLang,
    css: '.slip{border:1px solid #999;border-radius:6px;padding:10pt 12pt;margin:0 0 10pt;break-inside:avoid}'
      + '.slip h2{font-size:12pt;margin:0 0 6pt}.slip p{margin:0 0 4pt}.slip .ln{border-bottom:1px solid #ccc;padding-bottom:3pt}.pre{white-space:pre-wrap}',
    html: slips.join(''),
    onBlocked: () => alert(T('ps.docs.print_blocked')),
  });
}

function renderTaskPlan(ctx) {
  const table = $('#task-plan');
  const head = `<thead><tr><th></th>${ctx.plan.days.map((d, i) => `<th>${esc(T('ps.task.day_n', { n: i + 1 }))}</th>`).join('')}</tr></thead>`;
  const row = (label, cells) => `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
  const dates = row(T('ps.task.plan_date'), ctx.plan.days.map((d, i) => `<td><input type="date" class="tp-date" data-i="${i}" value="${esc(d.date)}" aria-label="${esc(T('ps.task.plan_date') + ' ' + (i + 1))}"></td>`).join(''));
  const teacherRow = (l) => row(taskTeacherLabel(l), ctx.plan.days.map((d, i) => `<td><input type="text" class="tp-lessons" inputmode="numeric" data-i="${i}" data-t="${l}" value="${esc(d[l].join(', '))}" placeholder="${esc(T('ps.task.plan_ph'))}" aria-label="${esc(taskTeacherLabel(l) + ' · ' + T('ps.task.day_n', { n: i + 1 }))}"></td>`).join(''));
  table.innerHTML = head + `<tbody>${dates}${teacherRow('A')}${teacherRow('Б')}</tbody>`;
  const save = async (fn) => { const plan = await PSTasks.plan(); fn(plan); await PSTasks.savePlan(plan); renderTasks(); };
  $all('.tp-date', table).forEach((inp) => { inp.onchange = () => save((p) => { p.days[Number(inp.dataset.i)].date = inp.value; }); });
  $all('.tp-lessons', table).forEach((inp) => { inp.onchange = () => save((p) => { p.days[Number(inp.dataset.i)][inp.dataset.t] = PSTasks.parseLessons(inp.value); }); });
  $('#task-plan-template').onclick = async () => {
    await PSTasks.saveTemplate(await PSTasks.plan());
    taskStatus(T('ps.task.plan_tpl_saved'));
  };
}

async function renderLessonTable() {
  const seed = await loadLessonsSeed();
  const lessons = await PSTasks.lessonTable(seed);
  const opt = (v, label, cur) => `<option value="${v}" ${String(v) === String(cur || '') ? 'selected' : ''}>${esc(label)}</option>`;
  const table = $('#lesson-table');
  table.innerHTML = `<thead><tr><th>${esc(T('ps.task.f.lesson'))}</th><th>${esc(T('ps.task.f.day'))}</th><th>${esc(T('ps.task.f.teacher'))}</th></tr></thead><tbody>${
    Object.keys(lessons).map((n) => `<tr><th scope="row">${esc(n)}</th>
      <td><select class="lt-day" data-n="${n}" aria-label="${esc(T('ps.task.f.day') + ' · ' + n)}">${opt('', '—', lessons[n].day)}${Array.from({ length: PSTasks.DAYS }, (_, i) => opt(i + 1, String(i + 1), lessons[n].day)).join('')}</select></td>
      <td><select class="lt-teacher" data-n="${n}" aria-label="${esc(T('ps.task.f.teacher') + ' · ' + n)}">${opt('', '—', lessons[n].teacher)}${PSTasks.TEACHERS.map((l) => opt(l, taskTeacherLabel(l), lessons[n].teacher)).join('')}</select></td></tr>`).join('')
  }</tbody>`;
  const save = async (n) => {
    await PSTasks.setLesson(n, { day: Number($(`.lt-day[data-n="${n}"]`).value) || null, teacher: $(`.lt-teacher[data-n="${n}"]`).value || null });
  };
  $all('.lt-day, .lt-teacher', table).forEach((s) => { s.onchange = () => save(s.dataset.n); });
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

  await renderLessonTable();
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
    if (!(await PSPdf.ensure('pdf'))) return;
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
      renderSchoolSwitch();
      showRoute('dashboard');
    } catch (err) {
      alert(T('ps.app.backup_read_failed', { error: err.message }));
    }
  };
}

// ---------- ШКОЛЫ (Ф1) ----------
// Переключатель в шапке, окно «Школы», баннер и режим «только чтение».
// Правила — js/modules/schools.js, хранение — js/db.js.

// Экраны, которые в завершённой школе остаются живыми: копия всей базы и
// архив выданных документов к данным школы не относятся.
const RO_EXEMPT_ROUTES = ['backup', 'docsarchive'];
// Кнопки и поля, которые только читают: документы, печать, выгрузка.
const RO_ALLOW = '[id^="export-"], #assignment-doc-btn, #assignment-doc-menu button, #generate-interactive-pdf-btn, '
  + '#download-reg-blank-pdf, #open-export-picker-btn, #doc-language, .row-card, .row-doc, .row-formulaire, [data-ro-allow]';

function applyReadOnly(route) {
  const ro = DB.isReadOnly();
  document.body.classList.toggle('ps-readonly', ro);
  const section = document.getElementById('route-' + route);
  if (!section) return;
  const lock = ro && !RO_EXEMPT_ROUTES.includes(route);
  section.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (lock && !el.matches(RO_ALLOW)) {
      if (!el.disabled) { el.disabled = true; el.dataset.roLocked = '1'; }
    } else if (el.dataset.roLocked) {
      el.disabled = false;
      delete el.dataset.roLocked;
    }
  });
}

function schoolLanguageOptions(selected) {
  const codes = Students.LANGUAGE_PRESETS.slice();
  if (selected && !codes.includes(selected)) codes.push(selected);
  return codes.map((code) => `<option value="${esc(code)}" ${code === selected ? 'selected' : ''}>${esc(Students.languageName(code))}</option>`).join('');
}

function renderSchoolSwitch() {
  const select = document.getElementById('ps-school-select');
  if (!select) return;
  const current = Schools.current();
  select.innerHTML = Schools.list().slice().reverse()
    .map((school) => `<option value="${esc(school.id)}" ${current && school.id === current.id ? 'selected' : ''}>${esc(Schools.fullLabel(school))}</option>`)
    .join('');
  const banner = document.getElementById('ps-school-banner');
  if (banner) {
    const ro = current && current.completed;
    banner.hidden = !ro;
    banner.textContent = ro ? T('ps.school.banner_readonly', { school: Schools.label(current) }) : '';
  }
  document.body.classList.toggle('ps-readonly', !!(current && current.completed));
}

function rerenderCurrentRoute() {
  renderSchoolSwitch();
  const current = $all('.route').find((el) => !el.classList.contains('hidden'));
  showRoute(current ? current.id.replace('route-', '') : DEFAULT_ROUTE);
}

async function switchSchool(schoolId) {
  await Schools.switchTo(schoolId);
  closeModal();
  rerenderCurrentRoute();
}

function openSchoolsModal() {
  const list = Schools.list();
  const current = Schools.current();
  const open = Schools.openSchool();
  const rows = list.slice().reverse().map((school) => {
    const isCurrent = current && school.id === current.id;
    const actions = [];
    if (!isCurrent) actions.push(`<button type="button" class="md-btn md-btn-text" data-school-open="${esc(school.id)}">${T('ps.school.open')}</button>`);
    if (!school.completed) actions.push(`<button type="button" class="md-btn md-btn-outlined" data-school-complete="${esc(school.id)}">${T('ps.school.complete')}</button>`);
    if (Schools.canReopen(school)) actions.push(`<button type="button" class="md-btn md-btn-text" data-school-reopen="${esc(school.id)}">${T('ps.school.reopen')}</button>`);
    const lang = school.completed
      ? `<span class="hint">${esc(T('ps.school.language'))}: ${esc(Students.languageName(school.language))}</span>`
      : `<label class="ps-school-lang">${esc(T('ps.school.language'))} <select data-school-lang="${esc(school.id)}">${schoolLanguageOptions(school.language)}</select></label>`;
    return `<div class="ps-school-row${isCurrent ? ' is-current' : ''}">
      <div class="ps-school-row__main">
        <b>${esc(Schools.label(school))} · ${esc(school.year)}</b>
        <span class="ps-status ${school.completed ? 'ps-status--attended' : 'ps-status--willCome'}">${esc(Schools.stateLabel(school))}</span>
        ${isCurrent ? `<span class="hint">${esc(T('ps.school.current'))}</span>` : ''}
      </div>
      <div class="ps-school-row__side">${lang}<span class="btn-row">${actions.join('')}</span></div>
    </div>`;
  }).join('');

  const createBlock = open
    ? `<p class="hint">${esc(T('ps.school.create_blocked', { school: Schools.label(open) }))}</p>`
    : `<div class="inline-form">
        <label>${esc(T('ps.school.new_language'))} <select id="ps-new-school-lang">${schoolLanguageOptions((current && current.language) || 'ru')}</select></label>
        <input type="text" id="ps-new-school-lang-other" placeholder="${esc(T('ps.school.language_other_ph'))}" aria-label="${esc(T('ps.school.language_other_ph'))}">
        <button type="button" class="md-btn md-btn-filled" id="ps-new-school-btn">${T('ps.school.create')}</button>
      </div>`;

  openModal(`
    <h2>${T('ps.school.title')}</h2>
    <p class="hint">${T('ps.school.hint')}</p>
    <div class="ps-school-list">${rows}</div>
    <h3>${T('ps.school.new')}</h3>
    ${createBlock}
    <div class="modal-close-row"><button type="button" class="md-btn md-btn-outlined" id="ps-schools-close">${T('ps.app.zakryt')}</button></div>
  `);

  const box = $('#active-modal');
  $('#ps-schools-close').onclick = closeModal;
  $all('[data-school-open]', box).forEach((btn) => { btn.onclick = () => switchSchool(btn.dataset.schoolOpen); });
  $all('[data-school-complete]', box).forEach((btn) => {
    btn.onclick = async () => {
      const school = list.find((x) => x.id === btn.dataset.schoolComplete);
      if (!confirm(T('ps.school.complete_confirm', { school: Schools.label(school) }))) return;
      await Schools.complete(school.id);
      openSchoolsModal();
      rerenderCurrentRoute();
    };
  });
  $all('[data-school-reopen]', box).forEach((btn) => {
    btn.onclick = async () => {
      const school = list.find((x) => x.id === btn.dataset.schoolReopen);
      if (!confirm(T('ps.school.reopen_confirm', { school: Schools.label(school) }))) return;
      try { await Schools.reopen(school.id); } catch (e) { return alert(e.message); }
      openSchoolsModal();
      rerenderCurrentRoute();
    };
  });
  $all('[data-school-lang]', box).forEach((sel) => {
    sel.onchange = async () => {
      try { await Schools.setLanguage(sel.dataset.schoolLang, sel.value); } catch (e) { return alert(e.message); }
      renderSchoolSwitch();
    };
  });
  const createBtn = $('#ps-new-school-btn');
  if (createBtn) {
    createBtn.onclick = async () => {
      const other = $('#ps-new-school-lang-other').value.trim();
      const language = other || $('#ps-new-school-lang').value;
      try {
        const school = await Schools.create({ language });
        await switchSchool(school.id);
      } catch (e) { alert(e.message); }
    };
  }
}

async function initSchools() {
  await DB.ready();
  if (typeof CWDirectory !== 'undefined') {
    // Справочник собраний — общий слой; без него карточка честно работает
    // с названием текстом (CWDirectory.ready остаётся false).
    Promise.resolve(CWDirectory.init()).catch((error) => console.warn('pioneer-school: справочник собраний недоступен', error));
  }
  renderSchoolSwitch();
  const select = document.getElementById('ps-school-select');
  if (select) select.onchange = () => switchSchool(select.value);
  const manage = document.getElementById('ps-school-manage');
  if (manage) manage.onclick = openSchoolsModal;
}

// ---------- КАРТОЧКА ПИОНЕРА (Ф1; Ф4 — путь и история) ----------

// Текст строки истории: ключ ps.hist.<kind>, подписи статусов и происхождения.
function historyText(item) {
  const p = item.params || {};
  const params = {
    ...p,
    origin: Students.originLabel(p.origin),
    from: Students.statusLabel(p.from),
    to: Students.statusLabel(p.to),
    answer: Students.statusLabel(p.answer),
    deadline: p.deadline ? psDate(p.deadline) : ''
  };
  const text = T('ps.hist.' + item.kind, params);
  return item.kind === 'status' && p.reason ? `${text}: ${p.reason}` : text;
}

function pioneerPathHtml(steps) {
  return `<ol class="ps-path" aria-label="${esc(T('ps.path.title'))}">${steps.map((st, i) => {
    const note = st.key === 'answered' && st.note ? Students.statusLabel(st.note) : st.note;
    const sub = [st.at ? psDate(st.at) : '', note].filter(Boolean).join(' · ') || (st.state === 'skip' ? '—' : '');
    return `<li class="ps-path__step ps-path__step--${st.state}" ${st.state === 'current' ? 'aria-current="step"' : ''}>
      <span class="ps-ov-dot ps-ov-dot--${st.state}" aria-hidden="true">${st.state === 'done' ? '✓' : (st.state === 'bad' ? '✕' : i + 1)}</span>
      <span class="ps-path__label">${esc(T('ps.path.' + st.key))}</span>
      ${sub ? `<span class="ps-path__sub">${esc(sub)}</span>` : ''}
      <span class="sr-only">${esc(T('ps.stage.state.' + (st.state === 'bad' ? 'todo' : st.state === 'skip' ? 'later' : st.state)))}</span>
    </li>`;
  }).join('')}</ol>`;
}

function pioneerHistoryHtml(items) {
  if (!items.length) return `<p class="hint">${esc(T('ps.hist.empty'))}</p>`;
  return `<ul class="ps-history">${items.map((it) => `
    <li><b>${esc(psDate(it.at))}</b><span>${esc(historyText(it))}</span></li>`).join('')}</ul>`;
}

async function openPioneerCard(studentId) {
  const [students, classes, dispatchState, config, registrations] = await Promise.all([
    Students.list(), DB.list('classes'), Dispatch.getState(), Registration.getConfig(), Registration.list()
  ]);
  const student = students.find((s) => s.id === studentId);
  if (!student) return;
  const groupKey = Dispatch.keyOf(student);
  const dirRec = student.congregationId && typeof CWDirectory !== 'undefined' && CWDirectory.ready ? CWDirectory.get(student.congregationId) : null;
  const historyCtx = {
    classes, dispatchState, registrations, groupKey,
    groupName: (dirRec && dirRec.name) || String(student.values.congregation || '').trim(),
    deadline: ((dispatchState[groupKey] || {}).deadline) || config.deadline || ''
  };
  const school = Schools.current();
  const ro = DB.isReadOnly();
  const others = students.filter((s) => s.id !== studentId);
  const nameOf = (id) => { const o = students.find((s) => s.id === id); return o ? Students.fullName(o) : '—'; };
  const cls = classes.find((c) => c.id === student.classId);
  const directory = (typeof CWDirectory !== 'undefined' && CWDirectory.ready) ? CWDirectory.all() : [];
  const suggested = !student.congregationId && student.values.congregation && directory.length
    ? CWDirectory.byName(student.values.congregation) : null;
  const congId = student.congregationId || (suggested ? suggested.id : '');
  let relations = (student.relations || []).map((r) => ({ ...r }));

  const presets = Students.LANGUAGE_PRESETS.slice();
  if (school && school.language && !presets.includes(school.language)) presets.push(school.language);
  const langs = student.textbookLanguages || [];
  const otherLangs = langs.filter((l) => !presets.includes(l));
  const optionList = (values, fn, selected) => values.map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(fn.call(Students, v))}</option>`).join('');
  const directoryOptions = `<option value="">${esc(T('ps.pioneer.cong_none'))}</option>` + directory
    .slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
    .map((c) => `<option value="${esc(c.id)}" ${c.id === congId ? 'selected' : ''}>${esc(c.name)}${c.congNumber ? ' · ' + esc(c.congNumber) : ''}</option>`).join('');
  const open = Schools.openSchool();
  const canReinvite = ro && open && open.id !== (school && school.id) && student.status !== 'attended';

  openModal(`
    <h2>${esc(Students.fullName(student))}</h2>
    <div class="ps-card-chips">
      ${student.gender ? `<span class="ps-chip">${esc(Students.genderLabel(student.gender))}</span>` : ''}
      ${student.values.congregation ? `<span class="ps-chip">${esc(student.values.congregation)}</span>` : ''}
      ${cls ? `<span class="ps-chip">${esc(cls.name)}</span>` : ''}
      <span class="ps-status ps-status--${esc(student.status)}">${esc(Students.statusLabel(student.status))}</span>
    </div>
    ${(student.previousInvites || []).map((p) => `<p class="ps-prev-invite">${esc(Students.previousInviteText(p))}</p>`).join('')}
    <h3>${T('ps.path.title')}</h3>
    ${pioneerPathHtml(PioneerHistory.path(student, historyCtx))}
    <fieldset class="ps-card" ${ro ? 'disabled' : ''}>
      <div class="form-grid">
        <label>${T('ps.pioneer.f.origin')}<select id="pc-origin">${optionList(Students.ORIGINS, Students.originLabel, student.origin)}</select></label>
        <label>${T('ps.pioneer.f.status')}<select id="pc-status">${optionList(Students.STATUSES, Students.statusLabel, student.status)}</select></label>
        <label id="pc-reason-wrap">${T('ps.pioneer.f.reason')} *<input type="text" id="pc-reason" value="${esc(student.statusReason || '')}"></label>
        <div class="ps-radio-row" role="radiogroup" aria-label="${esc(T('ps.pioneer.f.gender'))}">
          <span>${T('ps.pioneer.f.gender')}</span>
          ${Students.GENDERS.map((g) => `<label class="ps-inline"><input type="radio" name="pc-gender" value="${g}" ${student.gender === g ? 'checked' : ''}> ${esc(Students.genderLabel(g))}</label>`).join('')}
        </div>
        <label>${T('ps.pioneer.f.congregation_dir')}<select id="pc-cong-id" ${directory.length ? '' : 'disabled'}>${directoryOptions}</select></label>
        <label>${T('ps.pioneer.f.congregation_name')}<input type="text" id="pc-cong-name" value="${esc(student.values.congregation || '')}"></label>
      </div>
      ${directory.length ? '' : `<p class="hint">${esc(T('ps.pioneer.cong_dir_empty'))}</p>`}
      ${suggested ? `<p class="hint">${esc(T('ps.pioneer.cong_suggested', { name: suggested.name }))}</p>` : ''}
      <div class="ps-card-langs" role="group" aria-labelledby="pc-langs-title">
        <span id="pc-langs-title">${T('ps.pioneer.f.languages')} *</span>
        ${presets.map((code) => `<label class="ps-inline"><input type="checkbox" class="pc-lang" value="${esc(code)}" ${langs.includes(code) ? 'checked' : ''}> ${esc(Students.languageName(code))}</label>`).join('')}
        <input type="text" id="pc-lang-other" value="${esc(otherLangs.join(', '))}" placeholder="${esc(T('ps.pioneer.lang_other_ph'))}" aria-label="${esc(T('ps.pioneer.lang_other_ph'))}">
      </div>
      <h3>${T('ps.pioneer.f.relations')}</h3>
      <div id="pc-relations"></div>
      <div class="inline-form" id="pc-rel-add" ${others.length ? '' : 'hidden'}>
        <select id="pc-rel-type" aria-label="${esc(T('ps.pioneer.f.relation_type'))}">${optionList(Students.RELATION_TYPES, Students.relationLabel, 'spouse')}</select>
        <select id="pc-rel-who" aria-label="${esc(T('ps.pioneer.f.relation_who'))}"></select>
        <button type="button" class="md-btn md-btn-outlined" id="pc-rel-add-btn">${T('ps.pioneer.rel_add')}</button>
      </div>
      <p class="hint">${T('ps.pioneer.rel_hint')}</p>
    </fieldset>
    <h3>${T('ps.hist.title')}</h3>
    ${pioneerHistoryHtml(PioneerHistory.timeline(student, historyCtx))}
    <p class="ps-error" id="pc-error" role="alert"></p>
    <div class="modal-close-row">
      ${canReinvite ? `<button type="button" class="md-btn md-btn-tonal" id="pc-reinvite">${T('ps.pioneer.reinvite', { school: Schools.label(open) })}</button>` : ''}
      <button type="button" class="md-btn md-btn-outlined" id="pc-close">${T('ps.app.zakryt')}</button>
      ${ro ? '' : `<button type="button" class="md-btn md-btn-filled" id="pc-save">${T('ps.pioneer.save')}</button>`}
    </div>
  `);

  const syncReason = () => {
    $('#pc-reason-wrap').hidden = !Students.REASON_REQUIRED.includes($('#pc-status').value);
  };
  const syncCong = () => {
    const sel = $('#pc-cong-id');
    const rec = sel.value ? directory.find((c) => c.id === sel.value) : null;
    const input = $('#pc-cong-name');
    if (rec) input.value = rec.name;
    input.readOnly = !!rec;
  };
  const renderRelations = () => {
    $('#pc-relations').innerHTML = relations.length
      ? relations.map((r, i) => `<div class="list-row"><span>${esc(Students.relationLabel(r.type))}: ${esc(nameOf(r.studentId))}</span>${ro ? '' : `<button type="button" class="md-btn md-btn-text" data-rel-remove="${i}">${T('ps.app.udalit')}</button>`}</div>`).join('')
      : `<p class="hint">${T('ps.pioneer.rel_none')}</p>`;
    $all('[data-rel-remove]', $('#pc-relations')).forEach((btn) => {
      btn.onclick = () => { relations.splice(+btn.dataset.relRemove, 1); renderRelations(); };
    });
    const free = others.filter((o) => !relations.some((r) => r.studentId === o.id));
    $('#pc-rel-who').innerHTML = free.map((o) => `<option value="${esc(o.id)}">${esc(Students.fullName(o))}</option>`).join('');
    $('#pc-rel-add-btn').disabled = ro || !free.length;
  };

  syncReason();
  syncCong();
  renderRelations();
  $('#pc-status').onchange = syncReason;
  $('#pc-cong-id').onchange = syncCong;
  $('#pc-rel-add-btn').onclick = () => {
    const who = $('#pc-rel-who').value;
    if (!who) return;
    relations.push({ type: $('#pc-rel-type').value, studentId: who });
    renderRelations();
  };
  $('#pc-close').onclick = closeModal;

  const reinviteBtn = $('#pc-reinvite');
  if (reinviteBtn) {
    reinviteBtn.onclick = async () => {
      try {
        await Students.reinvite(school.id, studentId, open.id);
        $('#pc-error').textContent = '';
        alert(T('ps.pioneer.reinvited', { name: Students.fullName(student), school: Schools.label(open) }));
        closeModal();
      } catch (e) { $('#pc-error').textContent = e.message; }
    };
  }

  const saveBtn = $('#pc-save');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const checked = $all('.pc-lang').filter((cb) => cb.checked).map((cb) => cb.value);
      const typed = Students.parseLanguages($('#pc-lang-other').value);
      const genderEl = document.querySelector('input[name="pc-gender"]:checked');
      const patch = {
        origin: $('#pc-origin').value,
        status: $('#pc-status').value,
        statusReason: $('#pc-reason').value,
        gender: genderEl ? genderEl.value : '',
        congregationId: $('#pc-cong-id').value || null,
        textbookLanguages: [...checked, ...typed],
        relations,
        values: { congregation: $('#pc-cong-name').value.trim() }
      };
      try {
        await Students.saveCard(studentId, patch);
      } catch (e) {
        $('#pc-error').textContent = e.message;
        return;
      }
      closeModal();
      await refreshStudentsViews();
      renderDashboard();
    };
  }
}

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', () => {
  /* Фаза C1: sender сюда попадает транзитивно через shared/templates.js
     (подстановка шапки при генерации писем/S-257 и т.п.), собственного
     обращения к CWSender в этом модуле нет. Backend не менялся — реального
     ожидания здесь нет, точка нужна заранее для фазы C2. */
  /* ЗАЩИТА ОБНОВЛЕНИЯ: при смешанном поколении кэша сюда может попасть старый
     shared/sender.js без ready(). Он синхронный и уже готов — не падаем. */
  if (window.CWSender && typeof window.CWSender.ready === 'function') window.CWSender.ready();
  // Версия — в меню «⋮» (shared/nav.js); здесь — скрытое поле, как у всех модулей.
  $('#moduleVersion').textContent = `v${APP_VERSION}`;
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
    renderSchoolSwitch();
    const current = $all('.route').find((el) => !el.classList.contains('hidden'));
    if (current) showRoute(current.id.replace('route-', ''));
  });
  $all('.nav-item').forEach((btn) => btn.addEventListener('click', () => showRoute(btn.dataset.route)));
  document.getElementById('psGroupNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-group]');
    if (btn) { e.stopPropagation(); openGroupSheet(btn); }
  });
  document.getElementById('psGroupSheet')?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-route]');
    if (item) showRoute(item.dataset.route);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#psGroupSheet')) closeGroupSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGroupSheet(); });
  initBackup();

  // Ф1: попытка записи в завершённую школу (кнопка, которую не погасили) —
  // понятное сообщение вместо «кнопка ничего не сделала».
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.code === 'PS_READONLY') {
      event.preventDefault();
      alert(event.reason.message);
    }
  });

  // Регистрация SW и отслеживание обновлений — общий слой (shared/update.js).
  // Раньше модуль просто регистрировал worker и не следил за обновлениями
  // вовсе: пользователь мог неделями работать на старой оболочке.
  if (typeof CWUpdate !== 'undefined') CWUpdate.init({ swUrl: 'sw.js', ui: 'silent', hubHref: '../index.html' });

  // Реакция на смену #hash: раньше кнопки «Назад»/«Вперёд» в браузере меняли
  // адрес, но экран не переключался — приложение выглядело зависшим.
  window.addEventListener('hashchange', () => {
    const route = window.location.hash.slice(1) || DEFAULT_ROUTE;
    const current = $all('.route').find((el) => !el.classList.contains('hidden'));
    if (current && current.id === 'route-' + route) return;
    showRoute(route);
  });

  const initialRoute = (window.location.hash || '#' + DEFAULT_ROUTE).slice(1);
  // Школа поднимается ДО первого экрана: экраны читают данные выбранной школы.
  initSchools()
    .catch((error) => console.error('pioneer-school: школы', error))
    .then(() => showRoute(initialRoute || DEFAULT_ROUTE));
});
