#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const registrySource = read('shared/version.js');
const modules = [...registrySource.matchAll(/'([^']+)':\s*\{[^}]*version:\s*'([^']+)'[^}]*worker:\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], version: m[2], worker: m[3] }));
const expected = ['congress-project', 'circuit-planner', 'pioneer-school', 'appointments', 'documents', 'journal'];
let failures = 0;
const ok = (label, value) => {
  console.log('  ' + (value ? '✓ ' : '✗ ') + label);
  if (!value) failures++;
};

console.log('\nUpdate contract');
ok('каждый модуль имеет worker URL в реестре', expected.every((id) => modules.some((m) => m.id === id)));
for (const module of modules) {
  const source = read(module.worker);
  ok(module.id + ': worker отвечает своей версией', source.includes("type === 'CW_VERSION'") && new RegExp(`module\\s*:\\s*'${module.id}'`).test(source));
  ok(module.id + ': имя кэша включает версию hub', /CACHE(?:_NAME|_STATIC|\s*)[^\n]*CW_VERSION/.test(source));
}

const hub = read('service-worker.js');
ok('hub worker отдаёт версию и release manifest', hub.includes("module: 'hub'") && hub.includes('release: self.CW_RELEASE'));
ok('hub worker импортирует release manifest', /importScripts\([^)]*release-manifest\.js/.test(hub));

console.log(failures ? `\nПровалов: ${failures}` : '\nUpdate contract согласован.');
process.exit(failures ? 1 : 0);
