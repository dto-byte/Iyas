/* =====================================================================
   عالم ٠١ — الملاحظة (world-observation.js)
   قوالب + زمن تشغيل + تسجيل في المحرك. لا يعدّل هذا الملف المحرك إطلاقًا.
   ===================================================================== */
(function(){
  "use strict";
  const {
    state, el, makeRng, randInt, pick, shuffle, toArabicDigits,
    activePalette, SHAPE_TYPES, SHAPE_AR, shapeSVG,
    colorDef, colorIndef, colorAdj, agree, SHAPE_INDEF, SHAPE_PLURAL,
    scatterLayout, rowLayout, mirrorLayout, evenGrid, uniqueCombos,
    makeChallenge, renderChallengeHeader, clearStage, startTimer, finishRound
  } = MAD;

  /* ===================== محور صعوبة الملاحظة ===================== */
  function difficultyParams(diffLevel){
    const table = {1:{count:4,time:20,speed:0.10}, 2:{count:6,time:16,speed:0.16}, 3:{count:8,time:13,speed:0.24}, 4:{count:10,time:10,speed:0.34}};
    return table[diffLevel] || table[1];
  }

  /* ===================== القوالب ===================== */
  const OBS_TEMPLATES = {
    different: { name:"الشكل المختلف", motion:true, requiresMotionMechanic:false,
      goal:(d)=>`ابحث عن ${SHAPE_AR[d.minorType]} ${agree(d.minorType,'الغريب','الغريبة')} بين ${toArabicDigits(d.count-1)} ${SHAPE_PLURAL[d.majorType]}`,
      generate(rng,p){
        const majorType=pick(rng,SHAPE_TYPES); let minorType=pick(rng,SHAPE_TYPES);
        while(minorType===majorType) minorType=pick(rng,SHAPE_TYPES);
        const color=pick(rng,activePalette()); const pts=scatterLayout(p.count,rng); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>{ const a=rng()*Math.PI*2; return {id:i,type:i===ci?minorType:majorType,color,x:pt.x,y:pt.y,vx:Math.cos(a)*p.speed,vy:Math.sin(a)*p.speed,isCorrect:i===ci}; });
        return {shapes, meta:{majorType,minorType,count:p.count}};
      },
      validate(ch){ const r=[]; if(ch.shapes.filter(s=>s.isCorrect).length!==1) r.push("عدد الحلول ليس ١");
        const t=new Set(ch.shapes.filter(s=>!s.isCorrect).map(s=>s.type)); if(t.size!==1) r.push("العناصر غير المصححة ليست من نفس النوع"); return r; }
    },
    missing: { name:"القطعة الناقصة", motion:false, requiresMotionMechanic:false,
      goal:()=>`ابحث عن الشكل الذي ينقصه جزء`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES.filter(t=>t!=="cross")); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng,0.3); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>({id:i,type,color,x:pt.x,y:pt.y,vx:0,vy:0,notch:i===ci,isCorrect:i===ci}));
        return {shapes, meta:{type,count:p.count}}; },
      validate(ch){ const r=[]; if(ch.shapes.filter(s=>s.isCorrect).length!==1) r.push("عدد الحلول ليس ١");
        if(ch.shapes.filter(s=>s.notch).length!==1) r.push("أكثر من عنصر ناقص"); return r; }
    },
    hidden: { name:"الشكل المموّه", motion:false, requiresMotionMechanic:false,
      goal:(d)=>`ابحث عن ${SHAPE_AR[d.type]} ${agree(d.type,'المموّه','المموّهة')}`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng,0.3); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>({id:i,type,color,x:pt.x,y:pt.y,vx:0,vy:0,opacity:i===ci?0.22:1,isCorrect:i===ci}));
        return {shapes, meta:{type,count:p.count}}; },
      validate(ch){ const r=[]; const low=ch.shapes.filter(s=>s.opacity<0.5); if(low.length!==1) r.push("أكثر من عنصر مموّه");
        if(low[0]&&!low[0].isCorrect) r.push("العنصر المموّه ليس الحل"); return r; }
    },
    moving: { name:"الشكل المتحرك", motion:true, requiresMotionMechanic:true,
      goal:(d)=>`ابحث عن ${SHAPE_AR[d.type]} ${agree(d.type,'الوحيد المتحرك','الوحيدة المتحركة')}`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng,0.35); const ci=randInt(rng,0,p.count-1); const a=rng()*Math.PI*2; const spd=p.speed>0?p.speed:0.2;
        const shapes=pts.map((pt,i)=>({id:i,type,color,x:pt.x,y:pt.y,vx:i===ci?Math.cos(a)*spd*1.6:0,vy:i===ci?Math.sin(a)*spd*1.6:0,isCorrect:i===ci}));
        return {shapes, meta:{type,count:p.count}}; },
      validate(ch){ const r=[]; const m=ch.shapes.filter(s=>Math.abs(s.vx)+Math.abs(s.vy)>0.001); if(m.length!==1) r.push("أكثر من عنصر متحرك");
        if(m[0]&&!m[0].isCorrect) r.push("العنصر المتحرك ليس الحل"); return r; }
    },
    changed: { name:"الشكل المتغيّر", motion:false, requiresMotionMechanic:true,
      goal:(d)=>`ابحث عن ${SHAPE_AR[d.type]} ${agree(d.type,'الذي يومض','التي تومض')} باستمرار`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng,0.3); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>({id:i,type,color,x:pt.x,y:pt.y,vx:0,vy:0,flicker:i===ci,isCorrect:i===ci}));
        return {shapes, meta:{type,count:p.count}, minTimeOverride:6}; },
      validate(ch){ const r=[]; const a=ch.shapes.filter(s=>s.flicker); if(a.length!==1) r.push("أكثر من عنصر متغيّر");
        if(ch.time<6) r.push("الوقت غير كافٍ لملاحظة التغيّر"); return r; }
    },
    largest: { name:"الشكل الأكبر", motion:true, requiresMotionMechanic:false,
      goal:(d)=>`ابحث عن ${SHAPE_AR[d.type]} الأكبر حجمًا`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>{ const a=rng()*Math.PI*2; return {id:i,type,color,x:pt.x,y:pt.y,vx:Math.cos(a)*p.speed,vy:Math.sin(a)*p.speed,scale:i===ci?1.6:1,isCorrect:i===ci}; });
        return {shapes, meta:{type,count:p.count}}; },
      validate(ch){ const r=[]; const sc=ch.shapes.map(s=>s.scale||1); const mx=Math.max(...sc); const w=ch.shapes.filter(s=>(s.scale||1)===mx);
        if(w.length!==1) r.push("أكثر من عنصر بالحجم الأكبر"); if(mx<1.35) r.push("الفرق في الحجم غير واضح كفاية");
        if(w[0]&&!w[0].isCorrect) r.push("الأكبر ليس الحل المسجّل"); return r; }
    },
    smallest: { name:"الشكل الأصغر", motion:true, requiresMotionMechanic:false,
      goal:(d)=>`ابحث عن ${SHAPE_AR[d.type]} الأصغر حجمًا`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>{ const a=rng()*Math.PI*2; return {id:i,type,color,x:pt.x,y:pt.y,vx:Math.cos(a)*p.speed,vy:Math.sin(a)*p.speed,scale:i===ci?0.55:1,isCorrect:i===ci}; });
        return {shapes, meta:{type,count:p.count}}; },
      validate(ch){ const r=[]; const sc=ch.shapes.map(s=>s.scale||1); const mn=Math.min(...sc); const w=ch.shapes.filter(s=>(s.scale||1)===mn);
        if(w.length!==1) r.push("أكثر من عنصر بالحجم الأصغر"); if(mn>0.7) r.push("الفرق في الحجم غير واضح كفاية");
        if(w[0]&&!w[0].isCorrect) r.push("الأصغر ليس الحل المسجّل"); return r; }
    },
    shadow: { name:"الظل", motion:false, requiresMotionMechanic:false,
      goal:(d)=>`ابحث عن الظل (المحدَّد بلا تعبئة) بين ${SHAPE_PLURAL[d.type]}`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette());
        const pts=scatterLayout(p.count,rng,0.3); const ci=randInt(rng,0,p.count-1);
        const shapes=pts.map((pt,i)=>({id:i,type,color,x:pt.x,y:pt.y,vx:0,vy:0,outline:i===ci,isCorrect:i===ci}));
        return {shapes, meta:{type,count:p.count}}; },
      validate(ch){ const r=[]; const sh=ch.shapes.filter(s=>s.outline); if(sh.length!==1) r.push("أكثر من ظل واحد");
        if(sh[0]&&!sh[0].isCorrect) r.push("الظل ليس الحل المسجّل"); return r; }
    },
    reflection: { name:"كسر التناظر", motion:false, requiresMotionMechanic:false,
      goal:()=>`ابحث عن الزوج الذي يكسر التناظر المرآوي`,
      generate(rng,p){ const pc=Math.max(3,Math.min(6,Math.round(p.count/2))); const color=pick(rng,activePalette());
        const pts=mirrorLayout(pc); const mm=randInt(rng,0,pc-1); const shapes=[]; let idc=0;
        pts.forEach((pair,i)=>{ const type=pick(rng,SHAPE_TYPES); let rt=type; const mis=i===mm;
          if(mis){ do{ rt=pick(rng,SHAPE_TYPES); }while(rt===type); }
          shapes.push({id:idc++,type,color,x:pair.left.x,y:pair.left.y,vx:0,vy:0,isCorrect:mis,side:'left'});
          shapes.push({id:idc++,type:rt,color,x:pair.right.x,y:pair.right.y,vx:0,vy:0,isCorrect:mis,side:'right'}); });
        return {shapes, meta:{pairCount:pc}, drawMirrorLine:true}; },
      validate(ch){ const r=[]; const c=ch.shapes.filter(s=>s.isCorrect); if(c.length!==2) r.push("عدد عناصر الحل غير صحيح"); return r; }
    },
    pattern: { name:"كاسر النمط", motion:false, requiresMotionMechanic:false,
      goal:()=>`ابحث عن العنصر الذي يكسر نمط الألوان المتكرر`,
      generate(rng,p){ const count=Math.max(6,Math.min(10,p.count+2)); const type=pick(rng,SHAPE_TYPES.filter(t=>t==="circle"||t==="square"||t==="diamond"));
        const cl=pick(rng,[2,3]); const cc=shuffle(rng,activePalette()).slice(0,cl); const pts=rowLayout(count); const bi=randInt(rng,1,count-2);
        let wc=pick(rng,activePalette()); const exp=cc[bi%cl]; while(wc===exp){ wc=pick(rng,activePalette()); }
        const shapes=pts.map((pt,i)=>{ const e=cc[i%cl]; const color=i===bi?wc:e; return {id:i,type,color,x:pt.x,y:pt.y,vx:0,vy:0,isCorrect:i===bi}; });
        return {shapes, meta:{count,cl}}; },
      validate(ch){ const r=[]; if(ch.shapes.filter(s=>s.isCorrect).length!==1) r.push("عدد كاسرات النمط ليس ١"); return r; }
    }
  };
  const OBS_KEYS = ["different","missing","hidden","moving","changed","largest","smallest","shadow","reflection","pattern"];

  /* ===================== زمن التشغيل ===================== */
  function generateObsChallenge(templateKey, difficulty, roundIndex, seed){
    const rng = makeRng(seed);
    let p = difficultyParams(difficulty);
    if(state.settings.reducedMotion) p = Object.assign({}, p, {speed:0});
    const tmpl = OBS_TEMPLATES[templateKey];
    const built = tmpl.generate(rng, p);
    const time = built.minTimeOverride ? Math.max(p.time, built.minTimeOverride) : p.time;
    const ch = makeChallenge({
      worldName:"ملاحظة", skill:"الملاحظة", input:"الأشكال", action:"ابحث",
      rule: tmpl.name, modifier: tmpl.motion ? "عناصر متحركة" : "تخطيط ثابت",
      templateKey, templateName: tmpl.name, difficulty, roundIndex, seed,
      time, goal: tmpl.goal(built.meta)
    });
    ch.world = "الملاحظة";
    ch.shapes = built.shapes;
    ch.drawMirrorLine = !!built.drawMirrorLine;
    return ch;
  }

  /* ميزانية مسح العنصر الواحد بالثواني — تنقص مع الصعوبة لأن ضغط الوقت هو جوهر
     الصعوبة نفسها. كانت ثابتة على ١.٣ فكان مستوى الخبير (١٠ عناصر / ١٠ ثوانٍ)
     يُرفض دائمًا: ٧ عمليات توليد مهدورة لكل جولة ومدقّق بلا أثر.
     لا يغيّر هذا شيئًا يراه اللاعب — الجولة كانت تُلعب بعد الرفض على أي حال. */
  const SCAN_BUDGET = {1:1.3, 2:1.2, 3:1.1, 4:0.95};
  /* "كسر التناظر" أسرع مسحًا: العناصر مرتّبة أزواجًا متناظرة لا مبعثرة */
  const REFLECTION_FACTOR = 0.75;

  function validateObsChallenge(ch){
    const reasons = [];
    if(ch.shapes.length<3 || ch.shapes.length>14) reasons.push("عدد العناصر خارج النطاق المسموح");
    const perItem = (SCAN_BUDGET[ch.difficulty] || 1.3) * (ch.templateKey==="reflection" ? REFLECTION_FACTOR : 1);
    const minTime = ch.shapes.length * perItem;
    if(ch.time<minTime) reasons.push("الوقت غير كافٍ");
    const t = OBS_TEMPLATES[ch.templateKey].validate(ch);
    return { valid: reasons.length===0 && t.length===0, reasons: reasons.concat(t) };
  }

  function startMotion(ch){
    cancelAnimationFrame(state.animId);
    const nodes = [...el.stage.querySelectorAll('.shape')];
    function tick(){
      ch.shapes.forEach((s,i)=>{
        s.x+=s.vx; s.y+=s.vy;
        if(s.x<6||s.x>94) s.vx*=-1; if(s.y<12||s.y>88) s.vy*=-1;
        s.x=Math.min(94,Math.max(6,s.x)); s.y=Math.min(88,Math.max(12,s.y));
        if(nodes[i]){ nodes[i].style.left=s.x+'%'; nodes[i].style.top=s.y+'%'; }
      });
      state.animId = requestAnimationFrame(tick);
    }
    tick();
  }

  function renderObsChallenge(ch, isWarmup){
    renderChallengeHeader(ch, isWarmup);
    clearStage();
    if(ch.drawMirrorLine){ const line=document.createElement('div'); line.className='mirror-line'; el.stage.appendChild(line); }
    ch.shapes.forEach(s=>{
      const div=document.createElement('div'); div.className='shape'+(s.flicker?' flicker-anim':'');
      const visualSize=44*(s.scale||1); const hitSize=Math.max(44,visualSize);
      div.style.width=hitSize+'px'; div.style.height=hitSize+'px'; div.style.left=s.x+'%'; div.style.top=s.y+'%';
      div.style.opacity = s.opacity!=null ? s.opacity : 1;
      div.innerHTML = `<svg width="${visualSize}" height="${visualSize}" viewBox="0 0 44 44">${shapeSVG(s.type,s.color,!!s.notch,!!s.outline)}</svg>`;
      div.dataset.id=s.id;
      div.addEventListener('click', ()=>{
        if(state.locked || state.paused) return;
        const reaction = performance.now()-state.roundStart;
        div.classList.add(s.isCorrect?'correct-flash':'wrong-flash');
        finishRound(s.isCorrect, reaction, isWarmup);
      });
      el.stage.appendChild(div);
    });
    state.locked=false; state.roundStart=performance.now();
    startTimer(ch.time, ()=>{ if(!state.locked) finishRound(false, null, isWarmup); }, true, 900);
    if(OBS_TEMPLATES[ch.templateKey].motion && !state.settings.reducedMotion) startMotion(ch);
    else cancelAnimationFrame(state.animId);
  }

  /* ===================== التسجيل في المحرك ===================== */
  MAD.registerWorld({
    key:'observation', badge:'١',
    name:"الملاحظة", label:"عالم الملاحظة", skillName:"الملاحظة", input:"الأشكال", action:"ابحث",
    topRank:"ملاحظ بارع",
    nebula:{ a:'#2D4E8A', b:'#2A5C6E' },
    accent:{ solid:'#5B8CFF', dim:'rgba(91,140,255,0.18)' },
    intro:{
      icon: `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`,
      text: `<b>عالم الملاحظة</b> يقيس سرعة انتباهك للتفاصيل الدقيقة. ستظهر مجموعة أشكال متشابهة، ومهمتك العثور على العنصر المختلف بينها — أحيانًا بالنوع، الحجم، اللون، أو حتى الحركة — قبل انتهاء الوقت.`
    },
    keys: OBS_KEYS, templates: OBS_TEMPLATES, warmup:"different",
    motionLockNotice: 'قوالب "الشكل المتحرك" و"الشكل المتغيّر" مُستبعدة لأنها تعتمد جوهريًا على الحركة',
    onResume(ch){ if(OBS_TEMPLATES[ch.templateKey].motion && !state.settings.reducedMotion) startMotion(ch); },
    maxAttempts: 6,
    build: generateObsChallenge,
    validate: validateObsChallenge,
    render: renderObsChallenge
  });

})();
