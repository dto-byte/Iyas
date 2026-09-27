/* =====================================================================
   إياس — عامل الخدمة (sw.js)
   يجعل اللعبة تعمل بلا إنترنت بعد أول زيارة، وقابلة للتثبيت على الهاتف.

   قاعدة التحديث: عند تغيير أي ملف في src/ **ارفع رقم CACHE**. وإلا بقي
   المتصفح يخدم النسخة القديمة من الذاكرة المؤقتة ولن يرى المستخدم تعديلك.
   ===================================================================== */
const CACHE = 'eyas-v1';

/* هيكل التطبيق: كل ما يلزم لتشغيل جلسة كاملة بلا شبكة */
const SHELL = [
  './',
  './index.html',
  './logo-data.js',
  './engine-core.js',
  './world-observation.js',
  './world-memory.js',
  './world-logic.js',
  './world-pattern.js',
  './world-focus.js',
  './progress.js',
  './pwa.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      /* addAll يفشل كليًا إن سقط ملف واحد — نخزّن كلًّا على حدة حتى لا
         يُفسد أصل واحد مفقود التثبيت بأكمله */
      Promise.all(SHELL.map(u => c.add(u).catch(err => {
        console.warn('تعذّر تخزين', u, err);
      })))
    )
  );
  /* لا نستدعي skipWaiting: التحديث يسري في الزيارة القادمة، فلا تنقطع
     جلسة جارية تحت أقدام اللاعب. pwa.js هو من يعرض عليه التحديث. */
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* pwa.js يطلب التفعيل الفوري حين يوافق اللاعب على التحديث */
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* طلبات التنقّل: الشبكة أولًا ليصل التحديث سريعًا، والمخزن احتياطًا
     حين لا شبكة — فلا تظهر صفحة "لا يوجد اتصال" أبدًا. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* بقية الأصول: المخزن أولًا (اللعبة كلها ملفات ساكنة)، ثم الشبكة.
     الخطوط من نطاق آخر تعود بـ"استجابة معتمة" — نخزّنها كما هي فهي
     كافية للعرض، ولا نستطيع فحص حالتها. */
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        const cacheable = res && (res.ok || res.type === 'opaque');
        if (cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        /* لا شبكة ولا نسخة مخزّنة: نُفشل الطلب بهدوء بدل رمي استثناء */
        return new Response('', { status: 504, statusText: 'غير متاح دون اتصال' });
      });
    })
  );
});
