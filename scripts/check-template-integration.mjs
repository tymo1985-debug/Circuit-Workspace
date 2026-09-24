#!/usr/bin/env node
import assert from 'node:assert/strict';

globalThis.self = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };

const letters = await import('../congress-project/js/letters.js');
const state = await import('../congress-project/js/state.js');

assert.equal(
  letters.markup('**bold *italic*** and __under__'),
  '<strong>bold <em>italic</em></strong> and <u>under</u>',
  'nested Congress text markup must produce balanced HTML',
);

state.store.st = {
  settings: { font: 'Arial', fontSize: 17 },
  congresses: [],
  activeId: null,
};

const rows = {
  explicit: { id: 'explicit', context: 'custom', module: 'congress-project', format: 'text', translations: { uk: { body: 'EXPLICIT' } } },
  type: { id: 'type', context: 'congress.assignment.invitation:Talk', module: 'congress-project', format: 'text', translations: { uk: { body: 'TYPE' } } },
  common: { id: 'common', context: 'congress.assignment.invitation', module: 'congress-project', format: 'text', translations: { uk: { body: 'COMMON' } } },
};
globalThis.CWDocLang = { get: () => 'uk' };
globalThis.CWTemplates = {
  stored: true,
  get: id => rows[id] || null,
  text(key) {
    const row = rows[key] || Object.values(rows).find(x => x.context === key);
    if (!row) return null;
    return { id: row.id, body: row.translations.uk.body, lang: 'uk', format: row.format, custom: true };
  },
};

assert.equal(letters.pickTemplate({ type: 'Talk', letterTemplateId: 'explicit' }), 'EXPLICIT');
delete rows.explicit;
assert.equal(letters.pickTemplate({ type: 'Talk', letterTemplateId: 'explicit' }), 'TYPE', 'deleted explicit template must fall back to type-specific');
delete rows.type;
assert.equal(letters.pickTemplate({ type: 'Talk', letterTemplateId: 'explicit' }), 'COMMON', 'deleted explicit template must eventually fall back to common');

console.log('Template integration regression checks passed.');
