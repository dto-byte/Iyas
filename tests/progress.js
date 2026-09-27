/* اختبار طبقة التقدّم: نموذج التخزين، السلسلة اليومية، الاتجاه، القصّ،
   والتعامل مع البيانات التالفة أو التخزين المحجوب.
   الاستعمال: node progress.js ../src */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = process.argv[2];
const errs = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errs.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'), {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.AudioContext = undefined; }
});
const { window } = dom, { document } = window;
for (const el of [...document.querySelectorAll('script[src]')])
  window.eval(fs.readFileSync(path.join(SRC, el.getAttribute('src')), 'utf8'));
window.eval('MAD.boot();');
const MAD = window.MAD;
const P = MAD.progress;

let pass = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { errs.push('فحص فشل: ' + msg); console.log('  ✗ ' + msg); } };
const clear = () => window.localStorage.removeItem(P.KEY);

/* أدوات بناء أيام اصطناعية */
const DAY = 86400000;
const at = (daysAgo, now) => now - daysAgo * DAY;
function daysFrom(offsets, now) {
  const days = {};
  offsets.forEach(o => { days[P.dayKey(at(o, now))] = 1; });
  return days;
}

console.log('١) نموذج التخزين');
clear();
ok(JSON.stringify(P.load()) === JSON.stringify({ v: 1, sessions: [], totals: {}, days: {} }),
  'التخزين الفارغ يُعيد بنية نظيفة');

const now = Date.now();
const s1 = { at: now, world: 'observation', diff: 2, xp: 120, accuracy: 78, avgReactMs: 1840, maxCombo: 3, rounds: 9, correct: 7, mistakes: 2 };
const r1 = P.recordSession(s1);
ok(r1.saved === true, 'الجلسة حُفظت فعليًا');
let d = P.load();
ok(d.sessions.length === 1 && d.sessions[0].xp === 120, 'الجلسة مقروءة بعد الحفظ');
ok(d.totals.observation.count === 1 && d.totals.observation.xp === 120 && d.totals.observation.bestXP === 120,
  'المجاميع التراكمية صحيحة');
ok(d.days[P.dayKey(now)] === 1, 'عدّاد اليوم زاد');

P.recordSession(Object.assign({}, s1, { xp: 90 }));
d = P.load();
ok(d.totals.observation.count === 2 && d.totals.observation.xp === 210, 'المجاميع تتراكم');
ok(d.totals.observation.bestXP === 120, 'أفضل خبرة لا تنخفض بجلسة أضعف');
ok(d.days[P.dayKey(now)] === 2, 'جلستان في اليوم نفسه تُحسبان يومًا واحدًا بعدّاد ٢');

console.log('\n٢) السلسلة اليومية');
ok(P.computeStreak({}, now).current === 0, 'لا سلسلة بلا أيام');
ok(P.computeStreak(daysFrom([0], now), now).current === 1, 'لعب اليوم فقط ← سلسلة ١');
ok(P.computeStreak(daysFrom([0, 1, 2], now), now).current === 3, 'ثلاثة أيام متصلة ← سلسلة ٣');
ok(P.computeStreak(daysFrom([0, 1, 3], now), now).current === 2, 'فجوة تقطع السلسلة عند حدّها');

const yOnly = P.computeStreak(daysFrom([1, 2], now), now);
ok(yOnly.current === 2 && yOnly.playedToday === false,
  'لم يلعب اليوم لكن لعب أمس ← السلسلة قائمة (٢) واليوم لم ينتهِ بعد');

const broken = P.computeStreak(daysFrom([2, 3, 4], now), now);
ok(broken.current === 0, 'انقطاع يومين كاملين ← السلسلة صفر');
ok(broken.longest === 3, 'أطول سلسلة تُحفظ بعد الانقطاع');

const twoRuns = P.computeStreak(daysFrom([0, 1, 5, 6, 7, 8], now), now);
ok(twoRuns.current === 2 && twoRuns.longest === 4, 'أطول سلسلة تاريخية أكبر من الحالية');
ok(twoRuns.activeDays === 6, 'عدد الأيام النشطة صحيح');

/* الحدّ الحرج: عبور منتصف الليل يجب أن يُحسب بالتوقيت المحلي لا UTC */
const localMidnightish = new Date(); localMidnightish.setHours(23, 50, 0, 0);
const tsLate = localMidnightish.getTime();
ok(P.dayKey(tsLate) === P.dayKey(localMidnightish.getTime() - 3600000),
  'مفتاح اليوم محلي: ١١:٥٠م و١٠:٥٠م في اليوم نفسه');

console.log('\n٣) الاتجاه');
const mk = (accs) => accs.map(a => ({ accuracy: a }));
ok(P.computeTrend(mk([70, 70, 70])) === null, 'عيّنة صغيرة ← لا اتجاه (null)');
ok(P.computeTrend(mk([50, 50, 50, 50, 50, 80, 80, 80, 80, 80])).dir === 'up', 'تحسّن واضح ← up');
ok(P.computeTrend(mk([80, 80, 80, 80, 80, 50, 50, 50, 50, 50])).dir === 'down', 'تراجع واضح ← down');
ok(P.computeTrend(mk([70, 70, 70, 70, 70, 71, 70, 70, 70, 70])).dir === 'flat', 'فرق ضئيل ← flat');

