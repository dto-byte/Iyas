/* اختبار التكيّف ثنائي الاتجاه واقتراح مستوى البداية.
   جزء ١: وحدات على السياسة النقيّة adaptiveDecision.
   جزء ٢: لاعب آلي يلعب جلسة حقيقية ويجيب صحيحًا وبسرعة — يجب أن يرتفع المستوى.
   الاستعمال: node adaptive.js ../src */
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

let pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { errs.push('فحص فشل: ' + m); console.log('  ✗ ' + m); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* ===================== ١) السياسة النقيّة ===================== */
console.log('١) قرار التكيّف (دالة نقيّة)');
const D = MAD.adaptiveDecision, C = MAD.ADAPT;
const S = (o) => Object.assign({ consecutiveMistakes: 0, consecutiveCorrect: 0, comfort: [], adaptiveOffset: 0 }, o);
const fast = Array(C.correctToRaise).fill(C.comfortRatio - 0.2);
const slow = Array(C.correctToRaise).fill(C.comfortRatio + 0.2);

ok(D(S({})) === null, 'حالة محايدة ← لا قرار');
ok(D(S({ consecutiveMistakes: C.mistakesToLower })) === 'lower', 'خطآن متتاليان ← خفض');
ok(D(S({ consecutiveMistakes: C.mistakesToLower - 1 })) === null, 'خطأ واحد لا يكفي للخفض');
ok(D(S({ consecutiveMistakes: 9, adaptiveOffset: C.minOffset })) === null, 'لا خفض تحت الحدّ الأدنى');

ok(D(S({ consecutiveCorrect: C.correctToRaise, comfort: fast })) === 'raise',
  'إجابات صحيحة متتالية وسريعة ← رفع');
ok(D(S({ consecutiveCorrect: C.correctToRaise, comfort: slow })) === null,
  'صحيحة لكن بطيئة ← لا رفع (الصحّة وحدها لا تكفي)');
ok(D(S({ consecutiveCorrect: C.correctToRaise, comfort: [...fast.slice(1), C.comfortRatio + 0.1] })) === null,
  'إجابة واحدة بطيئة ضمنها تُلغي الرفع');
ok(D(S({ consecutiveCorrect: C.correctToRaise - 1, comfort: fast })) === null,
  'عدد أقل من المطلوب ← لا رفع');
ok(D(S({ consecutiveCorrect: 9, comfort: fast, adaptiveOffset: C.maxOffset })) === null,
  'لا رفع فوق الحدّ الأقصى');
ok(D(S({ consecutiveCorrect: 9, comfort: fast, consecutiveMistakes: C.mistakesToLower })) === 'lower',
  'الخفض له الأسبقية حين يجتمع الشرطان');
ok(D(S({ consecutiveCorrect: C.correctToRaise, comfort: [] })) === null,
  'بلا عيّنات راحة ← لا رفع');
ok(C.minOffset < 0 && C.maxOffset > 0, 'المدى ثنائي الاتجاه فعلًا (سالب وموجب)');

/* ===================== ٢) لاعب آلي في جلسة حقيقية ===================== */
console.log('\n٢) جلسة حقيقية بلاعب متمكّن');

/* اللاعب الآلي يعرف الإجابة يقينًا في قوالب "اختيار من متعدد" وحدها، فنحصر
   الجلسة فيها. بدون هذا الحصر يعتمد نجاح الاختبار على أي القوالب وقع عليها
   الترتيب العشوائي — أي اختبار متقلّب، وهو أسوأ من غياب الاختبار.
   تغطية بقية المُصيّرات مسؤولية session.js لا هذا الاختبار. */
(function restrictToMC(){
  const w = MAD.WORLDS.logic;
  const off = MAD.state.manuallyDisabled.logic;
  off.clear();
  w.keys.forEach(k => { if (w.templates[k].pattern !== 'mc') off.add(k); });
  const left = w.keys.length - off.size;
  ok(left >= 3, `بقي ${left} قالب اختيار من متعدد لقيادة الجلسة`);
})();

/* يجد الإجابة الصحيحة من بنية التحدي نفسها لا من الشاشة */
function clickCorrect() {
  const ch = MAD.state.challenge;
  const stage = document.getElementById('stage');
  if (!ch || !stage) return false;
  const fire = (node) => { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return true; };

  // أشكال مبعثرة تحمل isCorrect (الملاحظة / choice)
  if (Array.isArray(ch.shapes)) {
    const s = ch.shapes.find(x => x.isCorrect);
    const node = s && stage.querySelector(`[data-id="${s.id}"]`);
    if (node) return fire(node);
  }
  // خيارات mc / matrix / mirror
  if (ch.payload && Array.isArray(ch.payload.options)) {
    const idx = ch.payload.options.findIndex(o => o.isCorrect);
    const cards = stage.querySelectorAll('.opt-card');
    if (idx >= 0 && cards[idx]) return fire(cards[idx]);
  }
  return false;
}

function clickWrong() {
  const ch = MAD.state.challenge;
  const stage = document.getElementById('stage');
  if (!ch || !stage || !ch.payload || !Array.isArray(ch.payload.options)) return false;
  const i = ch.payload.options.findIndex(o => !o.isCorrect);
  const cards = stage.querySelectorAll('.opt-card');
  if (i < 0 || !cards[i]) return false;
  cards[i].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
}

