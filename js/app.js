/* ==========================================================================
   ملاحظاتي — منطق التطبيق
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     الحالة العامة
     ====================================================================== */
  const COLORS = [
    { hex: '#6366f1' }, { hex: '#a855f7' }, { hex: '#f43f5e' }, { hex: '#f59e0b' },
    { hex: '#10b981' }, { hex: '#06b6d4' }, { hex: '#3b82f6' }, { hex: '#64748b' }
  ];

  const UI = {
    mode: 'login',
    view: 'all',           // all | pinned | favorite | archive | trash | category
    categoryId: null,
    query: '',
    sort: 'updated',
    layout: 'grid',
    editingId: null,
    editingTags: [],
    editingColor: COLORS[0].hex,
    editingPinned: false,
    editingFavorite: false,
    editingArchived: false
  };

  const VIEW_TITLES = {
    all: 'كل الملاحظات',
    pinned: 'الملاحظات المثبّتة',
    favorite: 'الملاحظات المفضّلة',
    archive: 'الأرشيف',
    trash: 'سلة المحذوفات',
    category: 'التصنيف'
  };

  /* ======================================================================
     مراجع DOM
     ====================================================================== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const el = {
    authScreen: $('#authScreen'),
    appScreen: $('#appScreen'),
    authForm: $('#authForm'),
    tabs: $('.tabs'),
    tabLogin: $('#tabLogin'),
    tabRegister: $('#tabRegister'),
    nameField: $('#nameField'),
    confirmField: $('#confirmField'),
    fullName: $('#fullName'),
    email: $('#email'),
    password: $('#password'),
    confirmPassword: $('#confirmPassword'),
    rememberMe: $('#rememberMe'),
    formAlert: $('#formAlert'),
    submitBtn: $('#submitBtn'),
    switchHint: $('#switchHint'),
    strengthBox: $('#strengthBox'),
    strengthFill: $('#strengthFill'),
    strengthText: $('#strengthText'),
    configWarning: $('#configWarning'),
    configWarningText: $('#configWarningText'),
    verifyPanel: $('#verifyPanel'),
    verifyTitle: $('#verifyTitle'),
    verifyText: $('#verifyText'),
    verifyMail: $('#verifyMail'),
    resendBtn: $('#resendBtn'),
    backToLoginBtn: $('#backToLoginBtn'),

    sidebar: $('#sidebar'),
    sidebarScrim: $('#sidebarScrim'),
    menuBtn: $('#menuBtn'),
    sidebarClose: $('#sidebarClose'),
    navList: $('#navList'),
    categoryList: $('#categoryList'),
    addCategoryBtn: $('#addCategoryBtn'),
    newNoteBtn: $('#newNoteBtn'),
    fabBtn: $('#fabBtn'),
    emptyActionBtn: $('#emptyActionBtn'),

    searchInput: $('#searchInput'),
    clearSearch: $('#clearSearch'),
    sortSelect: $('#sortSelect'),
    themeBtn: $('#themeBtn'),
    moreBtn: $('#moreBtn'),
    moreMenu: $('#moreMenu'),
    importFile: $('#importFile'),

    viewTitle: $('#viewTitle'),
    viewMeta: $('#viewMeta'),
    headChips: $('#headChips'),
    notesGrid: $('#notesGrid'),
    emptyState: $('#emptyState'),
    emptyTitle: $('#emptyTitle'),
    emptyText: $('#emptyText'),

    userName: $('#userName'),
    userEmail: $('#userEmail'),
    userAvatar: $('#userAvatar'),
    logoutBtn: $('#logoutBtn'),
    storageText: $('#storageText'),
    storageFill: $('#storageFill'),

    editorRoot: $('#editorRoot'),
    editorTitle: $('#editorTitle'),
    editorDot: $('#editorDot'),
    editorPinBtn: $('#editorPinBtn'),
    editorFavBtn: $('#editorFavBtn'),
    editorArchiveBtn: $('#editorArchiveBtn'),
    editorDeleteBtn: $('#editorDeleteBtn'),
    editorCloseBtn: $('#editorCloseBtn'),
    noteTitle: $('#noteTitle'),
    noteBody: $('#noteBody'),
    noteCategory: $('#noteCategory'),
    noteTags: $('#noteTags'),
    tagsChips: $('#tagsChips'),
    tagsBox: $('#tagsBox'),
    palette: $('#palette'),
    editorStatus: $('#editorStatus'),
    saveNoteBtn: $('#saveNoteBtn'),

    confirmRoot: $('#confirmRoot'),
    confirmTitle: $('#confirmTitle'),
    confirmText: $('#confirmText'),
    confirmOkBtn: $('#confirmOkBtn'),
    confirmIcon: $('#confirmIcon'),

    promptRoot: $('#promptRoot'),
    promptTitle: $('#promptTitle'),
    promptText: $('#promptText'),
    promptInput: $('#promptInput'),
    promptError: $('#promptError'),
    promptOkBtn: $('#promptOkBtn'),

    toasts: $('#toasts')
  };

  /* ======================================================================
     أدوات مساعدة
     ====================================================================== */
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]); }

  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp('(' + safeQ + ')', 'gi'), '<mark>$1</mark>');
  }

  const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  function fmtDate(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
    if (diff < 604800) return rtf.format(-Math.floor(diff / 86400), 'day');
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }

  function words(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  /* ======================================================================
     التنبيهات (Toasts)
     ====================================================================== */
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.8 19a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L12 4Z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>'
  };

  function toast(message, type) {
    type = type || 'info';
    const node = document.createElement('div');
    node.className = 'toast ' + type;
    node.innerHTML = (ICONS[type] || ICONS.info) + '<span>' + esc(message) + '</span>';
    el.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 260);
    }, 3200);
  }

  /* ======================================================================
     المكوّنات: تأكيد / إدخال
     ====================================================================== */
  let confirmHandler = null;

  function askConfirm({ title, text, okText, danger }) {
    el.confirmTitle.textContent = title || 'تأكيد';
    el.confirmText.textContent = text || 'هل أنت متأكد؟';
    el.confirmOkBtn.textContent = okText || 'تأكيد';
    el.confirmIcon.className = 'confirm-icon ' + (danger === false ? 'info' : 'danger');
    el.confirmRoot.hidden = false;
    el.confirmOkBtn.focus();
    return new Promise((resolve) => { confirmHandler = resolve; });
  }

  function closeConfirm(result) {
    el.confirmRoot.hidden = true;
    const fn = confirmHandler;
    confirmHandler = null;
    if (fn) fn(result);
  }

  let promptHandler = null;

  function askPrompt({ title, text, value, placeholder, okText }) {
    el.promptTitle.textContent = title || '';
    el.promptText.textContent = text || '';
    el.promptText.hidden = !text;
    el.promptInput.value = value || '';
    el.promptInput.placeholder = placeholder || '';
    el.promptOkBtn.textContent = okText || 'حفظ';
    el.promptError.textContent = '';
    el.promptError.classList.remove('show');
    el.promptRoot.hidden = false;
    setTimeout(() => { el.promptInput.focus(); el.promptInput.select(); }, 60);
    return new Promise((resolve) => { promptHandler = resolve; });
  }

  function closePrompt(result) {
    el.promptRoot.hidden = true;
    const fn = promptHandler;
    promptHandler = null;
    if (fn) fn(result);
  }

  /* ======================================================================
     المصادقة
     ====================================================================== */
  function setMode(mode) {
    UI.mode = mode;
    showVerifyPanel(false);
    el.tabs.dataset.mode = mode;
    el.tabLogin.classList.toggle('is-active', mode === 'login');
    el.tabRegister.classList.toggle('is-active', mode === 'register');
    el.tabLogin.setAttribute('aria-selected', mode === 'login');
    el.tabRegister.setAttribute('aria-selected', mode === 'register');
    el.nameField.hidden = mode !== 'register';
    el.confirmField.hidden = mode !== 'register';
    el.strengthBox.hidden = mode !== 'register';
    el.password.setAttribute('autocomplete', mode === 'register' ? 'new-password' : 'current-password');
    $('.btn-label', el.submitBtn).textContent = mode === 'register' ? 'إنشاء الحساب' : 'تسجيل الدخول';
    el.switchHint.innerHTML = mode === 'register'
      ? 'لديك حساب بالفعل؟ <button type="button" class="link-btn" data-switch-mode="login">سجّل الدخول</button>'
      : 'ليس لديك حساب؟ <button type="button" class="link-btn" data-switch-mode="register">أنشئ حساباً جديداً</button>';
    clearFieldErrors();
    hideAlert();
  }

  /* ---- لوحة تأكيد البريد الإلكتروني ---- */
  function showVerifyPanel(show, email) {
    el.verifyPanel.hidden = !show;
    el.authForm.hidden = show;
    el.tabs.style.display = show ? 'none' : '';
    if (show) {
      el.verifyMail.textContent = email || el.email.value.trim();
      el.verifyTitle.textContent = 'تحقّق من بريدك الإلكتروني';
      el.verifyText.textContent = 'أرسلنا رابط تفعيل إلى بريدك. افتح الرابط لتفعيل الحساب ثم عد لتسجيل الدخول.';
    }
  }

  function showConfigWarning(message) {
    el.configWarningText.textContent = message;
    el.configWarning.hidden = false;
  }
  function hideConfigWarning() { el.configWarning.hidden = true; }

  function clearFieldErrors() {
    $$('.field-error').forEach((p) => { p.textContent = ''; p.classList.remove('show'); });
    $$('.input-wrap').forEach((w) => w.classList.remove('has-error'));
  }

  function fieldError(name, message) {
    const p = $('[data-error-for="' + name + '"]');
    if (p) { p.textContent = message; p.classList.add('show'); }
    const input = el[name];
    if (input && input.closest) {
      const wrap = input.closest('.input-wrap');
      if (wrap) wrap.classList.add('has-error');
    }
  }

  function showAlert(message, type) {
    el.formAlert.textContent = message;
    el.formAlert.dataset.type = type || 'error';
    el.formAlert.hidden = false;
  }
  function hideAlert() { el.formAlert.hidden = true; }

  function validateAuth() {
    clearFieldErrors();
    let ok = true;
    const email = el.email.value.trim();
    const pass = el.password.value;

    if (!email) { fieldError('email', 'الرجاء إدخال البريد الإلكتروني'); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldError('email', 'صيغة البريد الإلكتروني غير صحيحة'); ok = false; }

    if (!pass) { fieldError('password', 'الرجاء إدخال كلمة المرور'); ok = false; }
    else if (UI.mode === 'register' && pass.length < 8) {
      fieldError('password', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'); ok = false;
    }

    if (UI.mode === 'register') {
      const name = el.fullName.value.trim();
      if (!name) { fieldError('fullName', 'الرجاء إدخال الاسم'); ok = false; }
      else if (name.length < 2) { fieldError('fullName', 'الاسم قصير جداً'); ok = false; }
      if (pass !== el.confirmPassword.value) {
        fieldError('confirmPassword', 'كلمتا المرور غير متطابقتين'); ok = false;
      }
    }
    return ok;
  }

  function updateStrength() {
    const val = el.password.value;
    const score = strengthOf(val);
    const labels = ['', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية جداً'];
    const colors = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981'];
    el.strengthFill.style.width = (score / 4 * 100) + '%';
    el.strengthFill.style.background = colors[score] || colors[0];
    el.strengthText.textContent = val ? labels[score] : '—';
    el.strengthText.style.color = val ? (colors[score] || colors[0]) : '';
  }

  /** تقدير قوة كلمة المرور — مؤشر مساعدة للمستخدم فقط.
      (التجزئة الفعلية تتم على خوادم Supabase Auth) */
  function strengthOf(password) {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length < 6) score = Math.min(score, 1);
    return Math.min(score, 4);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    hideAlert();
    if (!validateAuth()) return;

    el.submitBtn.classList.add('loading');
    el.submitBtn.disabled = true;

    try {
      const email = el.email.value.trim();
      const password = el.password.value;

      if (UI.mode === 'register') {
        const res = await Store.register({
          name: el.fullName.value.trim(),
          email: email,
          password: password
        });

        if (res.needsConfirmation) {
          // Supabase يطلب تأكيد البريد قبل منح الجلسة
          showVerifyPanel(true, email);
          el.password.value = '';
          toast('أرسلنا رابط تفعيل إلى بريدك الإلكتروني', 'info');
          return;
        }
        toast('تم إنشاء حسابك بنجاح، أهلاً بك ' + Store.displayName, 'success');
      } else {
        await Store.login({ email: email, password: password });
        toast('مرحباً بعودتك، ' + Store.displayName, 'success');
      }

      el.authForm.reset();
      el.rememberMe.checked = true;
      await enterApp();
    } catch (err) {
      const reason = err && err.reason;
      const msg = err && err.message ? err.message : 'حدث خطأ غير متوقع. حاول مرة أخرى.';

      if (reason === 'EMAIL_EXISTS') {
        fieldError('email', 'هذا البريد مسجّل بالفعل');
        setMode('login');
        showAlert('يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك.');
      } else if (reason === 'BAD_PASSWORD') {
        fieldError('password', 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      } else if (reason === 'NOT_CONFIRMED') {
        showVerifyPanel(true, el.email.value.trim());
        showAlert('لم يتم تأكيد بريدك بعد. افتح رسالة التأكيد ثم أعد المحاولة.');
      } else if (reason === 'EMAIL_RATE_LIMIT') {
        showAlert('تم تجاوز حد إرسال رسائل البريد مؤقتاً. انتظر قليلاً ثم أعد المحاولة.');
      } else if (reason === 'NETWORK') {
        showAlert('تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.');
      } else if (reason === 'NO_TABLES') {
        showAlert('جداول قاعدة البيانات غير موجودة. نفّذ ملف supabase-schema.sql في لوحة تحكم Supabase.');
      } else {
        showAlert(msg);
      }
    } finally {
      el.submitBtn.classList.remove('loading');
      el.submitBtn.disabled = false;
    }
  }

  /* ======================================================================
     حالة العرض
     ====================================================================== */
  function baseNotes() {
    const all = Store.notes || [];
    switch (UI.view) {
      case 'pinned':   return all.filter((n) => n.pinned && !n.trashed && !n.archived);
      case 'favorite': return all.filter((n) => n.favorite && !n.trashed && !n.archived);
      case 'archive':  return all.filter((n) => n.archived && !n.trashed);
      case 'trash':    return all.filter((n) => n.trashed);
      case 'category': return all.filter((n) => n.categoryId === UI.categoryId && !n.trashed && !n.archived);
      default:         return all.filter((n) => !n.trashed && !n.archived);
    }
  }

  function visibleNotes() {
    let list = baseNotes();
    const q = UI.query.trim().toLowerCase();
    if (q) {
      list = list.filter((n) => {
        const hay = ((n.title || '') + ' ' + (n.body || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    const sorters = {
      updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
      created: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      oldest:  (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      title:   (a, b) => (a.title || '').localeCompare(b.title || '', 'ar')
    };
    list = list.slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return sorters[UI.sort](a, b);
    });
    return list;
  }

  /* ======================================================================
     العرض (Render)
     ====================================================================== */
  function renderCounts() {
    const all = Store.notes || [];
    const counts = {
      all: all.filter((n) => !n.trashed && !n.archived).length,
      pinned: all.filter((n) => n.pinned && !n.trashed && !n.archived).length,
      favorite: all.filter((n) => n.favorite && !n.trashed && !n.archived).length,
      archive: all.filter((n) => n.archived && !n.trashed).length,
      trash: all.filter((n) => n.trashed).length
    };
    Object.keys(counts).forEach((k) => {
      const node = $('[data-count="' + k + '"]');
      if (node) node.textContent = counts[k];
    });
  }

  function renderCategories() {
    const cats = Store.categories || [];
    const all = Store.notes || [];
    if (!cats.length) {
      el.categoryList.innerHTML = '<p style="padding:6px 11px;font-size:12.5px;color:var(--faint)">لا توجد تصنيفات بعد</p>';
      return;
    }
    el.categoryList.innerHTML = cats.map((c) => {
      const count = all.filter((n) => n.categoryId === c.id && !n.trashed && !n.archived).length;
      const active = UI.view === 'category' && UI.categoryId === c.id;
      return (
        '<div class="cat-item' + (active ? ' is-active' : '') + '" data-cat="' + esc(c.id) + '">' +
          '<span class="cat-dot" style="background:' + esc(c.color || '#6366f1') + '"></span>' +
          '<span class="cat-name">' + esc(c.name) + '</span>' +
          '<span class="count">' + count + '</span>' +
          '<span class="cat-actions">' +
            '<button class="icon-btn" data-cat-edit="' + esc(c.id) + '" aria-label="تعديل التصنيف"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6.5l3 3"/></svg></button>' +
            '<button class="icon-btn" data-cat-del="' + esc(c.id) + '" aria-label="حذف التصنيف"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.5"/></svg></button>' +
          '</span>' +
        '</div>'
      );
    }).join('');
  }

  function noteCardHtml(note) {
    const color = note.color || COLORS[0].hex;
    const tags = (note.tags || []).map((t) => '<span class="tag">#' + esc(t) + '</span>').join('');
    const cat = (Store.categories || []).find((c) => c.id === note.categoryId);
    const catChip = cat ? '<span class="tag cat">' + esc(cat.name) + '</span>' : '';
    const body = (note.body || '').length > 700 ? (note.body || '').slice(0, 700) + '…' : (note.body || '');
    const fav = note.favorite ? '<span class="fav-star"><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m12 20-1.6-1.5C6 14.9 3.2 12.4 3.2 9.3 3.2 6.8 5.2 5 7.6 5c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.4 0 4.4 1.8 4.4 4.3 0 3.1-2.8 5.6-7.2 9.2z"/></svg></span>' : '';
    const pin = note.pinned
      ? '<span class="pin-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-.7 5.2 3.2 2.4V13H6.5v-1.4l3.2-2.4z"/><path d="M12 13v7"/></svg></span>'
      : '';

    const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-.7 5.2 3.2 2.4V13H6.5v-1.4l3.2-2.4z"/><path d="M12 13v7"/></svg>';
    const ICON_FAV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 20-1.6-1.5C6 14.9 3.2 12.4 3.2 9.3 3.2 6.8 5.2 5 7.6 5c1.5 0 2.9.8 3.7 2 .8-1.2 2.2-2 3.7-2 2.4 0 4.4 1.8 4.4 4.3 0 3.1-2.8 5.6-7.2 9.2z"/></svg>';
    const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.5"/></svg>';
    const ICON_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h10.5a4.5 4.5 0 0 1 0 9H9"/><path d="m8 6.5-4 4.5 4 4.5"/></svg>';

    const actions = UI.view === 'trash'
      ? '<button class="icon-btn" data-act="restore" title="استعادة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h10.5a4.5 4.5 0 0 1 0 9H9"/><path d="m8 6.5-4 4.5 4 4.5"/></svg></button>' +
        '<button class="icon-btn danger" data-act="forever" title="حذف نهائي"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h16M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.5"/></svg></button>'
      : '<button class="icon-btn' + (note.pinned ? ' active' : '') + '" data-act="pin" title="تثبيت">' + ICON_PIN + '</button>' +
        '<button class="icon-btn' + (note.favorite ? ' active' : '') + '" data-act="fav" title="المفضلة">' + ICON_FAV + '</button>' +
        '<button class="icon-btn" data-act="del" title="نقل إلى سلة المحذوفات">' + ICON_DEL + '</button>';

    return (
      '<article class="note-card' + (note.pinned ? ' is-pinned' : '') + '" data-id="' + esc(note.id) + '" style="--note-color:' + esc(color) + '" tabindex="0">' +
        pin +
        '<div class="note-card-top">' +
          '<h3 class="note-title">' + (note.title ? highlight(note.title, UI.query) : '<span style="color:var(--faint);font-weight:600">بدون عنوان</span>') + '</h3>' +
          '<div class="note-card-actions">' + actions + '</div>' +
        '</div>' +
        '<p class="note-body">' + (body ? highlight(body, UI.query) : '<span style="color:var(--faint)">لا يوجد نص</span>') + '</p>' +
        '<div class="note-foot">' +
          '<div class="note-tags">' + catChip + tags + fav + '</div>' +
          '<span class="note-date">' + fmtDate(note.updatedAt) + '</span>' +
        '</div>' +
      '</article>'
    );
  }

  function renderNotes() {
    const list = visibleNotes();
    const q = UI.query.trim();

    el.notesGrid.innerHTML = list.map(noteCardHtml).join('');

    const isEmpty = list.length === 0;
    el.emptyState.hidden = !isEmpty;
    el.notesGrid.hidden = isEmpty;

    // العنوان
    let title = VIEW_TITLES[UI.view] || 'الملاحظات';
    if (UI.view === 'category') {
      const cat = (Store.categories || []).find((c) => c.id === UI.categoryId);
      title = cat ? cat.name : 'التصنيف';
    }
    el.viewTitle.textContent = q ? 'نتائج البحث' : title;

    // الوصف
    const totalWords = list.reduce((sum, n) => sum + words(n.body), 0);
    el.viewMeta.textContent = q
      ? list.length + ' نتيجة لـ «' + q + '»'
      : list.length + ' ملاحظة · ' + totalWords + ' كلمة';

    // الرقائق
    const chips = [];
    if (list.filter((n) => n.pinned).length) chips.push(list.filter((n) => n.pinned).length + ' مثبّتة');
    if (list.filter((n) => n.favorite).length) chips.push(list.filter((n) => n.favorite).length + ' مفضّلة');
    el.headChips.innerHTML = chips.map((c) => '<span class="head-chip">' + esc(c) + '</span>').join('');

    // الحالة الفارغة
    if (isEmpty) {
      if (q) {
        el.emptyTitle.textContent = 'لا توجد نتائج';
        el.emptyText.textContent = 'لم نعثر على أي ملاحظة تطابق «' + q + '». جرّب كلمات أخرى.';
        el.emptyActionBtn.hidden = true;
      } else if (UI.view === 'trash') {
        el.emptyTitle.textContent = 'سلة المحذوفات فارغة';
        el.emptyText.textContent = 'الملاحظات المحذوفة ستظهر هنا ويمكنك استعادتها في أي وقت.';
        el.emptyActionBtn.hidden = true;
      } else if (UI.view === 'archive') {
        el.emptyTitle.textContent = 'لا توجد ملاحظات مؤرشفة';
        el.emptyText.textContent = 'الأرشيف مكان للملاحظات القديمة التي لا تريدها في قائمتك الرئيسية.';
        el.emptyActionBtn.hidden = true;
      } else {
        el.emptyTitle.textContent = 'ابدأ بملاحظتك الأولى';
        el.emptyText.textContent = 'كل فكرة تستحق أن تُحفظ. أنشئ ملاحظة جديدة وابدأ بتنظيم أفكارك.';
        el.emptyActionBtn.hidden = false;
      }
    }

    renderCounts();
    renderCategories();
    updateStorage();
  }

  function updateStorage() {
    const count = (Store.notes || []).length;
    const online = !!Store.user;
    el.storageText.textContent = online ? count + ' ملاحظة' : 'غير متصل';
    const pct = Math.min(100, (count / 40) * 100);
    el.storageFill.style.width = (online ? Math.max(pct, 2) : 0) + '%';
  }

  function renderUser() {
    const u = Store.user;
    if (!u) return;
    el.userName.textContent = Store.displayName;
    el.userEmail.textContent = u.email;
    el.userAvatar.textContent = (Store.displayName || u.email).trim().charAt(0) || 'م';
  }

  /* ======================================================================
     المحرر
     ====================================================================== */
  function renderPalette() {
    el.palette.innerHTML = COLORS.map((c) =>
      '<button class="swatch' + (c.hex === UI.editingColor ? ' is-active' : '') + '" data-color="' + c.hex + '" style="background:' + c.hex + '" aria-label="لون"></button>'
    ).join('');
  }

  function renderTags() {
    el.tagsChips.innerHTML = UI.editingTags.map((t) =>
      '<span class="chip">' + esc(t) + '<button type="button" data-rm-tag="' + esc(t) + '" aria-label="حذف الوسم"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>'
    ).join('');
  }

  function renderCategoryOptions() {
    const cats = Store.categories || [];
    el.noteCategory.innerHTML = '<option value="">بدون تصنيف</option>' +
      cats.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
  }

  function updateEditorStatus() {
    const w = words(el.noteBody.value);
    const ch = el.noteBody.value.length;
    el.editorStatus.textContent = w + ' كلمة · ' + ch + ' حرف';
  }

  function syncEditorToggles() {
    el.editorPinBtn.classList.toggle('is-on', UI.editingPinned);
    el.editorFavBtn.classList.toggle('is-on', UI.editingFavorite);
    el.editorFavBtn.classList.toggle('fav-on', UI.editingFavorite);
    el.editorArchiveBtn.classList.toggle('is-on', UI.editingArchived);
  }

  function openEditor(noteId) {
    const note = noteId ? (Store.notes || []).find((n) => n.id === noteId) : null;
    UI.editingId = note ? note.id : null;

    if (note) {
      el.noteTitle.value = note.title || '';
      el.noteBody.value = note.body || '';
      UI.editingTags = (note.tags || []).slice();
      UI.editingColor = note.color || COLORS[0].hex;
      UI.editingPinned = !!note.pinned;
      UI.editingFavorite = !!note.favorite;
      UI.editingArchived = !!note.archived;
      el.editorTitle.textContent = 'تحرير الملاحظة';
      el.editorDeleteBtn.hidden = false;
    } else {
      el.noteTitle.value = '';
      el.noteBody.value = '';
      UI.editingTags = [];
      UI.editingColor = COLORS[0].hex;
      UI.editingPinned = false;
      UI.editingFavorite = false;
      UI.editingArchived = false;
      el.editorTitle.textContent = 'ملاحظة جديدة';
      el.editorDeleteBtn.hidden = true;
    }

    syncEditorToggles();
    renderPalette();
    renderTags();
    renderCategoryOptions();
    if (note && note.categoryId) el.noteCategory.value = note.categoryId;
    updateEditorStatus();

    el.editorRoot.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => el.noteTitle.focus(), 80);
  }

  function closeEditor() {
    el.editorRoot.hidden = true;
    UI.editingId = null;
    document.body.style.overflow = '';
  }

  async function saveNote() {
    const title = el.noteTitle.value.trim();
    const body = el.noteBody.value;
    const tags = UI.editingTags.slice();
    const color = UI.editingColor;
    const categoryId = el.noteCategory.value || null;
    const wasNew = !UI.editingId;

    if (!title && !body.trim() && !tags.length) {
      toast('الملاحظة فارغة — لم يتم الحفظ', 'warn');
      return;
    }

    const payload = {
      title: title, body: body, tags: tags, color: color, categoryId: categoryId,
      pinned: UI.editingPinned, favorite: UI.editingFavorite, archived: UI.editingArchived
    };

    el.saveNoteBtn.disabled = true;
    try {
      if (UI.editingId) {
        await Store.updateNote(UI.editingId, payload);
      } else {
        await Store.createNote(payload);
      }
      closeEditor();
      renderNotes();
      toast(wasNew ? 'تم إنشاء الملاحظة' : 'تم تحديث الملاحظة', 'success');
    } catch (err) {
      toast(err && err.message ? err.message : 'تعذّر حفظ الملاحظة', 'error');
    } finally {
      el.saveNoteBtn.disabled = false;
    }
  }

  async function togglePin(id) {
    const note = (Store.notes || []).find((n) => n.id === id);
    if (!note) return;
    try {
      await Store.updateNote(id, { pinned: !note.pinned });
      if (UI.editingId === id) { UI.editingPinned = !note.pinned; syncEditorToggles(); }
      renderNotes();
    } catch (err) {
      toast(err.message || 'تعذّر تحديث الملاحظة', 'error');
    }
  }

  async function toggleFav(id) {
    const note = (Store.notes || []).find((n) => n.id === id);
    if (!note) return;
    try {
      await Store.updateNote(id, { favorite: !note.favorite });
      if (UI.editingId === id) { UI.editingFavorite = !note.favorite; syncEditorToggles(); }
      renderNotes();
    } catch (err) {
      toast(err.message || 'تعذّر تحديث الملاحظة', 'error');
    }
  }

  async function trashNote(id) {
    try {
      await Store.updateNote(id, { trashed: true, deletedAt: Store.now() });
      if (UI.editingId === id) closeEditor();
      renderNotes();
      toast('نُقلت الملاحظة إلى سلة المحذوفات', 'info');
    } catch (err) {
      toast(err.message || 'تعذّر نقل الملاحظة', 'error');
    }
  }

  async function restoreNote(id) {
    try {
      await Store.updateNote(id, { trashed: false, deletedAt: null });
      renderNotes();
      toast('تمت استعادة الملاحظة', 'success');
    } catch (err) {
      toast(err.message || 'تعذّرت استعادة الملاحظة', 'error');
    }
  }

  async function deleteForever(id) {
    try {
      await Store.deleteNote(id);
      if (UI.editingId === id) closeEditor();
      renderNotes();
      toast('تم حذف الملاحظة نهائياً', 'info');
    } catch (err) {
      toast(err.message || 'تعذّر حذف الملاحظة', 'error');
    }
  }

  /* ======================================================================
     التصنيفات
     ====================================================================== */
  async function addCategory() {
    const name = await askPrompt({
      title: 'تصنيف جديد',
      text: 'اكتب اسم التصنيف الذي تريد تنظيم ملاحظاتك ضمنه.',
      placeholder: 'مثال: العمل',
      okText: 'إنشاء'
    });
    if (!name) return;
    const clean = String(name).trim();
    if (!clean) return;
    const color = COLORS[(Store.categories || []).length % COLORS.length].hex;
    try {
      await Store.createCategory({ name: clean, color: color });
      renderNotes();
      toast('تم إنشاء التصنيف «' + clean + '»', 'success');
    } catch (err) {
      toast(err.message || 'تعذّر إنشاء التصنيف', 'error');
    }
  }

  async function editCategory(id) {
    const cat = (Store.categories || []).find((c) => c.id === id);
    if (!cat) return;
    const name = await askPrompt({
      title: 'تعديل التصنيف',
      text: 'اختر الاسم الجديد لهذا التصنيف.',
      value: cat.name,
      okText: 'حفظ'
    });
    if (name === null) return;
    const clean = String(name).trim();
    if (!clean) return;
    try {
      await Store.updateCategory(id, { name: clean });
      renderNotes();
      toast('تم تحديث اسم التصنيف', 'success');
    } catch (err) {
      toast(err.message || 'تعذّر تحديث التصنيف', 'error');
    }
  }

  async function deleteCategory(id) {
    const cat = (Store.categories || []).find((c) => c.id === id);
    if (!cat) return;
    const count = (Store.notes || []).filter((n) => n.categoryId === id && !n.trashed).length;
    const ok = await askConfirm({
      title: 'حذف التصنيف',
      text: count
        ? 'سيتم حذف التصنيف «' + cat.name + '» وستبقى ' + count + ' ملاحظة بدون تصنيف.'
        : 'سيتم حذف التصنيف «' + cat.name + '».',
      okText: 'حذف'
    });
    if (!ok) return;
    try {
      await Store.deleteCategory(id);
      if (UI.view === 'category' && UI.categoryId === id) { UI.view = 'all'; UI.categoryId = null; }
      renderNotes();
      toast('تم حذف التصنيف', 'info');
    } catch (err) {
      toast(err.message || 'تعذّر حذف التصنيف', 'error');
    }
  }

  /* ======================================================================
     التصدير والاستيراد
     ====================================================================== */
  async function editProfileName() {
    const current = Store.displayName;
    const name = await askPrompt({
      title: 'تعديل الاسم المعروض',
      text: 'هذا الاسم يظهر في أعلى التطبيق فقط، ولا يغيّر بريدك الإلكتروني.',
      value: current,
      placeholder: 'اسمك',
      okText: 'حفظ'
    });
    if (name === null) return;
    const clean = String(name).trim();
    if (!clean) return;
    try {
      await Store.updateProfile({ display_name: clean });
      renderUser();
      toast('تم تحديث الاسم', 'success');
    } catch (err) {
      toast((err && err.message) || 'تعذّر تحديث الاسم', 'error');
    }
  }

  function exportData() {
    try {
      const blob = new Blob([Store.exportData()], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      a.href = url;
      a.download = 'mynotes-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('تم تصدير ملاحظاتك', 'success');
    } catch (e) {
      toast('تعذّر التصدير', 'error');
    }
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const count = await Store.importData(reader.result);
        renderNotes();
        toast('تم استيراد ' + count + ' ملاحظة', 'success');
      } catch (e) {
        toast((e && e.message) || 'الملف غير صالح', 'error');
      }
    };
    reader.onerror = () => toast('تعذّر قراءة الملف', 'error');
    reader.readAsText(file);
  }

  /* ======================================================================
     المظهر والإعدادات
     ====================================================================== */
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0d16' : '#4f46e5');
  }

  /** المظهر الافتراضي يتبع تفضيل النظام، ما لم يختار المستخدم غير ذلك */
  function systemTheme() {
    try {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyLayout(layout) {
    document.body.dataset.layout = layout;
    $$('.seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.layout === layout));
  }

  function setView(view, categoryId) {
    UI.view = view;
    UI.categoryId = categoryId || null;
    $$('.nav-item').forEach((a) => a.classList.toggle('is-active', a.dataset.view === view && !categoryId));
    renderNotes();
    closeSidebar();
  }

  /* ======================================================================
     الشريط الجانبي (موبايل)
     ====================================================================== */
  function openSidebar() {
    el.sidebar.classList.add('open');
    el.sidebarScrim.hidden = false;
  }
  function closeSidebar() {
    el.sidebar.classList.remove('open');
    el.sidebarScrim.hidden = true;
  }

  /* ======================================================================
     أحداث
     ====================================================================== */
  function bindEvents() {

    /* --- المصادقة --- */
    el.tabLogin.addEventListener('click', () => setMode('login'));
    el.tabRegister.addEventListener('click', () => setMode('register'));
    el.authForm.addEventListener('submit', handleAuthSubmit);
    el.password.addEventListener('input', updateStrength);

    /* --- تأكيد البريد --- */
    el.backToLoginBtn.addEventListener('click', () => {
      showVerifyPanel(false);
      setMode('login');
    });

    el.resendBtn.addEventListener('click', async () => {
      const email = el.verifyMail.textContent.trim();
      if (!email) return;
      el.resendBtn.disabled = true;
      const label = $('.btn-label', el.resendBtn) || el.resendBtn;
      const original = label.textContent;
      label.textContent = 'جارٍ الإرسال…';
      try {
        await Store.resendConfirmation(email);
        toast('تم إرسال رابط تفعيل جديد إلى ' + email, 'success');
      } catch (err) {
        toast((err && err.message) || 'تعذّر إرسال الرابط', 'error');
      } finally {
        el.resendBtn.disabled = false;
        label.textContent = original;
      }
    });

    document.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-switch-mode]');
      if (sw) { setMode(sw.dataset.switchMode); el.email.focus(); }
    });

    $$('[data-toggle-pass]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = $('#' + btn.dataset.togglePass);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        btn.style.color = show ? 'var(--brand-500)' : '';
      });
    });

    /* --- التنقل --- */
    el.navList.addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item');
      if (item) { setView(item.dataset.view); return; }
      const editBtn = e.target.closest('[data-cat-edit]');
      if (editBtn) { e.stopPropagation(); editCategory(editBtn.dataset.catEdit); return; }
      const delBtn = e.target.closest('[data-cat-del]');
      if (delBtn) { e.stopPropagation(); deleteCategory(delBtn.dataset.catDel); }
    });

    el.categoryList.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-cat-edit]');
      if (editBtn) { e.stopPropagation(); editCategory(editBtn.dataset.catEdit); return; }
      const delBtn = e.target.closest('[data-cat-del]');
      if (delBtn) { e.stopPropagation(); deleteCategory(delBtn.dataset.catDel); return; }
      const item = e.target.closest('.cat-item');
      if (item) setView('category', item.dataset.cat);
    });

    el.addCategoryBtn.addEventListener('click', addCategory);

    /* --- الملاحظات --- */
    el.notesGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.note-card');
      if (!card) return;
      const id = card.dataset.id;
      const actionBtn = e.target.closest('[data-act]');
      if (actionBtn) {
        e.stopPropagation();
        const act = actionBtn.dataset.act;
        if (act === 'pin') togglePin(id);
        else if (act === 'fav') toggleFav(id);
        else if (act === 'restore') restoreNote(id);
        else if (act === 'forever') {
          askConfirm({ title: 'حذف نهائي', text: 'سيتم حذف الملاحظة نهائياً ولا يمكن التراجع عن ذلك.', okText: 'حذف نهائي' })
            .then((ok) => { if (ok) deleteForever(id); });
        } else if (act === 'del') {
          trashNote(id);
        }
        return;
      }
      openEditor(id);
    });

    el.notesGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.note-card');
        if (card) { e.preventDefault(); openEditor(card.dataset.id); }
      }
    });

    el.newNoteBtn.addEventListener('click', () => openEditor(null));
    el.fabBtn.addEventListener('click', () => openEditor(null));
    el.emptyActionBtn.addEventListener('click', () => openEditor(null));

    /* --- المحرر --- */
    el.editorCloseBtn.addEventListener('click', closeEditor);
    $$('[data-close-editor]').forEach((b) => b.addEventListener('click', closeEditor));
    el.saveNoteBtn.addEventListener('click', saveNote);

    el.noteBody.addEventListener('input', updateEditorStatus);

    el.editorPinBtn.addEventListener('click', () => {
      UI.editingPinned = !UI.editingPinned;
      syncEditorToggles();
    });
    el.editorFavBtn.addEventListener('click', () => {
      UI.editingFavorite = !UI.editingFavorite;
      syncEditorToggles();
    });
    el.editorArchiveBtn.addEventListener('click', () => {
      UI.editingArchived = !UI.editingArchived;
      syncEditorToggles();
      toast(UI.editingArchived ? 'ستُؤرشف الملاحظة عند الحفظ' : 'ستعود الملاحظة إلى القائمة الرئيسية عند الحفظ', 'info');
    });
    el.editorDeleteBtn.addEventListener('click', () => {
      const id = UI.editingId;
      if (!id) return;
      askConfirm({ title: 'حذف الملاحظة', text: 'ستنتقل الملاحظة إلى سلة المحذوفات ويمكنك استعادتها لاحقاً.', okText: 'نقل إلى السلة' })
        .then((ok) => { if (ok) trashNote(id); });
    });

    el.palette.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-color]');
      if (!sw) return;
      UI.editingColor = sw.dataset.color;
      renderPalette();
    });

    el.noteTags.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const raw = el.noteTags.value.trim().replace(/^#/, '');
        if (!raw) return;
        if (UI.editingTags.indexOf(raw) === -1) UI.editingTags.push(raw);
        el.noteTags.value = '';
        renderTags();
      } else if (e.key === 'Backspace' && !el.noteTags.value && UI.editingTags.length) {
        UI.editingTags.pop();
        renderTags();
      }
    });

    el.tagsChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rm-tag]');
      if (!btn) return;
      UI.editingTags = UI.editingTags.filter((t) => t !== btn.dataset.rmTag);
      renderTags();
    });

    /* --- البحث --- */
    el.searchInput.addEventListener('input', () => {
      UI.query = el.searchInput.value;
      el.clearSearch.hidden = !UI.query;
      renderNotes();
    });
    el.clearSearch.addEventListener('click', () => {
      el.searchInput.value = '';
      UI.query = '';
      el.clearSearch.hidden = true;
      renderNotes();
      el.searchInput.focus();
    });

    /* --- العرض والترتيب --- */
    el.sortSelect.addEventListener('change', () => {
      UI.sort = el.sortSelect.value;
      Store.saveSettings({ sort: UI.sort });
      renderNotes();
    });

    $$('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        UI.layout = btn.dataset.layout;
        applyLayout(UI.layout);
        Store.saveSettings({ view: UI.layout });
      });
    });

    /* --- المظهر --- */
    el.themeBtn.addEventListener('click', () => {
      const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      Store.saveSettings({ theme: next });
    });

    /* --- قائمة المزيد --- */
    el.moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = el.moreMenu.hidden;
      el.moreMenu.hidden = !open;
      el.moreBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (!el.moreMenu.hidden && !e.target.closest('.menu-wrap')) {
        el.moreMenu.hidden = true;
        el.moreBtn.setAttribute('aria-expanded', 'false');
      }
    });
    el.moreMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      el.moreMenu.hidden = true;
      el.moreBtn.setAttribute('aria-expanded', 'false');
      const action = btn.dataset.action;
      if (action === 'export') exportData();
      else if (action === 'import') el.importFile.click();
      else if (action === 'lock') lockApp();
      else if (action === 'profile') editProfileName();
    });

    el.importFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    /* --- تسجيل الخروج --- */
    el.logoutBtn.addEventListener('click', async () => {
      const ok = await askConfirm({
        title: 'تسجيل الخروج',
        text: 'ستحتاج إلى كلمة المرور للدخول مرة أخرى. ملاحظاتك محفوظة بأمان في سحابة Supabase.',
        okText: 'تسجيل الخروج',
        danger: false
      });
      if (!ok) return;
      await Store.logout();
      closeEditor();
      el.appScreen.hidden = true;
      el.authScreen.hidden = false;
      setMode('login');
      el.authForm.reset();
      toast('تم تسجيل الخروج بنجاح', 'success');
    });

    /* --- الشريط الجانبي --- */
    el.menuBtn.addEventListener('click', openSidebar);
    el.sidebarClose.addEventListener('click', closeSidebar);
    el.sidebarScrim.addEventListener('click', closeSidebar);

    /* --- النوافذ --- */
    el.confirmOkBtn.addEventListener('click', () => closeConfirm(true));
    $$('[data-close-confirm]').forEach((b) => b.addEventListener('click', () => closeConfirm(false)));
    el.promptOkBtn.addEventListener('click', () => {
      const val = el.promptInput.value;
      if (!val.trim()) {
        el.promptError.textContent = 'الرجاء إدخال قيمة';
        el.promptError.classList.add('show');
        return;
      }
      closePrompt(val);
    });
    $$('[data-close-prompt]').forEach((b) => b.addEventListener('click', () => closePrompt(null)));
    el.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.promptOkBtn.click(); }
    });

    /* --- اختصارات لوحة المفاتيح --- */
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        if (!el.editorRoot.hidden) { closeEditor(); return; }
        if (!el.confirmRoot.hidden) { closeConfirm(false); return; }
        if (!el.promptRoot.hidden) { closePrompt(null); return; }
        if (!el.moreMenu.hidden) { el.moreMenu.hidden = true; return; }
        if (el.sidebar.classList.contains('open')) { closeSidebar(); return; }
      }

      if (mod && e.key.toLowerCase() === 's' && !el.editorRoot.hidden) {
        e.preventDefault();
        saveNote();
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        el.searchInput.focus();
        el.searchInput.select();
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (!el.appScreen.hidden) openEditor(null);
        return;
      }
      if (mod && e.key === 'Enter' && !el.editorRoot.hidden) {
        e.preventDefault();
        saveNote();
      }
    });
  }

  /* ======================================================================
     القفل والدخول
     ====================================================================== */
  async function lockApp() {
    const email = Store.user ? Store.user.email : '';
    await Store.lock();
    closeEditor();
    el.appScreen.hidden = true;
    el.authScreen.hidden = false;
    setMode('login');
    el.email.value = email;
    el.password.focus();
    toast('تم قفل التطبيق — أدخل كلمة المرور للمتابعة', 'info');
  }

  async function enterApp() {
    el.authScreen.hidden = true;
    el.appScreen.hidden = false;
    UI.view = 'all';
    UI.categoryId = null;
    UI.query = '';
    el.searchInput.value = '';
    el.clearSearch.hidden = true;
    $$('.nav-item').forEach((a) => a.classList.toggle('is-active', a.dataset.view === 'all'));
    renderUser();
    renderNotes();
    el.searchInput.focus();
  }

  /* ======================================================================
     الإقلاع
     ====================================================================== */
  async function init() {
    setMode('login');
    bindEvents();

    // تهيئة عميل Supabase
    const ok = Store.init();
    if (!ok) {
      showConfigWarning('تعذّر تحميل مكتبة Supabase أو إعدادات الاتصال. تحقّق من وجود اتصال بالإنترنت، ومن صحّة القيم في js/config.js.');
      el.submitBtn.disabled = true;
    }

    const settings = Store.getSettings();
    applyTheme(settings.theme || systemTheme());
    applyLayout(settings.view || 'grid');
    UI.sort = settings.sort || 'updated';
    el.sortSelect.value = UI.sort;

    if (!ok) return;

    // استعادة جلسة حالية إن وُجدت
    try {
      const res = await Store.boot();
      if (res && res.user) {
        if (res.noTables) {
          showConfigWarning('جداول قاعدة البيانات غير موجودة. نفّذ ملف supabase-schema.sql في لوحة تحكم Supabase (SQL Editor).');
        }
        if (res.error) {
          toast(res.error.message || 'تعذّر تحميل البيانات', 'error');
        }
        await enterApp();
      }
    } catch (e) {
      console.error(e);
      toast('تعذّر الاتصال بقاعدة البيانات', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
