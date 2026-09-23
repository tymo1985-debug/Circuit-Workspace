/**
 * Журнал — криптография защиты записей (J8).
 *
 * Только нативный Web Crypto, сторонних библиотек нет. Здесь нет доменной
 * логики Журнала и нет доступа к базе: только примитивы, формат и состояние
 * сессии в памяти. Что и когда шифровать, решает js/data.js.
 *
 * Иерархия ключей:
 *   парольная фраза → PBKDF2-HMAC-SHA256 (600 000, соль 16 байт) → KEK
 *   KEK → AES-256-GCM расшифровывает случайный DEK (32 байта)
 *   DEK → AES-256-GCM шифрует защищённый текст записей
 *
 * Хранится (journalMeta, `crypto:v1`): параметры KDF с солью и обёрнутый
 * DEK. НЕ хранится нигде: фраза, KEK, DEK в открытом виде. DEK в памяти —
 * неизвлекаемый CryptoKey; сырые байты затираются сразу после импорта
 * (по возможности — строки JavaScript затереть нельзя, и это не обещается).
 *
 * AAD: обёртка DEK — `cw-journal-dek|v1`; запись — `cw-journal-entry|v1|<id>`
 * (шифротекст чужой записи не проходит проверку). Изменяемые поля (status,
 * updatedAt, dueDate, archivedAt) в AAD не входят: смена метаданных не
 * требует перешифровки.
 *
 * Модель блокировки: при загрузке всегда заблокировано; ключ только в
 * памяти этой страницы; lock() роняет ссылку; `pagehide` — блокировка
 * (в том числе перед уходом в BFCache). Скрытие вкладки (`visibilitychange`)
 * НЕ блокирует — переключение приложений не должно ломать работу.
 */
