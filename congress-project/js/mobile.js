// congress-project/js/mobile.js
//
// Мобильная оболочка модуля: панель с текущим конгрессом, выпадающий список
// конгрессов, лист действий и плавающая кнопка добавления задания.
//
// ЗАЧЕМ. На телефоне до программы приходилось проскроллить четыре экрана
// служебного: список конгрессов, поля конгресса, шесть кнопок действий и
// подсказку. Фаза 1 (4.28.0) ужала это в CSS настолько, насколько CSS вообще
// может — дальше нужно убирать узлы из потока страницы, а это уже JS.
//
// ГЛАВНЫЙ ПРИНЦИП: НИЧЕГО НЕ ДУБЛИРУЕТСЯ. Мы не строим вторую копию списка
// конгрессов и не вешаем вторые обработчики на кнопки — мы ПЕРЕНОСИМ те же
// самые узлы в панель/лист и возвращаем обратно, когда экран становится
// широким. Обработчики в этом модуле висят на самих элементах
// (`el.onclick = ...` в bind()/renderCongresses), а они переживают перенос
// узла. Поэтому здесь нет ни одной копии прикладной логики — только
// перестановка DOM.
//
// Следствие, о котором важно помнить при правках: сюда нельзя добавлять
// «ещё одну кнопку X для мобильных». Кнопка должна быть одна, в разметке, а
// этот файл решает только, где она сейчас живёт.
//
// КАК РАЗДЕЛЕНЫ ДВА РАЗНЫХ ДЕЛА (4.30.0). Раньше выбор конгресса и правка
// текущего лежали в одном нижнем листе — из-за этого простое «переключиться
// на другой конгресс» открывало окно с полями ввода и красной кнопкой сброса.
// Теперь:
//   • выпадающий список под панелью — ТОЛЬКО выбор и создание;
//   • лист по кнопке «ещё» — всё, что делается с текущим конгрессом:
//     действия программы, его поля, сброс данных.
// Заголовком листа служит имя текущего конгресса, поэтому новых строк
// перевода для этого разделения не понадобилось.
import { $ } from "./dom.js";

const MOBILE = "(max-width:680px)";

/* Узлы переезжают между исходным местом и мобильным контейнером. Чтобы
   вернуть каждый ровно туда, откуда он взят, запоминаем родителя и
   следующего соседа в момент первого переезда: расставлять по индексу
   нельзя — соседи могут появиться и исчезнуть (например, .hint скрывается,
   но остаётся в DOM). */
const moved = [];

function remember(node, target) {
  if (!node || !target) return null;
  return { node, target, parent: node.parentNode, next: node.nextSibling };
}

/* Подписи берутся из уже отрисованного списка конгрессов, а не из состояния:
   так мобильный слой не знает ничего о модели данных и не требует врезки
   вызова в render(). renderCongresses переписывает innerHTML списка целиком,
   поэтому MutationObserver ловит любое изменение — создание, удаление,
   переключение активного, переименование. */
function syncLabels() {
  const active = document.querySelector("#congressList .congress.active");
  const name = active ? (active.querySelector("b")?.textContent || "") : "";
  const meta = active ? (active.querySelector("small")?.textContent || "") : "";
  const set = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
  set("#mCongressName", name);
  set("#mCongressMeta", meta);
  /* У листа нет собственного заголовка с data-i18n: имя конгресса точнее
     любой общей подписи и не требует нового ключа перевода. */
  set("#mSheetTitle", name);
}

export function initMobile() {
  const bar = $("#mobileBar");
  const menu = $("#mCongressMenu");
  const sheet = $("#mobileActionsSheet");
  if (!bar || !menu || !sheet) return;

  const trigger = $("#mCongressBtn");
  const sheetBody = sheet.querySelector(".sheet-body");

  [
    /* .sidebar переносится целиком, а не по частям: main.js исключает
       `.sidebar` в clearSelectionIfOutside, и разрыв этой вложенности сбрасывал
       бы выделенное задание при каждом клике по списку конгрессов. */
    remember(document.querySelector(".sidebar"), menu),
    /* «Сбросить данные» относится к приложению, а не к выбору конгресса —
       ему не место в списке, который открывают по десять раз на дню.
       Кнопка — <button>, поэтому вынос за пределы .sidebar безопасен:
       clearSelectionIfOutside отдельно исключает `button`. */
    remember($("#resetAppBtn"), sheetBody),
    remember($("#programActions"), sheetBody),
    remember($("#congressMeta"), sheetBody),
  ].forEach((m) => { if (m) moved.push(m); });

  /* Порядок в листе задаётся явно, а не порядком переноса: по частоте —
     действия программы, поля конгресса, сброс данных последним. */
  const order = ["#programActions", "#congressMeta", "#resetAppBtn"];
  const toMobile = () => {
    moved.forEach((m) => m.target.appendChild(m.node));
    order.forEach((sel) => { const el = $(sel); if (el) sheetBody.appendChild(el); });
  };
  const toPage = () => moved.forEach((m) => m.parent.insertBefore(m.node, m.next));

  /* Выпадающий список. Механика повторяет js/topbar-menu.js (открыть,
     закрыть по действию, клик мимо, Esc) — там она привязана к своим
     идентификаторам и к `.md-menu__item`, поэтому переиспользовать её как
     есть нельзя. Обобщение обеих в один помощник записано в IDEAS.md. */
  const openMenu = () => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  const closeMenu = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.onclick = (e) => {
    e.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  };

  /* Любое действие внутри списка его закрывает: выбор конгресса — потому что
     дело сделано, «Серия»/«Новый» — потому что поверх откроется диалог.
     Обработчики самих элементов уже отработали (всплытие идёт снизу вверх). */
  menu.addEventListener("click", (e) => {
    if (e.target.closest(".congress, button")) closeMenu();
  });

  document.addEventListener("click", (e) => {
    if (menu.hidden) return;
    if (e.target.closest("#mobileBar")) return;
    closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (menu.hidden || e.key !== "Escape") return;
    e.stopPropagation();
    closeMenu();
    trigger.focus();
  });

  $("#mMoreBtn").onclick = () => { closeMenu(); sheet.showModal(); };
  /* Плавающая кнопка не заводит своё «добавить задание», а нажимает ту же
     кнопку, что и на широком экране: одна логика, один обработчик. */
  $("#mAddTaskBtn").onclick = () => $("#addTaskBtn").click();

  sheet.addEventListener("click", (e) => {
    if (e.target.closest("button, .congress")) sheet.close();
  });
  sheet.querySelector(".sheet-close").onclick = () => sheet.close();

  const list = $("#congressList");
  if (list) new MutationObserver(syncLabels).observe(list, { childList: true, subtree: true });
  syncLabels();

  const mq = window.matchMedia(MOBILE);
  const apply = () => {
    if (mq.matches) {
      toMobile();
    } else {
      /* Открытый список или лист на широком экране остались бы висеть поверх
         вернувшегося на место содержимого — закрываем до переноса. */
      closeMenu();
      sheet.close();
      toPage();
    }
  };
  mq.addEventListener("change", apply);
  apply();
}
