// congress-project/js/mobile.js
//
// Мобильная оболочка модуля: панель с текущим конгрессом, два нижних листа
// и плавающая кнопка добавления задания.
//
// ЗАЧЕМ. На телефоне до программы приходилось проскроллить четыре экрана
// служебного: список конгрессов, поля конгресса, шесть кнопок действий и
// подсказку. Фаза 1 (4.28.0) ужала это в CSS настолько, насколько CSS вообще
// может — дальше нужно убирать узлы из потока страницы, а это уже JS.
//
// ГЛАВНЫЙ ПРИНЦИП: НИЧЕГО НЕ ДУБЛИРУЕТСЯ. Мы не строим вторую копию списка
// конгрессов и не вешаем вторые обработчики на кнопки — мы ПЕРЕНОСИМ те же
// самые узлы в диалог и возвращаем обратно, когда экран становится широким.
// Обработчики в этом модуле висят на самих элементах (`el.onclick = ...` в
// bind()/renderCongresses), а они переживают перенос узла. Поэтому здесь нет
// ни одной копии прикладной логики — только перестановка DOM.
//
// Следствие, о котором важно помнить при правках: сюда нельзя добавлять
// «ещё одну кнопку X для мобильных». Кнопка должна быть одна, в разметке, а
// этот файл решает только, где она сейчас живёт.
import { $ } from "./dom.js";

const MOBILE = "(max-width:680px)";

/* Узлы переезжают между исходным местом и листом. Чтобы вернуть каждый
   ровно туда, откуда он взят, запоминаем родителя и следующего соседа в
   момент первого переезда: расставлять по индексу нельзя — соседи могут
   появиться и исчезнуть (например, .hint скрывается, но остаётся в DOM). */
const moved = [];

function remember(node, target) {
  if (!node || !target) return null;
  return { node, target, parent: node.parentNode, next: node.nextSibling };
}

function toSheet() {
  moved.forEach((m) => m.target.appendChild(m.node));
}

function toPage() {
  moved.forEach((m) => m.parent.insertBefore(m.node, m.next));
}

/* Подпись панели берётся из уже отрисованного списка конгрессов, а не из
   состояния: так мобильная панель не знает ничего о модели данных и не
   требует врезки вызова в render(). renderCongresses переписывает
   innerHTML списка целиком, поэтому MutationObserver ловит любое
   изменение — создание, удаление, переключение активного, переименование. */
function syncBar() {
  const active = document.querySelector("#congressList .congress.active");
  const name = $("#mCongressName");
  const meta = $("#mCongressMeta");
  if (!name || !meta) return;
  name.textContent = active ? (active.querySelector("b")?.textContent || "") : "";
  meta.textContent = active ? (active.querySelector("small")?.textContent || "") : "";
}

/* Лист закрывается по любому нажатию кнопки внутри него: действие уже
   запущено (обработчик самой кнопки отрабатывает раньше, всплытие идёт
   снизу вверх), и держать лист открытым поверх, например, диалога печати
   незачем. Поля ввода в карточке конгресса лист не закрывают — иначе
   имя конгресса нельзя было бы дописать. */
function closeOnAction(dialog) {
  dialog.addEventListener("click", (e) => {
    if (e.target.closest("button, .congress")) dialog.close();
  });
}

export function initMobile() {
  const bar = $("#mobileBar");
  const congressSheet = $("#mobileCongressSheet");
  const actionsSheet = $("#mobileActionsSheet");
  if (!bar || !congressSheet || !actionsSheet) return;

  const congressBody = congressSheet.querySelector(".sheet-body");
  const actionsBody = actionsSheet.querySelector(".sheet-body");

  [
    remember(document.querySelector(".sidebar"), congressBody),
    remember($("#congressMeta"), congressBody),
    remember($("#programActions"), actionsBody),
  ].forEach((m) => { if (m) moved.push(m); });

  $("#mCongressBtn").onclick = () => congressSheet.showModal();
  $("#mMoreBtn").onclick = () => actionsSheet.showModal();
  /* Плавающая кнопка не заводит своё «добавить задание», а нажимает ту же
     кнопку, что и на широком экране: одна логика, один обработчик. */
  $("#mAddTaskBtn").onclick = () => $("#addTaskBtn").click();

  [congressSheet, actionsSheet].forEach((d) => {
    closeOnAction(d);
    d.querySelector(".sheet-close").onclick = () => d.close();
  });

  const list = $("#congressList");
  if (list) new MutationObserver(syncBar).observe(list, { childList: true, subtree: true });
  syncBar();

  const mq = window.matchMedia(MOBILE);
  const apply = () => {
    if (mq.matches) {
      toSheet();
    } else {
      /* Открытый лист на широком экране остался бы модальным окном без
         содержимого — закрываем до переноса. */
      congressSheet.close();
      actionsSheet.close();
      toPage();
    }
  };
  mq.addEventListener("change", apply);
  apply();
}
