/* فحص لغوي لكل نص يراه اللاعب: يولّد أهداف كل القوالب بمئات البذور
   ويرفض: الأرقام الغربية، مطابقة الجنس الخاطئة، الصفة قبل الاسم، نص فارغ.
   الاستعمال: node lang.js ../src [عدد البذور] */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SRC = process.argv[2];
const ATTEMPTS = parseInt(process.argv[3] || '120', 10);

const vc = new VirtualConsole();
const runtimeErrs = [];
vc.on('jsdomError', e => runtimeErrs.push(e.message));
const dom = new JSDOM(fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'), {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => null; w.AudioContext = undefined; }
});
const { window } = dom, { document } = window;
for (const el of [...document.querySelectorAll('script[src]')])
  window.eval(fs.readFileSync(path.join(SRC, el.getAttribute('src')), 'utf8'));
window.eval('MAD.boot();');
const MAD = window.MAD;

/* أسماء الأشكال مصنّفة بالجنس — مصدرها المحرك نفسه لا قائمة مكرّرة هنا */
const MASC = [], FEM = [];
for (const t of MAD.SHAPE_TYPES) (MAD.shapeGender(t) === 'f' ? FEM : MASC).push(MAD.SHAPE_AR[t]);

/* صفات وضمائر موصولة: يجب أن تأتي *بعد* الاسم وتطابقه */
const ADJ = [
  ['الغريب', 'الغريبة'], ['المموّه', 'المموّهة'], ['المتحرك', 'المتحركة'],
  ['الوحيد', 'الوحيدة'], ['الذي', 'التي'],
  ['الأزرق', 'الزرقاء'], ['الأخضر', 'الخضراء'], ['البرتقالي', 'البرتقالية'],
  ['البنفسجي', 'البنفسجية'], ['الوردي', 'الوردية'],
  ['الغامق', 'الغامقة']
];
/* أفعال ونواسخ: يصح أن تتقدّم الاسم أو تتأخّر عنه، لكن الجنس يجب أن يطابق في الحالتين */
const VERB = [
  ['كان', 'كانت'], ['ظهر', 'ظهرت'], ['يومض', 'تومض'], ['يتحوّل', 'تتحوّل'],
  ['ليس', 'ليست'], ['اختفى', 'اختفت'], ['تغيّر', 'تغيّرت']
];

/* كل كلمة يصح أن تلي اسم شكل مباشرةً وهي محايدة الجنس (لا تحتاج مطابقة).
   ما ليس هنا ولا في ADJ/VERB يُعدّ "غير مصنَّف" ويُرفض — حتى لا يمرّ خطأ
   جديد بصمت عند إضافة نص لاحقًا. */
const NEUTRAL_AFTER_NOUN = new Set([
  'الأكبر', 'الأصغر',   // اسم تفضيل لا يتغيّر بالجنس
  'أكبر', 'أصغر',
  'بلون', 'من', 'إلى', 'في', 'بين', 'مع', 'هو', 'هي', 'و',
  'باستمرار', 'حجمًا'
]);

/* المطابقة تجري على الكلمات كاملةً، لا بالنص الجزئي:
   "الغريبة" تبدأ بـ"الغريب"، فالمقارنة الجزئية تُنتج إيجابيات كاذبة. */
const MASC_SET = new Set(MASC), FEM_SET = new Set(FEM);
const MASC_ADJ = new Set(ADJ.map(p => p[0])), FEM_ADJ = new Set(ADJ.map(p => p[1]));
const MASC_VERB = new Set(VERB.map(p => p[0])), FEM_VERB = new Set(VERB.map(p => p[1]));
const isNoun = (w) => MASC_SET.has(w) || FEM_SET.has(w);
/* التجاور يُفحص داخل الجملة الواحدة فقط: علامات الترقيم تفصل، فلا تُقارَن
   كلمة آخر جملة بكلمة أول الجملة التالية. */
const clauses = (t) => t.split(/[.؟!—،:=/()]+/).map(c => c.trim().split(/\s+/).filter(Boolean)).filter(a => a.length > 1);

