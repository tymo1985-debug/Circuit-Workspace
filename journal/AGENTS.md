# journal/AGENTS.md — Журнал

Правила модуля, не история. История — `CHANGELOG.md`.

## Хранение

- Одна физическая база: `circuit-workspace-db` (с v6). Второй IndexedDB
  у Журнала нет и быть не должно.
- Журнал владеет четырьмя хранилищами: `journalNodes`, `journalEntries`,
  `journalLinks`, `journalMeta`. Доступ — только через `CWJournal`
  (`js/data.js`), не через сырой `CWDB.journal*` из экранов.
- Никаких доменных данных в `localStorage` и `CWState`. `shared/state.js`
  не подключается: его блоб зеркалится в localStorage при закрытии вкладки.
- Строки, а не блоб: одна запись = одна строка хранилища.

## Модель

- Узлы: `circuit → congregation → group|pregroup`. Район — рабочий объект,
  а не папка.
- `kind` и `parentId` узла неизменяемы после создания (J3a). `nodes.update()`
  отклоняет попытку сменить любое из двух на другое значение — переноса
  подузлов/смены вида пока нет и не должно возникать частично (иначе узел
  мог бы стать сам себе родителем или увезти детей с устаревшим `circuitId`).
- Идентичность собрания — в `CWDirectory`, узел хранит только
  `communityId`. Расписание встреч и прочие рабочие/презентационные поля —
  собственные поля Журнала (`fields`), в справочник не пишутся.
- Записи — универсальные, `type`: `note|project|question|todo|visit|observation`.
  Значения `kind/type/status/rel` — канонические данные, не подписи.
- Архив — `status`/`archivedAt`, не отдельное хранилище.
- Посещение (J4a) — `journalEntries` с `type:'visit'`, только через
  `CWJournal.visits`; общие `entries.add/update/remove` посещение отклоняют
  (`journal-visit-use-facade`), чтение через `entries.*` не ограничено. Родитель — собрание/группа/предгруппа; `type/nodeId/
  circuitId` неизменяемы; `dateFrom/dateTo` — `YYYY-MM-DD`, `dateTo ≥ dateFrom`,
  пересечения разрешены. Статус `open ↔ completed`, любой → `archived`
  (`archivedAt`, возврат к прежнему) — только через complete/reopen/archive/
  unarchive. Записи внутри посещения несут `fields.visitId`; `visits.remove()`
  отказывает, пока есть записи или связи. Сезонная подпись («весна 2028») —
  производная от `dateFrom`, не хранится.
- Записи посещения (J4b) — `journalEntries` с `fields.visitId`, только через
  `CWJournal.visitRecords`; общие `entries.add/update/remove` их не создают,
  не правят, не удаляют и не «приписывают» к посещению
  (`journal-visit-record-use-facade`). Типы `note|observation|question|todo`;
  `nodeId/circuitId/fields.visitId` берутся из посещения и неизменяемы.
  Текст пользователя — только `body`; `fields` = `{ visitId, format, seq }`,
  без копии текста и без HTML. `format`: `paragraph|heading2|list|quote`,
  у задачи — `checklist`. Задача `open ↔ done` только через `complete/reopen`,
  превращение в задачу — явный `convertToTodo`. Правка возможна только в
  открытом посещении (`journal-visit-readonly`). Порядок — `fields.seq`.
  Удаление отказывает при связях (`journal-visit-record-has-links`).
- Задачи (J5) — один цикл todo для всего Журнала: `CWJournal.tasks`
  (самостоятельные задачи узла + задачи посещений). `open ↔ done` только
  `complete/reopen`; `dueDate` — верхнее поле, снятие срока удаляет поле.
  Задача посещения меняется только пока посещение открыто — экран «Задачи»
  это правило не обходит. `visitRecords.complete/reopen` делегируют сюда.
- Перенос (J5) — `CWJournal.carry`, одна строка на пункт через все посещения
  (не копируется, `fields.visitId` = источник). Открыт: `carryKey`; закрыт:
  поля НЕТ физически (`replaceEntry` через `mutate`, никогда null/''/false).
  `touches[]` = `{ visitId, at, action }`, `raised|kept|deferred|closed`, без
  текста. Входящие для V — из более ранних посещений узла; поднятое в V —
  только в «помечено» V. Общий фасад не трогает задачи и поля переноса
  (`journal-task-use-facade`, `journal-carry-use-facade`). Посещение, на
  которое ссылается история переноса, не удаляется.
- Маршрут — `journal/js/route.js` (`CWJournalRoute.parse/build`), один роутер;
  неполный хвост сводится к ближайшему валидному контексту.
- «На следующее посещение» — строка `carryKey = '<nodeId>:open'`; у закрытых
  записей поле отсутствует. Булево значение ключом IndexedDB не является.
  Пункт не копируется между визитами — история лежит в `touches[]`.
- Связи — URN (`journal:entry/<id>`, `journal:node/<id>`,
  `cw:<module>/<kind>/<id>`). Связь не копирует содержимое источника.

## Защита (J8)

- `title`/`body` защищённой записи уходят в `sec` (AES-GCM); открытый текст
  не сохраняется нигде вне зашифрованной полезной нагрузки — ни в строках,
  ни в индексах, ни в `journalMeta`, ни в кэшах «недавнего», ни в копиях.
- В `journalMeta` допустим только крипто-материал (KDF, соль, обёрнутый DEK),
  не кэш открытого текста.

## Фикстуры

- Экраны Обзор/Район в J1–J2 — статическая визуальная фикстура в разметке.
  Это не данные: в базу ничего «для красоты» не записывается.

## Копия

- Реестр `shared/backup.js`: четыре хранилища целиком + `communities`.
  Восстановление копии модуля — слияние по ключу, соседей не трогает.
- Полная копия хаба, снятая до v6, хранилищ Журнала не содержит и при
  восстановлении их не очищает — известная асимметрия, не дефект.
