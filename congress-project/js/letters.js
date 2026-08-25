// Auto-generated module: letters.js
import { $, $$ } from "./dom.js";
import { icon } from "./icons.js";
import { askOrientation } from "./printing.js";
import { renderTasks } from "./render.js";
import { A, S, docLang, linkedEntries, row, save, sender, store } from "./state.js";
import { clean, congressTheme, dt, esc, fmt, id, isLetterable, today } from "./utils.js";
import { t } from "./i18n.js";

/**
 * Системный текст письма. Раньше здесь лежали три копии украинского текста под
 * видом переводов на ru и de (по 1592 символа, байт-в-байт одинаковые) — теперь
 * это shared/templates/builtin.js, где ru и de пусты и честно ждут носителя
 * языка, а fallback отдаёт украинский.
 *
 * Обёртка оставлена, потому что на неё смотрят state.js и редактор шаблонов;
 * собственного текста в модуле больше нет.
 */
export const CONGRESS_CONTEXT="congress.assignment.invitation";
export const CONGRESS_TEMPLATE_ID="sys.congress.assignment.invitation";
export function builtinTemplate(lang){
  let list=self.CW_BUILTIN_TEMPLATES||[],b=list.find(x=>x.id===CONGRESS_TEMPLATE_ID);
  if(!b)return"";
  let tr=b.translations||{},want=tr[lang];
  if(want&&want.body)return want.body;
  let first=Object.keys(tr).map(k=>tr[k]).find(x=>x&&x.body);
  return first?first.body:"";
}
/**
 * Пространства имён, значения которых модуль реально передаёт в render().
 * Панель вставки переменных строится из общего реестра по этому списку —
 * второго перечня переменных внутри модуля больше нет (был массив PH).
 * Переменные чужих модулей (visit.*, student.*) сюда не входят: движок их
 * не подставит, и предлагать их в панели значило бы обманывать.
 */
export const NAMESPACES=["sender","congress","assignment","doc"];
/**
 * Подстановка через общий движок (shared/templates.js).
 * Если файл почему-то не доехал (устаревший кэш SW), шаблон возвращается как
 * есть: плейсхолдеры останутся видимыми в предпросмотре — это заметно сразу,
 * в отличие от письма с пустыми местами вместо дат.
 */
function fill(tpl,data){return self.CWTemplates?self.CWTemplates.render(tpl,data):String(tpl==null?"":tpl)}
/**
 * Значения для подстановки.
 *
 * ⚠️ УЧАСТНИК БЕРЁТСЯ ПЕРВЫЙ ИЗ СПИСКА. Список участников общий для всей связки
 * заданий серии (`LINK_SHARED_FIELDS` в state.js), а конгресс — тот, что открыт
 * сейчас. То есть письмо всегда про активный конгресс и про первого брата в
 * списке. Пока в модели нет связи «участник → конгресс», иначе и быть не может;
 * решение по этому — открытый вопрос, см. TODO.md.
 */
export function values(t,congress){let c=congress||A(),sd=sender(),p=(t.participants||[])[0]||{};return{sender:sd,congress:{name:congressTheme(c),theme:(c&&c.theme)||"",place:c.place||"",date:fmt(c.date),rehearsalDate:fmt(c.rehearsalDate),rehearsalTime:c.rehearsalTime||"",recordingDeadline:fmt(c.recordingDeadline),responseDeadline:fmt(c.responseDeadline)},assignment:{number:t.number,title:t.title,time:dt(t.time),type:t.kind||t.type||"",participant:p.name||"",congregation:p.congregation||"",recordingMedia:t.recordingMedia||"",recordingKind:t.recordingKind||"",notes:t.notes||""}}}
export function markup(s){return s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/__([^_]+)__/g,"<u>$1</u>").replace(/\*([^*]+)\*/g,"<em>$1</em>")}
export function renderPlain(text){let clean=esc(text).replace(/\r\n/g,"\n").replace(/\r/g,"\n");return clean.split(/\n\s*\n/g).map((b,i)=>{b=b.trim();if(!b)return"";return`<p${i===0?" class='letter-header'":""}>${markup(b.replace(/\n/g,"<br>"))}</p>`}).join("")}
/**
 * Какой текст письма использовать для задания.
 *
 * Порядок прежний: шаблон для конкретного типа задания важнее общего.
 * Изменился только источник — общее хранилище вместо настроек модуля.
 *
 * ⚠️ ОТКАТ НА ПРЕЖНИЙ ИСТОЧНИК — не перестраховка, а обязательная часть
 * миграции. Пока хранилище не прочитано (доля секунды после загрузки страницы)
 * или пока перенос не выполнен, читаем настройки модуля. Иначе пользователь в
 * этот момент получил бы системное письмо вместо своего и ничего бы не заметил.
 * Старые ключи живут ровно до подтверждённого переноса — см. adoptTemplates().
 */
