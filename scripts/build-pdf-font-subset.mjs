#!/usr/bin/env node
/**
 * Пересборка субсета DejaVu Sans для ПЛОСКИХ PDF Школы пионеров
 * (`pioneer-school/js/export/fonts/dejavu-sans-subset.js`, глобаль
 * `window.PDF_FONT_DEJAVU_SANS`, встраивается в jsPDF через addFileToVFS).
 *
 * ЗАЧЕМ ЭТОТ СКРИПТ. Первая сборка субсета покрывала только ASCII + кириллицу
 * + десяток знаков пунктуации — 364 кодпоинта. Пока документы Школы были
 * только по-русски, этого хватало. С подключением `shared/doclang.js`
 * (языки документа ru/uk/en/pl/de) выяснилось, что в шрифте нет НИ ОДНОГО
 * из ł ż ą ę ś ć ń ó ź ä ö ü ß — то есть польский и немецкий бланк молча
 * печатались бы как «Szko-a» вместо «Szkoła».
 *
 * ЗАПУСК:
 *   pip install fonttools
 *   node scripts/build-pdf-font-subset.mjs
 *
 * ПЯТЬ НЕОЧЕВИДНЫХ МОМЕНТОВ:
 *
 * 1. Версия исходного шрифта критична. Прежний субсет собран из DejaVu 2.37;
 *    сборка из другой версии может сдвинуть advance width и переверстать
 *    готовые бланки. Скрипт сверяет version исходника и падает при
 *    расхождении — не «предупреждает», а именно падает.
 *
 * 2. Формат — TTF, а не woff2. jsPDF умеет только TTF/OTF; woff2 он примет
 *    молча и отрисует пустоту.
 *
 * 3. --no-subset-tables=... не нужен, а вот --desubroutinize и --no-hinting
 *    нужны: хинтинг в PDF не используется, но занимает место.
 *
 * 4. Латиница берётся целыми блоками (Latin-1 Supplement + Latin Extended-A),
 *    а не по списку «нужных сейчас» букв. Список неизбежно разойдётся с
 *    реальными переводами, а разница в размере — единицы килобайт.
 *
 * 5. Расширение набора глифов бессмысленно без синхронной правки
 *    `_sanitizeForFont()` в `js/export/pdfExport.js`: она заменяет на «-»
 *    всё, что вне её whitelist, ДО того как строка дойдёт до шрифта.
 *    Скрипт проверяет, что whitelist покрывает новый набор.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const EXPECTED_VERSION = "Version 2.37";
const OUT = "pioneer-school/js/export/fonts/dejavu-sans-subset.js";
const SANITIZER = "pioneer-school/js/export/pdfExport.js";

/**
 * Диапазоны субсета. Менять здесь — и сразу же в `_sanitizeForFont()`.
 *   ASCII            — латиница, цифры, базовые знаки
 *   Latin-1 Suppl.   — ä ö ü ß é à ç ñ « » и т.д. (de, en, es)
 *   Latin Extended-A — ł ż ą ę ś ć ń ź ő ū (pl, и запас на остальные)
 *   Cyrillic         — весь блок целиком: ru + uk (і ї є ґ) + запас
 *   пунктуация       — тире, кавычки, многоточие, №
 */
const RANGES = [
  "U+0020-007E",
  "U+00A0-00FF",
  "U+0100-017F",
  "U+0400-04FF",
  "U+2013-2014",
  "U+2018-201E",
  "U+2026",
  "U+2116",
];

const tmp = mkdtempSync(join(tmpdir(), "cw-pdffont-"));
const ttf = join(tmp, "subset.ttf");

// Шаг 1 — сверить версию исходника: молчаливый сдвиг метрик хуже, чем падение.
const checkSrc = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
v = f["name"].getDebugName(5)
if v != sys.argv[2]:
    sys.exit("Исходный шрифт %r, ожидался %r — метрики могут разойтись" % (v, sys.argv[2]))
print("исходник:", v, "unitsPerEm:", f["head"].unitsPerEm)
`;
execFileSync("python3", ["-c", checkSrc, SRC, EXPECTED_VERSION], { stdio: "inherit" });

// Шаг 2 — собственно субсет.
execFileSync(
  "pyftsubset",
  [
    SRC,
    `--output-file=${ttf}`,
    `--unicodes=${RANGES.join(",")}`,
    "--no-hinting",
    "--desubroutinize",
    "--drop-tables+=DSIG",
  ],
  { stdio: "inherit" },
);

// Шаг 3 — проверка: контрольные буквы всех пяти языков должны быть в cmap.
const checkOut = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
cmap = set(f.getBestCmap())
probes = "łżąęśćńóźäöüßÄÖÜéàçñіїєґйщыэ№«»—…"
missing = [c for c in probes if ord(c) not in cmap]
if missing:
    sys.exit("В субсете нет глифов: " + " ".join(missing))
print("глифов в субсете:", len(cmap))
`;
execFileSync("python3", ["-c", checkOut, ttf], { stdio: "inherit" });

// Шаг 4 — записать как base64 в JS-обёртку (комментарий шапки сохраняем).
const b64 = readFileSync(ttf).toString("base64");
writeFileSync(
  OUT,
  [
    "// Шрифт DejaVu Sans, урезанный (scripts/build-pdf-font-subset.mjs) до",
    "// ASCII + Latin-1 Supplement + Latin Extended-A + всей кириллицы + пунктуации.",
    "// Источник: DejaVuSans.ttf 2.37 (свободная лицензия, Bitstream Vera/DejaVu).",
    "// Используется для встраивания в плоские PDF-бланки, где нужен настоящий",
    "// (не растровый) текст на ru/uk/en/pl/de.",
    "//",
    "// НЕ ПРАВИТЬ РУКАМИ: пересобирается скриптом. Расширяя набор глифов, синхронно",
    "// расширить whitelist в _sanitizeForFont() — иначе новые буквы станут дефисами.",
    `window.PDF_FONT_DEJAVU_SANS = "${b64}";`,
    "",
  ].join("\n"),
);

// Шаг 5 — предупредить, если санитайзер отстал от шрифта.
const sanitizer = readFileSync(SANITIZER, "utf8");
for (const needed of ["\\u00A0-\\u017F", "\\u0400-\\u04FF", "\\u2116"]) {
  if (!sanitizer.includes(needed)) {
    console.warn(`ВНИМАНИЕ: в _sanitizeForFont() нет диапазона ${needed} — новые глифы не дойдут до PDF`);
  }
}

console.log(`готово: ${OUT}, ${statSync(OUT).size} байт (ttf ${statSync(ttf).size} байт)`);
