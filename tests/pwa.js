/* اختبار طبقة التطبيق المثبَّت: البيان، الأيقونات، قائمة التخزين، وواجهة التثبيت.
   أهمّ فحص هنا: قائمة SHELL في sw.js **يجب** أن تغطي كل ما تحمّله index.html —
   ملف عالم جديد يُنسى فيها يعني لعبة مكسورة بلا إنترنت، وهو عطل صامت لا يظهر
   في أي اختبار آخر.
   الاستعمال: node pwa.js ../src */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = process.argv[2];
const errs = [];
let pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { errs.push('فحص فشل: ' + m); console.log('  ✗ ' + m); } };

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(SRC, f));

/* ===================== ١) البيان ===================== */
console.log('١) بيان التطبيق (manifest)');
ok(exists('manifest.webmanifest'), 'ملف البيان موجود');
let mf = null;
try { mf = JSON.parse(read('manifest.webmanifest')); ok(true, 'البيان JSON صالح'); }
catch (e) { ok(false, 'البيان JSON صالح — ' + e.message); }

if (mf) {
  ok(mf.name && mf.short_name, 'الاسم والاسم القصير موجودان');
  ok(mf.lang === 'ar' && mf.dir === 'rtl', 'اللغة عربية والاتجاه من اليمين');
  ok(mf.display === 'standalone', 'يُفتح كتطبيق مستقل لا كصفحة متصفح');
  ok(!!mf.start_url && !!mf.scope, 'نقطة البداية والنطاق محدَّدان');
  ok(/^#[0-9A-Fa-f]{6}$/.test(mf.background_color || '') && /^#[0-9A-Fa-f]{6}$/.test(mf.theme_color || ''),
    'ألوان الخلفية والسمة بصيغة صحيحة');
  /* لا كلمة إنجليزية في أي نص يراه المستخدم — قاعدة المشروع */
  const userText = [mf.name, mf.short_name, mf.description].join(' ');
  ok(!/[A-Za-z]/.test(userText), 'لا حرف لاتيني في نصوص البيان المعروضة');

  const sizes = (mf.icons || []).map(i => i.sizes);
  ok(sizes.includes('192x192') && sizes.includes('512x512'), 'مقاسا ١٩٢ و٥١٢ موجودان');
  ok((mf.icons || []).some(i => (i.purpose || '').includes('maskable')),
    'أيقونة maskable موجودة (أندرويد يقصّ الحواف دائريًا)');
}

/* ===================== ٢) ملفات الأيقونات ===================== */
console.log('\n٢) ملفات الأيقونات');
for (const ic of (mf && mf.icons) || []) {
  const p = path.join(SRC, ic.src);
  if (!fs.existsSync(p)) { ok(false, `${ic.src} موجود`); continue; }
  const b = fs.readFileSync(p);
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const want = parseInt(ic.sizes.split('x')[0], 10);
  ok(isPng && w === want && h === want && w === h,
    `${ic.src}: PNG مربّع ${w}×${h} كما يعلن البيان`);
}

/* ===================== ٣) قائمة التخزين تطابق الواقع ===================== */
console.log('\n٣) قائمة التخزين في عامل الخدمة');
const swSrc = read('sw.js');
const pwaSrc = read('pwa.js');
const shellMatch = swSrc.match(/const SHELL = \[([\s\S]*?)\];/);
ok(!!shellMatch, 'قائمة SHELL موجودة في sw.js');
const shell = shellMatch ? [...shellMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '')) : [];

const html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const links = [...html.matchAll(/(?:href|src)="((?:icon-[^"]+|manifest\.webmanifest))"/g)].map(m => m[1]);
const needed = [...new Set([...scripts, ...links, 'index.html'])];

const missing = needed.filter(f => !shell.includes(f));
ok(missing.length === 0,
  missing.length ? `ملفات تحمّلها الصفحة وغائبة عن SHELL: ${missing.join('، ')}` :
  `كل ما تحمّله الصفحة مخزَّن (${needed.length} ملفًا)`);

const ghosts = shell.filter(f => f !== '' && f !== './' && !exists(f));
ok(ghosts.length === 0,
  ghosts.length ? `أسماء في SHELL لا وجود لها على القرص: ${ghosts.join('، ')}` : 'لا اسم وهمي في SHELL');

