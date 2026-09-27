/* =====================================================================
   عالم ٠٣ — المنطق (world-logic.js)
   أحاجي استدلال: مصفوفات، قواعد خفية، استبعاد، ترتيب، تماثل.
   ===================================================================== */
(function(){
  "use strict";
  const {
    state, el, makeRng, randInt, pick, shuffle, toArabicDigits,
    activePalette, SHAPE_TYPES, SHAPE_AR, shapeSVG,
    colorDef, colorIndef, colorAdj, agree, SHAPE_INDEF, SHAPE_PLURAL,
    scatterLayout, rowLayout, mirrorLayout, evenGrid, uniqueCombos,
    makeChallenge, renderChallengeHeader, clearStage, startTimer, finishRound,
    makeShapeDiv, renderMC, renderChoiceScatter
  } = MAD;

  /* ===================== محور صعوبة المنطق + أدواته ===================== */
  function logicDifficultyParams(level){
    const table = {
      1:{count:3, optN:3, time:18},
      2:{count:4, optN:3, time:15},
      3:{count:4, optN:4, time:13},
      4:{count:5, optN:4, time:11}
    };
    return table[level] || table[1];
  }
  const TYPE_CYCLE = ["circle","square","triangle","diamond","hexagon","star","ring","cross"];
  function cycleType(type, steps){
    const i = TYPE_CYCLE.indexOf(type);
    return TYPE_CYCLE[(i + steps + TYPE_CYCLE.length*3) % TYPE_CYCLE.length];
  }

  const LOGIC_TEMPLATES = {

    matrix: { name:"مصفوفة الأنماط", pattern:'matrix',
      goal:()=>`أكمل النمط: ما الشكل الذي يجب أن يكون في الخلية الفارغة؟`,
      generate(rng,p){
        const pal = activePalette();
        let typeA=pick(rng,SHAPE_TYPES), typeB=pick(rng,SHAPE_TYPES);
        while(typeB===typeA) typeB=pick(rng,SHAPE_TYPES);
        let colorX=pick(rng,pal), colorY=pick(rng,pal);
        while(colorY===colorX) colorY=pick(rng,pal);
        const correct = {type:typeB, color:colorY};
        const distractors = [
          {type:typeA, color:colorY},
          {type:typeB, color:colorX},
          {type:typeA, color:colorX}
        ];
        const options = shuffle(rng, [
          {value:correct, isCorrect:true},
          ...distractors.map(d=>({value:d, isCorrect:false}))
        ]).slice(0, 4);
        if(!options.some(o=>o.isCorrect)) options[0] = {value:correct, isCorrect:true};
        return {
          payload:{
            cells:[
              {x:32,y:30,type:typeA,color:colorX},
              {x:68,y:30,type:typeB,color:colorX},
              {x:32,y:66,type:typeA,color:colorY}
            ],
            options, optionType:'shape'
          }, meta:{}
        };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    hiddenrule: { name:"القاعدة الخفية", pattern:'yesno',
      goal:()=>`بناءً على الأمثلة، هل يطابق هذا الشكل القاعدة الخفية؟`,
      generate(rng,p){
        const ruleType = pick(rng, ['color','type','large']);
        const pal = activePalette();
        const targetColor = pick(rng, pal);
        const targetType = pick(rng, SHAPE_TYPES);
        function matches(item){
          if(ruleType==='color') return item.color===targetColor;
          if(ruleType==='type') return item.type===targetType;
          return item.scale>1.15;
        }
        function randomItem(){
          return { type:pick(rng,SHAPE_TYPES), color:pick(rng,pal), scale: pick(rng,[0.8,1,1.4]) };
        }
        let examples = [];
        let guard=0;
        while(examples.length<4 && guard<200){
          guard++;
          const it = randomItem();
          examples.push({...it, isMatch: matches(it)});
        }
        // ensure both true and false present
        if(!examples.some(e=>e.isMatch) || !examples.every(e=>false)){}
        const hasTrue = examples.some(e=>e.isMatch), hasFalse = examples.some(e=>!e.isMatch);
        if(!hasTrue){ examples[0] = ruleType==='color' ? {type:pick(rng,SHAPE_TYPES),color:targetColor,scale:1,isMatch:true} : ruleType==='type' ? {type:targetType,color:pick(rng,pal),scale:1,isMatch:true} : {type:pick(rng,SHAPE_TYPES),color:pick(rng,pal),scale:1.4,isMatch:true}; }
        if(!hasFalse){ examples[1] = { type:pick(rng,SHAPE_TYPES), color:pick(rng,pal), scale:0.8, isMatch:false }; }
        const target = randomItem();
        const targetMatch = matches(target);
        return { payload:{ examples, target, targetMatch }, meta:{} };
      },
      validate(ch){ const r=[]; const ex=ch.payload.examples;
        if(!ex.some(e=>e.isMatch)) r.push("لا مثال إيجابي");
        if(!ex.some(e=>!e.isMatch)) r.push("لا مثال سلبي");
        return r; }
    },

    chain: { name:"السلسلة الشرطية", pattern:'mc',
      goal:(d)=>`القاعدة ١: إن كان اللون ${colorDef(d.ruleColor)} فالجهة يمين، وإلا يسار. القاعدة ٢: إن كان الشكل دائريًا (دائرة/حلقة) فالاتجاه أعلى، وإلا أسفل. طبّق القاعدتين على الشكل الظاهر.`,
      generate(rng,p){
        const pal = activePalette();
        const ruleColor = pick(rng, pal);
        const target = { type:pick(rng,SHAPE_TYPES), color:pick(rng,pal) };
        const isRight = target.color===ruleColor;
        const isRound = target.type==='circle' || target.type==='ring';
        const correctArrow = (isRight? "→" : "←") + (isRound? "↑" : "↓");
        const combos = ["→↑","→↓","←↑","←↓"];
        const options = shuffle(rng, combos.map(c=>({ value:c, isCorrect:c===correctArrow })));
        return { payload:{ slots:[{id:0,type:target.type,color:target.color,x:50,y:50}], options, optionType:'text', studyMode:'simultaneous' },
          meta:{ ruleColor } };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    elimination: { name:"الاستنتاج بالحذف", pattern:'choice',
      goal:(d)=>d.clueText,
      generate(rng,p){
        const n = p.count;
        const combos = uniqueCombos(rng, n);
        const pts = scatterLayout(n, rng, 0.3);
        const targetIdx = randInt(rng,0,n-1);
        const candidates = pts.map((pt,i)=>({id:i, type:combos[i].type, color:combos[i].color, x:pt.x, y:pt.y, isCorrect:i===targetIdx}));
        let remaining = candidates.slice();
        const clues = [];
        let guard=0;
        while(remaining.length>1 && clues.length<4 && guard<30){
          guard++;
          const others = remaining.filter(c=>c.id!==targetIdx);
          if(others.length===0) break;
          const victim = pick(rng, others);
          if(victim.type!==candidates[targetIdx].type){
            clues.push({attr:'type', value:victim.type, text:`ليس ${SHAPE_INDEF[victim.type]}`});
            remaining = remaining.filter(c=>c.type!==victim.type);
          } else {
            clues.push({attr:'color', value:victim.color, text:`ليس ${colorIndef(victim.color)}`});
            remaining = remaining.filter(c=>c.color!==victim.color);
          }
        }
        const clueText = "الأدلّة: " + clues.map(c=>c.text).join("، ") + " — من هو العنصر الوحيد الذي يطابق كل الأدلّة؟";
        return { payload:{ candidates, clues }, meta:{ clueText } };
      },
      validate(ch){
        const r=[];
        let remaining = ch.payload.candidates.slice();
        ch.payload.clues.forEach(c=>{
          remaining = remaining.filter(x=> c.attr==='type' ? x.type!==c.value : x.color!==c.value);
        });
        if(remaining.length!==1) r.push("الأدلّة لا تحصر الحل في عنصر واحد");
        else if(!remaining[0].isCorrect) r.push("العنصر المتبقي ليس الحل المسجّل");
        if(ch.payload.clues.length===0) r.push("لا توجد أدلّة");
        return r;
      }
    },

    order: { name:"الترتيب المنطقي", pattern:'mc',
      goal:(d)=>d.clueText,
      generate(rng,p){
        const combos = uniqueCombos(rng, 3);
        const order = shuffle(rng, [0,1,2]); // order[0] is largest ... order[2] smallest
        const names = combos.map(c=>`${SHAPE_AR[c.type]} ${colorAdj(c.color, c.type)}`);
        const clueText = `بحسب الأدلّة: ${names[order[0]]} أكبر من ${names[order[1]]}، و${names[order[1]]} أكبر من ${names[order[2]]}. `;
        const askLargest = rng()<0.5;
        const correctIdx = askLargest ? order[0] : order[2];
        const question = askLargest ? "أيّهم الأكبر؟" : "أيّهم الأصغر؟";
        const options = shuffle(rng, combos.map((c,i)=>({ value:c, isCorrect:i===correctIdx })));
        return { payload:{ options, optionType:'shape' }, meta:{ clueText: clueText+question } };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    sequence: { name:"أكمل التسلسل", pattern:'mc',
      goal:(d)=>`ما العدد التالي في التسلسل؟  ${d.seqText}`,
      generate(rng,p){
        const start = randInt(rng,1,10);
        const diff = pick(rng, [2,3,4,-2,-3]);
        const len = 4;
        const seq = []; for(let i=0;i<len;i++) seq.push(start+diff*i);
        const next = start+diff*len;
        const seqText = seq.map(n=>toArabicDigits(n)).join(" ، ") + " ، ؟";
        const used = new Set([next]); const options=[{value:next,isCorrect:true}];
        while(options.length<4){ const d2 = next + pick(rng,[-diff,diff,Math.round(diff/2)||1,-2,2]); if(!used.has(d2)){ used.add(d2); options.push({value:d2,isCorrect:false}); } }
        return { payload:{ options:shuffle(rng,options), optionType:'number' }, meta:{ seqText } };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    compare: { name:"الأثقل منطقيًا", pattern:'compare',
      goal:()=>`أي المجموعتين قيمتها الإجمالية أكبر؟`,
      generate(rng,p){
        const nLeft = randInt(rng,2,4), nRight = randInt(rng,2,4);
        function group(n){ const vals=[]; for(let i=0;i<n;i++) vals.push(randInt(rng,1,9)); return vals; }
        let left = group(nLeft), right = group(nRight);
        let sumL = left.reduce((a,b)=>a+b,0), sumR = right.reduce((a,b)=>a+b,0);
        let guard=0;
        while(sumL===sumR && guard<10){ right = group(nRight); sumR = right.reduce((a,b)=>a+b,0); guard++; }
        return { payload:{ left, right, sumL, sumR }, meta:{} };
      },
      validate(ch){ const r=[]; if(ch.payload.sumL===ch.payload.sumR) r.push("المجموعان متساويان"); return r; }
    },

    analogy: { name:"العلاقة المتماثلة", pattern:'mc',
      goal:(d)=>`${SHAPE_AR[d.c]} ${agree(d.c,'يتحوّل','تتحوّل')} إلى ${SHAPE_AR[d.dtype]}. بنفس العلاقة، ${SHAPE_AR[d.e]} ${agree(d.e,'يتحوّل','تتحوّل')} إلى ماذا؟`,
      generate(rng,p){
        const k = randInt(rng,1,3);
        const c = pick(rng, SHAPE_TYPES);
        const dtype = cycleType(c,k);
        let e = pick(rng, SHAPE_TYPES);
        while(e===c) e = pick(rng, SHAPE_TYPES);
        const correct = cycleType(e,k);
        const used = new Set([correct]); const options=[{value:{type:correct,color:activePalette()[0]}, isCorrect:true}];
        while(options.length<4){
          const t = pick(rng, SHAPE_TYPES);
          if(!used.has(t)){ used.add(t); options.push({value:{type:t,color:activePalette()[0]}, isCorrect:false}); }
        }
        return { payload:{ options:shuffle(rng,options), optionType:'shape' }, meta:{ c, dtype, e } };
      },
      validate(ch){ const r=[]; if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١"); return r; }
    },

    sorting: { name:"فرز بالقاعدة", pattern:'choice',
      goal:(d)=>d.clueText,
      generate(rng,p){
        const pal = activePalette();
        const n = Math.max(4, p.count);
        const targetColor = pick(rng, pal);
        const largeScale = 1.4;
        const pts = scatterLayout(n, rng, 0.3);
        const candidates = [];
        // build so exactly one satisfies BOTH color==targetColor AND scale large
        const targetIdx = randInt(rng,0,n-1);
        for(let i=0;i<n;i++){
          let color, scale;
          if(i===targetIdx){ color=targetColor; scale=largeScale; }
          else {
            // trap: matches exactly one condition, or neither
            const mode = i % 3;
            if(mode===0){ color=targetColor; scale=1; }
            else if(mode===1){ color=pick(rng, pal.filter(c=>c!==targetColor)); scale=largeScale; }
            else { color=pick(rng, pal.filter(c=>c!==targetColor)); scale=1; }
          }
          candidates.push({id:i, type:pick(rng,SHAPE_TYPES), color, scale, x:pts[i].x, y:pts[i].y, isCorrect:i===targetIdx});
        }
        const clueText = `اختر العنصر الذي يطابق الشرطين معًا: لونه ${colorIndef(targetColor)}، وحجمه كبير.`;
        return { payload:{ candidates }, meta:{ clueText } };
      },
      validate(ch){
        const r=[];
        const matches = ch.payload.candidates.filter(c=> c.isCorrect );
        if(matches.length!==1) r.push("عدد الحلول ليس ١");
        return r;
      }
    },

    deduction: { name:"شبكة الاستنتاج", pattern:'mc',
      goal:(d)=>d.clueText,
      generate(rng,p){
        const types = shuffle(rng, SHAPE_TYPES).slice(0,3);
        const pal = activePalette();
        const colors = shuffle(rng, pal).slice(0,3);
        const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
        const truth = pick(rng, perms); // truth[i] = color-index assigned to types[i]
        function satisfies(perm, clue){
          if(clue.kind==='is') return perm[clue.ti]===clue.ci;
          return perm[clue.ti]!==clue.ci;
        }
        function makeClue(){
          const ti = randInt(rng,0,2);
          const isDirect = rng()<0.4;
          if(isDirect) return {kind:'is', ti, ci:truth[ti], text:`${SHAPE_AR[types[ti]]} بلون ${colorIndef(colors[truth[ti]])}`};
          let ci = randInt(rng,0,2);
          while(ci===truth[ti]) ci = randInt(rng,0,2);
          return {kind:'not', ti, ci, text:`${SHAPE_AR[types[ti]]} ${agree(types[ti],'ليس','ليست')} بلون ${colorIndef(colors[ci])}`};
        }
        const cluePool = [];
        for(let ti=0; ti<3; ti++){
          for(let ci=0; ci<3; ci++){
            if(ci!==truth[ti]) cluePool.push({kind:'not', ti, ci, text:`${SHAPE_AR[types[ti]]} ${agree(types[ti],'ليس','ليست')} بلون ${colorIndef(colors[ci])}`});
          }
        }
        for(let ti=0; ti<3; ti++){
          cluePool.push({kind:'is', ti, ci:truth[ti], text:`${SHAPE_AR[types[ti]]} بلون ${colorIndef(colors[truth[ti]])}`});
        }
        const shuffledPool = shuffle(rng, cluePool);
        let clues = [];
        let consistent = perms.slice();
        for(let i=0; i<shuffledPool.length && clues.length<5; i++){
          const c = shuffledPool[i];
          const test = consistent.filter(pm=>satisfies(pm,c));
          if(test.length < consistent.length){
            clues.push(c); consistent = test;
            if(consistent.length===1) break;
          }
        }
        const clueText = "الأدلّة: " + clues.map(c=>c.text).join("، ") + ". أي التوزيعات التالية صحيحة؟";
        function describePerm(pm){ return types.map((t,i)=>`${SHAPE_AR[t]} = ${colorIndef(colors[pm[i]])}`).join("، "); }
        const wrongPerms = shuffle(rng, perms.filter(pm=>pm.toString()!==truth.toString())).slice(0,3);
        const options = shuffle(rng, [
          {value:describePerm(truth), isCorrect:true},
          ...wrongPerms.map(pm=>({value:describePerm(pm), isCorrect:false}))
        ]);
        return { payload:{ options, optionType:'text', _consistentCount:consistent.length }, meta:{ clueText } };
      },
      validate(ch){
        const r=[];
        if(ch.payload._consistentCount!==1) r.push("الأدلّة لا تحدد توزيعًا واحدًا فقط");
        if(ch.payload.options.filter(o=>o.isCorrect).length!==1) r.push("عدد الحلول ليس ١");
        return r;
      }
    }

  };
  const LOGIC_KEYS = ["matrix","hiddenrule","chain","elimination","order","sequence","compare","analogy","sorting","deduction"];

  /* ===================== مُصيّرات المنطق الخاصة ===================== */
  function renderLogicMatrix(ch, onResult){
    ch.payload.cells.forEach(c=>{
      el.stage.appendChild(makeShapeDiv({x:c.x, y:c.y, type:c.type, color:c.color, size:44}));
    });
    const ph = document.createElement('div');
    ph.style.cssText = 'position:absolute;left:68%;top:66%;transform:translate(-50%,-50%);width:44px;height:44px;border:2px dashed var(--line);border-radius:8px;';
    ph.textContent='؟'; ph.style.display='flex'; ph.style.alignItems='center'; ph.style.justifyContent='center'; ph.style.color='var(--muted)';
    el.stage.appendChild(ph);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;right:0;bottom:8%;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;';
    ch.payload.options.forEach(opt=>{
      const card = document.createElement('div'); card.className='opt-card';
      card.innerHTML = `<svg width="40" height="40" viewBox="0 0 44 44">${shapeSVG(opt.value.type, opt.value.color)}</svg>`;
      card.addEventListener('click', ()=>onResult(opt.isCorrect, card));
      wrap.appendChild(card);
    });
    el.stage.appendChild(wrap);
  }

  function renderLogicYesNo(ch, onResult){
    const row = document.createElement('div');
    row.style.cssText = 'position:absolute;left:0;right:0;top:10%;display:flex;justify-content:center;gap:10px;';
    ch.payload.examples.forEach(e=>{
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:40px;height:40px;';
      box.innerHTML = `<svg width="40" height="40" viewBox="0 0 44 44" style="transform:scale(${e.scale||1})">${shapeSVG(e.type,e.color)}</svg>
        <span style="position:absolute;top:-6px;left:-6px;font-size:13px;color:${e.isMatch?'var(--mint)':'var(--coral)'};font-weight:800;">${e.isMatch?'✓':'✗'}</span>`;
      row.appendChild(box);
    });
    el.stage.appendChild(row);

    const targetWrap = document.createElement('div');
    targetWrap.style.cssText = 'position:absolute;left:0;right:0;top:42%;display:flex;justify-content:center;';
    targetWrap.innerHTML = `<svg width="64" height="64" viewBox="0 0 44 44" style="transform:scale(${ch.payload.target.scale||1})">${shapeSVG(ch.payload.target.type, ch.payload.target.color)}</svg>`;
    el.stage.appendChild(targetWrap);

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'position:absolute;left:0;right:0;bottom:10%;display:flex;justify-content:center;gap:14px;';
    ['نعم','لا'].forEach(label=>{
      const card = document.createElement('div'); card.className='opt-card'; card.style.minWidth='84px';
      card.innerHTML = `<div style="font-size:15px;font-weight:700;">${label}</div>`;
      const isYes = label==='نعم';
      card.addEventListener('click', ()=>onResult(isYes===ch.payload.targetMatch, card));
      btnWrap.appendChild(card);
    });
    el.stage.appendChild(btnWrap);
  }

  function renderLogicCompare(ch, onResult){
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;';
    function panel(vals, isCorrectPanel){
      const p = document.createElement('div');
      p.style.cssText = 'flex:1;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;cursor:pointer;padding:10px;border-inline-end:1px solid var(--line);';
      vals.forEach(v=>{
        const chip = document.createElement('div');
        chip.style.cssText = 'width:38px;height:38px;border-radius:8px;background:var(--panel-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:var(--font-num);font-weight:700;font-size:16px;';
        chip.textContent = toArabicDigits(v);
        p.appendChild(chip);
      });
      p.addEventListener('click', ()=>onResult(isCorrectPanel, p));
      return p;
    }
    wrap.appendChild(panel(ch.payload.left, ch.payload.sumL>ch.payload.sumR));
    wrap.appendChild(panel(ch.payload.right, ch.payload.sumR>ch.payload.sumL));
    el.stage.appendChild(wrap);
  }


  /* ===================== زمن التشغيل ===================== */
  function buildLogicChallenge(templateKey, difficulty, roundIndex, seed){
    const rng = makeRng(seed);
    const p = logicDifficultyParams(difficulty);
    const tmpl = LOGIC_TEMPLATES[templateKey];
    const built = tmpl.generate(rng, p);
    const ch = makeChallenge({
      worldName:"منطق", skill:"المنطق", input:"متنوع", action:"استنتج",
      rule: tmpl.name, modifier:"بلا حركة",
      templateKey, templateName: tmpl.name, difficulty, roundIndex, seed,
      time: p.time, goal: tmpl.goal(built.meta)
    });
    ch.world = "المنطق";
    ch.payload = built.payload; ch.pattern = tmpl.pattern;
    return ch;
  }
  function validateLogicChallenge(ch){
    const t = LOGIC_TEMPLATES[ch.templateKey].validate(ch);
    return { valid: t.length===0, reasons: t };
  }

  function renderLogicChallenge(ch, isWarmup){
    renderChallengeHeader(ch, isWarmup);
    clearStage();
    state.locked=false; state.roundStart=performance.now();
    const onResult = (correct, node)=>{
      if(node) node.classList.add(correct?'correct-flash':'wrong-flash');
      finishRound(correct, performance.now()-state.roundStart, isWarmup);
    };

    if(ch.pattern==='mc'){
      renderMC(ch.payload.options, ch.payload.optionType, (correct)=>onResult(correct));
      if(ch.templateKey==='chain' && ch.payload.slots && ch.payload.slots[0]){
        const s = ch.payload.slots[0];
        el.stage.appendChild(makeShapeDiv({x:50, y:22, type:s.type, color:s.color, size:56}));
      }
    } else if(ch.pattern==='matrix'){
      renderLogicMatrix(ch, onResult);
    } else if(ch.pattern==='yesno'){
      renderLogicYesNo(ch, onResult);
    } else if(ch.pattern==='choice'){
      renderChoiceScatter(ch.payload.candidates, onResult);
    } else if(ch.pattern==='compare'){
      renderLogicCompare(ch, onResult);
    }

    startTimer(ch.time, ()=>{ if(!state.locked) finishRound(false, null, isWarmup); }, true, 900);
  }

  /* ===================== التسجيل في المحرك ===================== */
  MAD.registerWorld({
    key:'logic', badge:'٣',
    name:"المنطق", label:"عالم المنطق", skillName:"المنطق", input:"متنوع", action:"استنتج",
    topRank:"عقل استدلالي",
    nebula:{ a:'#8A6A1E', b:'#7A4E1E' },
    accent:{ solid:'#FFB454', dim:'rgba(255,180,84,0.18)' },
    intro:{
      icon: `<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2l3 6 6 1-4.5 4.5L17.5 20 12 17l-5.5 3 1-6.5L3 9l6-1z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
      text: `<b>عالم المنطق</b> يقيس قدرتك على الاستدلال والاستنتاج. لن تحتاج للبحث أو الحفظ هنا — بل لتحليل قاعدة أو دليل واستخدامه لاستنتاج الإجابة الصحيحة، تمامًا كأحاجي الذكاء الكلاسيكية.`
    },
    keys: LOGIC_KEYS, templates: LOGIC_TEMPLATES, warmup:"sequence",
    maxAttempts: 8,
    build: buildLogicChallenge,
    validate: validateLogicChallenge,
    render: renderLogicChallenge
  });

})();