export function pickTemplate(t){return pickTemplateInfo(t).body}
/**
 * То же решение, но с происхождением текста: какой шаблон выбран, на каком
 * языке он РЕАЛЬНО собран и когда правился.
 *
 * Язык нужен отдельно от запрошенного: при пустой колонке перевода
 * `CWTemplates.text()` отдаёт первый непустой, и записать в архив запрошенный
 * значило бы пометить украинское письмо как `ru`. На этом уже спотыкались в
 * Клиндарии (`docActualLang`).
 */
export function pickTemplateInfo(t){
  let s=S(),lang=docLang();
  if(self.CWTemplates&&self.CWTemplates.stored){
    if(t.type){let byType=self.CWTemplates.text(CONGRESS_CONTEXT+":"+t.type,lang);
      if(byType&&byType.body)return{body:byType.body,lang:byType.lang||lang,id:byType.id||CONGRESS_TEMPLATE_ID,context:CONGRESS_CONTEXT+":"+t.type,updatedAt:templateUpdatedAt(byType.id)}}
    let main=self.CWTemplates.text(CONGRESS_CONTEXT,lang);
    if(main&&main.body)return{body:main.body,lang:main.lang||lang,id:main.id||CONGRESS_TEMPLATE_ID,context:CONGRESS_CONTEXT,updatedAt:templateUpdatedAt(main.id)};
  }
  /* Хранилище ещё не прочитано или перенос не выполнен — прежний источник.
     Язык здесь только запрошенный: у настроек модуля колонок перевода нет. */
  let legacy=(s.templatesByType&&s.templatesByType[t.type])||(s.templates&&s.templates[lang])||builtinTemplate(lang);
  return{body:legacy,lang:lang,id:CONGRESS_TEMPLATE_ID,context:CONGRESS_CONTEXT,updatedAt:null}}
function templateUpdatedAt(id){let tpl=id&&self.CWTemplates&&self.CWTemplates.get?self.CWTemplates.get(id):null;return(tpl&&tpl.updatedAt)||null}
export function letterHTML(t,congress){let s=S(),tpl=fill(pickTemplate(t),values(t,congress));return`<article class="letter-page" style="font-family:${esc(s.font)};font-size:${(+s.fontSize||17)}px">${renderPlain(tpl)}</article>`}
/**
 * Цели письма: по одному пункту на каждый конгресс, где это задание есть.
 *
 * Связка (`linkId`) — это ОДНО задание, размноженное по конгрессам серии:
 * один и тот же брат выступает с ним на нескольких конгрессах. Письмо при этом
 * своё у каждого конгресса — там своя дата, своё место, свои сроки записи и
 * ответа, и отметка `letterSent` тоже локальная. Поэтому композер спрашивает
 * не «кому», а «про какой конгресс» (решение Алекса 15.08.2026).
 *
 * Задание в каждом конгрессе — СВОЙ объект со своим id: время площадки у них
 * может отличаться, и брать текст из копии активного конгресса нельзя.
 * Порядок — по дате конгресса: так же, как они идут в жизни.
 */
export function letterTargets(task){
  let own=A(),list=[{congress:own,task:task}];
  if(task.linkId)linkedEntries(task.linkId,task.id).forEach(e=>list.push(e));
  return list.sort((a,b)=>String(a.congress&&a.congress.date||"").localeCompare(String(b.congress&&b.congress.date||"")))}
/** Выбранная сейчас цель; по умолчанию — открытый конгресс. */
export function currentTarget(){
  let task=A().tasks.find(x=>x.id===store.previewId);
  if(!task)return null;
  let list=letterTargets(task);
  return list.find(x=>x.congress&&x.congress.id===store.previewCongressId)||list[0]}
export function openLetter(id){
  store.previewId=id;store.previewCongressId=(A()||{}).id;store.previewEdited=false;
  renderComposer();
  $("#letterDialog").showModal()}