console.log('\n٤) القصّ والمتانة');
clear();
const many = P.MAX_SESSIONS + 30;
for (let i = 0; i < many; i++) P.recordSession(Object.assign({}, s1, { xp: i, at: now - (many - i) * 1000 }));
d = P.load();
ok(d.sessions.length === P.MAX_SESSIONS, `السجلّ التفصيلي مقصوص إلى ${P.MAX_SESSIONS}`);
ok(d.sessions[d.sessions.length - 1].xp === many - 1, 'القصّ يحفظ الأحدث لا الأقدم');
ok(d.totals.observation.count === many, 'المجاميع لا تُقَص — الإحصاء الكلي يبقى صحيحًا');
ok(d.totals.observation.bestXP === many - 1, 'أفضل خبرة تبقى صحيحة بعد القصّ');

window.localStorage.setItem(P.KEY, '{ هذا ليس JSON صالحًا');
const recovered = P.load();
ok(recovered.sessions.length === 0 && recovered.v === 1, 'بيانات تالفة ← بنية نظيفة بلا استثناء');

window.localStorage.setItem(P.KEY, JSON.stringify({ v: 1, sessions: 'ليست مصفوفة', totals: null }));
const coerced = P.load();
ok(Array.isArray(coerced.sessions) && typeof coerced.totals === 'object', 'حقول بأنواع خاطئة تُصحَّح');

console.log('\n٥) الترتيب الزمني (شرط لصحّة المنحنى والاتجاه)');
clear();
/* نكتب بترتيب معكوس عمدًا: الأحدث أولًا — كما يحدث عند زرع بيانات أو تغيّر ساعة النظام */
[0, 1, 2, 3, 4].forEach(ago => {
  P.recordSession(Object.assign({}, s1, { at: at(ago, now), accuracy: 50 + ago * 10 }));
});
d = P.load();
const times = d.sessions.map(x => x.at);
ok(times.every((t, i) => i === 0 || times[i - 1] <= t), 'القراءة تُعيد الجلسات مرتَّبة زمنيًا تصاعديًا');
ok(d.sessions[0].accuracy === 90 && d.sessions[d.sessions.length - 1].accuracy === 50,
  'أول عنصر هو الأقدم فعلًا وآخره الأحدث');

console.log('\n٦) التكامل مع المحرك');
clear();
ok(typeof MAD.addHook === 'function', 'المحرك يوفّر نظام خطّافات');
const mount = document.getElementById('streakMount');
ok(!!mount, 'موضع شريط السلسلة موجود في index.html');
MAD.showSetup();
ok(mount.innerHTML.includes('سجلّ التقدّم'), 'شريط السلسلة يُرسم عند عرض شاشة الإعداد');
ok(mount.textContent.includes('لم تبدأ سلسلتك بعد'), 'الحالة الفارغة معروضة بنص عربي صحيح');

/* المثنى لا يُسبق برقم. هذه النصوص تُركَّب يدويًا داخل HTML فلا يطالها
   فاحص lang.js — والعيب ظهر فعلًا كـ"سلسلة ٢ يومان" بعد إصلاح countedWith. */
(function dualFormsInStreak(){
  clear();
  const day = 86400000;
  [1, 0].forEach(ago => P.recordSession(Object.assign({}, s1, { at: Date.now() - ago * day })));
  MAD.showSetup();
  const txt = document.getElementById('streakMount').textContent.replace(/\s+/g, ' ');
  ok(txt.includes('سلسلة يومين'), `السلسلة تعرض المثنى بلا رقم: "${txt.slice(0, 60)}"`);
  ok(!/[٠-٩]\s*يوم(ان|ين)/.test(txt), 'لا رقم يسبق المثنى في شريط السلسلة');
  ok(txt.includes('جلستان'), 'عدّاد الجلسات يعرض المثنى بلا رقم');
  clear();
})();

const btn = document.getElementById('openProgress');
ok(!!btn, 'زر فتح سجلّ التقدّم موجود');
btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const screen = document.getElementById('screen-progress');
ok(screen.style.display === 'block' && document.getElementById('screen-setup').style.display === 'none',
  'فتح السجلّ يُظهر شاشته ويُخفي الإعداد');
ok(screen.textContent.includes('لا توجد جلسات مسجّلة بعد'), 'الحالة الفارغة لشاشة السجلّ');
document.getElementById('progBack').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(screen.style.display === 'none' && document.getElementById('screen-setup').style.display === 'block',
  'الرجوع يُعيد شاشة الإعداد');

