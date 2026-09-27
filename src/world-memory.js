/* =====================================================================
   عالم ٠٢ — الذاكرة (world-memory.js)
   يحتوي مراحل الحفظ/الإخفاء/الاسترجاع الخاصة بالذاكرة وحدها.
   ===================================================================== */
(function(){
  "use strict";
  const {
    state, el, makeRng, randInt, pick, shuffle, toArabicDigits,
    activePalette, SHAPE_TYPES, SHAPE_AR, shapeSVG,
    colorDef, colorIndef, colorAdj, agree, SHAPE_INDEF, SHAPE_PLURAL,
    scatterLayout, rowLayout, mirrorLayout, evenGrid, uniqueCombos,
    makeChallenge, renderChallengeHeader, clearStage, startTimer, finishRound,
    makeShapeDiv, renderMC, playCorrect, playWrong, playStudyStart, playRecallStart
  } = MAD;

  /* ===================== محور صعوبة الذاكرة ===================== */
  function memoryDifficultyParams(diffLevel){
    const table = {1:{count:3,studyPerItem:1.0,recallTime:14,pairs:3}, 2:{count:4,studyPerItem:0.8,recallTime:11,pairs:4},
      3:{count:5,studyPerItem:0.65,recallTime:9,pairs:5}, 4:{count:6,studyPerItem:0.5,recallTime:7,pairs:6}};
    return table[diffLevel] || table[1];
  }

  /* ===================== القوالب ===================== */
  const MEM_TEMPLATES = {
    position: { name:"تذكّر الموقع", pattern:'grid',
      goal:(d)=>`أين ${agree(d.type,'كان','كانت')} ${SHAPE_AR[d.type]} ${colorAdj(d.color, d.type)}؟`,
      generate(rng,p){ const n=p.count; const combos=uniqueCombos(rng,n); const pts=scatterLayout(n,rng,0.3); const ci=randInt(rng,0,n-1);
        const slots=pts.map((pt,i)=>({id:i,type:combos[i].type,color:combos[i].color,x:pt.x,y:pt.y}));
        const recallSlots=slots.map((s,i)=>({id:i,x:s.x,y:s.y,placeholder:true,isCorrect:i===ci}));
        return {payload:{slots,recallSlots}, meta:{type:slots[ci].type,color:slots[ci].color}, studyTime:n*p.studyPerItem, pattern:'grid'}; },
      validate(ch){ const r=[]; if(ch.payload.recallSlots.filter(s=>s.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    changed: { name:"ماذا تغيّر؟", pattern:'grid',
      goal:()=>`أيّ شكل تغيّر عن المرة السابقة؟`,
      generate(rng,p){ const n=p.count; const combos=uniqueCombos(rng,n); const pts=scatterLayout(n,rng,0.3); const idx=randInt(rng,0,n-1);
        const slots=pts.map((pt,i)=>({id:i,type:combos[i].type,color:combos[i].color,x:pt.x,y:pt.y}));
        const changeType = rng()<0.5;
        let newType=slots[idx].type, newColor=slots[idx].color;
        if(changeType){ do{ newType=pick(rng,SHAPE_TYPES); }while(newType===slots[idx].type); }
        else { do{ newColor=pick(rng,activePalette()); }while(newColor===slots[idx].color); }
        const recallSlots=slots.map((s,i)=> i===idx ? {id:i,type:newType,color:newColor,x:s.x,y:s.y,isCorrect:true} : {id:i,type:s.type,color:s.color,x:s.x,y:s.y,isCorrect:false});
        return {payload:{slots,recallSlots}, meta:{}, studyTime:n*p.studyPerItem, pattern:'grid'}; },
      validate(ch){ const r=[]; if(ch.payload.recallSlots.filter(s=>s.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    missing: { name:"أين الغائب؟", pattern:'grid',
      goal:()=>`أين كان الشكل الذي اختفى؟`,
      generate(rng,p){ const n=p.count; const combos=uniqueCombos(rng,n); const pts=scatterLayout(n,rng,0.3); const idx=randInt(rng,0,n-1);
        const slots=pts.map((pt,i)=>({id:i,type:combos[i].type,color:combos[i].color,x:pt.x,y:pt.y}));
        const recallSlots=slots.map((s,i)=> i===idx ? {id:i,x:s.x,y:s.y,removed:true,isCorrect:true} : {id:i,type:s.type,color:s.color,x:s.x,y:s.y,isCorrect:false});
        return {payload:{slots,recallSlots}, meta:{}, studyTime:n*p.studyPerItem, pattern:'grid'}; },
      validate(ch){ const r=[]; if(ch.payload.recallSlots.filter(s=>s.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    count: { name:"تذكّر العدد", pattern:'mc',
      goal:()=>`كم عدد الأشكال التي ظهرت؟`,
      generate(rng,p){ const n=p.count; const combos=uniqueCombos(rng,n); const pts=scatterLayout(n,rng,0.3);
        const slots=pts.map((pt,i)=>({id:i,type:combos[i].type,color:combos[i].color,x:pt.x,y:pt.y}));
        const used=new Set([n]); const options=[{value:n,isCorrect:true}];
        while(options.length<4){ const d=Math.max(1,n+randInt(rng,-2,2)); if(!used.has(d)){ used.add(d); options.push({value:d,isCorrect:false}); } }
        return {payload:{slots, options:shuffle(rng,options), optionType:'number', studyMode:'simultaneous'}, meta:{}, studyTime:Math.max(2.5,n*0.5), pattern:'mc'}; },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    color: { name:"تذكّر اللون", pattern:'mc',
      goal:(d)=>`ما لون ${SHAPE_AR[d.type]} ${agree(d.type,'الذي ظهر','التي ظهرت')}؟`,
      generate(rng,p){ const type=pick(rng,SHAPE_TYPES); const color=pick(rng,activePalette()); const pal=activePalette();
        const options=shuffle(rng,pal).map(c=>({value:c,isCorrect:c===color}));
        return {payload:{slots:[{id:0,type,color,x:50,y:50}], options, optionType:'swatch', studyMode:'simultaneous'}, meta:{type}, studyTime:2.2, pattern:'mc'}; },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    first: { name:"الشكل الأول", pattern:'mc',
      goal:()=>`أي شكل ظهر أولًا في التسلسل؟`,
      generate(rng,p){ const n=Math.max(3,p.count); const combos=uniqueCombos(rng,n);
        const options=[{value:combos[0],isCorrect:true}]; const rest=combos.slice(1);
        shuffle(rng,rest).slice(0,3).forEach(c=>options.push({value:c,isCorrect:false}));
        return {payload:{slots:combos.map((c,i)=>({id:i,type:c.type,color:c.color})), options:shuffle(rng,options), optionType:'shape', studyMode:'sequential'}, meta:{}, studyTime:n*p.studyPerItem, pattern:'mc'}; },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    repeat: { name:"الشكل المكرَّر", pattern:'mc',
      goal:()=>`أي شكل تكرر ظهوره في التسلسل؟`,
      generate(rng,p){ const n=Math.max(3,p.count); const combos=uniqueCombos(rng,n); const ri=randInt(rng,0,n-1);
        const seq=combos.slice(); let ip; do{ ip=randInt(rng,0,seq.length); }while(Math.abs(ip-ri)<=1);
        seq.splice(ip,0,{type:combos[ri].type,color:combos[ri].color});
        const options=[{value:combos[ri],isCorrect:true}]; const others=combos.filter((c,i)=>i!==ri);
        shuffle(rng,others).slice(0,3).forEach(c=>options.push({value:c,isCorrect:false}));
        return {payload:{slots:seq.map((c,i)=>({id:i,type:c.type,color:c.color})), options:shuffle(rng,options), optionType:'shape', studyMode:'sequential'}, meta:{}, studyTime:seq.length*p.studyPerItem, pattern:'mc'}; },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },
    order: { name:"تذكّر الترتيب", pattern:'sequence', variant:'order',
      goal:()=>`انقر على الأشكال بالترتيب الذي ظهرت به`,
      generate(rng,p){ const n=Math.max(3,Math.min(6,p.count)); const combos=uniqueCombos(rng,n); const pts=scatterLayout(n,rng,0.3);
        const sp=shuffle(rng,[...Array(n).keys()]);
        const recallLayout=combos.map((c,oi)=>({type:c.type,color:c.color,x:pts[sp[oi]].x,y:pts[sp[oi]].y,refIndex:oi}));
        return {payload:{items:combos, recallLayout}, meta:{}, studyTime:n*p.studyPerItem, pattern:'sequence', variant:'order'}; },
      validate(ch){ const r=[]; if(ch.payload.items.length!==ch.payload.recallLayout.length) r.push("عدم تطابق الطول"); return r; }
    },
    path: { name:"تذكّر المسار", pattern:'sequence', variant:'path',
      goal:()=>`انقر على الخلايا بنفس ترتيب ظهورها`,
      generate(rng,p){ const gridN=9; const gridPts=evenGrid(gridN); const len=Math.max(3,Math.min(gridN,p.count+1));
        const cells=shuffle(rng,[...Array(gridN).keys()]).slice(0,len);
        return {payload:{gridPts, sequenceCells:cells}, meta:{}, studyTime:len*p.studyPerItem, pattern:'sequence', variant:'path'}; },
      validate(ch){ const r=[]; const c=ch.payload.sequenceCells; if(c.length<3||c.length>9) r.push("طول المسار خارج النطاق");
        if(new Set(c).size!==c.length) r.push("تكرار في الخلايا"); return r; }
    },
    pairs: { name:"طابق الأزواج", pattern:'pairs',
      goal:()=>`اعثر على جميع الأزواج المتطابقة`,
      generate(rng,p){ const pc=p.pairs; const combos=uniqueCombos(rng,pc); let tiles=[];
        combos.forEach((c,pid)=>{ tiles.push({pairId:pid,type:c.type,color:c.color}); tiles.push({pairId:pid,type:c.type,color:c.color}); });
        tiles=shuffle(rng,tiles).map((t,i)=>({...t,id:i})); const pts=evenGrid(tiles.length);
        tiles.forEach((t,i)=>{ t.x=pts[i].x; t.y=pts[i].y; });
        return {payload:{tiles, pairsCount:pc}, meta:{pairsCount:pc}, studyTime:0, recallTimeOverride:pc*7, pattern:'pairs'}; },
      validate(ch){ const r=[]; const byPair={}; ch.payload.tiles.forEach(t=>{ byPair[t.pairId]=(byPair[t.pairId]||0)+1; });
        Object.values(byPair).forEach(c=>{ if(c!==2) r.push("زوج غير مكتمل"); }); return r; }
    }
  };
  const MEM_KEYS = ["position","changed","missing","count","color","first","repeat","order","path","pairs"];

  /* ===================== مُصيّرات مراحل الذاكرة ===================== */
  function renderMemStudySimultaneous(slots){
    clearStage();
    slots.forEach(s=>{ el.stage.appendChild(makeShapeDiv({x:s.x,y:s.y,type:s.type,color:s.color})); });
  }
  function renderMemStudySequential(items, perItemSec, onDone){
    clearStage(); let idx=0;
    function showNext(){
      clearStage();
      if(idx>=items.length){ onDone(); return; }
      const it=items[idx];
      el.stage.appendChild(makeShapeDiv({x:50,y:50,type:it.type,color:it.color,size:76}));
      idx++;
      state.memTimeoutId = setTimeout(showNext, perItemSec*1000);
    }
    showNext();
  }
  function renderPathStudySequential(gridPts, cells, perItemSec, onDone){
    clearStage();
    const cellDivs = gridPts.map((pt,i)=>{
      const d=document.createElement('div'); d.className='grid-cell'; d.style.left=pt.x+'%'; d.style.top=pt.y+'%'; d.dataset.idx=i;
      el.stage.appendChild(d); return d;
    });
    let step=0;
    function showNext(){
      if(step>0) cellDivs[cells[step-1]].classList.remove('hl');
      if(step>=cells.length){ state.memTimeoutId=setTimeout(onDone, 200); return; }
      cellDivs[cells[step]].classList.add('hl');
      step++;
      state.memTimeoutId = setTimeout(showNext, perItemSec*1000);
    }
    showNext();
  }
  function renderMemHideScreen(){
    clearStage();
    const t=document.createElement('div'); t.className='study-text'; t.textContent='تذكّر...';
    const wrap=document.createElement('div'); wrap.className='flex-center'; wrap.appendChild(t); el.stage.appendChild(wrap);
  }
  function renderMemRecallGrid(recallSlots, onPick){
    clearStage();
    recallSlots.forEach(s=>{
      let content=null;
      if(s.placeholder) content=`<div style="width:20px;height:20px;border-radius:50%;background:var(--line);"></div>`;
      else if(s.removed) content=`<div style="width:10px;height:10px;border-radius:50%;background:var(--line);opacity:.6;"></div>`;
      const div=makeShapeDiv({x:s.x,y:s.y,type:(s.placeholder||s.removed)?null:s.type,color:s.color,content,clickable:true});
      div.addEventListener('click', ()=>onPick(!!s.isCorrect, div));
      el.stage.appendChild(div);
    });
  }
  function renderMemRecallSequenceOrder(recallLayout, onProgress){
    clearStage(); let expected=0;
    recallLayout.forEach(item=>{
      const div=makeShapeDiv({x:item.x,y:item.y,type:item.type,color:item.color,clickable:true});
      div.addEventListener('click', ()=>{
        if(div.dataset.done) return;
        if(item.refIndex===expected){
          div.classList.add('correct-flash'); div.style.outline='2px solid var(--mint)'; div.dataset.done='1'; expected++;
          if(expected>=recallLayout.length) onProgress(true);
        } else { onProgress(false); }
      });
      el.stage.appendChild(div);
    });
  }
  function renderMemRecallPath(gridPts, sequenceCells, onProgress){
    clearStage(); let expected=0;
    const cellDivs = gridPts.map((pt,i)=>{
      const d=document.createElement('div'); d.className='grid-cell'; d.style.left=pt.x+'%'; d.style.top=pt.y+'%';
      d.addEventListener('click', ()=>{
        if(d.classList.contains('done')) return;
        if(i===sequenceCells[expected]){ d.classList.add('done'); expected++; if(expected>=sequenceCells.length) onProgress(true); }
        else onProgress(false);
      });
      el.stage.appendChild(d); return d;
    });
  }
  function renderMemPairsRound(ch, isWarmup){
    clearStage();
    const { tiles, pairsCount } = ch.payload;
    let flipped = []; let matched = 0;
    const tileDivs = tiles.map(t=>{
      const div=document.createElement('div'); div.className='shape'; div.style.width='48px'; div.style.height='48px';
      div.style.left=t.x+'%'; div.style.top=t.y+'%'; div.style.cursor='pointer';
      div.innerHTML = `<div class="tile-back">؟</div>`;
      div.addEventListener('click', ()=>{
        if(state.paused || state.locked) return;
        if(div.dataset.matched || div.dataset.up) return;
        if(flipped.length>=2) return;
        div.dataset.up='1';
        div.innerHTML = `<svg width="44" height="44" viewBox="0 0 44 44">${shapeSVG(t.type,t.color)}</svg>`;
        flipped.push({tile:t, div});
        if(flipped.length===2){
          const [a,b]=flipped;
          if(a.tile.pairId===b.tile.pairId){
            setTimeout(()=>{
              a.div.dataset.matched='1'; b.div.dataset.matched='1';
              a.div.querySelector('svg').parentElement.style.opacity='0.35'; b.div.querySelector('svg').parentElement.style.opacity='0.35';
              matched++; flipped=[]; playCorrect();
              if(matched===pairsCount){ finishRound(true, performance.now()-state.roundStart, isWarmup); }
            }, 250);
          } else {
            state.mistakeCount++; playWrong();
            setTimeout(()=>{
              a.div.innerHTML=`<div class="tile-back">؟</div>`; b.div.innerHTML=`<div class="tile-back">؟</div>`;
              delete a.div.dataset.up; delete b.div.dataset.up; flipped=[];
            }, 550);
          }
        }
      });
      el.stage.appendChild(div);
      return div;
    });
    state.locked=false; state.roundStart=performance.now();
    startTimer(ch.time, ()=>{ if(!state.locked) finishRound(false, null, isWarmup); }, true, 700);
  }

  /* ===================== زمن التشغيل ===================== */
  function buildMemChallenge(templateKey, difficulty, roundIndex, seed){
    const dp = memoryDifficultyParams(difficulty);
    const tmpl = MEM_TEMPLATES[templateKey];
    const gen = tmpl.generate(makeRng(seed), dp);
    const ch = makeChallenge({
      worldName:"ذاكرة", skill:"الذاكرة", input:"متنوع", action:"تذكّر",
      rule: tmpl.name, modifier:"بلا حركة",
      templateKey, templateName: tmpl.name, difficulty, roundIndex, seed,
      time: gen.recallTimeOverride || dp.recallTime,
      goal: tmpl.goal(gen.meta)
    });
    ch.world = "الذاكرة";
    ch.payload = gen.payload; ch.pattern = gen.pattern; ch.variant = gen.variant; ch.studyTime = gen.studyTime;
    return ch;
  }
  function validateMemChallenge(ch){
    const t = MEM_TEMPLATES[ch.templateKey].validate(ch);
    return { valid: t.length===0, reasons: t };
  }

  function runMemoryPhases(ch, isWarmup){
    if(ch.pattern==='pairs'){
      renderChallengeHeader(ch, isWarmup);
      state.memoryPhase='recall';
      renderMemPairsRound(ch, isWarmup);
      return;
    }
    renderChallengeHeader(ch, isWarmup, ' · <span class="practice">احفظ الآن</span>' + (isWarmup?' (إحماء)':''));
    state.memoryPhase='study'; playStudyStart();
    el.timerFill.style.width='100%'; el.hudTime.textContent='—';

    const doHideThenRecall = ()=>{
      state.memoryPhase='hide'; renderMemHideScreen();
      state.memTimeoutId = setTimeout(()=>{
        state.memoryPhase='recall'; playRecallStart();
        startMemoryRecall(ch, isWarmup);
      }, 550);
    };
    const dp = memoryDifficultyParams(ch.difficulty);
    if(ch.pattern==='mc' && ch.payload.studyMode==='sequential'){ renderMemStudySequential(ch.payload.slots, dp.studyPerItem, doHideThenRecall); }
    else if(ch.pattern==='mc'){ renderMemStudySimultaneous(ch.payload.slots); state.memTimeoutId=setTimeout(doHideThenRecall, ch.studyTime*1000); }
    else if(ch.pattern==='grid'){ renderMemStudySimultaneous(ch.payload.slots); state.memTimeoutId=setTimeout(doHideThenRecall, ch.studyTime*1000); }
    else if(ch.pattern==='sequence' && ch.variant==='order'){ renderMemStudySequential(ch.payload.items, dp.studyPerItem, doHideThenRecall); }
    else if(ch.pattern==='sequence' && ch.variant==='path'){ renderPathStudySequential(ch.payload.gridPts, ch.payload.sequenceCells, dp.studyPerItem, doHideThenRecall); }
  }

  function startMemoryRecall(ch, isWarmup){
    state.locked=false; state.roundStart = performance.now();
    const onResult = (correct)=>finishRound(correct, performance.now()-state.roundStart, isWarmup);
    if(ch.pattern==='mc') renderMC(ch.payload.options, ch.payload.optionType, onResult);
    else if(ch.pattern==='grid') renderMemRecallGrid(ch.payload.recallSlots, onResult);
    else if(ch.pattern==='sequence' && ch.variant==='order') renderMemRecallSequenceOrder(ch.payload.recallLayout, onResult);
    else if(ch.pattern==='sequence' && ch.variant==='path') renderMemRecallPath(ch.payload.gridPts, ch.payload.sequenceCells, onResult);
    startTimer(ch.time, ()=>{ if(!state.locked) finishRound(false, null, isWarmup); }, true, 700);
  }

  /* ===================== التسجيل في المحرك ===================== */
  MAD.registerWorld({
    key:'memory', badge:'٢',
    name:"الذاكرة", label:"عالم الذاكرة", skillName:"الذاكرة", input:"متنوع", action:"تذكّر",
    topRank:"ذاكرة حديدية",
    nebula:{ a:'#5C2A7A', b:'#3A2A5C' },
    accent:{ solid:'#6D3FC4', dim:'rgba(109,63,196,0.12)' },
    intro:{
      icon: `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18 9 9 0 000-18z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l4 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      text: `<b>عالم الذاكرة</b> تحدٍّ في الاحتفاظ بما رأيته. سيظهر أمامك شكل أو ترتيب أو موقع لثوانٍ معدودة لتحفظه، ثم يُخفى — وعليك استرجاعه بالضغط الصحيح بعد اختفائه.`
    },
    keys: MEM_KEYS, templates: MEM_TEMPLATES, warmup:"count",
    canPause(){ return state.memoryPhase==='recall'; },
    pauseBlockedNotice: 'لا يمكن الإيقاف أثناء الحفظ',
    maxAttempts: 6,
    build: buildMemChallenge,
    validate: validateMemChallenge,
    render: runMemoryPhases
  });

})();