(function (global) {
  'use strict';

  var VAULT_ID = 'crypto:v1';
  var KDF_ITERATIONS = 600000;
  var ITER_MIN = 100000;
  var ITER_MAX = 10000000;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var DEK_BYTES = 32;
  var TAG_BITS = 128;
  var DEK_AAD = 'cw-journal-dek|v1';
  var ENTRY_AAD = 'cw-journal-entry|v1|';
  var MIN_PASSPHRASE = 8;

  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8', { fatal: true });

  function subtle() {
    var c = global.crypto;
    if (!c || !c.subtle || typeof c.getRandomValues !== 'function') throw new Error('journal-crypto-unavailable');
    return c.subtle;
  }
  function randomBytes(n) {
    var b = new Uint8Array(n);
    global.crypto.getRandomValues(b);
    return b;
  }
  /** Best-effort: только для временных массивов байтов. */
  function wipe(bytes) { if (bytes && typeof bytes.fill === 'function') bytes.fill(0); }

  /* ─── base64url без дополнения, строго и канонично ───────────────────── */
  function b64u(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str) || str.length % 4 === 1) throw new Error('journal-crypto-bad-encoding');
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin;
    try { bin = atob(b64); } catch (e) { throw new Error('journal-crypto-bad-encoding'); }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    if (b64u(out) !== str) throw new Error('journal-crypto-bad-encoding'); // лишние биты хвоста
    return out;
  }
  function b64Len(str) { try { return unb64u(str).length; } catch (e) { return -1; } }

  function isPlainObject(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function onlyKeys(o, allowed) { return Object.keys(o).every(function (k) { return allowed.indexOf(k) !== -1; }); }

  /* ─── Проверка формы (без ключа: годится и для копии) ─────────────────── */

  /** Код ошибки или null. Лишние поля запрещены: в `sec` не должно
   *  оказаться ничего, кроме шифротекста и его параметров. */
  function validateSec(sec) {
    if (!isPlainObject(sec)) return 'journal-sec-malformed';
    if (sec.v !== 1) return 'journal-sec-unsupported-version';
    if (sec.alg !== 'AES-GCM') return 'journal-sec-unsupported-alg';
    if (!onlyKeys(sec, ['v', 'alg', 'iv', 'ct'])) return 'journal-sec-malformed';
    if (b64Len(sec.iv) !== IV_BYTES) return 'journal-sec-malformed';
    if (b64Len(sec.ct) < TAG_BITS / 8) return 'journal-sec-malformed';
    return null;
  }

  /** Код ошибки или null. Только крипто-материал, никакого текста. */
  function validateVault(meta) {
    if (!isPlainObject(meta) || meta.id !== VAULT_ID) return 'journal-vault-invalid';
    if (meta.v !== 1) return 'journal-vault-unsupported';
    if (!onlyKeys(meta, ['id', 'v', 'kdf', 'wrap', 'createdAt', 'changedAt'])) return 'journal-vault-invalid';
    var k = meta.kdf, w = meta.wrap;
    if (!isPlainObject(k) || !onlyKeys(k, ['alg', 'hash', 'iterations', 'salt'])) return 'journal-vault-invalid';
    if (k.alg !== 'PBKDF2' || k.hash !== 'SHA-256') return 'journal-vault-unsupported';
    if (typeof k.iterations !== 'number' || !Number.isInteger(k.iterations) || k.iterations < ITER_MIN || k.iterations > ITER_MAX) return 'journal-vault-invalid';
    var saltLen = b64Len(k.salt);
    if (saltLen < SALT_BYTES || saltLen > 64) return 'journal-vault-invalid';
    if (!isPlainObject(w) || !onlyKeys(w, ['alg', 'iv', 'ct'])) return 'journal-vault-invalid';
    if (w.alg !== 'AES-GCM') return 'journal-vault-unsupported';
    if (b64Len(w.iv) !== IV_BYTES || b64Len(w.ct) !== DEK_BYTES + TAG_BITS / 8) return 'journal-vault-invalid';
    if (meta.createdAt !== undefined && typeof meta.createdAt !== 'string') return 'journal-vault-invalid';
    if (meta.changedAt !== undefined && typeof meta.changedAt !== 'string') return 'journal-vault-invalid';
    return null;
  }

  function checkNewPassphrase(p) {
    if (typeof p !== 'string' || p.length < MIN_PASSPHRASE) throw new Error('journal-vault-weak-passphrase');
  }

  /* ─── Примитивы ─────────────────────────────────────────────────────── */
  async function deriveKek(passphrase, kdf) {
    if (typeof passphrase !== 'string' || !passphrase) throw new Error('journal-vault-unlock-failed');
    var pw = enc.encode(passphrase);
    try {
      var base = await subtle().importKey('raw', pw, { name: 'PBKDF2' }, false, ['deriveKey']);
      return await subtle().deriveKey(
        { name: 'PBKDF2', hash: kdf.hash, salt: unb64u(kdf.salt), iterations: kdf.iterations },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally { wipe(pw); }
  }
  async function seal(key, bytes, aad) {
    var iv = randomBytes(IV_BYTES);
    var ct = new Uint8Array(await subtle().encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad), tagLength: TAG_BITS }, key, bytes));
    return { iv: b64u(iv), ct: b64u(ct) };
  }
  async function unseal(key, iv, ct, aad, failCode) {
    var ivB, ctB;
    try { ivB = unb64u(iv); ctB = unb64u(ct); } catch (e) { throw new Error(failCode); }
    try {
      return new Uint8Array(await subtle().decrypt(
        { name: 'AES-GCM', iv: ivB, additionalData: enc.encode(aad), tagLength: TAG_BITS }, key, ctB));
    } catch (e) { throw new Error(failCode); }
  }
  function importDek(raw) {
    return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function unwrapRaw(meta, passphrase) {
    var bad = validateVault(meta);
    if (bad) throw new Error(bad);
    var kek = await deriveKek(passphrase, meta.kdf);
    var raw = await unseal(kek, meta.wrap.iv, meta.wrap.ct, DEK_AAD, 'journal-vault-unlock-failed');
    if (raw.length !== DEK_BYTES) { wipe(raw); throw new Error('journal-vault-invalid'); }
    return raw;
  }
  async function wrapRaw(raw, passphrase) {
    var kdf = { alg: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: b64u(randomBytes(SALT_BYTES)) };
    var kek = await deriveKek(passphrase, kdf);
    var w = await seal(kek, raw, DEK_AAD);
    return { kdf: kdf, wrap: { alg: 'AES-GCM', iv: w.iv, ct: w.ct } };
  }

  /* ─── Сейф ─────────────────────────────────────────────────────────── */

  /** Новый сейф: соль, KEK, случайный DEK, обёртка. Ничего не пишет. */
  async function createVault(passphrase) {
    checkNewPassphrase(passphrase);
    var raw = randomBytes(DEK_BYTES);
    try {
      var w = await wrapRaw(raw, passphrase);
      var key = await importDek(raw);
      return { meta: { id: VAULT_ID, v: 1, kdf: w.kdf, wrap: w.wrap, createdAt: new Date().toISOString() }, key: key };
    } finally { wipe(raw); }
  }

  /** Неверная фраза и подмена обёртки неразличимы: обе — отказ проверки. */
  async function openVault(meta, passphrase) {
    var raw = await unwrapRaw(meta, passphrase);
    try { return await importDek(raw); } finally { wipe(raw); }
  }

  /** Смена фразы: ТОТ ЖЕ DEK под новой солью и новым KEK. Записи не
   *  перешифровываются. Ничего не пишет — только новый объект метаданных. */
  async function rewrapVault(meta, oldPassphrase, newPassphrase) {
    checkNewPassphrase(newPassphrase);
    var raw = await unwrapRaw(meta, oldPassphrase);
    try {
      var w = await wrapRaw(raw, newPassphrase);
      return { id: VAULT_ID, v: 1, kdf: w.kdf, wrap: w.wrap, createdAt: meta.createdAt, changedAt: new Date().toISOString() };
    } finally { wipe(raw); }
  }

  /* ─── Записи ───────────────────────────────────────────────────────── */

  /** Полезная нагрузка — UTF-8 JSON ТОЛЬКО с защищаемыми полями записи;
   *  каждый вызов — новый случайный iv. */
  async function encryptEntry(key, entryId, payload) {
    if (!key) throw new Error('journal-vault-locked');
    if (typeof entryId !== 'string' || !entryId) throw new Error('journal-entry-not-found');
    var bytes = enc.encode(JSON.stringify(payload));
    try {
      var s = await seal(key, bytes, ENTRY_AAD + entryId);
      return { v: 1, alg: 'AES-GCM', iv: s.iv, ct: s.ct };
    } finally { wipe(bytes); }
  }

  /** Отказ проверки — исключение; «мусорного» текста не бывает. */
  async function decryptEntry(key, entryId, sec) {
    if (!key) throw new Error('journal-vault-locked');
    var bad = validateSec(sec);
    if (bad) throw new Error(bad);
    var bytes = await unseal(key, sec.iv, sec.ct, ENTRY_AAD + entryId, 'journal-sec-auth-failed');
    var obj;
    try { obj = JSON.parse(dec.decode(bytes)); } catch (e) { throw new Error('journal-sec-malformed'); } finally { wipe(bytes); }
    if (!isPlainObject(obj) || !Object.keys(obj).every(function (k) {
      return (k === 'title' || k === 'body') && typeof obj[k] === 'string';
    })) throw new Error('journal-sec-malformed');
    return obj;
  }

  /* ─── Сессия: только память этой страницы ────────────────────────────── */
  var state = { key: null, mark: null };
  var listeners = [];
  function emit(kind, reason) {
    listeners.slice().forEach(function (fn) { try { fn(kind, reason); } catch (e) { /* слушатель — не повод сорвать блокировку */ } });
  }
  var session = {
    isUnlocked: function () { return !!state.key; },
    key: function () { return state.key; },
    /** Отпечаток сейфа, от которого получен ключ (wrap.ct): замена сейфа
     *  (восстановление копии в другой вкладке) обнаруживается сравнением. */
    mark: function () { return state.mark; },
    open: function (key, mark) {
      if (!key || typeof mark !== 'string') throw new Error('journal-vault-invalid');
      state.key = key;
      state.mark = mark;
      emit('unlocked');
    },
    remark: function (mark) { if (state.key && typeof mark === 'string') state.mark = mark; },
    lock: function (reason) {
      var was = !!state.key;
      state.key = null;
      state.mark = null;
      if (was) emit('locked', reason || 'manual');
    },
    onChange: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
  };

  if (typeof global.addEventListener === 'function' && global.document) {
    global.addEventListener('pagehide', function () { session.lock('pagehide'); });
  }

  global.CWJournalCrypto = {
    VAULT_ID: VAULT_ID,
    KDF_ITERATIONS: KDF_ITERATIONS,
    MIN_PASSPHRASE: MIN_PASSPHRASE,
    validateSec: validateSec,
    validateVault: validateVault,
    createVault: createVault,
    openVault: openVault,
    rewrapVault: rewrapVault,
    encryptEntry: encryptEntry,
    decryptEntry: decryptEntry,
    b64u: b64u,
    unb64u: unb64u,
    session: session,
  };
})(typeof self !== 'undefined' ? self : globalThis);
