/* اختبار jsdom كامل: يقلع اللعبة، ويلعب جلسة كاملة في كل عالم × كل مستوى صعوبة */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = process.argv[2];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => { /* تجاهل تحذيرات CSS غير المدعومة في jsdom */ });

const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: undefined,
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // jsdom لا يوفّر canvas ولا AudioContext ولا PointerEvent
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
  }
});
const { window } = dom;
const { document } = window;

// تحميل السكربتات يدويًا (jsdom لا يجلب ملفات محلية عبر src بدون resource loader)
for (const el of [...document.querySelectorAll('script[src]')]) {
  const file = path.join(SRC, el.getAttribute('src'));
  const code = fs.readFileSync(file, 'utf8');
  try { window.eval(code); } catch (e) { errors.push(`تحميل ${el.getAttribute('src')}: ${e.stack}`); }
}
// سكربت الإقلاع المضمّن
try { window.eval('MAD.boot();'); } catch (e) { errors.push('boot: ' + e.stack); }

const MAD = window.MAD;
if (!MAD) { console.log('فشل: MAD غير معرّف'); console.log(errors.join('\n')); process.exit(1); }

const worlds = MAD.WORLD_ORDER;
console.log('العوالم المسجّلة:', worlds.join(', '));
for (const k of worlds) {
  const w = MAD.WORLDS[k];
  console.log(`  ${w.badge} ${w.label}: ${w.keys.length} قالب · إحماء=${w.warmup} · شارة سديم=${w.nebula.a}`);
  const missing = w.keys.filter(key => !w.templates[key]);
  if (missing.length) errors.push(`${k}: مفاتيح بلا قوالب: ${missing}`);
  const extra = Object.keys(w.templates).filter(key => !w.keys.includes(key));
  if (extra.length) errors.push(`${k}: قوالب خارج قائمة المفاتيح: ${extra}`);
  if (!MAD.state.manuallyDisabled[k]) errors.push(`${k}: لا توجد مجموعة استبعاد يدوي`);
}

// ---- محرّك زمن مُسرَّع: ننفّذ المؤقتات فورًا بترتيبها ----
let clicks = 0, rounds = 0, results = 0;

function drain(maxSteps) {
  // jsdom ينفّذ setTimeout فعليًا؛ نستخدم حلقة انتظار حقيقية عبر Promise
  return new Promise(res => setTimeout(res, maxSteps));
}

function clickAnyAnswer() {
  const stage = document.getElementById('stage');
  if (!stage) return false;
  const targets = stage.querySelectorAll('.opt-card, .shape[style*="cursor: pointer"], .shape, .grid-cell');
  const usable = [...targets].filter(t => !t.classList.contains('overlay-msg'));
  if (!usable.length) return false;
  usable[Math.floor(Math.random() * usable.length)].dispatchEvent(
    new window.MouseEvent('click', { bubbles: true })
  );
  clicks++;
  return true;
}

async function playSession(worldKey, diff) {
  // اختيار العالم عبر أزرار العوالم (نفس مسار المستخدم)
  const btn = document.querySelector(`.world-btn[data-w="${worldKey}"]`);
  if (!btn) { errors.push(`لا يوجد زر للعالم ${worldKey}`); return; }
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const dbtn = document.querySelector(`.diff-btn[data-d="${diff}"]`);
  if (dbtn) dbtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  document.getElementById('startBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  /* الميزانية تُشتق من العالم نفسه لا برقم ثابت: جولة عالم التركيز سلسلة
     مؤقّتة تستغرق أضعاف جولة سؤال واحد، ومهلة ثابتة تُفشل الاختبار لسبب
     لا علاقة له بالكود. */
  const w = MAD.WORLDS[worldKey];
  const worstRound = Math.max(...w.keys.map(k => {
    try { return w.build(k, 4, 2, 1234).time || 20; } catch (e) { return 20; }
  }));
  const budgetMs = (MAD.state.totalRounds + 1) * (worstRound * 1000 + 2500) + 15000;
  const deadline = Date.now() + budgetMs;
  let lastRound = -1;
  while (Date.now() < deadline) {
    await drain(40);
    if (document.getElementById('screen-result').style.display === 'block') { results++; return; }
    if (MAD.state.round !== lastRound) { lastRound = MAD.state.round; rounds++; }
    if (!MAD.state.locked && MAD.state.challenge) clickAnyAnswer();
  }
  errors.push(`انتهت المهلة دون نتيجة: ${worldKey} صعوبة ${diff} (الميزانية ${Math.round(budgetMs/1000)}ث)`);
}

(async () => {
  for (const w of worlds) {
    for (const d of [1, 2, 3, 4]) {
      await playSession(w, d);
      const replay = document.getElementById('replayBtn');
      if (replay) replay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await drain(30);
    }
    console.log(`  ✓ اكتملت ٤ جلسات في ${MAD.WORLDS[w].label}`);
  }

  console.log(`\nالجولات المُنفَّذة: ${rounds} · النقرات: ${clicks} · شاشات النتيجة: ${results}/${worlds.length * 4}`);
  if (errors.length) {
    console.log('\n=== أخطاء (' + errors.length + ') ===');
    console.log([...new Set(errors)].slice(0, 25).join('\n---\n'));
    process.exit(1);
  }
  console.log('\nصفر أخطاء وقت تشغيل.');
  process.exit(0);
})();
