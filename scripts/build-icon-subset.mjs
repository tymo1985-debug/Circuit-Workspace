#!/usr/bin/env node
/**
 * Пересборка субсета Material Symbols для shared/fonts/.
 *
 * ЗАЧЕМ ЭТОТ СКРИПТ. Первая сборка субсета делалась вручную pyftsubset
 * по кодпоинтам — и лигатуры при этом терялись. Внешне всё выглядело
 * нормально (файл 18 КБ, иконки в cmap), но `<span class="md-icon">event</span>`
 * печатал слово «event» вместо иконки, потому что в GSUB не осталось
 * ни одной лигатуры. Баг дожил до продакшена и вылез на скриншоте шапки.
 * Рецепт неочевиден, поэтому зафиксирован кодом, а не в голове.
 *
 * ЗАПУСК:
 *   npm install material-symbols
 *   pip install fonttools brotli
 *   node scripts/build-icon-subset.mjs
 *
 * ЧЕТЫРЕ НЕОЧЕВИДНЫХ МОМЕНТА:
 *
 * 1. Шрифт берётся из npm-пакета material-symbols, а не с fonts.gstatic.com:
 *    в рабочей среде сеть до Google закрыта, npm — открыт.
 *
 * 2. Оси вариативного шрифта нужно зафиксировать ДО субсеттинга. Без этого
 *    субсет остаётся 3.5 МБ: все начертания по осям FILL/GRAD/opsz/wght
 *    тянутся следом.
 *
 * 3. Лигатуры Material Symbols лежат в features `rlig` и `rclt`, а НЕ в `liga`.
 *    Указать только liga — снова получить субсет без лигатур.
 *
 * 4. Обязателен --no-layout-closure. Без него pyftsubset дотягивает каждую
 *    лигатуру, чьи буквы попали в набор, — а имена ~4000 иконок собраны
 *    из тех же 26 букв. Размер прыгает с 4 КБ до 243 КБ.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Иконки в субсете. Добавляя новую — не забыть поднять версии SW:
 *  при кэшировании cache-first старый шрифт иначе останется у вернувшихся
 *  пользователей, и новая иконка отрисуется пустым квадратом. */
const ICONS = [
  "home", "calendar_month", "school", "settings", "apps",
  "add", "close", "check", "menu", "search", "edit", "delete",
  "chevron_right", "chevron_left", "expand_more", "arrow_back",
  "event", "mail", "group", "person", "description",
  "notifications", "filter_list", "print", "more_vert",
  "download", "upload", "content_copy", "drag_indicator",
  "warning", "today", "dark_mode", "light_mode",
];

const SRC = "node_modules/material-symbols/material-symbols-outlined.woff2";
const OUT = "shared/fonts/material-symbols-outlined-subset.woff2";

const tmp = mkdtempSync(join(tmpdir(), "cw-icons-"));
const staticFont = join(tmp, "static.woff2");
const cpFile = join(tmp, "codepoints.txt");

// Шаг 1 — зафиксировать оси и заодно вытащить кодпоинты нужных иконок.
const py = `
import sys, json
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

names = json.loads(sys.argv[3])
f = TTFont(sys.argv[1])
inst = instancer.instantiateVariableFont(f, {"FILL": 0, "GRAD": 0, "opsz": 24, "wght": 400})
inst.flavor = "woff2"
inst.save(sys.argv[2])

cmap = inst.getBestCmap()
rev = {}
for cp, gn in cmap.items():
    rev.setdefault(gn, cp)
missing = [n for n in names if n not in rev]
if missing:
    sys.exit("Нет таких иконок в шрифте: " + ", ".join(missing))
with open(sys.argv[4], "w") as fh:
    fh.write(",".join("U+%04X" % rev[n] for n in names))
`;
execFileSync("python3", ["-c", py, SRC, staticFont, JSON.stringify(ICONS), cpFile], {
  stdio: "inherit",
});

// Шаг 2 — субсет: глифы иконок по кодпоинтам, буквы имён через --text,
// лигатурные features сохранить, замыкание по layout выключить.
execFileSync(
  "pyftsubset",
  [
    staticFont,
    `--output-file=${OUT}`,
    "--flavor=woff2",
    `--unicodes-file=${cpFile}`,
    `--text=${ICONS.join(" ")}`,
    "--layout-features=rlig,rclt,liga,calt",
    "--no-layout-closure",
    "--no-hinting",
    "--desubroutinize",
  ],
  { stdio: "inherit" }
);

// Шаг 3 — проверка: лигатуры должны быть на месте, иначе сборка бессмысленна.
const check = `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
g = f["GSUB"].table
def subtables(lu):
    for st in lu.SubTable:
        yield st.ExtSubTable if (lu.LookupType == 7 and hasattr(st, "ExtSubTable")) else st
found = set()
for lu in g.LookupList.Lookup:
    for st in subtables(lu):
        if getattr(st, "ligatures", None):
            for first, ligs in st.ligatures.items():
                for lg in ligs:
                    found.add((first + "".join(lg.Component)).replace("underscore", "_"))
if not found:
    sys.exit("СБОРКА НЕГОДНА: в субсете нет лигатур — иконки будут печататься словами")
print("лигатур в субсете:", len(found))
`;
execFileSync("python3", ["-c", check, OUT], { stdio: "inherit" });
console.log(`готово: ${OUT}, ${statSync(OUT).size} байт`);
