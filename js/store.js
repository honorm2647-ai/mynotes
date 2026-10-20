/* ==========================================================================
   Store — طبقة البيانات (localStorage)
   - عزل كامل لكل مستخدم (مساحة مفاتيح منفصلة)
   - تشفير AES-GCM لمحتوى الملاحظات، المفتاح مُشتق من كلمة مرور المستخدم
   ========================================================================== */
(function (global) {
  'use strict';

  const NS = 'mynotes.v1';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const K = {
    users:     NS + '.users',            // سجل المستخدمين
    remember:  NS + '.remember',         // تذكّرني: userId + المفتاح المشفّر
    session:   NS + '.session',          // الجلسة الحالية (sessionStorage)
    settings:  NS + '.settings',         // إعدادات عامة (مظهر/عرض)
    user: (uid, part) => NS + '.u.' + uid + '.' + part
  };

  /* ---------- أدوات ---------- */
  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function readLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function removeLS(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function readSS(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function writeSS(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function removeSS(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return global.btoa(s);
  }
  function unb64(str) {
    const bin = global.atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function uid(prefix) {
    const bytes = new Uint8Array(9);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const rand = global.NoteCrypto ? global.NoteCrypto.toHex(bytes) : String(Date.now());
    return (prefix || 'id') + '_' + rand;
  }

  function now() { return new Date().toISOString(); }

  /* ---------- حالة داخلية ---------- */
  const state = {
    user: null,          // المستخدم الحالي
    aesKey: null,        // مفتاح تشفير المحتوى
    notes: [],
    categories: [],
    secure: false        // هل التشفير فعّال؟
  };

  /* ---------- المستخدمون ---------- */
  function loadUsers() { return safeParse(readLS(K.users), {}); }
  function saveUsers(map) { return writeLS(K.users, JSON.stringify(map)); }

  function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

  function findUserByEmail(email) {
    const map = loadUsers();
    const target = normalizeEmail(email);
    const found = Object.keys(map).find((id) => map[id].email === target);
    return found ? map[found] : null;
  }

  /* ---------- اشتقاق المفاتيح ---------- */
  function subtleOk() {
    return !!(global.crypto && global.crypto.subtle &&
      typeof global.crypto.subtle.deriveKey === 'function');
  }

  async function deriveAesKey(password, saltHex) {
    const salt = global.NoteCrypto.fromHex(saltHex);
    const keyMaterial = await global.crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return global.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 210000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,                       // قابل للتصدير (لحفظ "تذكّرني")
      ['encrypt', 'decrypt']
    );
  }

  async function importAesKey(rawB64) {
    return global.crypto.subtle.importKey(
      'raw', unb64(rawB64), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
  }

  async function exportAesKey(key) {
    return b64(await global.crypto.subtle.exportKey('raw', key));
  }

  /* ---------- تشفير المحتوى ---------- */
  async function encryptJSON(obj) {
    if (!state.secure || !state.aesKey) return { plain: JSON.stringify(obj) };
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const data = enc.encode(JSON.stringify(obj));
    const ct = await global.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, state.aesKey, data);
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function decryptJSON(record) {
    if (!record) return null;
    if (record.plain) return JSON.parse(record.plain);
    if (!state.aesKey) return null;
    try {
      const iv = unb64(record.iv);
      const ct = unb64(record.ct);
      const pt = await global.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, state.aesKey, ct);
      return JSON.parse(dec.decode(pt));
    } catch (e) {
      return null;
    }
  }

  async function writePart(uid, part, payload) {
    const record = await encryptJSON(payload);
    return writeLS(K.user(uid, part), JSON.stringify(record));
  }

  async function readPart(uid, part, fallback) {
    const raw = readLS(K.user(uid, part));
    if (!raw) return fallback;
    const record = safeParse(raw, null);
    if (!record) return fallback;
    const val = await decryptJSON(record);
    return val == null ? fallback : val;
  }

  /* ---------- جلسة العمل ---------- */
  function setSession(userId, remember) {
    removeSS(K.session);
    if (remember) {
      removeLS(K.session);
      writeLS(K.session, JSON.stringify({ userId: userId, t: now() }));
    } else {
      writeSS(K.session, JSON.stringify({ userId: userId, t: now() }));
    }
  }

  function getSession() {
    const ss = safeParse(readSS(K.session), null);
    if (ss && ss.userId) return ss;
    const ls = safeParse(readLS(K.session), null);
    if (ls && ls.userId) return ls;
    return null;
  }

  function clearSession() {
    removeSS(K.session);
    removeLS(K.session);
    removeLS(K.remember);
    state.user = null;
    state.aesKey = null;
    state.notes = [];
    state.categories = [];
    state.secure = false;
  }

  /* ---------- واجهة Store ---------- */
  const Store = {
    K,

    get user() { return state.user; },
    get secure() { return state.secure; },
    get notes() { return state.notes; },
    get categories() { return state.categories; },

    /* --- الإقلاع: استعادة جلسة محفوظة إن أمكن --- */
    async boot() {
      const session = getSession();
      if (!session) return null;

      const users = loadUsers();
      const user = users[session.userId];
      if (!user) { clearSession(); return null; }

      state.user = user;
      state.secure = subtleOk();

      if (state.secure) {
        const remember = safeParse(readLS(K.remember), null);
        if (remember && remember.userId === user.id && remember.key) {
          try {
            state.aesKey = await importAesKey(remember.key);
          } catch (e) {
            state.aesKey = null;
          }
        }
      }

      if (!state.aesKey && state.secure) {
        // الجلسة محفوظة لكن المفتاح غير متاح — نطلب كلمة المرور
        state.secure = false;
        return { locked: true, user: user };
      }

      await Store.loadData();
      return { locked: false, user: user };
    },

    /* --- تسجيل حساب جديد --- */
    async register({ name, email, password }, remember) {
      const mail = normalizeEmail(email);
      if (findUserByEmail(mail)) throw new Error('EMAIL_EXISTS');

      const salt = global.NoteCrypto.makeSalt();
      const derived = await global.NoteCrypto.derive(password, salt);

      const id = uid('u');
      const user = {
        id: id,
        name: String(name || '').trim() || mail.split('@')[0],
        email: mail,
        salt: salt,
        hash: derived.hash,
        algo: derived.algo,
        iterations: derived.iterations,
        keySalt: global.NoteCrypto.makeSalt(),
        createdAt: now(),
        lastLogin: now()
      };

      const users = loadUsers();
      users[id] = user;
      if (!saveUsers(users)) throw new Error('STORAGE_FULL');

      state.user = user;
      state.secure = subtleOk();
      if (state.secure) {
        state.aesKey = await deriveAesKey(password, user.keySalt);
        if (remember) {
          writeLS(K.remember, JSON.stringify({ userId: id, key: await exportAesKey(state.aesKey) }));
        }
      }
      state.notes = [];
      state.categories = [];
      await Store.loadData();
      setSession(id, remember);
      return user;
    },

    /* --- تسجيل الدخول --- */
    async login({ email, password }, remember) {
      const user = findUserByEmail(email);
      if (!user) throw new Error('NO_USER');

      const derived = await global.NoteCrypto.derive(password, user.salt, user.algo);
      if (derived.algo !== user.algo) throw new Error('CRYPTO_MISMATCH');
      if (!global.NoteCrypto.safeEqual(derived.hash, user.hash)) throw new Error('BAD_PASSWORD');

      state.user = user;
      state.secure = subtleOk();
      if (state.secure) {
        state.aesKey = await deriveAesKey(password, user.keySalt);
        if (remember) {
          writeLS(K.remember, JSON.stringify({ userId: user.id, key: await exportAesKey(state.aesKey) }));
        } else {
          removeLS(K.remember);
        }
      }

      user.lastLogin = now();
      const users = loadUsers();
      users[user.id] = user;
      saveUsers(users);

      await Store.loadData();
      setSession(user.id, remember);
      return user;
    },

    /* --- قفل التطبيق: محو المفتاح من الذاكرة --- */
    async lock() {
      removeSS(K.session);
      removeLS(K.session);
      removeLS(K.remember);
      state.aesKey = null;
      state.secure = false;
      state.notes = [];
      state.categories = [];
    },

    logout() { clearSession(); },

    /* --- تحميل/حفظ بيانات المستخدم --- */
    async loadData() {
      if (!state.user) return;
      const uid = state.user.id;
      const notes = await readPart(uid, 'notes', []);
      const cats = await readPart(uid, 'categories', []);
      state.notes = Array.isArray(notes) ? notes : [];
      state.categories = Array.isArray(cats) ? cats : [];
    },

    async saveNotes(notes) {
      state.notes = notes;
      if (!state.user) return false;
      return writePart(state.user.id, 'notes', notes);
    },

    async saveCategories(cats) {
      state.categories = cats;
      if (!state.user) return false;
      return writePart(state.user.id, 'categories', cats);
    },

    /* --- الإعدادات العامة --- */
    getSettings() {
      return Object.assign(
        { view: 'grid', sort: 'updated' },
        safeParse(readLS(K.settings), {})
      );
    },
    saveSettings(patch) {
      const next = Object.assign(Store.getSettings(), patch || {});
      writeLS(K.settings, JSON.stringify(next));
      return next;
    },

    /* --- تصدير / استيراد --- */
    exportData() {
      return JSON.stringify({
        app: 'ملاحظاتي',
        version: 1,
        exportedAt: now(),
        user: { name: state.user.name, email: state.user.email },
        categories: state.categories,
        notes: state.notes
      }, null, 2);
    },

    async importData(json) {
      const data = safeParse(json, null);
      if (!data || !Array.isArray(data.notes)) throw new Error('BAD_FILE');
      const existing = state.notes;
      const incoming = data.notes.map((n) => Object.assign({}, n, { id: n.id || uid('n') }));
      state.notes = existing.concat(incoming);
      await Store.saveNotes(state.notes);
      if (Array.isArray(data.categories) && data.categories.length) {
        state.categories = state.categories.concat(
          data.categories.map((c) => Object.assign({}, c, { id: c.id || uid('c') }))
        );
        await Store.saveCategories(state.categories);
      }
      return incoming.length;
    },

    /* --- تقدير حجم التخزين --- */
    usageBytes() {
      let total = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(NS)) total += key.length + (localStorage.getItem(key) || '').length;
        }
      } catch (e) {}
      return total * 2; // تقدير UTF-16
    },

    /* --- حذف حساب المستخدم وكل بياناته --- */
    async deleteAccount(password) {
      const user = state.user;
      if (!user) throw new Error('NO_USER');
      const derived = await global.NoteCrypto.derive(password, user.salt, user.algo);
      if (!global.NoteCrypto.safeEqual(derived.hash, user.hash)) throw new Error('BAD_PASSWORD');

      removeLS(K.user(user.id, 'notes'));
      removeLS(K.user(user.id, 'categories'));
      const users = loadUsers();
      delete users[user.id];
      saveUsers(users);
      clearSession();
      return true;
    },

    /* --- مساعدات --- */
    newId: uid,
    now
  };

  global.Store = Store;
})(window);
