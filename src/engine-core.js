/* =====================================================================
   إياس — المحرك الأساسي (engine-core.js)
   لا يحتوي هذا الملف على أي معرفة بعالم بعينه. كل عالم يسجّل نفسه عبر
   MAD.registerWorld(...) ويستهلك الأدوات المشتركة من الكائن MAD.
   خط الأنابيب الثابت: المُركِّب ← المولّد ← المدقّق ← المُعشّي ← اللعب ← التحليلات
   ===================================================================== */
(function(){
  "use strict";

  const MAD = {};
  window.MAD = MAD;

  /* ===================== حقل النجوم الخلفي ===================== */
  (function initStarfield(){
    let canvas, ctx;
    try{
      canvas = document.getElementById('starfield');
      ctx = canvas.getContext('2d');
      if(!ctx) throw new Error('no 2d context');
    }catch(e){
      window.setStarfieldMotion = function(){};
      return;
    }
    let stars = [];
    let w=0,h=0,dpr=Math.min(window.devicePixelRatio||1,2);
    let animating = true;

    function resize(){
      try{
        w = window.innerWidth; h = window.innerHeight;
        canvas.width = w*dpr; canvas.height = h*dpr;
        canvas.style.width = w+'px'; canvas.style.height = h+'px';
        ctx.setTransform(dpr,0,0,dpr,0,0);
        const count = Math.round((w*h)/9000);
        stars = Array.from({length:count}, ()=>({
          x: Math.random()*w, y: Math.random()*h,
          r: Math.random()*1.3+0.3,
          base: Math.random()*0.5+0.3,
          speed: Math.random()*0.4+0.15,
          phase: Math.random()*Math.PI*2
        }));
      }catch(e){}
    }
    function drawStatic(){
      try{
        ctx.clearRect(0,0,w,h);
        stars.forEach(s=>{ ctx.globalAlpha = s.base+0.25; ctx.fillStyle='#CFE0FF'; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); });
        ctx.globalAlpha = 1;
      }catch(e){}
    }
    let t=0;
    function tick(){
      if(!animating){ return; }
      try{
        t += 0.016;
        ctx.clearRect(0,0,w,h);
        stars.forEach(s=>{
          const tw = s.base + Math.sin(t*s.speed + s.phase)*0.28;
          ctx.globalAlpha = Math.max(0.05, tw);
          ctx.fillStyle = '#CFE0FF';
          ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }catch(e){ return; }
      requestAnimationFrame(tick);
    }
    window.setStarfieldMotion = function(enabled){
      animating = enabled;
      if(enabled) requestAnimationFrame(tick); else drawStatic();
    };
    window.addEventListener('resize', resize);
    resize();
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animating = !prefersReduced;
    if(animating) requestAnimationFrame(tick); else drawStatic();
  })();

  /* ===================== سجلّ العوالم ===================== */
  /* كل عالم يستدعي MAD.registerWorld مرة واحدة. المحرك يبني من هذا السجلّ:
     ألوان السديم، لون العالم، نص التعريف، عقد الدولاب، مجموعات الاستبعاد اليدوي.
     هذا يلغي نهائيًا خطأ "نسيان مفتاح العالم الجديد" الذي تكرّر سابقًا. */
  const WORLDS = {};
  const WORLD_ORDER = [];
  MAD.WORLDS = WORLDS;
  MAD.WORLD_ORDER = WORLD_ORDER;

  MAD.registerWorld = function(def){
    const required = ['key','name','label','badge','nebula','accent','intro','keys','templates','warmup','build','validate','render'];
    const missing = required.filter(k=>def[k]==null);
    if(missing.length){ console.error('تسجيل عالم ناقص:', def.key, missing); return; }
    if(WORLDS[def.key]){ console.error('عالم مكرر:', def.key); return; }
    WORLDS[def.key] = def;
    WORLD_ORDER.push(def.key);
    state.manuallyDisabled[def.key] = new Set();
  };

  /* ===================== المظهر حسب العالم ===================== */
  function applyNebula(worldKey){
    const w = WORLDS[worldKey];
    if(!w) return;
    document.documentElement.style.setProperty('--nebula-a', w.nebula.a);
    document.documentElement.style.setProperty('--nebula-b', w.nebula.b);
    document.documentElement.style.setProperty('--world-accent', w.accent.solid);
    document.documentElement.style.setProperty('--world-accent-dim', w.accent.dim);
  }
  function applyReducedMotionClass(enabled){
    document.body.classList.toggle('reduced-motion', enabled);
    if(window.setStarfieldMotion) window.setStarfieldMotion(!enabled);
  }

  /* ===================== أدوات مشتركة ===================== */
  function makeRng(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randInt(rng, min, max){ return Math.floor(rng()*(max-min+1))+min; }
  function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)]; }
  function shuffle(rng, arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){ const j = Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  function toArabicDigits(n){
    const map = {'0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩'};
    return String(n).split('').map(c=>map[c]!==undefined?map[c]:c).join('');
  }

  /* ===================== الصوت ===================== */
  let audioCtx = null;
  function ensureAudio(){
    if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  }
  function tone(freq, dur, type, vol){
    if(!state.settings.sound || !audioCtx) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type||'sine'; osc.frequency.value = freq;
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(vol||0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now+dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now+dur);
  }
  function playCorrect(){ tone(880,0.12,'sine',0.18); setTimeout(()=>tone(1320,0.15,'sine',0.15),90); }
  function playWrong(){ tone(180,0.25,'sawtooth',0.15); }
  function playTimeout(){ tone(260,0.12,'square',0.12); setTimeout(()=>tone(160,0.2,'square',0.12),100); }
  function playTick(){ tone(1000,0.05,'sine',0.05); }
  function playStudyStart(){ tone(520,0.08,'sine',0.12); }
  function playRecallStart(){ tone(700,0.08,'triangle',0.14); setTimeout(()=>tone(900,0.08,'triangle',0.12),70); }
  function playRecord(){ tone(660,0.15,'sine',0.15); setTimeout(()=>tone(880,0.15,'sine',0.14),110); setTimeout(()=>tone(1100,0.22,'sine',0.13),220); }
  function playLaunch(){
    tone(392,0.35,'sine',0.11); setTimeout(()=>tone(523,0.35,'sine',0.11),90);
    setTimeout(()=>tone(659,0.5,'sine',0.10),190);
  }

  /* ===================== خطّافات عامة =====================
     بنية عامة لا تعرف شيئًا عن أي ميزة. تُستخدم لتوصيل وحدات جانبية
     (مثل progress.js) بأحداث المحرك دون أن يعرف المحرك بوجودها.
     - 'sessionEnd'  : تُستدعى عند ظهور شاشة النتيجة، وتتلقّى ملخّص الجلسة.
                       ما تُعيده من نص HTML يُضاف داخل بطاقة النتيجة.
     - 'setupRender' : تُستدعى كلما أُعيد عرض شاشة الإعداد (ومنه تبديل العالم).
     ======================================================== */
  const hooks = {};
  MAD.addHook = function(name, fn){ (hooks[name] || (hooks[name] = [])).push(fn); };
  function fireHook(name, payload){
    const out = [];
    (hooks[name] || []).forEach(fn=>{
      try{ const r = fn(payload); if(r) out.push(r); }
      catch(e){ console.error('خطّاف "'+name+'" فشل:', e); }
    });
    return out;
  }

  /* ===================== حفظ محلي لأرقام اللاعب القياسية ===================== */
  const STORAGE_PREFIX = 'cogtrain_best_';
  function loadBest(world){
    try{ const raw = localStorage.getItem(STORAGE_PREFIX+world); if(raw) return JSON.parse(raw); }catch(e){}
    return { bestXP:0, bestAccuracy:0, bestCombo:1, totalSessions:0, totalXP:0 };
  }
  function saveBest(world, session){
    const prev = loadBest(world);
    const updated = {
      bestXP: Math.max(prev.bestXP, session.xp),
      bestAccuracy: Math.max(prev.bestAccuracy, session.accuracy),
      bestCombo: Math.max(prev.bestCombo, session.combo),
      totalSessions: prev.totalSessions+1,
      totalXP: prev.totalXP + session.xp
    };
    try{ localStorage.setItem(STORAGE_PREFIX+world, JSON.stringify(updated)); }catch(e){}
    return { updated, prev, isNewRecord: prev.totalSessions>0 && session.xp>prev.bestXP };
  }

  /* ===================== الألوان والأشكال ===================== */
  const PALETTE_NORMAL = ["#2F5FE0","#C76A00","#8B4CD8","#0E9E68"];
  const PALETTE_CB = ["#0072B2","#D55E00","#009E73","#CC79A7"];
  function activePalette(){ return state.settings.colorBlind ? PALETTE_CB : PALETTE_NORMAL; }
  /* ===================== الطبقة اللغوية العربية =====================
     كل نص يُعرض للاعب يُبنى من هنا. ثلاث صيغ لكل لون، وجنس نحوي لكل شكل،
     لأن أسماء الأشكال مختلطة الجنس (المربع مذكّر، الدائرة مؤنّثة) — فصفة
     واحدة ثابتة تُنتج أخطاء مثل "المربع الغريبة".
     ------------------------------------------------------------------
     لا تكتب صفة أو فعلًا أو ضميرًا بعد اسم شكل إلا عبر agree(...).
     ================================================================== */
  const COLOR_FORMS = {
    "#2F5FE0": { m:"الأزرق",        f:"الزرقاء",         indef:"أزرق" },
    "#C76A00": { m:"البرتقالي",     f:"البرتقالية",      indef:"برتقالي" },
    "#8B4CD8": { m:"البنفسجي",      f:"البنفسجية",       indef:"بنفسجي" },
    "#0E9E68": { m:"الأخضر",        f:"الخضراء",         indef:"أخضر" },
    "#0072B2": { m:"الأزرق الغامق", f:"الزرقاء الغامقة", indef:"أزرق غامق" },
    "#D55E00": { m:"البرتقالي",     f:"البرتقالية",      indef:"برتقالي" },
    "#009E73": { m:"الأخضر الغامق", f:"الخضراء الغامقة", indef:"أخضر غامق" },
    "#CC79A7": { m:"الوردي",        f:"الوردية",         indef:"وردي" }
  };
  const COLOR_FALLBACK = { m:"الملوّن", f:"الملوّنة", indef:"ملوّن" };
  function colorForms(hex){ return COLOR_FORMS[hex] || COLOR_FALLBACK; }
  /* الصيغة المعرّفة المذكّرة: "إن كان اللون الأزرق" */
  function colorDef(hex){ return colorForms(hex).m; }
  /* الصيغة النكرة: "لونه أزرق" · "ليس أزرق" · "بلون أزرق" */
  function colorIndef(hex){ return colorForms(hex).indef; }
  /* صفة لون تُطابق جنس الشكل الموصوف: "المربع الأزرق" · "الدائرة الزرقاء" */
  function colorAdj(hex, shapeType){ const f = colorForms(hex); return shapeGender(shapeType)==='f' ? f.f : f.m; }

  const SHAPE_TYPES = ["circle","square","triangle","diamond","hexagon","star","ring","cross"];
  const SHAPE_AR = { circle:"الدائرة", square:"المربع", triangle:"المثلث", diamond:"المعيّن",
    hexagon:"السداسي", star:"النجمة", ring:"الحلقة", cross:"الصليب" };
  /* الجنس النحوي لكل شكل — أساس كل مطابقة */
  const SHAPE_GENDER = { circle:'f', square:'m', triangle:'m', diamond:'m',
    hexagon:'m', star:'f', ring:'f', cross:'m' };
  /* خبر "ليس" منصوبًا: "ليس مربعًا" · "ليس دائرةً" */
  const SHAPE_INDEF = { circle:"دائرةً", square:"مربعًا", triangle:"مثلثًا", diamond:"معيّنًا",
    hexagon:"سداسيًا", star:"نجمةً", ring:"حلقةً", cross:"صليبًا" };
  /* الجمع بعد الأعداد ٣-١٠: "بين ٣ مثلثات" */
  const SHAPE_PLURAL = { circle:"دوائر", square:"مربعات", triangle:"مثلثات", diamond:"معيّنات",
    hexagon:"سداسيات", star:"نجوم", ring:"حلقات", cross:"صلبان" };
  function shapeGender(type){ return SHAPE_GENDER[type] || 'm'; }
  /* يختار الصيغة المطابقة لجنس الشكل: agree(type, "الغريب", "الغريبة") */
  function agree(type, masc, fem){ return shapeGender(type)==='f' ? fem : masc; }

  /* المعدود العربي: الصيغة تتغيّر بالعدد لا بالجنس وحده.
     ١ مفرد · ٢ مثنى · ٣-١٠ جمع · ١١ وما بعدها مفرد منصوب.
     counted(17, {one:'جلسة', two:'جلستان', few:'جلسات', many:'جلسة'}) ← "جلسة"
     تُعيد الكلمة فقط؛ الرقم يُضيفه المستدعي بـ toArabicDigits. */
  function counted(n, forms){
    const r = Math.abs(n) % 100;
    if(n === 0) return forms.zero || forms.few || forms.one;
    if(n === 1) return forms.one;
    /* المثنى صيغة للعدد ٢ وحده. أما ١٠٢ فيُكتب عمليًا "١٠٢ جلسة" لا "١٠٢ جلستان" */
    if(n === 2) return forms.two || forms.one;
    if(r >= 3 && r <= 10) return forms.few || forms.one;
    if(r === 1) return forms.one;
    return forms.many || forms.one;
  }
  /* العدد + المعدود معًا بالأرقام العربية.
     المثنى لا يُسبق برقم في العربية: "جلستان" لا "٢ جلستان". */
  function countedWith(n, forms){
    if(n === 2) return counted(n, forms);
    return toArabicDigits(n) + ' ' + counted(n, forms);
  }
  function shapeSVG(type, color, notch, outlineOnly){
    const c = color;
    const fillAttr = outlineOnly ? `fill="none" stroke="${c}" stroke-width="4"` : `fill="${c}"`;
    let base;
    switch(type){
      case "circle": base = `<circle cx="22" cy="22" r="17" ${fillAttr}/>`; break;
      case "square": base = `<rect x="6" y="6" width="32" height="32" rx="4" ${fillAttr}/>`; break;
      case "triangle": base = `<polygon points="22,4 40,38 4,38" ${fillAttr}/>`; break;
      case "diamond": base = `<polygon points="22,3 41,22 22,41 3,22" ${fillAttr}/>`; break;
      case "hexagon": base = `<polygon points="22,3 38,12 38,32 22,41 6,32 6,12" ${fillAttr}/>`; break;
      case "star": base = `<polygon points="22,3 27,17 42,17 30,26 34,41 22,32 10,41 14,26 2,17 17,17" ${fillAttr}/>`; break;
      case "ring": base = `<circle cx="22" cy="22" r="17" fill="none" stroke="${c}" stroke-width="7"/>`; break;
      case "cross": base = outlineOnly
          ? `<rect x="17" y="4" width="10" height="36" rx="2" fill="none" stroke="${c}" stroke-width="3"/><rect x="4" y="17" width="36" height="10" rx="2" fill="none" stroke="${c}" stroke-width="3"/>`
          : `<rect x="17" y="4" width="10" height="36" rx="2" fill="${c}"/><rect x="4" y="17" width="36" height="10" rx="2" fill="${c}"/>`;
        break;
      default: base = `<circle cx="22" cy="22" r="17" ${fillAttr}/>`;
    }
    if(notch){ base += `<circle cx="36" cy="10" r="9" fill="#0B0E14"/>`; }
    return base;
  }

  /* ===================== تخطيطات ===================== */
  function scatterLayout(count, rng, jitter){
    const cols = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count/cols);
    const cellW = 100/cols, cellH = 100/rows; const pts = [];
    for(let i=0;i<count;i++){
      const col = i % cols, row = Math.floor(i/cols);
      const jx = (rng()-0.5) * (cellW*(jitter==null?0.5:jitter));
      const jy = (rng()-0.5) * (cellH*(jitter==null?0.5:jitter));
      pts.push({ x: Math.min(92, Math.max(8, col*cellW + cellW/2 + jx)), y: Math.min(85, Math.max(15, row*cellH + cellH/2 + jy)) });
    }
    return pts;
  }
  function rowLayout(count){
    const pts = []; const margin = 12; const span = 100 - margin*2;
    for(let i=0;i<count;i++){ pts.push({ x: margin + (span * (i/(count-1||1))), y: 50 }); }
    return pts;
  }
  function mirrorLayout(pairCount){
    const pts = []; const margin = 15; const span = 70 - margin;
    for(let i=0;i<pairCount;i++){ const y = margin + (span * (i/((pairCount-1)||1))); pts.push({ left:{x:32,y}, right:{x:68,y} }); }
    return pts;
  }
  function evenGrid(n){
    const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n/cols);
    const cellW = 100/cols, cellH = 100/rows; const pts = [];
    for(let i=0;i<n;i++){ const col=i%cols, row=Math.floor(i/cols); pts.push({x: col*cellW+cellW/2, y: row*cellH+cellH/2}); }
    return pts;
  }
  function uniqueCombos(rng, n){
    const combos=[]; const pal = activePalette(); const used=new Set(); let guard=0;
    while(combos.length<n && guard<500){
      guard++;
      const type = pick(rng, SHAPE_TYPES); const color = pick(rng, pal); const key = type+color;
      if(!used.has(key)){ used.add(key); combos.push({type,color}); }
    }
    return combos;
  }

  const DIFF_LABEL = {1:"سهل", 2:"متوسط", 3:"صعب", 4:"خبير"};

  /* ===================== حالة الجلسة ===================== */
  const state = {
    world:null, diff:1,
    settings:{ reducedMotion:false, colorBlind:false, sound:true },
    round:0, order:[], totalRounds:10,
    xp:0, combo:1, maxCombo:1, correctCount:0, mistakeCount:0,
    consecutiveMistakes:0, consecutiveCorrect:0, comfort:[], adaptiveOffset:0,
    reactionTimes:[], perTemplate:{},
    timerId:null, animId:null, memTimeoutId:null, roundStart:0, challenge:null,
    locked:false, paused:false, currentRemainingMs:0, lastTickSecond:null,
    /* حقل حرّ يستخدمه العالم لتتبّع مرحلته الداخلية (مثال: مراحل الحفظ في الذاكرة) */
    memoryPhase:null,
    seedCounter: Math.floor(Math.random()*1e9),
    manuallyDisabled:{}
  };
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ state.settings.reducedMotion = true; }

  const el = {};
  function cacheElements(){
    const ids = {
      setup:'screen-setup', game:'screen-game', result:'screen-result',
      worldSelect:'worldSelect', diffSelect:'diffSelect', settingsSelect:'settingsSelect',
      startBtn:'startBtn', tmplGrid:'tmplGrid', tmplGridLabel:'tmplGridLabel',
      hudTime:'hudTime', hudRound:'hudRound', hudCombo:'hudCombo', hudXP:'hudXP',
      pauseBtn:'pauseBtn', pauseOverlay:'pauseOverlay', resumeBtn:'resumeBtn', homeBtn:'homeBtn',
      tmplTag:'tmplTag', goalText:'goalText', timerFill:'timerFill', stage:'stage', overlayMsg:'overlayMsg',
      debugJson:'debugJson', pipeline:'pipeline', toast:'toast'
    };
    Object.keys(ids).forEach(k=>{ el[k] = document.getElementById(ids[k]); });
  }

  /* ===================== شبكة القوالب في الإعدادات ===================== */
  function renderTmplGrid(){
    el.tmplGrid.innerHTML = '';
    const w = WORLDS[state.world];
    w.keys.forEach(k=>{
      const d = document.createElement('div');
      const tmpl = w.templates[k];
      const locked = state.settings.reducedMotion && !!tmpl.requiresMotionMechanic;
      const manuallyOff = state.manuallyDisabled[state.world].has(k);
      d.className = 'tmpl-chip' + (locked ? ' locked' : (manuallyOff ? ' disabled' : ''));
      d.textContent = tmpl.name;
      d.title = locked ? 'مُستبعد تلقائيًا لأنه يعتمد على الحركة' : 'انقر لتفعيل/استبعاد هذا القالب';
      if(!locked){
        d.addEventListener('click', ()=>{
          const set = state.manuallyDisabled[state.world];
          if(set.has(k)) set.delete(k); else set.add(k);
          renderTmplGrid();
        });
      }
      el.tmplGrid.appendChild(d);
    });
  }

  function renderWorldIntro(){
    const info = WORLDS[state.world] && WORLDS[state.world].intro;
    const box = document.getElementById('worldIntro');
    if(box && info) box.innerHTML = info.icon + `<div>${info.text}</div>`;
  }

  function renderWorldSelect(){
    el.worldSelect.innerHTML = '';
    WORLD_ORDER.forEach(key=>{
      const w = WORLDS[key];
      const b = document.createElement('button');
      b.className = 'world-btn' + (key===state.world ? ' active' : '');
      b.dataset.w = key;
      b.innerHTML = `<span class="w-badge">${w.badge}</span>${w.label}`;
      el.worldSelect.appendChild(b);
    });
  }

  /* ===================== دولاب العوالم (اختيار العالم) ===================== */
  let orbitRotation = 0;
  let orbitDragging = false, orbitStartAngle = 0, orbitStartRotation = 0;
  let orbitDownX = 0, orbitDownY = 0, orbitMoveDist = 0, orbitAnimId = null;

  function angleOfPointer(e, rect){
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    return Math.atan2(e.clientY-cy, e.clientX-cx) * 180/Math.PI;
  }
  function orbitNodeAngle(i, n, rotation){ return -90 + i*(360/n) + rotation; }

  function positionOrbitNodes(rotation){
    const nodes = document.querySelectorAll('#orbitRing .orbit-node');
    const n = nodes.length; const radius = 95;
    nodes.forEach((node,i)=>{
      const rad = orbitNodeAngle(i, n, rotation) * Math.PI/180;
      const x = radius*Math.cos(rad), y = radius*Math.sin(rad);
      node.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    });
  }

  function renderOrbitRing(){
    const ring = document.getElementById('orbitRing');
    if(!ring) return;
    ring.innerHTML = '';
    WORLD_ORDER.forEach(key=>{
      const w = WORLDS[key];
      const node = document.createElement('div');
      node.className = 'orbit-node' + (key===state.world ? ' active' : '');
      node.dataset.key = key;
      node.title = w.label; node.setAttribute('aria-label', w.label); node.setAttribute('role','button');
      node.textContent = w.badge;
      ring.appendChild(node);
    });
    positionOrbitNodes(orbitRotation);
  }

  function updateOrbitHub(key){
    const world = WORLDS[key];
    const badgeEl = document.getElementById('orbitHubBadge');
    const nameEl = document.getElementById('orbitHubName');
    if(badgeEl) badgeEl.textContent = world.badge;
    if(nameEl) nameEl.textContent = world.label;
    document.querySelectorAll('#orbitRing .orbit-node').forEach(n=>{
      n.classList.toggle('active', n.dataset.key===key);
    });
  }

  function animateOrbitTo(target){
    cancelAnimationFrame(orbitAnimId);
    if(document.body.classList.contains('reduced-motion')){
      orbitRotation = target; positionOrbitNodes(orbitRotation); return;
    }
    const start = orbitRotation; const startTime = performance.now(); const dur = 320;
    function step(now){
      const t = Math.min(1, (now-startTime)/dur);
      const eased = 1 - Math.pow(1-t, 3);
      orbitRotation = start + (target-start)*eased;
      positionOrbitNodes(orbitRotation);
      if(t<1) orbitAnimId = requestAnimationFrame(step); else orbitRotation = target;
    }
    orbitAnimId = requestAnimationFrame(step);
  }

  function snapOrbitToWorld(key){
    const idx = WORLD_ORDER.indexOf(key);
    if(idx<0) return;
    const n = WORLD_ORDER.length;
    const baseTarget = -idx*(360/n);
    let target = baseTarget;
    while(target - orbitRotation > 180) target -= 360;
    while(target - orbitRotation < -180) target += 360;
    animateOrbitTo(target);
  }

  function orbitSnapToNearest(){
    const n = WORLD_ORDER.length; const step = 360/n;
    let bestIdx = 0, bestDiff = Infinity;
    for(let i=0;i<n;i++){
      let eff = ((-90 + i*step + orbitRotation) % 360 + 360) % 360;
      let d = Math.abs(eff-270); d = Math.min(d, 360-d);
      if(d<bestDiff){ bestDiff=d; bestIdx=i; }
    }
    const key = WORLD_ORDER[bestIdx];
    if(key !== state.world) switchWorld(key); else snapOrbitToWorld(key);
  }

  function initOrbitWheel(){
    renderOrbitRing();
    updateOrbitHub(state.world);
    const wheelEl = document.getElementById('orbitWheel');
    const ringEl = document.getElementById('orbitRing');
    if(!wheelEl || !ringEl) return;

    ringEl.addEventListener('pointerdown', (e)=>{
      orbitDragging = true; ringEl.classList.add('dragging');
      try{ ringEl.setPointerCapture(e.pointerId); }catch(err){}
      const rect = wheelEl.getBoundingClientRect();
      orbitStartAngle = angleOfPointer(e, rect);
      orbitStartRotation = orbitRotation;
      orbitDownX = e.clientX; orbitDownY = e.clientY; orbitMoveDist = 0;
      cancelAnimationFrame(orbitAnimId);
    });
    ringEl.addEventListener('pointermove', (e)=>{
      if(!orbitDragging) return;
      const rect = wheelEl.getBoundingClientRect();
      const curAngle = angleOfPointer(e, rect);
      orbitRotation = orbitStartRotation + (curAngle - orbitStartAngle);
      orbitMoveDist = Math.hypot(e.clientX-orbitDownX, e.clientY-orbitDownY);
      positionOrbitNodes(orbitRotation);
    });
    function endDrag(e){
      if(!orbitDragging) return;
      orbitDragging = false; ringEl.classList.remove('dragging');
      if(orbitMoveDist < 6){
        const nodeEl = e.target.closest ? e.target.closest('.orbit-node') : null;
        if(nodeEl){
          const key = nodeEl.dataset.key;
          if(key !== state.world) switchWorld(key); else snapOrbitToWorld(key);
          return;
        }
      }
      orbitSnapToNearest();
    }
    ringEl.addEventListener('pointerup', endDrag);
    ringEl.addEventListener('pointercancel', endDrag);
  }

  function switchWorld(key){
    state.world = key;
    [...el.worldSelect.children].forEach(b=>b.classList.toggle('active', b.dataset.w===key));
    renderTmplGrid();
    applyNebula(key);
    renderWorldBest();
    renderWorldIntro();
    updateOrbitHub(key);
    snapOrbitToWorld(key);
    fireHook('setupRender', { world: key });
  }

  function renderWorldBest(){
    const b = loadBest(state.world); const w = WORLDS[state.world];
    const info = document.getElementById('worldBestInfo');
    if(!info) return;
    if(b.totalSessions===0){
      info.innerHTML = `لم تلعب <b>${w.label}</b> من قبل — اصنع أول رقم قياسي لك الآن!`;
    } else {
      info.innerHTML = `أفضل نتيجة في <b>${w.label}</b>: <span class="hv">${toArabicDigits(b.bestXP)}</span> نقطة خبرة ·
        أفضل دقة <span class="hv">${toArabicDigits(b.bestAccuracy)}٪</span> ·
        ${toArabicDigits(b.totalSessions)} ${b.totalSessions===1?'جلسة':'جلسات'} ملعوبة`;
    }
  }

  function showToast(msg){ el.toast.textContent=msg; el.toast.classList.add('show'); clearTimeout(el.toast._t); el.toast._t=setTimeout(()=>el.toast.classList.remove('show'),2600); }

  function exitToHome(){
    clearInterval(state.timerId); cancelAnimationFrame(state.animId); clearTimeout(state.memTimeoutId);
    state.locked = true; state.paused = false; state.challenge = null;
    el.pauseOverlay.classList.remove('show');
    showSetup();
  }

  /* ===================== بدء الجلسة ===================== */
  function startSession(){
    const w = WORLDS[state.world];
    const rngOrder = makeRng(state.seedCounter++);
    const availableKeys = w.keys.filter(k=>{
      const tmpl = w.templates[k];
      const locked = state.settings.reducedMotion && !!tmpl.requiresMotionMechanic;
      return !locked && !state.manuallyDisabled[state.world].has(k);
    });
    if(availableKeys.length < 3){ showToast('تحتاج ٣ قوالب متاحة على الأقل لبدء الجلسة'); return; }
    const scoredCount = Math.min(9, availableKeys.length);
    state.order = shuffle(rngOrder, availableKeys).slice(0, scoredCount);
    state.totalRounds = 1 + scoredCount;
    state.round=0; state.xp=0; state.combo=1; state.maxCombo=1; state.correctCount=0; state.mistakeCount=0;
    state.consecutiveMistakes=0; state.consecutiveCorrect=0; state.comfort=[];
    state.adaptiveOffset=0; state.reactionTimes=[]; state.perTemplate={};
    el.setup.style.display='none'; el.result.style.display='none'; el.game.style.display='block';
    if(state.settings.reducedMotion && w.motionLockNotice){
      const anyLocked = w.keys.some(k=>w.templates[k].requiresMotionMechanic);
      if(anyLocked) showToast(w.motionLockNotice);
    }
    nextRound();
  }

  /* ===================== خط الأنابيب ===================== */
  const PIPE_ORDER = ['composer','generator','validator','randomizer','play','analytics'];
  function litPipeline(names){
    [...el.pipeline.children].forEach(n=>{ n.classList.remove('active','reject'); if(names.includes(n.dataset.n)) n.classList.add('active'); });
    let maxIdx = -1;
    names.forEach(n=>{ const i=PIPE_ORDER.indexOf(n); if(i>maxIdx) maxIdx=i; });
    const progressEl = document.getElementById('pipeProgress');
    if(progressEl){ progressEl.style.width = maxIdx>=0 ? ((maxIdx/(PIPE_ORDER.length-1))*100)+'%' : '0%'; }
  }
  function rejectPipeline(name){ [...el.pipeline.children].forEach(n=>{ if(n.dataset.n===name) n.classList.add('reject'); else n.classList.remove('active'); }); }

  /* خط الأنابيب الكامل مُعمَّمًا: كل عالم يمرّر دالة بناء ودالة تدقيق فقط.
     المولّد يُعيد المحاولة تلقائيًا ببذرة جديدة حتى ينجح المدقّق. */
  function runPipeline(opts){
    const build = opts.build, validate = opts.validate;
    const maxAttempts = opts.maxAttempts || 6;
    litPipeline(['composer']);
    setTimeout(()=>{
      litPipeline(['generator']);
      let seed = state.seedCounter++;
      let ch = build(seed);
      setTimeout(()=>{
        litPipeline(['validator']);
        let check = validate(ch); let attempts = 0;
        while(!check.valid && attempts < maxAttempts){
          rejectPipeline('validator');
          seed = state.seedCounter++;
          ch = build(seed); check = validate(ch); attempts++;
        }
        setTimeout(()=>{
          litPipeline(['randomizer']);
          setTimeout(()=>{ litPipeline(['play']); state.challenge = ch; opts.onReady(ch); }, 160);
        }, 160);
      }, 160);
    }, 160);
  }

  /* غلاف تحدٍّ موحّد لكل العوالم — يبني الحقول المشتركة ويترك payload للعالم */
  function makeChallenge(parts){
    return {
      id:`${parts.worldName}-${parts.templateKey}-${parts.roundIndex}-${parts.seed}`,
      world: parts.worldName,
      skill: parts.skill, input: parts.input, action: parts.action,
      rule: parts.rule, modifier: parts.modifier,
      templateKey: parts.templateKey, templateName: parts.templateName,
      difficulty: parts.difficulty, time: parts.time, goal: parts.goal,
      reward: `+${toArabicDigits(10+parts.difficulty*5)} نقطة خبرة`,
      seed: parts.seed, version:"١.٠"
    };
  }

  function updateHud(){ el.hudXP.textContent=toArabicDigits(Math.round(state.xp)); el.hudCombo.textContent='×'+toArabicDigits(Math.min(state.combo,4)); }

  function clearStage(){
    el.stage.innerHTML = '<div class="overlay-msg" id="overlayMsg"></div><div class="pause-overlay" id="pauseOverlay"><div class="ptxt">الجلسة متوقفة مؤقتًا</div><button class="resume-btn" id="resumeBtn">استمرار</button><button class="pause-exit-btn" id="pauseExitBtn">الخروج إلى الرئيسية</button></div>';
    el.overlayMsg = document.getElementById('overlayMsg'); el.pauseOverlay = document.getElementById('pauseOverlay'); el.resumeBtn = document.getElementById('resumeBtn');
    el.resumeBtn.addEventListener('click', togglePause);
    document.getElementById('pauseExitBtn').addEventListener('click', exitToHome);
    el.stage.classList.remove('feedback-correct','feedback-wrong');
  }

  function showRoundOverlay(text, cls){ el.overlayMsg.textContent=text; el.overlayMsg.classList.remove('win','lose'); el.overlayMsg.classList.add('show',cls); }

  /* ترويسة الجولة المشتركة (اسم القالب + الهدف + لوحة البيانات) */
  function renderChallengeHeader(ch, isWarmup, tagSuffix){
    el.debugJson.textContent = buildDebugText(ch);
    const suffix = tagSuffix != null ? tagSuffix
      : (isWarmup ? ` <span class="practice">(إحماء — لا تُحسب في النتيجة)</span>`
                  : ` · الجولة ${toArabicDigits(state.round-1)} من ${toArabicDigits(state.totalRounds-1)}`);
    el.tmplTag.innerHTML = ch.templateName + suffix;
    el.goalText.innerHTML = `<b>${ch.goal}</b>`;
  }

  /* ===================== المؤقّت العام (قابل لإعادة الاستخدام) ===================== */
  let currentExpireHandler = ()=>{};
  function startTimer(seconds, onExpire, allowTick, graceMs){
    graceMs = graceMs || 0;
    currentExpireHandler = onExpire || (()=>{});
    clearInterval(state.timerId);
    const total = seconds*1000; const graceEnd = performance.now()+graceMs;
    el.timerFill.classList.remove('low'); el.timerFill.style.width='100%';
    state.lastTickSecond = null;
    state.timerId = setInterval(()=>{
      const now = performance.now();
      if(now < graceEnd){ el.hudTime.textContent='استعد'; el.timerFill.style.width='100%'; return; }
      const elapsed = now-graceEnd; const remaining = Math.max(0,total-elapsed);
      state.currentRemainingMs = remaining;
      const pct = (remaining/total)*100;
      el.timerFill.style.width = pct+'%';
      el.hudTime.textContent = toArabicDigits((remaining/1000).toFixed(1));
      if(pct<25) el.timerFill.classList.add('low');
      if(allowTick){
        const secLeft = Math.ceil(remaining/1000);
        if(secLeft<=3 && secLeft>0 && secLeft!==state.lastTickSecond){ state.lastTickSecond=secLeft; playTick(); }
      }
      if(remaining<=0){ clearInterval(state.timerId); currentExpireHandler(); }
    }, 50);
  }

  function togglePause(){
    if(!state.challenge || state.locked) return;
    const w = WORLDS[state.world];
    if(w.canPause && !w.canPause(state.challenge)){
      showToast(w.pauseBlockedNotice || 'لا يمكن الإيقاف في هذه المرحلة');
      return;
    }
    state.paused = !state.paused;
    if(state.paused){
      clearInterval(state.timerId); cancelAnimationFrame(state.animId);
      el.pauseOverlay.classList.add('show');
    } else {
      el.pauseOverlay.classList.remove('show');
      const secLeft = Math.max(0.3, state.currentRemainingMs/1000);
      startTimer(secLeft, currentExpireHandler, true);
      if(w.onResume) w.onResume(state.challenge);
    }
  }

  /* ===================== التحليلات ونهاية الجولة ===================== */
  function recordTemplateResult(key, correct){
    if(!state.perTemplate[key]) state.perTemplate[key]={correct:0,total:0};
    state.perTemplate[key].total++; if(correct) state.perTemplate[key].correct++;
  }
  /* ===================== التكيّف ثنائي الاتجاه =====================
     يخفّض عند تكرار الخطأ، ويرفع عند التمكّن. الرفع مشروط بشرطين معًا:
     إجابات صحيحة متتالية **وسرعة مريحة** — لأن من يجيب صحيحًا في آخر لحظة
     متحدٍّ بالقدر المناسب، فرفع مستواه عقوبة لا مكافأة.
     السياسة دالة نقيّة تُعيد القرار فقط، ليمكن إجهادها في Node دون متصفح. */
  const ADAPT = {
    mistakesToLower: 2,   // خطآن متتاليان
    correctToRaise: 3,    // ثلاث إجابات صحيحة متتالية
    comfortRatio: 0.6,    // استُهلك ≤ ٦٠٪ من الوقت المتاح في كلٍّ منها
    minOffset: -2,
    maxOffset: 2
  };

  /* s = {consecutiveMistakes, consecutiveCorrect, comfort:[نِسَب], adaptiveOffset}
     تُعيد 'lower' أو 'raise' أو null */
  function adaptiveDecision(s, cfg){
    const c = cfg || ADAPT;
    if(s.consecutiveMistakes >= c.mistakesToLower && s.adaptiveOffset > c.minOffset) return 'lower';
    if(s.consecutiveCorrect >= c.correctToRaise && s.adaptiveOffset < c.maxOffset){
      const recent = (s.comfort || []).slice(-c.correctToRaise);
      if(recent.length === c.correctToRaise && recent.every(r => r <= c.comfortRatio)) return 'raise';
    }
    return null;
  }

  function resetAdaptiveWindow(){
    state.consecutiveMistakes = 0; state.consecutiveCorrect = 0; state.comfort = [];
  }

  function applyAdaptiveCheck(){
    const decision = adaptiveDecision(state);
    if(decision === 'lower'){
      state.adaptiveOffset -= 1; resetAdaptiveWindow();
      showToast('لاحظنا صعوبة متكررة — تم تخفيف مستوى التحدي تلقائيًا لمساعدتك');
    } else if(decision === 'raise'){
      state.adaptiveOffset += 1; resetAdaptiveWindow();
      showToast('أداء متمكّن وسريع — رُفع مستوى التحدي تلقائيًا');
    }
  }

  function finishRound(isCorrect, reactionMs, isWarmup){
    if(state.locked) return;
    state.locked = true;
    clearInterval(state.timerId); cancelAnimationFrame(state.animId); clearTimeout(state.memTimeoutId);
    const ch = state.challenge;
    if(isCorrect){
      showRoundOverlay('صحيح!','win'); playCorrect(); el.stage.classList.add('feedback-correct');
      if(!isWarmup){
        state.reactionTimes.push(reactionMs); state.correctCount++; state.combo++;
        state.consecutiveMistakes=0; state.consecutiveCorrect++;
        /* نسبة ما استُهلك من الوقت المتاح — مقياس "الراحة" الذي يشترطه الرفع */
        const budget = (ch.time || 0) * 1000;
        state.comfort.push(budget > 0 ? Math.min(1, reactionMs / budget) : 1);
        state.maxCombo = Math.max(state.maxCombo||1, Math.min(state.combo,4));
        const bonus = ch.time && (ch.time*1000-reactionMs)>0 ? 5 : 0;
        state.xp += (10 + ch.difficulty*5 + bonus) * Math.min(state.combo,4);
        recordTemplateResult(ch.templateKey, true);
        applyAdaptiveCheck();
      }
    } else {
      showRoundOverlay(reactionMs===null?'انتهى الوقت':'خطأ','lose');
      if(reactionMs===null) playTimeout(); else playWrong();
      el.stage.classList.add('feedback-wrong');
      if(!isWarmup){
        state.mistakeCount++; state.combo=1;
        state.consecutiveMistakes++; state.consecutiveCorrect=0; state.comfort=[];
        recordTemplateResult(ch.templateKey, false); applyAdaptiveCheck();
      }
    }
    updateHud(); litPipeline(['analytics']);
    setTimeout(nextRound, 900);
  }

  /* ===================== دورة الجولة العامة ===================== */
  function nextRound(){
    state.round += 1;
    el.hudRound.textContent = `${toArabicDigits(state.round)}/${toArabicDigits(state.totalRounds)}`;
    if(state.round > state.totalRounds){ return showResult(); }
    const isWarmup = state.round === 1;
    const w = WORLDS[state.world];
    const templateKey = isWarmup ? w.warmup : state.order[state.round-2];
    const baseDiff = isWarmup ? 1 : Math.min(4, state.diff + Math.floor((state.round-2)/3));
    const effectiveDiff = Math.max(1, Math.min(4, baseDiff + (isWarmup?0:state.adaptiveOffset)));
    /* المحرك يقود خط الأنابيب بنفسه: العالم يقدّم build/validate/render فقط */
    runPipeline({
      maxAttempts: w.maxAttempts || 6,
      build: (seed)=>w.build(templateKey, effectiveDiff, state.round, seed),
      validate: w.validate,
      onReady: (ch)=>w.render(ch, isWarmup)
    });
  }

  /* ===================== مُصيّرات عرض مشتركة بين العوالم ===================== */
  function makeShapeDiv(cfg){
    const div=document.createElement('div'); div.className='shape';
    const size=cfg.size||44; const hit=Math.max(44,size);
    div.style.width=hit+'px'; div.style.height=hit+'px'; div.style.left=cfg.x+'%'; div.style.top=cfg.y+'%';
    div.style.cursor = cfg.clickable ? 'pointer' : 'default';
    if(cfg.content!=null) div.innerHTML = cfg.content;
    else if(cfg.type) div.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 44 44">${shapeSVG(cfg.type,cfg.color,false,false)}</svg>`;
    return div;
  }

  /* نمط العرض "mc" — اختيار من متعدد (أرقام/ألوان/نص/أشكال) */
  function renderMC(options, optionType, onPick){
    clearStage();
    const wrap=document.createElement('div'); wrap.className='flex-center'; el.stage.appendChild(wrap);
    options.forEach(opt=>{
      const card=document.createElement('div'); card.className='opt-card';
      if(optionType==='number') card.innerHTML=`<div style="font-family:var(--font-num);font-size:26px;font-weight:700;">${toArabicDigits(opt.value)}</div>`;
      else if(optionType==='swatch') card.innerHTML=`<div style="width:44px;height:44px;border-radius:8px;background:${opt.value};"></div>`;
      else if(optionType==='text') card.innerHTML=`<div style="font-size:13px;font-weight:700;padding:2px 4px;">${opt.value}</div>`;
      else {
        const sz = 52 * (opt.value.scale||1);
        const rot = opt.value.angle ? `transform:rotate(${opt.value.angle}deg);` : '';
        card.innerHTML=`<svg width="${sz}" height="${sz}" viewBox="0 0 44 44" style="${rot}">${shapeSVG(opt.value.type,opt.value.color)}</svg>`;
      }
      card.addEventListener('click', ()=>onPick(opt.isCorrect, card));
      wrap.appendChild(card);
    });
  }

  /* نمط العرض "choice" — عناصر مبعثرة، اضغط الصحيح */
  function renderChoiceScatter(candidates, onResult){
    candidates.forEach(c=>{
      const visualSize = 44*(c.scale||1);
      const div = makeShapeDiv({x:c.x, y:c.y, type:c.type, color:c.color, size:visualSize, clickable:true});
      div.addEventListener('click', ()=>onResult(!!c.isCorrect, div));
      el.stage.appendChild(div);
    });
  }

  /* صف مرجعي علوي (يُعرض فوق خيارات mc عند الحاجة) */
  function renderReferenceRow(items){
    const row = document.createElement('div');
    row.style.cssText = 'position:absolute;left:0;right:0;top:10%;display:flex;justify-content:center;gap:10px;';
    items.forEach(it=>{
      const sz = 40 * (it.scale||1);
      const rot = it.angle ? `transform:rotate(${it.angle}deg);` : '';
      const box = document.createElement('div');
      box.innerHTML = `<svg width="${sz}" height="${sz}" viewBox="0 0 44 44" style="${rot}">${shapeSVG(it.type,it.color)}</svg>`;
      row.appendChild(box);
    });
    el.stage.appendChild(row);
  }

  /* ===================== لوحة البيانات المشتركة ===================== */
  function buildDebugText(ch){
    return `المعرّف: ${ch.id}\n` + `العالم: ${ch.world}\n` + `المهارة: ${ch.skill}\n` + `المُدخل: ${ch.input}\n` +
      `الفعل: ${ch.action}\n` + `القانون: ${ch.rule}\n` + `المؤثر: ${ch.modifier}\n` +
      `الصعوبة: ${DIFF_LABEL[ch.difficulty]}\n` + `الوقت: ${toArabicDigits(ch.time)} ثانية\n` +
      `الهدف: ${ch.goal}\n` + `المكافأة: ${ch.reward}\n` + `البذرة: ${toArabicDigits(ch.seed)}`;
  }

  /* ===================== نتيجة الجلسة ===================== */
  function showResult(){
    el.game.style.display='none'; el.result.style.display='block';
    const scored = state.totalRounds-1;
    const accuracy = scored>0 ? Math.round((state.correctCount/scored)*100) : 0;
    const avgReact = state.reactionTimes.length ? (state.reactionTimes.reduce((a,b)=>a+b,0)/state.reactionTimes.length/1000).toFixed(2) : '—';
    const w = WORLDS[state.world];
    let rank='لاعب جديد';
    if(accuracy>=90 && state.mistakeCount===0) rank = w.topRank || 'أداء بارع';
    else if(accuracy>=70) rank='متقدّم'; else if(accuracy>=40) rank='متعلّم';
    const perTmplRows = Object.keys(state.perTemplate).map(k=>{
      const t=state.perTemplate[k]; const ok=t.correct===t.total;
      return `<div class="row"><span>${w.templates[k].name}</span><span class="${ok?'ok':'bad'}">${toArabicDigits(t.correct)}/${toArabicDigits(t.total)}</span></div>`;
    }).join('');

    const sessionXP = Math.round(state.xp);
    const { updated, prev, isNewRecord } = saveBest(state.world, { xp:sessionXP, accuracy, combo: state.maxCombo||1 });
    let recordBlock = '';
    if(isNewRecord){
      playRecord();
      recordBlock = `<div class="record-banner">
        <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="currentColor"/></svg>
        رقم قياسي جديد! تجاوزت أفضل نتيجة سابقة (${toArabicDigits(prev.bestXP)} نقطة خبرة)
      </div>`;
    } else if(prev.totalSessions===0){
      recordBlock = `<div class="record-banner first">أول جلسة لك في ${w.label} — هذه بداية سجلّك</div>`;
    } else {
      recordBlock = `<div class="best-compare">أفضل نتيجة سابقة في ${w.label}: <span class="hv">${toArabicDigits(updated.bestXP)}</span> نقطة خبرة</div>`;
    }

    /* ملخّص الجلسة يُسلَّم للخطّافات — أي وحدة جانبية تسجّله أو تضيف كتلة عرض */
    const summary = {
      at: Date.now(), world: state.world, worldLabel: w.label,
      diff: state.diff, xp: sessionXP, accuracy,
      avgReactMs: state.reactionTimes.length
        ? Math.round(state.reactionTimes.reduce((a,b)=>a+b,0)/state.reactionTimes.length) : null,
      maxCombo: state.maxCombo || 1, rounds: scored,
      correct: state.correctCount, mistakes: state.mistakeCount
    };
    const extraBlocks = fireHook('sessionEnd', summary).join('');

    el.result.innerHTML = `
      <div class="result">
        <h2>نتيجة الجلسة — ${w.label}</h2>
        <div class="rank">${rank}</div>
        ${recordBlock}
        <div class="stat-grid">
          <div class="cell"><div class="v">${toArabicDigits(sessionXP)}</div><div class="l">الخبرة</div></div>
          <div class="cell"><div class="v">${toArabicDigits(accuracy)}٪</div><div class="l">الدقة</div></div>
          <div class="cell"><div class="v">${toArabicDigits(avgReact)} ث</div><div class="l">سرعة الاستجابة</div></div>
          <div class="cell"><div class="v">${toArabicDigits(state.mistakeCount)}</div><div class="l">الأخطاء</div></div>
        </div>
        ${extraBlocks}
        <div class="per-tmpl">${perTmplRows}</div>
        <button class="replay-btn" id="replayBtn">جلسة جديدة</button>
      </div>`;
    document.getElementById('replayBtn').addEventListener('click', ()=>{
      el.result.style.display='none'; showSetup();
    });
  }

  /* شاشة الإعداد: نقطة دخول واحدة حتى تُحدَّث كل عناصرها معًا */
  function showSetup(){
    el.game.style.display='none'; el.result.style.display='none'; el.setup.style.display='block';
    litPipeline([]); renderWorldBest();
    fireHook('setupRender', { world: state.world });
  }

  /* ===================== ربط الأحداث والإقلاع ===================== */
  function wireEvents(){
    el.worldSelect.addEventListener('click', (e)=>{ const b=e.target.closest('.world-btn'); if(!b) return; switchWorld(b.dataset.w); });
    el.diffSelect.addEventListener('click', (e)=>{ const b=e.target.closest('.diff-btn'); if(!b) return;
      [...el.diffSelect.children].forEach(c=>c.classList.remove('active')); b.classList.add('active'); state.diff=parseInt(b.dataset.d,10); });
    el.settingsSelect.addEventListener('click', (e)=>{ const b=e.target.closest('.diff-btn'); if(!b) return;
      b.classList.toggle('active'); state.settings[b.dataset.s]=b.classList.contains('active'); renderTmplGrid();
      if(b.dataset.s==='reducedMotion') applyReducedMotionClass(state.settings.reducedMotion); });
    el.startBtn.addEventListener('click', ()=>{
      ensureAudio(); playLaunch();
      el.startBtn.classList.add('launch');
      el.startBtn.disabled = true;
      setTimeout(()=>{ el.startBtn.classList.remove('launch'); el.startBtn.disabled=false; startSession(); }, 260);
    });
    el.pauseBtn.addEventListener('click', togglePause);

    let homeConfirmTimeout = null;
    el.homeBtn.addEventListener('click', ()=>{
      if(el.homeBtn.dataset.confirm==='1'){ el.homeBtn.dataset.confirm=''; exitToHome(); }
      else {
        el.homeBtn.dataset.confirm='1';
        showToast('اضغط مرة أخرى للخروج إلى الرئيسية — ستفقد تقدّم هذه الجلسة');
        clearTimeout(homeConfirmTimeout);
        homeConfirmTimeout = setTimeout(()=>{ el.homeBtn.dataset.confirm=''; }, 2500);
      }
    });
    el.resumeBtn.addEventListener('click', togglePause);
    const pauseExit = document.getElementById('pauseExitBtn');
    if(pauseExit) pauseExit.addEventListener('click', exitToHome);

    /* أثر "المذنّب" — شعاع خفيف يعبر أي زر عند الضغط، يتوقف تلقائيًا مع تقليل الحركة */
    document.addEventListener('click', function(e){
      if(document.body.classList.contains('reduced-motion')) return;
      const btn = e.target.closest('.world-btn,.diff-btn,.tmpl-chip,.start-btn,.replay-btn,.resume-btn,.pause-btn,.opt-card,.grid-cell,.tile-back');
      if(!btn) return;
      btn.classList.remove('zap'); void btn.offsetWidth; btn.classList.add('zap');
      setTimeout(()=>btn.classList.remove('zap'), 450);
    });
  }

  let booted = false;
  MAD.boot = function(){
    if(booted) return;
    if(WORLD_ORDER.length===0){ console.error('لم يُسجَّل أي عالم — تحقّق من ترتيب وسوم <script>'); return; }
    booted = true;
    cacheElements();
    const logo = document.getElementById('gameLogo');
    if(logo && window.LOGO_DATA) logo.src = window.LOGO_DATA;
    state.world = WORLD_ORDER[0];
    renderWorldSelect();
    renderTmplGrid();
    applyNebula(state.world);
    renderWorldBest();
    renderWorldIntro();
    initOrbitWheel();
    applyReducedMotionClass(state.settings.reducedMotion);
    if(state.settings.reducedMotion){ [...el.settingsSelect.children].forEach(b=>{ if(b.dataset.s==='reducedMotion') b.classList.add('active'); }); }
    wireEvents();
  };

  /* الإقلاع ذاتي: ينتظر اكتمال تحميل ملفات العوالم وتسجيلها، فلا حاجة لوسم إقلاع مضمّن */
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>MAD.boot());
  else setTimeout(()=>MAD.boot(), 0);

  /* ===================== ما يُصدّره المحرك للعوالم ===================== */
  Object.assign(MAD, {
    state, el,
    makeRng, randInt, pick, shuffle, toArabicDigits,
    activePalette, SHAPE_TYPES, SHAPE_AR, shapeSVG,
    colorDef, colorIndef, colorAdj, agree, shapeGender, SHAPE_INDEF, SHAPE_PLURAL, SHAPE_GENDER,
    counted, countedWith,
    scatterLayout, rowLayout, mirrorLayout, evenGrid, uniqueCombos,
    DIFF_LABEL,
    runPipeline, makeChallenge, renderChallengeHeader,
    clearStage, showRoundOverlay, startTimer, finishRound, showToast,
    loadBest, showSetup, adaptiveDecision, ADAPT,
    makeShapeDiv, renderMC, renderChoiceScatter, renderReferenceRow,
    playCorrect, playWrong, playStudyStart, playRecallStart
  });

})();
