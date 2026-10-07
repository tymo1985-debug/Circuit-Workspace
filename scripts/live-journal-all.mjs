#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/live-journal-all.mjs  (npm run test:journal)
 *
 * Все живые прогоны Журнала подряд. НЕ ВХОДИТ В ГЕЙТ (нужен Chromium), но
 * обязателен при правке `journal/`, `archive/` и общих слоёв под ними
 * (`shared/db.js`, `backup.js`, `archive.js`, `directory.js`, `planner.js`).
 *
 * Зачем отдельный запуск: до 07.10.2026 десять `live-journal-*` запускались
 * только вручную, и `live-journal-documents` две недели падал на чипе,
 * который Документы 1.12.0 убрали, — никто не заметил (аудит 06, JF-5).
 * Список собирается по маске, поэтому новый прогон сюда попадает сам.
 *
 * Коды: 0 — все прошли; 1 — есть провал.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const files = readdirSync(DIR).filter((f) => /^live-journal-(?!all\.)[\w-]+\.mjs$/.test(f)).sort();
const results = [];
for (const f of files) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(DIR, f)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10 * 60 * 1000 });
  const ok = r.status === 0;
  results.push({ f, ok, s: Math.round((Date.now() - started) / 1000) });
  console.log((ok ? '  ✓ ' : '  ✗ ') + f + ' (' + Math.round((Date.now() - started) / 1000) + ' с)');
  if (!ok) {
    const tail = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-15).join('\n');
    console.log(tail.replace(/^/gm, '      '));
  }
}
const bad = results.filter((x) => !x.ok);
console.log(bad.length ? '\n✗ Провалено: ' + bad.length + ' из ' + results.length : '\n✓ Живые прогоны Журнала: ' + results.length + ' из ' + results.length);
process.exit(bad.length ? 1 : 0);
