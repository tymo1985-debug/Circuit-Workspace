/**
 * Circuit Workspace — scripts/lib/hub-source.mjs
 * Текст хаба «как одним файлом»: index.html, в который обратно вставлены
 * hub.css (вместо <link>) и hub.js (вместо <script src>).
 *
 * 24.10.2026 inline <style> и <script> хаба вынесены в файлы ради CSP. Проверки,
 * которые читали хаб регулярными выражениями или исполняли его скрипт в jsdom,
 * берут текст отсюда — так их утверждения о хабе остаются прежними, а не
 * расползаются на два файла в каждой проверке.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function hubSource(root) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'hub.css'), 'utf8');
  const js = readFileSync(join(root, 'hub.js'), 'utf8');
  const LINK = '<link rel="stylesheet" href="hub.css">';
  const SCRIPT = '<script src="hub.js"></script>';
  if (!html.includes(LINK) || !html.includes(SCRIPT)) {
    throw new Error('hub-source: в index.html нет подключения hub.css/hub.js');
  }
  return html.replace(LINK, () => '<style>\n' + css + '</style>').replace(SCRIPT, () => '<script>\n' + js + '</script>');
}
