/* إجهاد القوالب: لكل قالب × ٤ مستويات × ١٥٠ بذرة — يفحص التوليد والتدقيق والهدف */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const SRC = process.argv[2];
const ATTEMPTS = parseInt(process.argv[3] || '150', 10);

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', e => errs.push(e.message));
const dom = new JSDOM(fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'), {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.AudioContext = undefined; }
});
const { window } = dom, { document } = window;
for (const el of [...document.querySelectorAll('script[src]')])
  window.eval(fs.readFileSync(path.join(SRC, el.getAttribute('src')), 'utf8'));
window.eval('MAD.boot();');
const MAD = window.MAD;

const problems = [];
let total = 0, invalid = 0;

for (const wk of MAD.WORLD_ORDER) {
  const w = MAD.WORLDS[wk];
  const rows = [];
  for (const key of w.keys) {
    const tmpl = w.templates[key];
    let bad = 0, emptyGoal = 0;
    for (let d = 1; d <= 4; d++) {
      for (let i = 0; i < ATTEMPTS; i++) {
        total++;
        const seed = (d * 1e6 + i * 7919) >>> 0;
        MAD.state.world = wk;
        MAD.state.seedCounter = seed;
        let ch;
        try {
          // نمر عبر نفس مسار البناء الحقيقي للعالم عبر build المستخدم في runPipeline
          ch = w.build(key, d, 2, seed);
        } catch (e) { problems.push(`${wk}/${key} د${d}: استثناء بناء — ${e.message}`); bad++; continue; }
        if (!ch) { problems.push(wk+"/"+key+": بناء أعاد قيمة فارغة"); bad++; continue; }
        if (typeof ch.goal !== 'string' || !ch.goal.trim()) emptyGoal++;
        const v = w.validate(ch);
        if (!v.valid) { bad++; invalid++; }
      }
    }
    rows.push({ key, name: tmpl.name, bad, emptyGoal });
    if (emptyGoal) problems.push(`${wk}/${key}: هدف فارغ ×${emptyGoal}`);
  }
  const hasHook = rows.some(r => r.bad !== undefined);
  console.log(`\n${w.label}`);
  rows.forEach(r => {
    const rate = ((r.bad / (4 * ATTEMPTS)) * 100).toFixed(1);
    const flag = r.bad === 0 ? '✓' : (r.bad / (4 * ATTEMPTS) > 0.5 ? '✗' : '~');
    console.log(`  ${flag} ${r.name.padEnd(24)} رفض المدقّق: ${String(r.bad).padStart(4)}/${4 * ATTEMPTS} (${rate}٪)`);
  });
}

console.log(`\nالمجموع: ${total} محاولة · رفض المدقّق ${invalid} (${((invalid / total) * 100).toFixed(2)}٪)`);
if (problems.length) { console.log('\nمشاكل:\n' + problems.slice(0, 20).join('\n')); process.exit(1); }
if (errs.length) { console.log('\nأخطاء وقت تشغيل:\n' + errs.slice(0, 5).join('\n')); process.exit(1); }
console.log('لا مشاكل بنيوية.');