/* الاسم قد يتغيّر مع اسم اللعبة، والمهم أن يحمل رقم نسخة يُرفَع مع كل تحديث */
ok(/const CACHE = '[a-z][a-z-]*-v\d+'/.test(swSrc), 'اسم المخزن يحمل رقم نسخة');
ok(swSrc.includes("caches.keys()") && swSrc.includes('caches.delete'),
  'التفعيل يحذف المخازن القديمة (وإلا تراكمت نسخ ميتة)');
ok(swSrc.split('message')[0].includes('self.skipWaiting()'),
  'التفعيل فوري — الانتظار كان يُبقي اللاعب على نسخة قديمة بلا مؤشّر');
ok(/fetch\(req,\s*\{\s*cache:\s*'reload'\s*\}\)/.test(swSrc),
  'طلب التنقّل يتجاوز تخزين المتصفح (max-age=600 كان يخدم صفحة قديمة)');
ok(pwaSrc.includes("dataset.screen === 'game'") && pwaSrc.includes('location.reload()'),
  'إعادة التحميل مؤجَّلة ما دامت جولة جارية');
ok(pwaSrc.includes('reg.update()') && pwaSrc.includes('visibilitychange'),
  'التحديث يُفحص عند كل فتح وعند العودة إلى التطبيق');
ok(swSrc.includes("req.mode === 'navigate'"), 'طلبات التنقّل لها مسار خاص (شبكة أولًا)');

/* ===================== ٤) الواجهة داخل المتصفح المحاكى ===================== */
console.log('\n٤) واجهة التثبيت والتحديث');
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.AudioContext = undefined; }
});
const { window } = dom, { document } = window;
for (const el of [...document.querySelectorAll('script[src]')])
  window.eval(fs.readFileSync(path.join(SRC, el.getAttribute('src')), 'utf8'));
window.eval('MAD.boot();');
const MAD = window.MAD;

ok(!!MAD.pwa, 'وحدة pwa مسجّلة على MAD');
ok(MAD.pwa.supported === false, 'بلا serviceWorker في البيئة ← تُعطَّل بهدوء لا بانهيار');
ok(!!document.getElementById('pwaMount'), 'موضع شريط التثبيت موجود في index.html');
ok(!document.querySelector('.pwa-bar'),
  'لا شريط يظهر قبل أن يعرض المتصفح التثبيت (لا إزعاج بلا سبب)');

/* نحاكي عرض المتصفح للتثبيت */
let prompted = false, choice = 'accepted';
MAD.pwa.deferredPrompt = { prompt(){ prompted = true; }, get userChoice(){ return Promise.resolve({ outcome: choice }); } };
MAD.pwa.renderMount();
const insBtn = document.getElementById('pwaInstall');
ok(!!insBtn, 'زر التثبيت يظهر بعد إتاحة المتصفح له');
ok(!/[A-Za-z]/.test(document.getElementById('pwaMount').textContent), 'نص شريط التثبيت عربي خالص');
insBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(prompted, 'الضغط يستدعي نافذة التثبيت من المتصفح');

/* نحاكي وصول تحديث */
let skipMsg = null;
MAD.pwa.updateReady = { postMessage(m){ skipMsg = m; } };
MAD.pwa.renderMount();
const upBtn = document.getElementById('pwaUpdate');
ok(!!upBtn, 'زر التحديث يظهر عند توفّر نسخة جديدة');
upBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(skipMsg === 'skipWaiting', 'الضغط يطلب من عامل الخدمة التفعيل الفوري');
ok(upBtn.disabled === true, 'الزر يُعطَّل بعد الضغط فلا يُضغط مرتين');

MAD.pwa.updateReady = null; MAD.pwa.deferredPrompt = null; MAD.pwa.renderMount();
ok(!document.querySelector('.pwa-bar'), 'الشريط يختفي بعد انتهاء سببه');

/* البيئة بلا matchMedia: يجب ألّا تنهار — كانت تنهار قبل الحراسة */
ok(typeof window.matchMedia !== 'function', 'البيئة المحاكاة فعلًا بلا matchMedia');
ok(MAD.pwa.isInstalled() === false, 'isInstalled تُجيب بهدوء بلا matchMedia بدل أن ترمي');

console.log(`\nفحوص ناجحة: ${pass}`);
if (errs.length) { console.log('\n=== أخطاء ===\n' + [...new Set(errs)].join('\n')); process.exit(1); }
console.log('صفر أخطاء في طبقة التثبيت.');
