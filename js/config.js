/* ==========================================================================
   إعدادات التطبيق — Supabase
   ─────────────────────────────────────────────────────────────────────────
   ⚠️  الأمان:
   • المفتاح المنشور (sb_publishable_...) آمن للتعريض في المتصفح — هذا هو
     الغرض منه، وحماية البيانات كلها مغطاة بسياسات RLS على مستوى القاعدة.
   • المفتاح السري (sb_secret_...) لا يُوضع هنا إطلاقاً ولا في أي ملف
     يُخدَم للمتصفح. مكانه الوحيد: متغيّرات بيئة دوال Supabase Edge.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  global.APP_CONFIG = {
    supabase: {
      url: 'https://evucpfkohggfvhywpwaq.supabase.co',
      publishableKey: 'sb_publishable_wnMsAcU1T80HK3eNnbpD-Q_kxw9g-dq'
    },

    tables: {
      profiles: 'profiles',
      categories: 'categories',
      notes: 'notes'
    },

    auth: {
      storageKey: 'mynotes.auth.v1',
      // مفتاح اختياري لتخزين الجلسات في localStorage (كلمة المرور لا تُخزَّن أبداً)
      persistSession: true,
      autoRefreshToken: true
    },

    app: {
      name: 'ملاحظاتي',
      version: '2.0.0',
      // الحد الأقصى لعدد الملاحظات التي تُحمَّل دفعةً واحدة
      pageSize: 500
    }
  };
})(window);
