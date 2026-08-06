import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = {
  registry: 'shared/version.js',
  congress: 'congress-project/service-worker.js',
  congressHtml: 'congress-project/index.html',
  planner: 'circuit-planner/app.js',
  schoolApp: 'pioneer-school/js/app.js',
  schoolSw: 'pioneer-school/sw.js',
  appointments: 'appointments/sw.js',
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')]),
  ),
);

function capture(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`Не удалось прочитать версию: ${label}`);
  return match[1];
}

const registry = Object.fromEntries(
  [...source.registry.matchAll(/'([^']+)':\s*\{[^}]*version:\s*'([^']+)'/g)].map((match) => [
    match[1],
    match[2],
  ]),
);

const actual = {
  'congress-project': capture(source.congress, /APP_VERSION\s*=\s*'([^']+)'/, files.congress),
  'circuit-planner': capture(source.planner, /version:\s*'([^']+)'/, files.planner),
  'pioneer-school': capture(source.schoolApp, /APP_VERSION\s*=\s*'([^']+)'/, files.schoolApp),
  appointments: capture(source.appointments, /APP_VERSION\s*=\s*'([^']+)'/, files.appointments),
};

const errors = [];
const semver = /^\d+\.\d+\.\d+$/;

for (const [moduleId, version] of Object.entries(actual)) {
  if (!semver.test(version)) errors.push(`${moduleId}: некорректная версия ${version}`);
  if (registry[moduleId] !== version) {
    errors.push(`${moduleId}: код=${version}, shared/version.js=${registry[moduleId] || 'нет записи'}`);
  }
}

const schoolSwVersion = capture(source.schoolSw, /APP_VERSION\s*=\s*'([^']+)'/, files.schoolSw);
if (schoolSwVersion !== actual['pioneer-school']) {
  errors.push(`pioneer-school: app.js=${actual['pioneer-school']}, sw.js=${schoolSwVersion}`);
}

const shellVersion = capture(source.registry, /CW_VERSION\s*=\s*'([^']+)'/, files.registry);
if (!semver.test(shellVersion)) errors.push(`Хаб: некорректная версия ${shellVersion}`);

if (/<title>[^<]*\bv\d+\.\d+(?:\.\d+)?[^<]*<\/title>/i.test(source.congressHtml)) {
  errors.push('congress-project/index.html: версия не должна быть захардкожена в <title>');
}

if (errors.length) {
  console.error(`Проверка версий не пройдена:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Версии согласованы: хаб ${shellVersion}; ${Object.entries(actual)
    .map(([id, version]) => `${id} ${version}`)
    .join('; ')}`);
}
