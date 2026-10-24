#!/usr/bin/env node
/**
 * Пересборка встроенного шрифта PDF — Noto Sans, четыре начертания
 * (`shared/fonts/noto-sans-pdf-*.js`, глобали `window.PDF_FONT_NOTO_SANS`,
 * `…_BOLD`, `…_ITALIC`, `…_BOLDITALIC`; встраиваются в jsPDF через
 * addFileToVFS и в pdf-lib через embedFont).
 *
 * ПОЧЕМУ NOTO SANS (визуальный аудит 24.10.2026, Ф6, решение Алекса). Один
 * шрифт во всём приложении — в интерфейсе и на бумаге. Прежде PDF Клиндария
 * печатались Aptos (шрифт Microsoft: распространять, конвертировать и
 * встраивать в приложения лицензия не разрешает — файлы удалены), а Школы и
 * Конгрессов — DejaVu Sans. Noto Sans — свободная лицензия SIL OFL 1.1, того
 * же автора, что и Aptos (Стив Мэттесон), с полной кириллицей.
 *
 * ЗАПУСК:
 *   pip install fonttools
 *   npm pack @expo-google-fonts/noto-sans@0.4.2 && tar xzf expo-google-fonts-noto-sans-0.4.2.tgz
 *   NOTO_SRC=./package node scripts/build-pdf-font-subset.mjs
 *
 * НЕОЧЕВИДНОЕ:
 * 1. Версия исходника критична — другая версия может сдвинуть ширины глифов
 *    и переверстать готовые бланки. Скрипт падает при расхождении.
 * 2. Формат — TTF: jsPDF умеет только TTF/OTF, woff2 он примет молча и
 *    отрисует пустоту.
 * 3. Таблицы GPOS/GSUB/GDEF выброшены: jsPDF их не читает, а это треть веса.
 *    По той же причине нет комбинируемых диакритик — только готовые буквы.
 * 4. Латиница и кириллица — целыми блоками, а не по списку «нужных сейчас»
 *    букв: список разойдётся с реальными переводами и текстами писем.
 * 5. Расширяя набор глифов, синхронно расширить `_sanitizeForFont()` в
 *    `pioneer-school/js/export/pdfExport.js` и `FONT_SAFE` в
 *    `congress-project/js/batch-pdf.js`: они заменяют на «-» всё, что вне
 *    whitelist, ДО шрифта (jsPDF на неизвестном глифе обрезает строку).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = process.env.NOTO_SRC || "./package";
const EXPECTED_VERSION = "Version 2.015";
const STYLES = [
  ["400Regular", "regular", "PDF_FONT_NOTO_SANS"],
  ["700Bold", "bold", "PDF_FONT_NOTO_SANS_BOLD"],
  ["400Regular_Italic", "italic", "PDF_FONT_NOTO_SANS_ITALIC"],
  ["700Bold_Italic", "bolditalic", "PDF_FONT_NOTO_SANS_BOLDITALIC"],
];
/**
 *   ASCII, Latin-1, Latin Extended-A/B — de, en, pl и запас (ș ț и т.п.)
 *   Cyrillic          — весь блок: ru, uk (і ї є ґ) и запас
 *   General Punctuation — тире, кавычки, многоточие, неразрывные пробелы
 *   € ₴ ₽ № ™ −
 */
const RANGES = ["U+0020-007E", "U+00A0-024F", "U+0400-04FF", "U+2000-206F", "U+20AC", "U+20B4", "U+20BD", "U+2116", "U+2122", "U+2212"];

const tmp = mkdtempSync(join(tmpdir(), "cw-pdffont-"));
const checkSrc = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
v = f["name"].getDebugName(5)
if v != sys.argv[2]:
    sys.exit("Исходный шрифт %r, ожидался %r — метрики могут разойтись" % (v, sys.argv[2]))
`;
const checkOut = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
cmap = set(f.getBestCmap())
probes = "łżąęśćńóźäöüßÄÖÜéàçñіїєґйщыэ№«»—…“”„’"
missing = [c for c in probes if ord(c) not in cmap]
if missing:
    sys.exit("В субсете нет глифов: " + " ".join(missing))
print("  глифов:", len(cmap))
`;

for (const [dir, name, global] of STYLES) {
  const src = join(SRC, dir, `NotoSans_${dir}.ttf`);
  const ttf = join(tmp, `${name}.ttf`);
  const out = `shared/fonts/noto-sans-pdf-${name}.js`;
  execFileSync("python3", ["-c", checkSrc, src, EXPECTED_VERSION], { stdio: "inherit" });
  execFileSync("pyftsubset", [src, `--output-file=${ttf}`, `--unicodes=${RANGES.join(",")}`,
    "--no-hinting", "--desubroutinize", "--drop-tables+=DSIG,GPOS,GSUB,GDEF", "--layout-features="], { stdio: "inherit" });
  execFileSync("python3", ["-c", checkOut, ttf], { stdio: "inherit" });
  const b64 = readFileSync(ttf).toString("base64");
  writeFileSync(out, [
    `// Noto Sans ${name} (${EXPECTED_VERSION}), урезанный scripts/build-pdf-font-subset.mjs`,
    "// до латиницы (до Latin Extended-B), кириллицы и пунктуации. Лицензия SIL OFL 1.1",
    "// (shared/fonts/OFL-NotoSans.txt). Встраивается в PDF всех модулей.",
    "// НЕ ПРАВИТЬ РУКАМИ: пересобирается скриптом.",
    `window.${global} = "${b64}";`,
    "",
  ].join("\n"));
  console.log(`готово: ${out}, ${statSync(out).size} байт`);
}
