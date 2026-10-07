#!/usr/bin/env node
/**
 * Circuit Workspace — scripts/check-owa-url.mjs
 *
 * Ссылка OWA в настройках Клиндария (аудит 03, H-1): принимается только https:.
 * Настройки приезжают и из импортированной копии, поэтому `javascript:` и любая
 * другая схема не должны дойти до window.open() в том же origin.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'circuit-planner/app.js'), 'utf8');
let failed = 0;
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) failed++; };

const m = src.match(/owaBase\(v\) \{[^\n]*\},\n/);
ok('функция owaBase найдена', !!m);
if (m) {
  const { owaBase } = vm.runInNewContext('({ ' + m[0].replace(/,\n$/, '') + ' })', { URL, String });
  const DEF = 'https://outlook.office.com/mail/deeplink/compose';
  ok('https принимается', owaBase('https://outlook.live.com/mail/deeplink/compose') === 'https://outlook.live.com/mail/deeplink/compose');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com', 'ftp://x', 'не ссылка', '', null, undefined, '  javascript:1  ']) {
    ok('отклонено: ' + JSON.stringify(bad), owaBase(bad) === DEF);
  }
}
ok('адрес для окна письма берётся через owaBase', /const base = App\.utils\.owaBase\(App\.state\.app\.settings\.owaUrl\)/.test(src));
ok('окно OWA открывается с noopener', /window\.open\(url, '_blank', 'noopener'\)/.test(src));
ok('настройки при загрузке проходят через owaBase', /out\.owaUrl = App\.utils\.owaBase\(out\.owaUrl\)/.test(src));

if (failed) { console.error('\nПровалено: ' + failed); process.exit(1); }
console.log('\nOWA: только https — ок');