/* سجلّ مليء: نتحقّق أن الشاشة تُبنى بكل أقسامها */
for (let i = 0; i < 12; i++) {
  P.recordSession({
    at: now - (11 - i) * DAY, world: MAD.WORLD_ORDER[i % MAD.WORLD_ORDER.length],
    diff: 2, xp: 80 + i * 6, accuracy: 55 + i * 3, avgReactMs: 2000 - i * 40,
    maxCombo: 2, rounds: 9, correct: 6, mistakes: 3
  });
}
document.getElementById('openProgress').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const txt = screen.textContent;
ok(txt.includes('سلسلة الأيام') && txt.includes('خريطة النشاط') && txt.includes('منحنى الدقة') && txt.includes('حسب العالم'),
  'كل أقسام الشاشة مبنية');
ok(screen.querySelectorAll('.hm-cell').length >= 7 * 8, 'خريطة النشاط تحتوي خلايا كافية');
ok(screen.querySelectorAll('.pw-row').length === MAD.WORLD_ORDER.length, 'صف لكل عالم مسجّل');
const rows = screen.querySelectorAll('.pw-row[data-w]');
ok(rows.length > 0, 'صفوف العوالم الملعوبة قابلة للنقر');
const other = [...rows].find(r => !r.classList.contains('sel'));
if (other) {
  const key = other.dataset.w;
  other.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(document.querySelector('.pw-row.sel').dataset.w === key, 'النقر على عالم يبدّل منحناه');
}
ok(!/[0-9]/.test(screen.textContent), 'لا رقم غربي واحد في شاشة السجلّ');

/* التسميات يجب أن تطابق الجهة التي يُرسم فيها الزمن فعلًا:
   المنحنى والخريطة يضعان الأحدث يسارًا، وفي RTL أول عنصر في flex يذهب يمينًا. */
const axisSpans = [...screen.querySelector('.ch-axis').children];
const dots = [...screen.querySelector('.prog-chart').querySelectorAll('circle')].map(c => +c.getAttribute('cx'));
ok(dots[0] > dots[dots.length - 1], 'المنحنى يرسم الأقدم يمينًا والأحدث يسارًا');
ok(axisSpans[0].textContent.includes('الأقدم') && axisSpans[1].textContent.includes('الأحدث'),
  'تسميتا محور الزمن بالترتيب الصحيح (الأقدم أولًا فيظهر يمينًا)');
const legendSpans = [...screen.querySelector('.hm-legend').children];
ok(legendSpans[0].textContent.includes('الأقدم') && legendSpans[2].textContent.includes('الأحدث'),
  'وسيلة إيضاح الخريطة بالترتيب الصحيح');
const hmCols = [...screen.querySelectorAll('.hm-col')];
const todayCell = screen.querySelector('.hm-cell.today');
ok(!!todayCell && hmCols.findIndex(c => c.contains(todayCell)) === hmCols.length - 1,
  'خلية اليوم في آخر عمود (الأحدث)');

/* التخزين المحجوب (حصّة ممتلئة أو نافذة خاصة): يجب ألّا تتعطّل اللعبة.
   الترقيع يجري على Storage.prototype لأن jsdom يُعيد كائن تخزين جديدًا
   في كل قراءة لـ window.localStorage، فالإسناد على النسخة لا يسري. */
const proto = Object.getPrototypeOf(window.localStorage);
const realSet = proto.setItem, realGet = proto.getItem;
proto.setItem = () => { throw new Error('QuotaExceededError'); };
const blocked = P.recordSession(s1);
ok(blocked.saved === false, 'التخزين المحجوب يُعيد saved=false بلا استثناء');
proto.getItem = () => { throw new Error('SecurityError'); };
const readBlocked = P.load();
ok(Array.isArray(readBlocked.sessions) && readBlocked.sessions.length === 0,
  'القراءة المحجوبة تُعيد بنية نظيفة بلا استثناء');
proto.setItem = realSet; proto.getItem = realGet;

/* جلسة كاملة حقيقية تصل إلى شاشة النتيجة وتُسجَّل عبر الخطّاف */
clear();
const before = P.load().sessions.length;
document.querySelector('.world-btn[data-w="logic"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
document.getElementById('startBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
(async () => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 40));
    if (document.getElementById('screen-result').style.display === 'block') break;
    if (!MAD.state.locked && MAD.state.challenge) {
      const t = document.getElementById('stage').querySelectorAll('.opt-card, .shape, .grid-cell');
      const usable = [...t].filter(x => !x.classList.contains('overlay-msg'));
      if (usable.length) usable[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    }
  }
  const after = P.load();
  ok(after.sessions.length === before + 1, 'جلسة حقيقية مكتملة تُسجَّل تلقائيًا عبر خطّاف sessionEnd');
  ok(after.sessions[after.sessions.length - 1].world === 'logic', 'العالم الصحيح مسجّل في الجلسة');
  ok(document.getElementById('screen-result').textContent.includes('سلسلة') ||
     document.getElementById('screen-result').textContent.includes('أول جلسة مسجّلة'),
    'شاشة النتيجة تعرض كتلة السلسلة المُضافة من الخطّاف');

  console.log(`\nفحوص ناجحة: ${pass}`);
  if (errs.length) { console.log('\n=== أخطاء ===\n' + [...new Set(errs)].join('\n')); process.exit(1); }
  console.log('صفر أخطاء في طبقة التقدّم.');
})();