/** Перерисовать композер целиком: выбор конгресса, письмо, состояние правки. */
export function renderComposer(){
  let task=A().tasks.find(x=>x.id===store.previewId);if(!task)return;
  let list=letterTargets(task),target=currentTarget();
  let box=$("#letterTargets");
  if(box){
    /* Один конгресс — выбирать не из чего, полоса не показывается: лишний
       элемент интерфейса там, где решения нет. */
    if(list.length<2){box.hidden=true;box.innerHTML=""}
    else{
      box.hidden=false;
      box.innerHTML=`<span class="letter-targets__label">${esc(t("cong.docs.for_congress"))}</span>`+list.map(x=>{
        let on=x.congress&&target&&x.congress.id===target.congress.id;
        return `<button type="button" class="letter-target" aria-pressed="${on?"true":"false"}" data-cong="${esc((x.congress||{}).id||"")}">${esc((x.congress||{}).name||"")}<span class="letter-target__date">${esc(fmt((x.congress||{}).date))}</span></button>`}).join("");
      $$("#letterTargets [data-cong]").forEach(b=>b.onclick=()=>selectTarget(b.dataset.cong));
    }
  }
  setComposerEdit(false);
  $("#letterPreview").innerHTML=target?letterHTML(target.task,target.congress):"";
  let flag=$("#composerEditedFlag");if(flag)flag.hidden=!store.previewEdited}
/** Смена конгресса. Разовая правка при этом теряется — поэтому спрашиваем. */
export function selectTarget(congressId){
  if(store.previewEdited&&!confirm(t("cong.docs.discard_edit")))return;
  store.previewCongressId=congressId;store.previewEdited=false;
  renderComposer()}
/**
 * Разовая правка — правка ЭТОГО экземпляра письма, не шаблона. Пометка
 * `edited` ставится в момент ВКЛЮЧЕНИЯ, а не по факту различий: знать, что
 * бумагу трогали руками, полезно, даже если текст вернули как был.
 * Тексты шаблонов правятся в модуле «Документы» — здесь этого нет намеренно.
 */
export function setComposerEdit(on){
  let box=$("#letterPreview"),btn=$("#composerEditBtn");if(!box)return;
  box.contentEditable=on?"true":"false";
  if(btn)btn.textContent=t(on?"cong.docs.edit_done":"cong.docs.edit_once");
  if(on){store.previewEdited=true;let flag=$("#composerEditedFlag");if(flag)flag.hidden=false;box.focus()}}
export function toggleComposerEdit(){setComposerEdit($("#letterPreview").contentEditable!=="true")}
export function copyComposerText(){
  let text=$("#letterPreview").innerText||"";
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>flashButton("#composerCopyBtn","cong.docs.copied","cong.docs.copy_text"));}
/** Короткая подтверждающая подпись на самой кнопке: тостов у модуля нет. */
function flashButton(sel,doneKey,backKey){
  let b=$(sel);if(!b)return;b.textContent=t(doneKey);setTimeout(()=>{b.textContent=t(backKey)},1800)}
export function saveComposerToArchive(){
  let target=currentTarget();if(!target)return;
  snapshotLetter(target.task,"manual",target.congress).then(()=>flashButton("#composerSaveBtn","cong.docs.saved","cong.docs.save_archive"))}
