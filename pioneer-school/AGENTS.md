# Школа пионеров — локальные правила

Читать вместе с корневым `AGENTS.md`.

## Где что лежит

| Файл | Размер | Как читать |
|---|---:|---|
| `js/app.js` | 130 КБ | по разделам (`// ----------`) |
| `i18n/dict.js` | 141 КБ | только `grep` по ключу |
| `../shared/fonts/noto-sans-pdf-*.js` | ~90 КБ | **не открывать** — base64 |

## Особенности модуля

- **Версия в ДВУХ местах**: `js/app.js` и `sw.js` (`APP_VERSION`). Обе поднимать
  вместе, иначе `check-versions.mjs` завалит гейт.
- Cache-first: правка `shared/*` требует патч-бампа.
- Шрифт PDF — субсет Noto Sans (общий для всех модулей, Ф6), 900 глифов,
  пересобирается `scripts/build-pdf-font-subset.mjs`. **Урезанный шрифт молча
  обрезает строку** на символе вне субсета — см. `docs/journal/traps.md`.
- Интерактивные PDF-формы с кириллицей — только через pdf-lib, не jsPDF.
- «Язык документа» (`shared/doclang.js`) подключён целиком с v1.9.0.
- Структура анкеты описана **один раз** — `js/modules/registrationSchema.js`:
  из неё строятся онлайн-форма, интерактивный PDF и (с 1.25.1) печатный бланк.
  Координаты бланка — подсказки `pdf` у полей; новое поле без подсказок ляжет
  на бумагу само. Проверка — `scripts/check-pioneer-blank.mjs`.

## Школы года (Ф1, 14.11.2026) — инварианты

- Каждая запись принадлежит школе: ключ `<schoolId>|<id>` + поле `schoolId`.
  Модули зовут `DB.*` с короткими id — префикс добавляет и снимает `js/db.js`.
  **Не писать в IndexedDB мимо `DB`**, не строить ключи с `|` вручную.
- Общее для всех школ — только `GLOBAL_META` в `js/db.js` (реестр школ,
  выбранная школа, `studentColumns`, `studentExportColumns`). Новый общий
  ключ — туда же, иначе он станет данными одной школы.
- Схема базы — версия 2; поднимать нельзя без сверки с потолком версии в
  `shared/backup.js`. Записи без префикса = старая копия → «Школа 1».
- Завершённая школа — только чтение (`PS_READONLY`). Кнопка, которая лишь
  читает (документ, печать, выгрузка), должна попасть в `RO_ALLOW` в `js/app.js`.
- Модель пионера — поля вне столбцов (`origin`, `status`, `statusReason`,
  `gender`, `congregationId`, `relations`, `textbookLanguages`,
  `previousInvites`), описание — шапка `js/modules/students.js`. «Ждём ли
  пионера» — только `Students.isExpected()`. Связи меняются только через
  `Students.saveCard()` / `remove()` — они взаимные.
- Проверка — `scripts/check-pioneer-schools.mjs`; подробности —
  `docs/journal/db.md` (14.11.2026).

## Формуляр (Ф2, 14.11.2026) — инварианты

- Ключи полей анкеты — контракт с IndexedDB, копиями и именами полей PDF
  (`<key>`, у групп галочек `<key>_<value>`). Генератор и разборщик PDF —
  в одном файле `js/export/pdfFormExport.js` (`generate` / `readFilled`).
- Языки учебника — массив `languages`; записи и анкеты v1 с одиночным
  `language` читать только через `RegistrationSchema.languagesOf()`.
- Анкета → карточка — только `Registration.applyToStudent()`: пустой ответ
  не стирает карточку, `attended`/`notAttended` не переписываются, слияние с
  существующим пионером — только по выбору пользователя.
- Проверка — `scripts/check-pioneer-form.mjs`.

## Рассылка (Ф3, 14.11.2026) — инварианты

- Состояние — meta-ключ `dispatch` школы: `{ [groupKey]: { sentAt, deadline,
  remindedAt } }`; группа — `congregationId` или `name:<название>`. Логика —
  только `js/modules/dispatch.js`.
- «Письмо отправлено» — только кнопкой (`Dispatch.markSent`); снятие отметки
  возвращает в «Приглашён» лишь `letterSent`. Пакет — только `isExpected()`.
- Тексты писем старейшинам — шаблоны общего слоя
  (`sys.school.congregation.letter` / `.reminder`), правятся в «Документах».
- Проверка — `scripts/check-pioneer-dispatch.mjs`.

## Обзор (Ф4, 15.11.2026) — инварианты

- Журнал — поле `history` записи пионера; пишет только `PioneerHistory.stamp`
  внутри `Students.save` / `saveCard` / `setClass` / `reinvite` (параметр
  `source`). Смены статуса из рассылки (`dispatch`) и формуляра (`form`) в
  журнал не идут — восстанавливаются из `dispatch` и `registrations`.
