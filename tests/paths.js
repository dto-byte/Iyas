const fs=require("fs"),path=require("path");
const {JSDOM,VirtualConsole}=require("jsdom");
const SRC=process.argv[2]; const errs=[];
const vc=new VirtualConsole();
vc.on("jsdomError",e=>errs.push("jsdomError: "+e.message));
vc.on("error",(...a)=>errs.push("console.error: "+a.join(" ")));
const dom=new JSDOM(fs.readFileSync(path.join(SRC,"index.html"),"utf8"),{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>null;w.AudioContext=undefined;}});
const {window}=dom,{document}=window;
for(const el of [...document.querySelectorAll("script[src]")]) window.eval(fs.readFileSync(path.join(SRC,el.getAttribute("src")),"utf8"));
window.eval("MAD.boot();");
const MAD=window.MAD;
const click=(sel)=>{const e=document.querySelector(sel); if(!e){errs.push("عنصر مفقود: "+sel); return null;} e.dispatchEvent(new window.MouseEvent("click",{bubbles:true})); return e;};
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ok=(cond,msg)=>console.log((cond?"  ✓ ":"  ✗ ")+msg)||(!cond&&errs.push("فحص فشل: "+msg));

(async()=>{
  console.log("١) الشعار وبناء الواجهة من السجلّ");
  ok(document.getElementById("gameLogo").src.startsWith("data:image/png;base64,"),"الشعار مُحمَّل من logo-data.js");
  const WN = MAD.WORLD_ORDER.length;
  ok(document.querySelectorAll(".world-btn").length===WN,
    "زرّ لكل عالم مسجّل ("+MAD.toArabicDigits(WN)+")");
  ok(document.querySelectorAll("#orbitRing .orbit-node").length===WN,
    "عقدة دولاب لكل عالم مسجّل");
  ok(document.getElementById("worldIntro").textContent.includes("عالم الملاحظة"),"نص تعريف العالم ظاهر");

  console.log("\n٢) تبديل كل العوالم من الدولاب ومن الأزرار");
  for(const k of MAD.WORLD_ORDER){
    click(`.orbit-node[data-key="${k}"]`);
    click(`.world-btn[data-w="${k}"]`);
    const chips=document.querySelectorAll("#tmplGrid .tmpl-chip").length;
    const accent=document.documentElement.style.getPropertyValue("--world-accent");
    ok(MAD.state.world===k && chips===MAD.WORLDS[k].keys.length && accent===MAD.WORLDS[k].accent.solid,
      `${MAD.WORLDS[k].label}: ${chips} رقاقة قالب · لون ${accent}`);
  }

  console.log("\n٣) تقليل الحركة يستبعد قوالب الحركة تلقائيًا");
  click('.world-btn[data-w="observation"]');
  click('.diff-btn[data-s="reducedMotion"]');
  ok(document.body.classList.contains("reduced-motion"),"صنف reduced-motion مُطبَّق على body");
  const w0=MAD.WORLDS[MAD.state.world];
  const motionCount=w0.keys.filter(k=>w0.templates[k].requiresMotionMechanic).length;
  const locked=[...document.querySelectorAll("#tmplGrid .tmpl-chip.locked")].map(c=>c.textContent);
  ok(locked.length===motionCount && motionCount>0,"قوالب الحركة مستبعدة تلقائيًا: "+locked.join(" · "));
  click('.diff-btn[data-s="reducedMotion"]');
  ok(!document.body.classList.contains("reduced-motion"),"إلغاء تقليل الحركة يعمل");

  console.log("\n٤) عمى الألوان يبدّل اللوحة");
  click('.diff-btn[data-s="colorBlind"]');
  ok(MAD.activePalette()[0]==="#0072B2","لوحة Okabe-Ito مُفعّلة: "+MAD.activePalette().join(","));
  click('.diff-btn[data-s="colorBlind"]');

  console.log("\n٥) استبعاد يدوي + رفض البدء بأقل من ٣ قوالب");
  const chips=[...document.querySelectorAll("#tmplGrid .tmpl-chip")];
  chips.slice(0,8).forEach(c=>c.dispatchEvent(new window.MouseEvent("click",{bubbles:true})));
  ok(MAD.state.manuallyDisabled.observation.size===8,"٨ قوالب مستبعدة يدويًا");
  click("#startBtn"); await wait(400);
  ok(document.getElementById("screen-setup").style.display!=="none","الجلسة لم تبدأ (أقل من ٣ قوالب)");
  ok(document.getElementById("toast").classList.contains("show"),"رسالة تنبيه ظهرت: "+document.getElementById("toast").textContent);
  MAD.state.manuallyDisabled.observation.clear();
  window.eval("MAD.state.world='observation'");

  console.log("\n٦) الإيقاف المؤقت والاستئناف والخروج");
  click('.world-btn[data-w="logic"]'); click("#startBtn"); await wait(1400);
  ok(MAD.state.challenge!==null,"تحدٍّ نشط في عالم المنطق");
  click("#pauseBtn"); await wait(60);
  ok(MAD.state.paused===true,"الجلسة متوقفة مؤقتًا");
  click("#pauseBtn"); await wait(60);
  ok(MAD.state.paused===false,"الجلسة استُؤنفت");
  click("#homeBtn"); click("#homeBtn"); await wait(60);
  ok(document.getElementById("screen-setup").style.display==="block","الخروج للرئيسية يحتاج ضغطتين ونجح");

  console.log("\n٧) منع الإيقاف أثناء مرحلة الحفظ في الذاكرة");
  click('.world-btn[data-w="memory"]'); click("#startBtn"); await wait(1200);
  if(MAD.state.memoryPhase==="study"){
    click("#pauseBtn"); await wait(40);
    ok(MAD.state.paused===false,"الإيقاف لا يسري أثناء الحفظ (محروس بـ state.locked)");
    ok(MAD.WORLDS.memory.canPause({})===false,"خطّاف canPause يرفض الإيقاف خارج مرحلة الاسترجاع");
  } else { console.log("  ~ لم نلتقط مرحلة الحفظ في هذا التوقيت (مرحلة="+MAD.state.memoryPhase+")"); }

  console.log("\n٨) سمة الشاشة على body وترتيب شاشة البداية");
  /* ui-chrome.js يترجم تبديل المحرك للشاشات (style.display المباشر) إلى
     body[data-screen]، وعليها يبني CSS هيكلًا مختلفًا لكل شاشة — أبرزه إخفاء
     الشعار والعنوان أثناء اللعب. بلا هذه السمة تعود الترويسة الكبيرة فوق
     لوحة الجولة على الهاتف، وهي ملاحظة جاءت من تجربة على جهاز حقيقي. */
  click("#homeBtn"); click("#homeBtn"); await wait(120);
  ok(document.body.dataset.screen==="setup","body[data-screen] = setup على شاشة البداية");
  click('.world-btn[data-w="observation"]'); click("#startBtn"); await wait(1400);
  ok(document.body.dataset.screen==="game","body[data-screen] = game بعد بدء الجلسة");
  click("#homeBtn"); click("#homeBtn"); await wait(120);
  ok(document.body.dataset.screen==="setup","السمة تعود إلى setup بعد الخروج");

  const css = fs.readFileSync(path.join(SRC,"index.html"),"utf8");
  const at = css.indexOf('body[data-screen="game"] .brand');
  ok(at > 0 && css.slice(at, at + 240).includes("display:none"),
     "قاعدة إخفاء الترويسة أثناء اللعب موجودة في CSS");

  /* الشاشة الأولى قرار لا قراءة: زر البدء قبل شرح العالم في ترتيب DOM */
  const introEl = document.getElementById("worldIntro");
  ok(!!(document.getElementById("startBtn").compareDocumentPosition(introEl) & 4),
     "زر البدء يسبق شرح العالم في ترتيب الصفحة");

  console.log("\n"+(errs.length?("=== أخطاء ===\n"+[...new Set(errs)].join("\n")):"صفر أخطاء في كل المسارات."));
  process.exit(errs.length?1:0);
})();
