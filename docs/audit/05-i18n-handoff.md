# Передача носителю: долг перевода (аудит 03, P2-7)

**Дата:** 07.10.2026 · **Версия:** хаб 0.42.45 · Заполнять «очевидным» переводом нельзя
(правило из шапки `dict.js`): потом не отличить от вычитанного носителем.
Источник списка — `node scripts/check-i18n-coverage.mjs`, §2; сам счётчик считает скрипт.

## 1. Нет перевода вовсе — только `ru` (18 ключей)

| Ключ | Файл | Русский текст |
|---|---|---|
| `cong.status.letter_pending` | congress-project/i18n/dict.js | Письмо не отправлено |
| `cong.section.main` | congress-project/i18n/dict.js | Основное |
| `cong.section.task_state` | congress-project/i18n/dict.js | Состояние задания |
| `cong.section.letter_recording` | congress-project/i18n/dict.js | Письмо и запись |
| `cong.section.notes` | congress-project/i18n/dict.js | Примечания |
| `cong.title.more` | congress-project/i18n/dict.js | Ещё |
| `cong.title.print_menu` | congress-project/i18n/dict.js | Печать |
| `cong.btn.print_menu` | congress-project/i18n/dict.js | Печать |
| `cong.ph.participant_congregation` | congress-project/i18n/dict.js | Собрание / группа |
| `cong.title.delete_participant` | congress-project/i18n/dict.js | Удалить участника |
| `cong.err.js` | congress-project/i18n/dict.js | Ошибка JavaScript |
| `update.partial` | shared/i18n/common.js | Не удалось проверить некоторые модули. Попробуйте ещё раз. |
| `update.available_multi` | shared/i18n/common.js | Доступно обновление Circuit Workspace |
| `update.apply_all` | shared/i18n/common.js | Обновить всё |
| `update.available_open_hub` | shared/i18n/common.js | Доступно обновление Circuit Workspace — открыть Hub |
| `update.open_hub` | shared/i18n/common.js | Открыть Hub |
| `update.installed_multi` | shared/i18n/common.js | Обновление установлено |
| `update.dismiss` | shared/i18n/common.js | Понятно |

Три последних ключа Конгрессов (`cong.ph.participant_congregation`,
`cong.title.delete_participant`, `cong.err.js`) 07.10.2026 вынесены из кода
в словарь: раньше эти строки были вписаны в `tasks.js` и `main.js` и видны
любому пользователю по-русски. Нужны uk / en / pl / de.

## 2. Есть перевод, но не вычитан носителем

- **Диагностика ошибок** (`errors.*`, 9 ключей, `shared/i18n/common.js`, 0.42.43) —
  uk / pl / de написаны мной, en проверить.
- **Архив** (`arc.*` в `archive/i18n/dict.js`, `doc.tab_archive` в
  `shared/i18n/common.js`, `cp.arch_*`, `cong.arch.*`) — заведены 05.10.2026.
- **Защита копии** (`backup.blocked`, `backup.guard_restore`, `backup.guard_saved`,
  `shared/i18n/common.js`) — заведены 28.08.2026.
- Совпадения `uk` с `ru` (≈ 99 на 28.08.2026): часть законная омонимия
  («Телефон», «Тема»), часть недопереведена; машинно не различить.

## 3. Как принимать правки

Правки — точечно в словарь, без смены ключей; плейсхолдеры `{n}`, `{count}`
сохраняются (проверка `check-i18n-placeholders.mjs`). Принятые ключи после
вычитки выпадают из §2 сами — отметка вручную не нужна.
