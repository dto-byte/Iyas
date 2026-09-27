/* =====================================================================
   عالم ٠٤ — الأنماط (world-pattern.js)
   إدراك البنية البصرية: دوران، تناظر، امتداد زخرفي، كثافة.
   ===================================================================== */
(function(){
  "use strict";
  const {
    state, el, makeRng, randInt, pick, shuffle, toArabicDigits,
    activePalette, SHAPE_TYPES, SHAPE_AR, shapeSVG,
    colorDef, colorIndef, colorAdj, agree, SHAPE_INDEF, SHAPE_PLURAL,
    scatterLayout, rowLayout, mirrorLayout, evenGrid, uniqueCombos,
    makeChallenge, renderChallengeHeader, clearStage, startTimer, finishRound,
    makeShapeDiv, renderMC, renderChoiceScatter, renderReferenceRow
  } = MAD;

  /* ===================== محور صعوبة الأنماط + أدواته ===================== */
  function patternDifficultyParams(level){
    const table = {
      1:{count:3, optN:3, time:16},
      2:{count:4, optN:3, time:14},
      3:{count:5, optN:4, time:12},
      4:{count:6, optN:4, time:10}
    };
    return table[level] || table[1];
  }
  const ROTATION_TYPES = ["square","triangle","cross","star","diamond","hexagon"];
  function circlePos(i, n, cx, cy, r){
    const theta = (i/n) * Math.PI * 2;
    return { x: cx + r*Math.cos(theta), y: cy + r*Math.sin(theta) };
  }

  const PATTERN_TEMPLATES = {

    rotate: { name:"تدوير الشكل", pattern:'mc',
      goal:(d)=>`لاحظ الشكل، ثم اختر شكله بعد تدويره ${toArabicDigits(d.angle)}° باتجاه عقارب الساعة`,
      generate(rng, p){
        const type = pick(rng, ROTATION_TYPES);
        const color = pick(rng, activePalette());
        const correctAngle = pick(rng, [90,180,270]);
        const angles = shuffle(rng, [0,90,180,270]);
        const options = angles.map(a=>({ value:{type,color,angle:a}, isCorrect: a===correctAngle }));
        return { payload:{ referenceItems:[{type,color,angle:0}], options, optionType:'shape' }, meta:{angle:correctAngle} };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١");
        const angles = ch.payload.options.map(o=>o.value.angle); if(new Set(angles).size!==angles.length) r.push("زوايا مكررة"); return r; }
    },

    oddstrip: { name:"الشريط الشاذ", pattern:'choice',
      goal:()=>`كل شريط له نمط لوني متكرر خاص به، إلا عنصرًا واحدًا يكسر نمط شريطه — أوجده`,
      generate(rng, p){
        const stripsCount = 3;
        const itemsPerStrip = Math.max(4, p.count);
        const type = pick(rng, SHAPE_TYPES);
        const pal = activePalette();
        const breakStrip = randInt(rng, 0, stripsCount-1);
        const breakPos = randInt(rng, 1, itemsPerStrip-2);
        const candidates = [];
        let id = 0;
        for(let s=0; s<stripsCount; s++){
          const cycleLen = pick(rng, [2,3]);
          const cycleColors = shuffle(rng, pal).slice(0, cycleLen);
          const y = 20 + s*30;
          for(let i=0; i<itemsPerStrip; i++){
            const x = 10 + i*(80/(itemsPerStrip-1));
            let color = cycleColors[i % cycleLen];
            let isCorrect = false;
            if(s===breakStrip && i===breakPos){
              let wrong = pick(rng, pal);
              while(wrong===color) wrong = pick(rng, pal);
              color = wrong; isCorrect = true;
            }
            candidates.push({id:id++, type, color, x, y, isCorrect});
          }
        }
        return { payload:{ candidates }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.candidates.filter(c=>c.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    scalepredict: { name:"تكبير النمط", pattern:'mc',
      goal:()=>`لاحظ تدرّج الحجم، ما الحجم التالي المنطقي؟`,
      generate(rng, p){
        const type = pick(rng, SHAPE_TYPES);
        const color = pick(rng, activePalette());
        const start = 0.5 + rng()*0.2;
        const step = 0.18 + rng()*0.1;
        const n = 3;
        const refs = []; for(let i=0;i<n;i++) refs.push({type,color,scale: +(start+step*i).toFixed(2)});
        const correctScale = +(start+step*n).toFixed(2);
        const used = new Set([correctScale]); const options=[{value:{type,color,scale:correctScale}, isCorrect:true}];
        while(options.length<4){
          const alt = +(correctScale + pick(rng,[-step, step, -2*step, 2*step])).toFixed(2);
          if(alt>0.2 && alt<2.2 && !used.has(alt)){ used.add(alt); options.push({value:{type,color,scale:alt}, isCorrect:false}); }
        }
        return { payload:{ referenceItems:refs, options:shuffle(rng,options), optionType:'shape' }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    grid2d: { name:"نمط الشبكة ثنائي البعد", pattern:'choice',
      goal:()=>`الشبكة تتبع نمط تناوب لوني بين الصفوف والأعمدة — أوجد الخلية التي تكسر النمط`,
      generate(rng, p){
        const n = Math.max(9, p.count*p.count);
        const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n/cols);
        const pal = activePalette();
        const colorA = pick(rng, pal); let colorB = pick(rng, pal);
        while(colorB===colorA) colorB = pick(rng, pal);
        const type = "square";
        const breakIdx = randInt(rng, 0, rows*cols-1);
        const candidates = [];
        for(let i=0;i<rows*cols;i++){
          const row = Math.floor(i/cols), col = i%cols;
          const expected = (row+col)%2===0 ? colorA : colorB;
          const color = i===breakIdx ? (expected===colorA?colorB:colorA) : expected;
          const x = 10 + col*(80/(cols-1||1));
          const y = 15 + row*(70/(rows-1||1));
          candidates.push({id:i, type, color, x, y, isCorrect:i===breakIdx});
        }
        return { payload:{ candidates }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.candidates.filter(c=>c.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    motifextend: { name:"الفسيفساء المتكررة", pattern:'mc',
      goal:()=>`لاحظ الامتداد المتكرر، ما القطعة التالية التي تُكمله؟`,
      generate(rng, p){
        const m = pick(rng, [2,3]);
        const combos = uniqueCombos(rng, m);
        const repeatCount = Math.max(2, Math.floor(p.count/m)+1);
        const refs = [];
        for(let i=0;i<repeatCount*m;i++) refs.push(combos[i % m]);
        const correct = combos[(refs.length) % m];
        const used = new Set([correct.type+correct.color]);
        const options = [{value:correct, isCorrect:true}];
        const pal = activePalette();
        while(options.length<4){
          const cand = { type: pick(rng, SHAPE_TYPES), color: pick(rng, pal) };
          const key = cand.type+cand.color;
          if(!used.has(key)){ used.add(key); options.push({value:cand, isCorrect:false}); }
        }
        return { payload:{ referenceItems:refs, options:shuffle(rng,options), optionType:'shape' }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    symmetrybreak: { name:"التناظر المكاني", pattern:'choice',
      goal:()=>`العناصر مرتّبة بتناظر دوراني حول المركز، إلا عنصرًا واحدًا يكسر هذا التناظر — أوجده`,
      generate(rng, p){
        const pairs = Math.max(3, Math.min(5, p.count));
        const n = pairs*2;
        const pal = activePalette();
        const breakPair = randInt(rng, 0, pairs-1);
        const candidates = [];
        for(let k=0;k<pairs;k++){
          const type = pick(rng, SHAPE_TYPES);
          const color = pick(rng, pal);
          const pos1 = circlePos(k, n, 50, 50, 33);
          const pos2 = circlePos(k+pairs, n, 50, 50, 33);
          let color2 = color, isCorrect2 = false;
          if(k===breakPair){
            do { color2 = pick(rng, pal); } while(color2===color);
            isCorrect2 = true;
          }
          candidates.push({id:k*2, type, color, x:pos1.x, y:pos1.y, isCorrect:false});
          candidates.push({id:k*2+1, type, color:color2, x:pos2.x, y:pos2.y, isCorrect:isCorrect2});
        }
        return { payload:{ candidates }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.candidates.filter(c=>c.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    mirrorpredict: { name:"توقّع الانعكاس", pattern:'mirror',
      goal:()=>`الجانب الأيمن يجب أن يعكس الأيسر تمامًا — ما الشكل الصحيح للموضع الفارغ؟`,
      generate(rng, p){
        const k = Math.max(3, Math.min(4, p.count-1));
        const combos = uniqueCombos(rng, k);
        const targetIdx = randInt(rng, 0, k-1);
        const leftItems = combos.map((c,i)=>({type:c.type, color:c.color, y: 15 + i*(70/(k-1||1))}));
        const rightItems = combos.map((c,i)=>({type: i===targetIdx?null:c.type, color: i===targetIdx?null:c.color, y: 15 + i*(70/(k-1||1)), isTarget: i===targetIdx}));
        const correct = combos[targetIdx];
        const used = new Set([correct.type+correct.color]);
        const options = [{value:correct, isCorrect:true}];
        const pal = activePalette();
        while(options.length<4){
          const cand = { type: pick(rng, SHAPE_TYPES), color: pick(rng, pal) };
          const key = cand.type+cand.color;
          if(!used.has(key)){ used.add(key); options.push({value:cand, isCorrect:false}); }
        }
        return { payload:{ leftItems, rightItems, options:shuffle(rng,options) }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١");
        if(ch.payload.rightItems.filter(it=>it.isTarget).length!==1) r.push("عدد الأهداف ليس ١"); return r; }
    },

    cyclictype: { name:"تسلسل الأشكال الدوري", pattern:'mc',
      goal:()=>`لاحظ ترتيب الأشكال المتكرر، ما الشكل التالي في الدورة؟`,
      generate(rng, p){
        const c = pick(rng, [2,3]);
        const cycleTypes = shuffle(rng, SHAPE_TYPES).slice(0, c);
        const color = pick(rng, activePalette());
        const n = Math.max(4, p.count);
        const refs = []; for(let i=0;i<n;i++) refs.push({type: cycleTypes[i%c], color});
        const correctType = cycleTypes[n % c];
        const used = new Set([correctType]); const options=[{value:{type:correctType,color}, isCorrect:true}];
        while(options.length<4){
          const t = pick(rng, SHAPE_TYPES);
          if(!used.has(t)){ used.add(t); options.push({value:{type:t,color}, isCorrect:false}); }
        }
        return { payload:{ referenceItems:refs, options:shuffle(rng,options), optionType:'shape' }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    density: { name:"كثافة النمط", pattern:'density',
      goal:()=>`أي المنطقتين أكثف من حيث تكرار النمط؟`,
      generate(rng, p){
        const type = pick(rng, SHAPE_TYPES);
        const color = pick(rng, activePalette());
        let leftCount = randInt(rng, 5, 14);
        let rightCount = randInt(rng, 5, 14);
        let guard=0;
        while(leftCount===rightCount && guard<10){ rightCount = randInt(rng,5,14); guard++; }
        return { payload:{ type, color, leftCount, rightCount }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.leftCount===ch.payload.rightCount) r.push("الكثافتان متساويتان"); return r; }
    }

  };
  const PATTERN_KEYS = ["rotate","oddstrip","scalepredict","grid2d","motifextend","symmetrybreak","mirrorpredict","cyclictype","density"];

  /* ===================== مُصيّرات الأنماط الخاصة ===================== */
  function renderPatternMirror(ch, onResult){
    ch.payload.leftItems.forEach(it=>{
      el.stage.appendChild(makeShapeDiv({x:28, y:it.y, type:it.type, color:it.color, size:40}));
    });
    ch.payload.rightItems.forEach(it=>{
      if(it.isTarget){
        const ph = document.createElement('div');
        ph.style.cssText = `position:absolute;left:72%;top:${it.y}%;transform:translate(-50%,-50%);width:40px;height:40px;border:2px dashed var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted);`;
        ph.textContent='؟';
        el.stage.appendChild(ph);
      } else {
        el.stage.appendChild(makeShapeDiv({x:72, y:it.y, type:it.type, color:it.color, size:40}));
      }
    });
    const mline = document.createElement('div'); mline.className='mirror-line'; el.stage.appendChild(mline);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;right:0;bottom:6%;display:flex;justify-content:center;gap:10px;flex-wrap:wrap;';
    ch.payload.options.forEach(opt=>{
      const card = document.createElement('div'); card.className='opt-card';
      card.innerHTML = `<svg width="40" height="40" viewBox="0 0 44 44">${shapeSVG(opt.value.type, opt.value.color)}</svg>`;
      card.addEventListener('click', ()=>onResult(opt.isCorrect, card));
      wrap.appendChild(card);
    });
    el.stage.appendChild(wrap);
  }

  function renderPatternDensity(ch, onResult){
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;';
    function panel(count, isCorrectPanel, seedOffset){
      const p = document.createElement('div');
      p.style.cssText = 'position:relative;flex:1;cursor:pointer;border-inline-end:1px solid var(--line);';
      const rng2 = makeRng(ch.seed + seedOffset);
      for(let i=0;i<count;i++){
        const x = 10 + rng2()*80, y = 10 + rng2()*80;
        const dot = document.createElement('div');
        dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);width:22px;height:22px;`;
        dot.innerHTML = `<svg width="22" height="22" viewBox="0 0 44 44">${shapeSVG(ch.payload.type, ch.payload.color)}</svg>`;
        p.appendChild(dot);
      }
      p.addEventListener('click', ()=>onResult(isCorrectPanel, p));
      return p;
    }
    wrap.appendChild(panel(ch.payload.leftCount, ch.payload.leftCount>ch.payload.rightCount, 1));
    wrap.appendChild(panel(ch.payload.rightCount, ch.payload.rightCount>ch.payload.leftCount, 2));
    el.stage.appendChild(wrap);
  }


  /* ===================== زمن التشغيل ===================== */
  function buildPatternChallenge(templateKey, difficulty, roundIndex, seed){
    const rng = makeRng(seed);
    const p = patternDifficultyParams(difficulty);
    const tmpl = PATTERN_TEMPLATES[templateKey];
    const built = tmpl.generate(rng, p);
    const ch = makeChallenge({
      worldName:"أنماط", skill:"الأنماط", input:"متنوع", action:"لاحظ",
      rule: tmpl.name, modifier:"بلا حركة",
      templateKey, templateName: tmpl.name, difficulty, roundIndex, seed,
      time: p.time, goal: tmpl.goal(built.meta)
    });
    ch.world = "الأنماط";
    ch.payload = built.payload; ch.pattern = tmpl.pattern;
    return ch;
  }
  function validatePatternChallenge(ch){
    const t = PATTERN_TEMPLATES[ch.templateKey].validate(ch);
    return { valid: t.length===0, reasons: t };
  }

  function renderPatternChallenge(ch, isWarmup){
    renderChallengeHeader(ch, isWarmup);
    clearStage();
    state.locked=false; state.roundStart=performance.now();
    const onResult = (correct, node)=>{
      if(node) node.classList.add(correct?'correct-flash':'wrong-flash');
      finishRound(correct, performance.now()-state.roundStart, isWarmup);
    };

    if(ch.pattern==='mc'){
      renderMC(ch.payload.options, ch.payload.optionType, (correct)=>onResult(correct));
      if(ch.payload.referenceItems) renderReferenceRow(ch.payload.referenceItems);
    } else if(ch.pattern==='choice'){
      renderChoiceScatter(ch.payload.candidates, onResult);
    } else if(ch.pattern==='mirror'){
      renderPatternMirror(ch, onResult);
    } else if(ch.pattern==='density'){
      renderPatternDensity(ch, onResult);
    }

    startTimer(ch.time, ()=>{ if(!state.locked) finishRound(false, null, isWarmup); }, true, 900);
  }

  /* ===================== التسجيل في المحرك ===================== */
  MAD.registerWorld({
    key:'pattern', badge:'٤',
    name:"الأنماط", label:"عالم الأنماط", skillName:"الأنماط", input:"متنوع", action:"لاحظ",
    topRank:"عين نمطية",
    nebula:{ a:'#2A7A5C', b:'#1E6A6A' },
    accent:{ solid:'#4ADE9A', dim:'rgba(74,222,154,0.18)' },
    intro:{
      icon: `<svg width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" fill="currentColor"/><rect x="14" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="3" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="14" y="14" width="7" height="7" fill="currentColor"/></svg>`,
      text: `<b>عالم الأنماط</b> يقيس قدرتك على إدراك البنية والتكرار البصري. ستلاحظ تناظرًا أو دورانًا أو نمطًا متكررًا، ومهمتك إكماله أو إيجاد ما يكسره — إدراك بصري لا حفظ ولا حساب.`
    },
    keys: PATTERN_KEYS, templates: PATTERN_TEMPLATES, warmup:"scalepredict",
    maxAttempts: 8,
    build: buildPatternChallenge,
    validate: validatePatternChallenge,
    render: renderPatternChallenge
  });

})();
