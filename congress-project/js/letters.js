// Auto-generated module: letters.js
import { $, $$ } from "./dom.js";
import { icon } from "./icons.js";
import { askOrientation } from "./printing.js";
import { renderTasks } from "./render.js";
import { A, S, docLang, row, save, sender, store } from "./state.js";
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
export function values(t){let c=A(),sd=sender(),p=(t.participants||[])[0]||{};return{sender:sd,congress:{name:congressTheme(c),theme:(c&&c.theme)||"",place:c.place||"",date:fmt(c.date),rehearsalDate:fmt(c.rehearsalDate),rehearsalTime:c.rehearsalTime||"",recordingDeadline:fmt(c.recordingDeadline),responseDeadline:fmt(c.responseDeadline)},assignment:{number:t.number,title:t.title,time:dt(t.time),type:t.kind||t.type||"",participant:p.name||"",congregation:p.congregation||"",recordingMedia:t.recordingMedia||"",recordingKind:t.recordingKind||"",notes:t.notes||""}}}
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
export function letterHTML(t){let s=S(),tpl=fill(pickTemplate(t),values(t));return`<article class="letter-page" style="font-family:${esc(s.font)};font-size:${(+s.fontSize||17)}px">${renderPlain(tpl)}</article>`}
export function openLetter(id){store.previewId=id;let t=A().tasks.find(x=>x.id===id);$("#letterPreview").innerHTML=letterHTML(t);$("#letterDialog").showModal()}
export function printFilename(title){let c=A(),base=(c?.name||"Конгресс").trim();return(base+(title?" — "+title:"")).replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ").trim()}
export function letterFileTitle(t){let n=String(t.number||"").trim();return n?"№"+n+" "+(t.title||""):(t.title||"")}
export function printLetter(){let task=A().tasks.find(x=>x.id===store.previewId);if(task){snapshotLetter(task,"print");askOrientation("Печать письма","portrait",letterHTML(task),printFilename(letterFileTitle(task)))}}
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
function docEntityTitle(task){let c=A(),p=(task.participants||[])[0]||{};
  return[letterFileTitle(task),p.name||"",(c&&c.name)||""].filter(Boolean).join(" · ")}
export function snapshotLetter(task,reason){
  if(!docsAvailable()||!task)return Promise.resolve(null);
  let info=pickTemplateInfo(task);
  return Promise.resolve(self.CWDocs.save({
    templateId:info.id,
    context:info.context,
    title:t("cong.docs.letter_title"),
    lang:info.lang,
    templateUpdatedAt:info.updatedAt,
    format:"text",
    body:fill(info.body,values(task)),
    pages:[],
    ref:docRef(task),
    entityTitle:docEntityTitle(task),
    data:values(task),
    reason:reason||"print"
  })).catch(e=>{console.warn("Конгрессы: снимок документа не сохранён",e);return null})}
/** Снимки для пакетной печати. Дедупликация в архиве схлопнет повторы сама. */
export function snapshotLetters(tasks,reason){(tasks||[]).forEach(x=>snapshotLetter(x,reason))}