export function printFilename(title){let c=A(),base=(c?.name||"Конгресс").trim();return(base+(title?" — "+title:"")).replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ").trim()}
export function letterFileTitle(t){let n=String(t.number||"").trim();return n?"№"+n+" "+(t.title||""):(t.title||"")}
export function printLetter(){
  let target=currentTarget();if(!target)return;
  /* На бумагу уходит то, что на экране: при разовой правке — правленый текст,
     иначе печаталось бы одно, а в архив ложилось другое. */
  let html=store.previewEdited?$("#letterPreview").innerHTML:letterHTML(target.task,target.congress);
  snapshotLetter(target.task,"print",target.congress);
  askOrientation("Печать письма","portrait",html,printFilename(letterFileTitle(target.task)))}
export function allLetters(){let tasks=A().tasks.filter(isLetterable);snapshotLetters(tasks,"print");askOrientation("Печать всех писем","portrait",tasks.map(letterHTML).join(""),printFilename("Все письма"))}
/**
 * Список писем.
 *
 * ⚠️ ПЕРЕМЕННАЯ ЗАДАНИЯ ЗДЕСЬ — `task`, А НЕ `t`. Функция перевода
 * импортируется как `t`, и коллбэк с параметром `t` её затеняет: вызов
 * `t("cong.btn.open")` обращается к ОБЪЕКТУ задания и бросает
 * «t is not a function». Именно так этот диалог не открывался вовсе
 * с v4.19.0 до 14.08.2026 — молча, весь экран целиком.
 * Чинить переименованием переменной, а не псевдонимом для перевода:
 * псевдоним прячет ловушку, а не убирает её. Ловится
 * `node scripts/check-i18n-shadow.mjs`.
 */
export function openLettersMode(){let tasks=(A().tasks||[]).filter(isLetterable);$("#lettersList").innerHTML=tasks.map(task=>{let p=(task.participants||[])[0]||{};return`<div class="letter-row"><div><b>${esc(p.name||t("cong.msg.no_participant"))}</b><br><span class="muted">${esc(task.number||"")} ${esc(task.title||"")}</span></div><button type="button" data-open="${task.id}" class="icon-text-btn" title="${esc(t("cong.title.open_letter"))}">${icon("eye")}<span>${esc(t("cong.btn.open"))}</span></button><button type="button" data-sent="${task.id}" class="light icon-text-btn" title="${esc(t("cong.title.mark_sent"))}">${icon("check")}<span>${esc(t("cong.btn.sent"))}</span></button><span>${task.letterSent?"✓":""}</span></div>`}).join("");$$("[data-open]").forEach(b=>b.onclick=()=>openLetter(b.dataset.open));$$("[data-sent]").forEach(b=>b.onclick=()=>{let task=A().tasks.find(x=>x.id===b.dataset.sent);task.letterSent=true;task.letterSentDate=today();task.status="Письмо отправлено";save();renderTasks();openLettersMode()});$("#lettersDialog").showModal()}

/* ── Архив выданных документов (общий слой, shared/documents.js) ──────────────
 *
 * Снимок пишется только когда письмо ПОКИНУЛО приложение: печать одного письма
 * или печать всех. Предпросмотр — нет: это ещё не выданная бумага.
 *
 * Печать плана снимков НЕ делает и делать не должна — это выгрузка данных, а не
 * документ из шаблона (то же правило, что для печати календаря в Клиндарии).
 *
 * Тело сохраняется ПОДСТАВЛЕННЫМ и в исходном формате шаблона (`text` с
 * `**жирным**`), а не собранным HTML: архив хранит документ, а не вёрстку
 * предпросмотра. Правка шаблона потом не меняет того, что уже ушло.
 *
 * Отказ архива не мешает выдаче письма: `CWDocs.save()` глотает ошибку сам,
 * здесь дополнительно стоит `catch` — печать уже идёт, ронять её нельзя.
 */
function docsAvailable(){return !!(self.CWDocs&&self.CWDocs.available&&self.CWDocs.available())}
function docRef(task){return{module:"congress-project",entity:"task",id:(task&&task.id)||""}}
/** Подпись задания на момент выдачи — чтобы запись читалась и без сущности. */
function docEntityTitle(task,congress){let c=congress||A(),p=(task.participants||[])[0]||{};
  return[letterFileTitle(task),p.name||"",(c&&c.name)||""].filter(Boolean).join(" · ")}
export function snapshotLetter(task,reason,congress){
  if(!docsAvailable()||!task)return Promise.resolve(null);
  let info=pickTemplateInfo(task),c=congress||A();
  /* Правленый экземпляр сохраняется тем текстом, что видел человек: сравнивать
     его с шаблоном бессмысленно, а в архив должно лечь то, что ушло людям.
     Правка относится только к открытому сейчас письму — поэтому и проверка
     на совпадение задания. */
  /* Сравнение по САМОМУ объекту задания, а не по store.previewId: в связке у
     каждого конгресса своя копия задания со своим id, и письмо соседнего
     конгресса ушло бы в архив как неправленое (поймано живым прогоном). */
  let shown=currentTarget(),
      edited=store.previewEdited&&!!shown&&shown.task===task,
      body=edited?($("#letterPreview").innerText||"").trim():fill(info.body,values(task,c));
  return Promise.resolve(self.CWDocs.save({
    templateId:info.id,
    context:info.context,
    title:t("cong.docs.letter_title"),
    lang:info.lang,
    templateUpdatedAt:info.updatedAt,
    format:"text",
    body:body,
    edited:edited,
    pages:[],
    ref:docRef(task),
    entityTitle:docEntityTitle(task,c),
    data:values(task,c),
    reason:reason||"print"
  })).catch(e=>{console.warn("Конгрессы: снимок документа не сохранён",e);return null})}
/** Снимки для пакетной печати. Дедупликация в архиве схлопнет повторы сама. */
export function snapshotLetters(tasks,reason){let c=A();(tasks||[]).forEach(x=>snapshotLetter(x,reason,c))}

/* ═══════════════════════════════════════════════════════════════════════════
   АРХИВ ВЫДАННЫХ ДОКУМЕНТОВ (задача Б, 24.08.2026)

   Модуль писал снимки в общий архив с 13.08.2026, но своего экрана не имел:
   увидеть отправленное можно было только зайдя в «Документы». Здесь экран
   появляется на месте — список писем ЭТОГО модуля, свежие сверху.

   Карточку рисует общий `CWDocsView`, а не местный код: до 24.08.2026
   рендерер существовал в проекте дважды (Клиндарий и Документы) и копии уже
   разошлись по вёрстке. Модуль отвечает только за отбор и за то, что вокруг.

   Отбор — `listAll({module:'congress-project'})`. Чужие письма сюда не
   попадают: у секретаря конгрессов нет причин видеть архив Школы, а общий
   взгляд на всё уже есть в «Документах».

   Группировки по заданиям здесь НЕТ намеренно, в отличие от «Документов».
   Там архив общий и без группировки превращается в кашу; здесь список уже
   сужен до одного модуля, а плоский список свежими сверху отвечает на главный
   вопрос секретаря — «что я отправлял последним». */
let docsArchive = { rows: null, search: "", loading: false, unbind: null };

function docsArchiveList() { return $("#docsArchiveList"); }

function renderDocsArchive() {
  let box = docsArchiveList(); if (!box) return;
  if (docsArchive.loading) { box.innerHTML = self.CWDocsView.stateHtml("loading"); return; }
  if (!docsArchive.rows || !docsArchive.rows.length) { box.innerHTML = self.CWDocsView.stateHtml("empty"); return; }
  let q = docsArchive.search.trim().toLowerCase();
  let rows = q ? docsArchive.rows.filter(d =>
    String(d.entityTitle || "").toLowerCase().includes(q)
    || String(d.subject || "").toLowerCase().includes(q)
    || String(d.body || "").toLowerCase().includes(q)) : docsArchive.rows;
  if (!rows.length) { box.innerHTML = self.CWDocsView.stateHtml("nothing"); return; }
  /* Подпись задания над карточкой: сама карточка её не показывает — она общая
     и про сущность-владельца ничего не знает. Удалённое задание помечается,
     а снимок остаётся: письмо уже ушло людям (см. shared/documents.js). */
  box.innerHTML = rows.map(d =>
    '<div class="docs-arc__item"><div class="docs-arc__owner">'
    + esc(d.entityTitle || t("doc.archive_entity_gone"))
    + '</div>' + self.CWDocsView.cardHtml(d) + '</div>').join("");
}

function loadDocsArchive() {
  if (!docsAvailable()) { docsArchive.rows = []; renderDocsArchive(); return; }
  docsArchive.loading = true; renderDocsArchive();
  self.CWDocs.listAll({ module: "congress-project" }).then(rows => {
    docsArchive.loading = false; docsArchive.rows = rows || []; renderDocsArchive();
  }).catch(e => {
    console.warn("Конгрессы: не удалось прочитать архив документов", e);
    docsArchive.loading = false; docsArchive.rows = []; renderDocsArchive();
  });
}

export function openDocsArchive() {
  let dlg = $("#docsArchiveDialog"); if (!dlg) return;
  let search = $("#docsArchiveSearch");
  if (search) { search.value = docsArchive.search; search.oninput = () => { docsArchive.search = search.value; renderDocsArchive(); }; }
  /* Обработчики вешаются на контейнер один раз за открытие и снимаются при
     закрытии: иначе каждое открытие добавляло бы ещё один слушатель, и
     удаление снимка срабатывало бы столько раз, сколько раз открывали окно. */
  if (docsArchive.unbind) docsArchive.unbind();
  docsArchive.unbind = self.CWDocsView.bind(docsArchiveList(), () => docsArchive.rows || [], {
    /* Тостов у модуля нет — подтверждение даёт сама кнопка карточки. */
    onToast: () => {},
    onRemoved: () => { loadDocsArchive(); },
  });
  dlg.addEventListener("close", () => { if (docsArchive.unbind) { docsArchive.unbind(); docsArchive.unbind = null; } }, { once: true });
  loadDocsArchive();
  dlg.showModal();
}