- Этапы и фильтры — чистые функции `js/modules/overview.js`; этап по данным,
  без ручных отметок. «Задания» закрыты, когда заполнены все места (Ф6).
- Проверка — `scripts/check-pioneer-overview.mjs`.

## Классы и учебники (Ф5, 15.11.2026) — инварианты

- Класс — `{ id, name, teacherA, teacherB }`; логика — `js/modules/classes.js`.
  В классы — только подтвердившие; «Предложить» не трогает распределённых;
  связанные карточки держатся вместе. Запись класса пионера — только
  `Students.setClass` (журнал).
- Заказ — `Textbooks.compute()` (язык × формат, «+5» только к печатным,
  `order.stock` по строке, `order.basis`); суммы — в `requestedByStudents` /
  `alreadyInStock` / `orderQuantity` для PDF/CSV и старых копий.
- Раздел остаётся `#textbooks`. Проверка — `scripts/check-pioneer-classes.mjs`.

## Задания (Ф6, 15.11.2026) — инварианты

- Логика — `js/modules/tasks.js` (`PSTasks`), экран — раздел `#tasks`.
- Общее для всех школ (`GLOBAL_META`): `taskLibrary` (ровно 18, читать только
  через `PSTasks.library()`; поле `practical` 1–4 — список Алекса). У школы:
  meta `tasks` (`{ [classId]: { [no]: { people, teacher, day } } }`,
  `people[0]` — главный, `teacher: null` — «как в расписании»).
- Когда и у кого — только `PSTasks.resolve(task, slot, days)`: день и время —
  слот практического занятия задания; преподаватель — ручная правка → буква
  части урока. Имя преподавателя — из `teacherA/teacherB` класса.
- Наследие до Ф6a — `lessonTable`, `schoolPlanTemplate` (GLOBAL_META),
  `schoolPlan`, `slot.day`: в базе и копиях остаются, не читаются, не
  стираются. Ключи из `GLOBAL_META` не убирать — иначе старая копия разложит
  их по школам.
- Правило — одно на задание; нарушение — предупреждение, не запрет. Каждое
  задание — один раз в классе. «Распределить автоматически»
  (`PSTasks.propose`) не трогает заполненные места.
- Тексты библиотеки всегда текущие (снимков нет — решение Алекса).
- Проверка — `scripts/check-pioneer-tasks.mjs`.

## Расписание (Ф6a, 20.11.2026) — инварианты

- Шаблон — `js/modules/schedule.js` (`PSSchedule.TEMPLATE`, `TITLES`),
  перенос PSS-sched_U.docx. **Только чтение** (решение Алекса): уроки,
  порядок, названия, песни (только номер) в интерфейсе не правятся.
- Практические занятия: 5б, 9а, 12а, 14б — `practical` у слота. Повторения —
  метки (`review`); разделов «Практические занятия» и «Ежедневное
  повторение» нет с 1.26.0 (их хранилища в базе остаются).
- Своё время — meta `scheduleTimes` школы, только отличия
  (`normalizeTimes`), пусто — стандарт. Даты — от `Assignment.startDate`.
- Экран — `#schedule`; печать A4 альбом через `CWPrint.document`.
- Проверка — `scripts/check-pioneer-schedule.mjs`.

## После школы (Ф7, 15.11.2026) — инварианты

- Логика — `js/modules/afterSchool.js`, экран — `#afterschool`. Отметка
  присутствия — это статус пионера (`attended` / `notAttended` + причина),
  ставится только `AfterSchool.mark()` (журнал, source `attendance`).
- S-253 — живой расчёт `AfterSchool.report()` (решение Алекса): стр.1 —
  origin `branchList` и не «Был» (без ответа / без отметки — тоже, с
  предупреждением), стр.2 — «Был» и не `branchList`. Meta `afterSchool_s253`
  хранит только ручные строки (`notAttendedFromList` / `attendedNotOnList` —
  имена полей = контракт со старыми копиями), `hidden` и `submitted`.
- Проверка — `scripts/check-pioneer-after.mjs`.

## Ленивая догрузка библиотек (N-3, закрыт 31.08.2026) — инварианты

- Четыре набора `pdf`, `import`, `excel`, `form` — `js/pdfstack.js` (`SETS`)
  поверх общего `shared/pdfstack.js`. Тяжёлым вендорам и сборщикам набора
  (`PdfExport`, `PdfImport`, `XlsxExport`, `PdfFormExport`) не место в
  разметке; каждая точка выдачи — после `ensure()`.
- Статика — `scripts/check-lazy-pdf.mjs` (`DEBT` пуст, только сокращать);
  живой прогон пяти трактов — `scripts/live-tracts.mjs` (вне гейта).
  Подробности — `docs/journal/pdf-print.md`.