const problems = [];
function checkText(where, text) {
  if (typeof text !== 'string' || !text.trim()) { problems.push(`${where}: نص فارغ`); return; }

  // ١) أرقام غربية
  const west = text.match(/[0-9]/g);
  if (west) problems.push(`${where}: أرقام غربية (${west.join('')}) في: ${text}`);

  for (const words of clauses(text))
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    // ٢) اسم يتبعه صفة/ضمير موصول: الجنس يجب أن يطابق
    if (MASC_SET.has(a) && FEM_ADJ.has(b)) problems.push(`${where}: مذكّر + صفة مؤنّثة "${a} ${b}" في: ${text}`);
    if (FEM_SET.has(a) && MASC_ADJ.has(b)) problems.push(`${where}: مؤنّث + صفة مذكّرة "${a} ${b}" في: ${text}`);
    // ٣) صفة تتقدّم الاسم — ترتيب خاطئ في العربية (الأفعال مستثناة، فتقدّمها صحيح)
    if ((MASC_ADJ.has(a) || FEM_ADJ.has(a)) && isNoun(b))
      problems.push(`${where}: صفة قبل الاسم "${a} ${b}" في: ${text}`);
    // ٤) الفعل مع الاسم في أي الاتجاهين: الجنس يجب أن يطابق
    if (MASC_VERB.has(a) && FEM_SET.has(b)) problems.push(`${where}: فعل مذكّر + فاعل مؤنّث "${a} ${b}" في: ${text}`);
    if (FEM_VERB.has(a) && MASC_SET.has(b)) problems.push(`${where}: فعل مؤنّث + فاعل مذكّر "${a} ${b}" في: ${text}`);
    if (MASC_SET.has(a) && FEM_VERB.has(b)) problems.push(`${where}: فاعل مذكّر + فعل مؤنّث "${a} ${b}" في: ${text}`);
    if (FEM_SET.has(a) && MASC_VERB.has(b)) problems.push(`${where}: فاعل مؤنّث + فعل مذكّر "${a} ${b}" في: ${text}`);

    // ٥) كلمة غير مصنَّفة تلي اسم شكل — قد تكون خطأ مطابقة جديدًا لم يُرصد
    if (isNoun(a) && /^[ء-ي]/.test(b)
        && !MASC_ADJ.has(b) && !FEM_ADJ.has(b) && !MASC_VERB.has(b) && !FEM_VERB.has(b)
        && !NEUTRAL_AFTER_NOUN.has(b))
      problems.push(`${where}: كلمة غير مصنَّفة بعد "${a}" هي "${b}" — صنّفها في lang.js: ${text}`);
  }
}

/* ===== وحدة: المعدود العربي ===== */
/* ١ مفرد · ٢ مثنى · ٣-١٠ جمع · ١١+ مفرد منصوب — والقاعدة تدور على آخر خانتين */
const N = { one:'جلسة', two:'جلستان', few:'جلسات', many:'جلسة' };
const cases = [
  [1,'جلسة'], [2,'جلستان'], [3,'جلسات'], [7,'جلسات'], [10,'جلسات'],
  [11,'جلسة'], [17,'جلسة'], [25,'جلسة'], [99,'جلسة'],
  [100,'جلسة'], [101,'جلسة'], [102,'جلسة'], [105,'جلسات'], [111,'جلسة']
];
let countedOk = 0;
for (const [n, want] of cases) {
  const got = MAD.counted(n, N);
  if (got === want) countedOk++;
  else problems.push(`المعدود: counted(${n}) أعاد "${got}" والمتوقع "${want}"`);
}
if (MAD.counted(0, { one:'يوم', few:'أيام', zero:'أيام' }) !== 'أيام')
  problems.push('المعدود: الصفر لا يستخدم صيغة zero');
if (MAD.countedWith(17, N) !== '١٧ جلسة')
  problems.push(`المعدود: countedWith(17) أعاد "${MAD.countedWith(17, N)}"`);
/* المثنى لا يُسبق برقم: "جلستان" لا "٢ جلستان" */
if (MAD.countedWith(2, N) !== 'جلستان')
  problems.push(`المعدود: countedWith(2) أعاد "${MAD.countedWith(2, N)}" والمتوقع "جلستان"`);
if (MAD.countedWith(3, N) !== '٣ جلسات')
  problems.push(`المعدود: countedWith(3) أعاد "${MAD.countedWith(3, N)}"`);
console.log(`  ✓ المعدود العربي: ${countedOk}/${cases.length} حالة صحيحة`);

let texts = 0;
for (const wk of MAD.WORLD_ORDER) {
  const w = MAD.WORLDS[wk];
  for (const key of w.keys) {
    for (let d = 1; d <= 4; d++) {
      for (let i = 0; i < ATTEMPTS; i++) {
        MAD.state.world = wk;
        const seed = (d * 7919 + i * 104729) >>> 0;
        let ch;
        try { ch = w.build(key, d, 2, seed); } catch (e) { problems.push(`${wk}/${key}: استثناء — ${e.message}`); continue; }
        checkText(`${wk}/${key}/د${d}`, ch.goal);
        texts++;
        // نصوص خيارات "text" تُعرض للاعب أيضًا
        if (ch.payload && ch.payload.optionType === 'text' && Array.isArray(ch.payload.options)) {
          ch.payload.options.forEach(o => { checkText(`${wk}/${key}/د${d}/خيار`, String(o.value)); texts++; });
        }
      }
    }
  }
  console.log(`  ✓ ${w.label}: فُحصت أهداف ${w.keys.length} قالب`);
}

console.log(`\nنصوص مفحوصة: ${texts}`);
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.log(`\n=== مشاكل لغوية (${uniq.length} نوعًا) ===`);
  console.log(uniq.slice(0, 30).join('\n'));
  process.exit(1);
}
if (runtimeErrs.length) { console.log('\nأخطاء وقت تشغيل:\n' + runtimeErrs.join('\n')); process.exit(1); }
console.log('صفر مشكلة لغوية.');
