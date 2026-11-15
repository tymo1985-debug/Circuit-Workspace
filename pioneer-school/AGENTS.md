# Школа пионеров — локальные правила

Читать вместе с корневым `AGENTS.md`.

## Где что лежит

| Файл | Размер | Как читать |
|---|---:|---|
| `js/app.js` | 120 КБ | по разделам (`// ----------`) |
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
- Структура анкеты описана **дважды**: `js/modules/registrationSchema.js`
  (онлайн-форма и интерактивный PDF строятся из неё) и ручная раскладка
  печатного бланка `pdfExport.downloadRegistrationBlankForm`. Меняешь состав
  вопросов — правь оба.

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
  без ручных отметок. «Задания» — `later`, пока нет Ф6.
- Проверка — `scripts/check-pioneer-overview.mjs`.

## Открытая работа: N-3

Ленивая догрузка библиотек. Четыре именованных набора: `pdf`, `import`,
`excel`, `form`. Общий загрузчик — `shared/pdfstack.js` (извлекается из
`App.pdf` Клиндария). Проверка `check-lazy-pdf.mjs` готова, остаётся снять
записи из `DEBT`. Затрагивает пять трактов выдачи бумаг — каждый требует
живого прогона. Подробности — `docs/journal/pdf-print.md`.
