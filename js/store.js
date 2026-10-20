/* ==========================================================================
   Store — طبقة البيانات فوق Supabase
   ─────────────────────────────────────────────────────────────────────────
   • المصادقة: Supabase Auth (تجزئة كلمة المرور على الخادم، لا تُخزَّن أبداً)
   • البيانات: جداول notes / categories / profiles مع حماية RLS
   • كل عملية كتابة تتركب على هوية المستخدم (auth.uid()) عبر سياسات RLS
   • لا يوجد أي تخزين محلي للبيانات — التخزين المحلي للإعدادات فقط
   ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.APP_CONFIG || {};
  const T = CFG.tables || {};
  const LS_SETTINGS = 'mynotes.settings.v1';

  /* ======================================================================
     الحالة
     ====================================================================== */
  const state = {
    user: null,        // مستخدم Supabase (session.user)
    session: null,     // جلسة Supabase
    profile: null,     // صف الملف الشخصي
    notes: [],         // نسخة في الذاكرة (مصدر العرض)
    categories: [],
    loading: false,
    configured: false,
    migrated: 0,
    lastError: null
  };

  let sb = null;

  /* ======================================================================
     أدوات
     ====================================================================== */
  function nowISO() { return new Date().toISOString(); }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function readLocalSettings() {
    try { return JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}; } catch (e) { return {}; }
  }
  function writeLocalSettings(obj) {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(obj)); } catch (e) {}
  }

  /** يحوّل صف قاعدة البيانات إلى نموذج التطبيق (camelCase) */
  function toApp(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title || '',
      body: row.body || '',
      tags: Array.isArray(row.tags) ? row.tags.slice() : [],
      color: row.color || '#6366f1',
      categoryId: row.category_id || null,
      pinned: !!row.pinned,
      favorite: !!row.favorite,
      archived: !!row.archived,
      trashed: !!row.trashed,
      deletedAt: row.deleted_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /** يحوّل نموذج التطبيق إلى صف قاعدة البيانات (snake_case) — حقول محددة فقط */
  function toRow(patch) {
    const row = {};
    const map = {
      title: 'title',
      body: 'body',
      color: 'color',
      pinned: 'pinned',
      favorite: 'favorite',
      archived: 'archived',
      trashed: 'trashed',
      deletedAt: 'deleted_at',
      categoryId: 'category_id'
    };
    Object.keys(map).forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(patch, k)) row[map[k]] = patch[k];
    });
    if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
      row.tags = (patch.tags || []).map((t) => String(t).slice(0, 40));
    }
    return row;
  }

  /** ترجمة أخطاء Supabase إلى رسائل عربية مفهومة */
  function translateError(err) {
    if (!err) return 'حدث خطأ غير متوقع.';
    const code = err.code || '';
    const msg = String(err.message || '').toLowerCase();

    if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
      return 'تم تجاوز حد إرسال رسائل البريد المؤقت. حاول بعد قليل.';
    }
    if (code === 'user_already_exists' || msg.includes('already registered') || msg.includes('already been registered')) {
      return 'هذا البريد مسجّل بالفعل. سجّل الدخول بدلاً من ذلك.';
    }
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
      return 'لم يتم تأكيد بريدك الإلكتروني بعد. افتح رسالة التأكيد التي أرسلناها.';
    }
    if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    }
    if (msg.includes('password should be at least')) {
      return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
    }
    if (msg.includes('email address') && msg.includes('invalid')) {
      return 'صيغة البريد الإلكتروني غير صحيحة.';
    }
    if (msg.includes('rate limit') && msg.includes('email')) {
      return 'تم تجاوز حد إرسال رسائل البريد. حاول بعد قليل.';
    }
    if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch')) {
      return 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.';
    }
    if (code === 'PGRST205' || msg.includes('could not find the table')) {
      return 'لم يتم إنشاء جداول قاعدة البيانات بعد. نفّذ ملف supabase-schema.sql في لوحة تحكم Supabase.';
    }
    if (code === '42501' || msg.includes('row-level security') || msg.includes('violates row-level security')) {
      return 'لا تملك صلاحية على هذه العملية.';
    }
    return err.message || 'حدث خطأ غير متوقع.';
  }

  /** خطأ مُغلّف يحمل كود reason لعرض رسالة دقيقة في الواجهة */
  function fail(reason, message) {
    const e = new Error(message || reason);
    e.reason = reason;
    return e;
  }

  function isNetworkError(err) {
    const m = String((err && err.message) || '').toLowerCase();
    return m.includes('fetch') || m.includes('network') || m.includes('timeout') || m.includes('failed to fetch');
  }

  /* ======================================================================
     تنظيف بيانات النسخة الأولى (localStorage)
     تنقل إعدادات العرض، وتُحذف بقية البيانات القديمة (كانت مشفّرة بمفتاح
     محلي لم يعد له معنى بعد التحويل إلى Supabase).
     ====================================================================== */
  function migrateLegacy() {
    try {
      let legacySettings = null;
      const stale = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('mynotes.v1.') !== 0) continue;
        if (k === 'mynotes.v1.settings') legacySettings = safeParse(localStorage.getItem(k), null);
        else stale.push(k);
      }
      stale.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });

      if (legacySettings) {
        const current = readLocalSettings();
        const merged = Object.assign({}, legacySettings, current);
        writeLocalSettings(merged);
      }
      // إعدادات النسخة الأولى استُخدمت — تُحذف أيضاً
      try { localStorage.removeItem('mynotes.v1.settings'); } catch (e) {}
      return stale.length;
    } catch (e) {
      if (global.console && console.warn) console.warn('[mynotes] تعذّر تنظيف بيانات النسخة الأولى:', e);
      return -1;
    }
  }

  /* ======================================================================
     تهيئة العميل
     ====================================================================== */
  function initClient() {
    const cfg = CFG.supabase || {};
    state.migrated = migrateLegacy();
    if (!global.supabase || !cfg.url || !cfg.publishableKey) {
      state.configured = false;
      return null;
    }
    try {
      sb = global.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: {
          persistSession: CFG.auth.persistSession !== false,
          autoRefreshToken: CFG.auth.autoRefreshToken !== false,
          detectSessionInUrl: true,
          storageKey: CFG.auth.storageKey || 'mynotes.auth.v1'
        },
        db: { schema: 'public' },
        global: { headers: { 'x-application-name': 'mynotes' } }
      });
      state.configured = true;
      return sb;
    } catch (e) {
      state.configured = false;
      return null;
    }
  }

  /* ======================================================================
     المصادقة
     ====================================================================== */
  async function register({ name, email, password }) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لم يتم إعداد الاتصال بقاعدة البيانات.');

    const { data, error } = await sb.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password: password,
      options: { data: { display_name: String(name || '').trim() } }
    });

    if (error) {
      const msg = translateError(error);
      const e = fail(mapAuthReason(error, msg), msg);
      throw e;
    }

    // بدون جلسة = Supabase يطلب تأكيد البريد
    const needsConfirmation = !data.session;
    if (data.session) {
      state.user = data.user;
      state.session = data.session;
      await loadData();          // تحميل الملف الشخصي والتصنيفات (فارغة للمستخدم الجديد)
    }
    return { user: data.user, session: data.session, needsConfirmation: needsConfirmation };
  }

  function mapAuthReason(error, msg) {
    const code = error.code || '';
    const m = String(error.message || '').toLowerCase();
    if (code === 'user_already_exists' || m.includes('already registered')) return 'EMAIL_EXISTS';
    if (code === 'email_not_confirmed' || m.includes('email not confirmed')) return 'NOT_CONFIRMED';
    if (code === 'invalid_credentials' || m.includes('invalid login credentials')) return 'BAD_PASSWORD';
    if (code === 'over_email_send_rate_limit') return 'EMAIL_RATE_LIMIT';
    if (m.includes('email rate limit') || (m.includes('rate limit') && m.includes('email'))) return 'EMAIL_RATE_LIMIT';
    if (isNetworkError(error)) return 'NETWORK';
    return 'AUTH_ERROR';
  }

  async function login({ email, password }) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لم يتم إعداد الاتصال بقاعدة البيانات.');

    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: password
    });

    if (error) {
      const msg = translateError(error);
      throw fail(mapAuthReason(error, msg), msg);
    }

    state.user = data.user;
    state.session = data.session;
    await loadData();
    return data.user;
  }

  async function resendConfirmation(email) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لم يتم إعداد الاتصال بقاعدة البيانات.');
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: String(email).trim().toLowerCase()
    });
    if (error) {
      const msg = translateError(error);
      throw fail(mapAuthReason(error, msg), msg);
    }
    return true;
  }

  async function logout() {
    if (sb) { try { await sb.auth.signOut(); } catch (e) {} }
    state.user = null;
    state.session = null;
    state.profile = null;
    state.notes = [];
    state.categories = [];
  }

  /** قفل التطبيق: يمسح الجلسة من المتصفح (يتطلب كلمة المرور للعودة) */
  async function lock() {
    if (sb) { try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} }
    state.user = null;
    state.session = null;
    state.notes = [];
    state.categories = [];
  }

  /* ======================================================================
     تحميل البيانات
     ====================================================================== */
  async function loadData() {
    if (!sb || !state.user) return;
    const uid = state.user.id;
    state.loading = true;

    try {
      const [notesRes, catsRes, profRes] = await Promise.all([
        sb.from(T.notes || 'notes')
          .select('*')
          .eq('user_id', uid)
          .order('updated_at', { ascending: false })
          .limit(CFG.app.pageSize),
        sb.from(T.categories || 'categories')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: true }),
        sb.from(T.profiles || 'profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle()
      ]);

      if (notesRes.error) throw fail(mapDbReason(notesRes.error), translateError(notesRes.error));
      if (catsRes.error) throw fail(mapDbReason(catsRes.error), translateError(catsRes.error));

      state.notes = (notesRes.data || []).map(toApp);
      state.categories = (catsRes.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        createdAt: c.created_at
      }));

      // الملف الشخصي: يُنشأ تلقائياً عبر trigger، لكن نضمن وجوده
      if (profRes.data) {
        state.profile = profRes.data;
      } else {
        const { data, error } = await sb.from(T.profiles || 'profiles').upsert({
          id: uid,
          display_name: (state.user.user_metadata && state.user.user_metadata.display_name) || '',
          theme: readLocalSettings().theme || 'light',
          layout: readLocalSettings().view || 'grid',
          sort_order: readLocalSettings().sort || 'updated'
        }, { onConflict: 'id' }).select().single();
        if (!error && data) state.profile = data;
      }
    } finally {
      state.loading = false;
    }
  }

  /* ======================================================================
     CRUD — الملاحظات
     ====================================================================== */
  async function createNote(data) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لا يوجد اتصال بقاعدة البيانات.');
    const payloadRow = toRow(data);
    payloadRow.user_id = state.user.id;

    // ملاحظة: .single() تُعيد صفاً واحداً ككائن (وليس مصفوفة)
    const { data: inserted, error } = await sb.from(T.notes || 'notes').insert(payloadRow).select().single();
    if (error) throw fail(mapDbReason(error), translateError(error));

    const note = toApp(inserted);
    if (!note) throw fail('DB_ERROR', 'تعذّر إنشاء الملاحظة.');
    state.notes.unshift(note);
    return note;
  }

  async function updateNote(id, patch) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لا يوجد اتصال بقاعدة البيانات.');

    const before = state.notes.find((n) => n.id === id);
    // تحديث متفائل في الذاكرة
    if (before) {
      state.notes = state.notes.map((n) => (n.id === id ? Object.assign({}, n, patch, { updatedAt: nowISO() }) : n));
    }

    const { data: updated, error } = await sb.from(T.notes || 'notes')
      .update(toRow(patch))
      .eq('id', id)
      .eq('user_id', state.user.id)
      .select()
      .single();

    if (error) {
      if (before) state.notes = state.notes.map((n) => (n.id === id ? before : n));   // تراجع
      throw fail(mapDbReason(error), translateError(error));
    }

    const note = toApp(updated);
    if (!note) throw fail('DB_ERROR', 'تعذّر تحديث الملاحظة.');
    state.notes = state.notes.map((n) => (n.id === id ? note : n));
    return note;
  }

  async function deleteNote(id) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لا يوجد اتصال بقاعدة البيانات.');

    const before = state.notes;
    state.notes = state.notes.filter((n) => n.id !== id);

    const { error } = await sb.from(T.notes || 'notes')
      .delete()
      .eq('id', id)
      .eq('user_id', state.user.id);

    if (error) {
      state.notes = before;   // تراجع
      throw fail(mapDbReason(error), translateError(error));
    }
    return true;
  }

  /** حذف مجموعة ملاحظات (استيراد) */
  async function insertNotes(list) {
    if (!sb || !list.length) return [];
    const rows = list.map((n) => {
      const row = toRow(n);
      row.user_id = state.user.id;
      return row;
    });
    const { data, error } = await sb.from(T.notes || 'notes').insert(rows).select();
    if (error) throw fail(mapDbReason(error), translateError(error));
    const notes = (data || []).map(toApp);
    state.notes = notes.concat(state.notes);
    return notes;
  }

  /* ======================================================================
     CRUD — التصنيفات
     ====================================================================== */
  async function createCategory({ name, color }) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لا يوجد اتصال بقاعدة البيانات.');
    const { data: inserted, error } = await sb.from(T.categories || 'categories')
      .insert({ user_id: state.user.id, name: name, color: color || '#6366f1' })
      .select().single();
    if (error) throw fail(mapDbReason(error), translateError(error));
    const cat = { id: inserted.id, name: inserted.name, color: inserted.color, createdAt: inserted.created_at };
    state.categories.push(cat);
    return cat;
  }

  async function updateCategory(id, patch) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لا يوجد اتصال بقاعدة البيانات.');
    const row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.color !== undefined) row.color = patch.color;

    const { data: updated, error } = await sb.from(T.categories || 'categories')
      .update(row)
      .eq('id', id)
      .eq('user_id', state.user.id)
      .select().single();
    if (error) throw fail(mapDbReason(error), translateError(error));

    const cat = { id: updated.id, name: updated.name, color: updated.color, createdAt: updated.created_at };
    state.categories = state.categories.map((c) => (c.id === id ? cat : c));
    return cat;
  }

  async function deleteCategory(id) {
    if (!sb) throw fail('NOT_CONFIGURED', 'لا يوجد اتصال بقاعدة البيانات.');
    const before = state.categories;
    state.categories = state.categories.filter((c) => c.id !== id);

    const { error } = await sb.from(T.categories || 'categories')
      .delete()
      .eq('id', id)
      .eq('user_id', state.user.id);
    if (error) {
      state.categories = before;
      throw fail(mapDbReason(error), translateError(error));
    }
    //_notes_ تُفقد تصنيفها تلقائياً عبر ON DELETE SET NULL
    state.notes = state.notes.map((n) => (n.categoryId === id ? Object.assign({}, n, { categoryId: null }) : n));
    return true;
  }

  /* ======================================================================
     الملف الشخصي والإعدادات
     ====================================================================== */
  async function updateProfile(patch) {
    if (!sb || !state.user) return null;
    const row = {};
    if (patch.display_name !== undefined) row.display_name = patch.display_name;
    if (patch.theme !== undefined) row.theme = patch.theme;
    if (patch.layout !== undefined) row.layout = patch.layout;
    if (patch.sort !== undefined) row.sort_order = patch.sort;

    const { data, error } = await sb.from(T.profiles || 'profiles')
      .upsert(Object.assign({ id: state.user.id }, row), { onConflict: 'id' })
      .select().single();
    if (error) throw fail(mapDbReason(error), translateError(error));
    state.profile = data;
    return data;
  }

  function getSettings() {
    const local = readLocalSettings();
    return Object.assign({ theme: null, view: 'grid', sort: 'updated' }, local);
  }

  /** يحفظ الإعدادات محلياً (فوري) ويزامنها مع السحابة (لاحقاً) */
  function saveSettings(patch) {
    const next = Object.assign(getSettings(), patch || {});
    writeLocalSettings(next);
    if (state.user) {
      const remote = {};
      if (patch.theme !== undefined) remote.theme = patch.theme;
      if (patch.view !== undefined) remote.layout = patch.view;
      if (patch.sort !== undefined) remote.sort = patch.sort;
      if (Object.keys(remote).length) {
        sb.from(T.profiles || 'profiles')
          .upsert(Object.assign({ id: state.user.id }, remote), { onConflict: 'id' })
          .then(({ error }) => { if (error) console.warn('تعذّرت مزامنة الإعدادات:', error.message); })
          .catch(() => {});
      }
    }
    return next;
  }

  function mapDbReason(error) {
    const code = error.code || '';
    const m = String(error.message || '').toLowerCase();
    if (code === 'PGRST205' || m.includes('could not find the table')) return 'NO_TABLES';
    if (code === '42501' || m.includes('row-level security')) return 'FORBIDDEN';
    if (isNetworkError(error)) return 'NETWORK';
    if (code === '23505' || m.includes('duplicate key')) return 'DUPLICATE';
    if (code === '23503' || m.includes('foreign key')) return 'FK_ERROR';
    return 'DB_ERROR';
  }

  /* ======================================================================
     التصدير والاستيراد
     ====================================================================== */
  function exportData() {
    return JSON.stringify({
      app: 'ملاحظاتي',
      version: 2,
      exportedAt: nowISO(),
      user: { name: displayName(), email: state.user ? state.user.email : '' },
      categories: state.categories,
      notes: state.notes
    }, null, 2);
  }

  async function importData(json) {
    const data = (function () { try { return JSON.parse(json); } catch (e) { return null; } })();
    if (!data || !Array.isArray(data.notes)) throw fail('BAD_FILE', 'الملف غير صالح.');

    const incoming = data.notes.map((n) => ({
      title: String(n.title || '').slice(0, 140),
      body: String(n.body || ''),
      tags: Array.isArray(n.tags) ? n.tags.slice(0, 20) : [],
      color: n.color || '#6366f1',
      categoryId: null,
      pinned: !!n.pinned,
      favorite: !!n.favorite,
      archived: !!n.archived,
      trashed: false
    }));

    await insertNotes(incoming);

    if (Array.isArray(data.categories) && data.categories.length) {
      for (const c of data.categories) {
        if (!c || !c.name) continue;
        try { await createCategory({ name: String(c.name).slice(0, 60), color: c.color || '#6366f1' }); } catch (e) {}
      }
    }
    return incoming.length;
  }

  function displayName() {
    if (state.profile && state.profile.display_name) return state.profile.display_name;
    if (state.user && state.user.user_metadata && state.user.user_metadata.display_name) return state.user.user_metadata.display_name;
    if (state.user && state.user.email) return state.user.email.split('@')[0];
    return 'مستخدم';
  }

  /* ======================================================================
     واجهة Store
     ====================================================================== */
  const Store = {
    get user() { return state.user; },
    get session() { return state.session; },
    get profile() { return state.profile; },
    get notes() { return state.notes; },
    get categories() { return state.categories; },
    get loading() { return state.loading; },
    get configured() { return state.configured; },
    get migrated() { return state.migrated; },
    get displayName() { return displayName(); },
    get client() { return sb; },

    init() {
      initClient();
      if (sb) {
        // تحديث الجلسة تلقائياً عند تغيّرها
        sb.auth.onAuthStateChange((event, session) => {
          state.session = session;
          if (session && session.user) state.user = session.user;
          if (event === 'SIGNED_OUT') {
            state.user = null;
            state.session = null;
            state.notes = [];
            state.categories = [];
          }
        });
      }
      return !!sb;
    },

    /** إقلاع التطبيق: يستعيد الجلسة الحالية إن وُجدت */
    async boot() {
      if (!sb) return { configured: false, locked: false, user: null };

      const { data, error } = await sb.auth.getSession();
      if (error || !data.session || !data.session.user) {
        return { configured: true, locked: false, user: null };
      }

      state.user = data.session.user;
      state.session = data.session;

      try {
        await loadData();
      } catch (e) {
        // الجداول غير موجودة بعد → نُبلغ الواجهة بدل الفشل الصامت
        return { configured: true, locked: false, user: state.user, error: e, noTables: e.reason === 'NO_TABLES' };
      }
      return { configured: true, locked: false, user: state.user };
    },

    register,
    login,
    logout,
    lock,
    resendConfirmation,

    loadData,
    createNote,
    updateNote,
    deleteNote,
    insertNotes,
    createCategory,
    updateCategory,
    deleteCategory,
    updateProfile,

    getSettings,
    saveSettings,
    exportData,
    importData,

    translateError,
    now: nowISO,
    newId: function () { return 'tmp_' + Math.random().toString(36).slice(2); }
  };

  global.Store = Store;
})(window);