async function playSession(world, diff, mode) {
  document.querySelector(`.world-btn[data-w="${world}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  document.querySelector(`.diff-btn[data-d="${diff}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  document.getElementById('startBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  let maxOffset = 0, minOffset = 0, raisedToast = false, loweredToast = false;
  const toast = document.getElementById('toast');
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await wait(25);
    if (document.getElementById('screen-result').style.display === 'block') break;
    maxOffset = Math.max(maxOffset, MAD.state.adaptiveOffset);
    minOffset = Math.min(minOffset, MAD.state.adaptiveOffset);
    if (toast.classList.contains('show')) {
      if (toast.textContent.includes('رُفع')) raisedToast = true;
      if (toast.textContent.includes('تخفيف')) loweredToast = true;
    }
    if (!MAD.state.locked && MAD.state.challenge) {
      if (mode === 'smart') { if (!clickCorrect()) fallbackClick(); }
      else { if (!clickWrong()) fallbackClick(); }
    }
  }
  return { maxOffset, minOffset, raisedToast, loweredToast };
}

function fallbackClick() {
  const stage = document.getElementById('stage');
  const t = [...stage.querySelectorAll('.opt-card, .shape, .grid-cell')].filter(x => !x.classList.contains('overlay-msg'));
  if (t.length) t[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

(async () => {
  /* عالم المنطق: كل قوالبه بنقرة واحدة صحيحة، فالتحكّم فيه أدقّ */
  const smart = await playSession('logic', 1, 'smart');
  ok(smart.maxOffset > 0, `اللاعب المتمكّن رفع المستوى تلقائيًا (بلغ ${smart.maxOffset}+)`);
  ok(smart.maxOffset <= MAD.ADAPT.maxOffset, 'الرفع لا يتجاوز الحدّ الأقصى');
  ok(smart.raisedToast, 'رسالة الرفع ظهرت للاعب');

  document.getElementById('replayBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);

  /* لاعب يضغط أول عنصر دائمًا — يخطئ كثيرًا، فيجب أن ينخفض المستوى */
  const dumb = await playSession('logic', 4, 'wrong');
  ok(dumb.minOffset < 0, `اللاعب المتعثّر خُفّض مستواه تلقائيًا (بلغ ${dumb.minOffset})`);
  ok(dumb.minOffset >= MAD.ADAPT.minOffset, 'الخفض لا يتجاوز الحدّ الأدنى');

  document.getElementById('replayBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);

  /* ===================== ٣) اقتراح مستوى البداية ===================== */
  console.log('\n٣) اقتراح مستوى البداية');
  const P = MAD.progress;
  const G = P.suggestDifficulty;
  const mkData = (sessions) => ({ sessions, totals: {}, days: {}, v: 1 });
  const ses = (accuracy, diff) => ({ world: 'logic', accuracy, diff, at: Date.now() });

  ok(G(mkData([ses(95, 2), ses(92, 2)]), 'logic', 2) === null,
    'أقل من ٣ جلسات ← لا اقتراح');
  const up = G(mkData([ses(95, 2), ses(92, 2), ses(90, 2)]), 'logic', 2);
  ok(up && up.target === 3 && up.harder === true, 'دقّة عالية ← يقترح مستوى أصعب');
  const down = G(mkData([ses(30, 3), ses(35, 3), ses(40, 3)]), 'logic', 3);
  ok(down && down.target === 2 && down.harder === false, 'دقّة منخفضة ← يقترح مستوى أسهل');
  ok(G(mkData([ses(65, 2), ses(70, 2), ses(60, 2)]), 'logic', 2) === null,
    'دقّة متوسطة ← لا اقتراح (لا إزعاج بلا فائدة)');
  ok(G(mkData([ses(95, 4), ses(95, 4), ses(95, 4)]), 'logic', 4) === null,
    'عند السقف خبير ← لا اقتراح');
  ok(G(mkData([ses(95, 2), ses(92, 2), ses(90, 2)]), 'logic', 3) === null,
    'الاقتراح مطابق للمختار ← لا يُعرض');
  ok(G(mkData([ses(95, 1), ses(92, 1), ses(90, 1)]), 'memory', 1) === null,
    'الاقتراح لكل عالم على حدة');

  /* التكامل: الاقتراح يظهر في شاشة الإعداد ويُطبَّق بضغطة */
  window.localStorage.removeItem(P.KEY);
  [95, 92, 90].forEach((a, i) => P.recordSession({
    at: Date.now() - (3 - i) * 3600000, world: 'logic', diff: 2, xp: 200, accuracy: a,
    avgReactMs: 1200, maxCombo: 4, rounds: 9, correct: 8, mistakes: 1
  }));
  document.querySelector('.diff-btn[data-d="2"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  document.querySelector('.world-btn[data-w="logic"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const box = document.querySelector('.diff-suggest');
  ok(!!box && box.textContent.includes('صعب'), 'الاقتراح معروض في شاشة الإعداد');
  ok(!/[0-9]/.test(box.textContent), 'نص الاقتراح بأرقام عربية شرقية');
  document.getElementById('applySuggest').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok(MAD.state.diff === 3, 'الضغط على "طبّق" غيّر مستوى الصعوبة فعليًا');
  ok(document.querySelector('.diff-btn.active').dataset.d === '3', 'زر الصعوبة الصحيح صار مفعّلًا');
  ok(!document.querySelector('.diff-suggest'), 'الاقتراح اختفى بعد تطبيقه');

  window.localStorage.removeItem(P.KEY);
  console.log(`\nفحوص ناجحة: ${pass}`);
  if (errs.length) { console.log('\n=== أخطاء ===\n' + [...new Set(errs)].join('\n')); process.exit(1); }
  console.log('صفر أخطاء في التكيّف.');
})();
