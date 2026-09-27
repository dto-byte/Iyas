/* =====================================================================
   عالم ٠٥ — التركيز (world-focus.js)

   ما الذي يميّزه عن العوالم السابقة؟
   - الملاحظة = بحث بصري: جِد المختلف وسط كثير.
   - التركيز  = **ضبط**: قاوم التداخل، وكُفَّ استجابة تلقائية، وحافظ على
     الانتباه عبر سيل سريع. الهدف ليس أن تجد شيئًا، بل ألّا تنخدع.

   لذلك جولة التركيز ليست سؤالًا واحدًا بل **سلسلة محاولات قصيرة سريعة**:
   محفّز يظهر، تستجيب، يختفي، يليه آخر. هذا هو الشكل الفعلي الذي تُقاس به
   مهام الانتباه في الأدبيات (ستروب، فلانكر، سايمون، Go/No-Go، تبديل المهام).

   القوالب السبعة، كلٌّ منها مُهمّة معروفة لا تنويعة على أخرى:
     stroop      تضارب الكلمة واللون   — كفّ التداخل الدلالي
     flanker     الأسهم المحاصِرة      — انتقاء مكاني وسط مشتّتات
     simon       تضارب الجهة           — تعارض المحفّز والاستجابة مكانيًا
     gonogo      كفّ الاستجابة         — منع استجابة صارت تلقائية
     switch      القاعدة المتبدّلة     — تحويل الانتباه بين بُعدين
     filtercount العدّ المُصفّى        — انتباه انتقائي مستدام عبر سيل
     tracking    تتبّع الأهداف         — تتبّع متعدّد الأجسام (يحتاج حركة)
   ===================================================================== */
(function(){
  "use strict";
  const {
    state, el, makeRng, randInt, pick, shuffle, toArabicDigits, counted, countedWith,
    activePalette, SHAPE_TYPES, SHAPE_AR, SHAPE_PLURAL, shapeSVG, agree,
    colorIndef, colorAdj,
    makeChallenge, renderChallengeHeader, clearStage, startTimer, finishRound,
    makeShapeDiv, renderMC
  } = MAD;

  /* ===================== محاور صعوبة التركيز =====================
     المحور الأول هو الزمن المتاح للمحاولة الواحدة: ضغط الوقت هو ما يحوّل
     المهمة من "سهلة إن تمهّلت" إلى قياس فعلي للتركيز.
     المحور الثاني نسبة المحاولات المتعارضة: كلما كثرت، صعب كفّ التداخل. */
  function focusDifficultyParams(level){
    const table = {
      1: { trials:6,  deadline:1700, conflict:0.40, allowedErrors:2, targets:2, distractors:3, trackSec:4 },
      2: { trials:8,  deadline:1400, conflict:0.55, allowedErrors:2, targets:3, distractors:5, trackSec:5 },
      3: { trials:10, deadline:1150, conflict:0.70, allowedErrors:1, targets:3, distractors:7, trackSec:6 },
      4: { trials:12, deadline:950,  conflict:0.80, allowedErrors:1, targets:4, distractors:9, trackSec:7 }
    };
    return table[level] || table[1];
  }

  const FEEDBACK_MS = 320;   // ومضة التصحيح بين المحاولات
  const N_TRY = { one:'محاولة', two:'محاولتان', few:'محاولات', many:'محاولة' };
  const N_SHAPE = { one:'شكل', two:'شكلان', few:'أشكال', many:'شكلًا' };

  /* ميزانية الجولة: مجموع مُهَل المحاولات + ومضاتها + هامش.
     المؤقّت العام شبكة أمان فقط — السلسلة تتقدّم بالاستجابة لا بالوقت. */
  function streamBudget(p){
    return Math.ceil((p.trials * (p.deadline + FEEDBACK_MS)) / 1000) + 2;
  }

  /* يوزّع المحاولات المتعارضة عشوائيًا مع ضمان وجود واحدة على الأقل،
     وإلا لم تَقِس المحاولةُ التداخلَ أصلًا. */
  function conflictFlags(rng, n, ratio){
    const wanted = Math.max(1, Math.min(n - 1, Math.round(n * ratio)));
    const flags = shuffle(rng, Array.from({length:n}, (_, i) => i < wanted));
    if(!flags.some(Boolean)) flags[randInt(rng, 0, n-1)] = true;
    if(flags.every(Boolean)) flags[randInt(rng, 0, n-1)] = false;
    return flags;
  }

  /* "٣ أقراص مميّزة" · "قرصين مميّزين" (المثنى بلا رقم) */
  function discPhrase(n){
    return countedWith(n, { one:'قرصًا مميّزًا', two:'قرصين مميّزين',
                            few:'أقراص مميّزة', many:'قرصًا مميّزًا' });
  }

  /* أسهم فلانكر — SVG محلي: المحرك لا يعرف الأسهم ولا حاجة لتعميمها */
  function arrowSVG(dir, color, size){
    const flip = dir === 'left' ? 'transform="scale(-1,1) translate(-44,0)"' : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 44 44" aria-hidden="true">
      <g ${flip}><path d="M6 22h24M22 12l10 10-10 10" fill="none" stroke="${color}"
        stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  }

  /* ===================== القوالب ===================== */
  const FOCUS_TEMPLATES = {

    stroop: { name:"تضارب الكلمة واللون", mode:'stream',
      goal:()=>`اضغط اللون الذي كُتبت به الكلمة — لا اللون الذي تعنيه`,
      generate(rng, p){
        const pal = activePalette();
        const flags = conflictFlags(rng, p.trials, p.conflict);
        const trials = flags.map(conflict => {
          const ink = pick(rng, pal);
          let word = ink;
          if(conflict){ while(word === ink) word = pick(rng, pal); }
          return { ink, word, conflict, answer: ink };
        });
        /* ترتيب الأزرار ثابت طوال الجولة: تبديله بين المحاولات يقيس شيئًا آخر */
        const options = shuffle(rng, pal).map(c => ({ value:c }));
        return { payload:{ kind:'stroop', trials, options, deadline:p.deadline,
                           allowedErrors:p.allowedErrors }, meta:{} };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        const pal = activePalette();
        if(pl.trials.length < 3) r.push("عدد المحاولات أقل من اللازم");
        if(!pl.trials.some(t => t.conflict)) r.push("لا محاولة متعارضة — لا تداخل يُقاس");
        if(!pl.trials.some(t => !t.conflict)) r.push("كل المحاولات متعارضة — لا خطّ أساس");
        if(pl.options.length !== pal.length) r.push("عدد أزرار الألوان لا يطابق اللوحة");
        if(new Set(pl.options.map(o=>o.value)).size !== pl.options.length) r.push("أزرار ألوان مكررة");
        if(pl.trials.some(t => !pl.options.some(o => o.value === t.answer))) r.push("إجابة بلا زر مطابق");
        if(pl.trials.some(t => t.conflict && t.word === t.ink)) r.push("محاولة مُعلَّمة متعارضة وهي متوافقة");
        return r;
      }
    },

    flanker: { name:"الأسهم المحاصِرة", mode:'stream',
      goal:()=>`اختر جهة السهم الأوسط وحده — وتجاهل الأسهم المحيطة به`,
      generate(rng, p){
        const flags = conflictFlags(rng, p.trials, p.conflict);
        const trials = flags.map(conflict => {
          const center = pick(rng, ['right','left']);
          const flank = conflict ? (center === 'right' ? 'left' : 'right') : center;
          return { center, flank, conflict, answer: center };
        });
        return { payload:{ kind:'flanker', trials, flankers:2, deadline:p.deadline,
                           allowedErrors:p.allowedErrors }, meta:{} };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        if(pl.trials.length < 3) r.push("عدد المحاولات أقل من اللازم");
        if(!pl.trials.some(t => t.conflict)) r.push("لا محاولة متعارضة — لا تداخل يُقاس");
        if(!pl.trials.some(t => !t.conflict)) r.push("كل المحاولات متعارضة — لا خطّ أساس");
        if(pl.trials.some(t => t.conflict && t.flank === t.center)) r.push("تعارض مُعلَن والأسهم متوافقة");
        if(pl.trials.some(t => !t.conflict && t.flank !== t.center)) r.push("توافق مُعلَن والأسهم متعارضة");
        if(pl.trials.some(t => t.answer !== t.center)) r.push("الإجابة لا تطابق السهم الأوسط");
        return r;
      }
    },

    simon: { name:"تضارب الجهة", mode:'stream',
      goal:()=>`اضغط زرّ اللون المطابق — وتجاهل الجهة التي ظهر فيها الشكل`,
      generate(rng, p){
        const pal = shuffle(rng, activePalette()).slice(0, 2);
        /* الزرّان مثبّتان على جهتيهما طوال الجولة: هذا ما يخلق التعارض */
        const sideOf = { [pal[0]]:'right', [pal[1]]:'left' };
        const flags = conflictFlags(rng, p.trials, p.conflict);
        const trials = flags.map(conflict => {
          const color = pick(rng, pal);
          const own = sideOf[color];
          const side = conflict ? (own === 'right' ? 'left' : 'right') : own;
          const type = pick(rng, SHAPE_TYPES);
          return { color, side, type, conflict, answer: color };
        });
        return { payload:{ kind:'simon', trials, rightColor:pal[0], leftColor:pal[1],
                           deadline:p.deadline, allowedErrors:p.allowedErrors }, meta:{} };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        if(pl.rightColor === pl.leftColor) r.push("زرّا اللون متطابقان");
        if(pl.trials.length < 3) r.push("عدد المحاولات أقل من اللازم");
        if(!pl.trials.some(t => t.conflict)) r.push("لا محاولة متعارضة — لا تداخل يُقاس");
        if(!pl.trials.some(t => !t.conflict)) r.push("كل المحاولات متعارضة — لا خطّ أساس");
        pl.trials.forEach(t => {
          const own = t.color === pl.rightColor ? 'right' : 'left';
          if(t.conflict && t.side === own) r.push("تعارض مُعلَن والجهة موافقة");
          if(!t.conflict && t.side !== own) r.push("توافق مُعلَن والجهة مخالفة");
          if(t.color !== pl.rightColor && t.color !== pl.leftColor) r.push("لون خارج الزرّين");
        });
        return r;
      }
    },

    gonogo: { name:"كفّ الاستجابة", mode:'stream',
      goal:(d)=>`اضغط على كل شكل يظهر بسرعة، إلا ${SHAPE_AR[d.stop]}: ${agree(d.stop,'اتركه يمرّ','اتركها تمرّ')}`,
      generate(rng, p){
        const pal = activePalette();
        const types = shuffle(rng, SHAPE_TYPES);
        const stop = types[0];
        const goPool = types.slice(1, 5);
        /* المحاولات الممنوعة قليلة عمدًا (~الثلث): الضغط يصير عادة،
           وكفّها هو ما يُقاس فعلًا. */
        const noGoCount = Math.max(1, Math.min(p.trials - 2, Math.round(p.trials * 0.3)));
        const flags = shuffle(rng, Array.from({length:p.trials}, (_, i) => i < noGoCount));
        const trials = flags.map(isStop => ({
          type: isStop ? stop : pick(rng, goPool),
          color: pick(rng, pal),
          isStop,
          answer: isStop ? 'hold' : 'press'
        }));
        return { payload:{ kind:'gonogo', trials, stop, deadline:p.deadline,
                           allowedErrors:p.allowedErrors }, meta:{ stop } };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        const stops = pl.trials.filter(t => t.isStop).length;
        if(stops < 1) r.push("لا محاولة ممنوعة — لا كفّ يُقاس");
        if(stops >= pl.trials.length - 1) r.push("الممنوعة أكثر من اللازم — لا تنشأ عادة الضغط");
        if(pl.trials.some(t => t.isStop !== (t.type === pl.stop))) r.push("شكل ممنوع لا يطابق العلامة");
        if(pl.trials.some(t => t.answer !== (t.isStop ? 'hold' : 'press'))) r.push("إجابة لا تطابق نوع المحاولة");
        return r;
      }
    },

    switch: { name:"القاعدة المتبدّلة", mode:'stream',
      goal:()=>`قبل كل شكل ستُخبَر: اللون أم الشكل؟ اختر ما يطابق المطلوب وحده`,
      generate(rng, p){
        const pal = shuffle(rng, activePalette()).slice(0, 2);
        const types = shuffle(rng, SHAPE_TYPES).slice(0, 2);
        const trials = [];
        let prevCue = pick(rng, ['color','shape']);
        for(let i = 0; i < p.trials; i++){
          /* نسبة التبديل هي محور الصعوبة هنا: كل تبديل يكلّف انتباهًا */
          const switched = i > 0 && rng() < p.conflict;
          const cue = switched ? (prevCue === 'color' ? 'shape' : 'color') : prevCue;
          const color = pick(rng, pal), type = pick(rng, types);
          trials.push({ cue, color, type, switched, answer: cue === 'color' ? color : type });
          prevCue = cue;
        }
        if(!trials.some(t => t.switched)){
          const i = randInt(rng, 1, trials.length - 1);
          trials[i].cue = trials[i-1].cue === 'color' ? 'shape' : 'color';
          trials[i].switched = true;
          trials[i].answer = trials[i].cue === 'color' ? trials[i].color : trials[i].type;
          for(let j = i + 1; j < trials.length; j++){
            trials[j].switched = trials[j].cue !== trials[j-1].cue;
          }
        }
        return { payload:{ kind:'switch', trials, colors:pal, types, deadline:p.deadline,
                           allowedErrors:p.allowedErrors }, meta:{} };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        if(pl.colors.length !== 2 || pl.colors[0] === pl.colors[1]) r.push("خيارا اللون غير صالحين");
        if(pl.types.length !== 2 || pl.types[0] === pl.types[1]) r.push("خيارا الشكل غير صالحين");
        if(!pl.trials.some(t => t.switched)) r.push("لا تبديل قاعدة — لا تحويل انتباه يُقاس");
        pl.trials.forEach(t => {
          const want = t.cue === 'color' ? t.color : t.type;
          if(t.answer !== want) r.push("الإجابة لا تطابق البُعد المطلوب");
          if(t.cue === 'color' && !pl.colors.includes(t.color)) r.push("لون خارج الخيارين");
          if(t.cue === 'shape' && !pl.types.includes(t.type)) r.push("شكل خارج الخيارين");
        });
        return r;
      }
    },

    filtercount: { name:"العدّ المُصفّى", mode:'stream',
      /* بلا ضمير عائد: "ما عداه/عداها" يلتبس مرجعه بين الشكل والمرّات */
      goal:(d)=>`عُدّ كم مرة ${agree(d.target,'ظهر','ظهرت')} ${SHAPE_AR[d.target]} في السيل — وتجاهل بقية الأشكال`,
      generate(rng, p){
        const pal = activePalette();
        const types = shuffle(rng, SHAPE_TYPES);
        const target = types[0];
        const others = types.slice(1, 4);
        const total = p.trials + 2;
        /* العدد الصحيح بين ٢ و(المجموع−٢): لا صفر يُخمَّن ولا "كلها" */
        const hits = randInt(rng, 2, Math.max(3, total - 2));
        const flags = shuffle(rng, Array.from({length:total}, (_, i) => i < hits));
        const trials = flags.map(isTarget => ({
          type: isTarget ? target : pick(rng, others),
          color: pick(rng, pal),
          isTarget,
          answer: null                    // لا استجابة أثناء السيل — المشاهدة فقط
        }));
        const used = new Set([hits]);
        const options = [{ value:hits, isCorrect:true }];
        let guard = 0;
        while(options.length < 4 && guard++ < 60){
          const delta = pick(rng, [-3,-2,-1,1,2,3]);
          const v = hits + delta;
          if(v >= 1 && v <= total && !used.has(v)){ used.add(v); options.push({ value:v, isCorrect:false }); }
        }
        return { payload:{ kind:'filtercount', trials, target, hits, watchOnly:true,
                           options: shuffle(rng, options), optionType:'number',
                           deadline:p.deadline, allowedErrors:0 }, meta:{ target } };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        const actual = pl.trials.filter(t => t.isTarget).length;
        if(actual !== pl.hits) r.push("العدد المُعلن لا يطابق السيل");
        if(actual < 1) r.push("لا هدف في السيل");
        if(actual === pl.trials.length) r.push("كل السيل أهداف — لا تصفية");
        if(pl.options.filter(o => o.isCorrect).length !== 1) r.push("عدد الحلول ليس ١");
        if(new Set(pl.options.map(o=>o.value)).size !== pl.options.length) r.push("خيارات مكررة");
        if(!pl.options.some(o => o.value === actual && o.isCorrect)) r.push("العدد الصحيح غائب عن الخيارات");
        if(pl.options.some(o => o.value < 1)) r.push("خيار عدد غير موجب");
        if(pl.trials.some(t => t.isTarget !== (t.type === pl.target))) r.push("هدف لا يطابق الشكل المستهدَف");
        return r;
      }
    },

    tracking: { name:"تتبّع الأهداف", mode:'track', requiresMotionMechanic:true,
      goal:(d)=>`تتبّع ${discPhrase(d.targets)} أثناء حركتها، ثم اضغطها بعد التوقّف`,
      generate(rng, p){
        const total = p.targets + p.distractors;
        const color = pick(rng, activePalette());
        const discs = [];
        for(let i = 0; i < total; i++){
          const angle = rng() * Math.PI * 2;
          const speed = 0.25 + rng() * 0.35;
          discs.push({
            id: i,
            x: 10 + rng() * 80,
            y: 16 + rng() * 68,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            isTarget: i < p.targets
          });
        }
        return { payload:{ kind:'tracking', discs: shuffle(rng, discs), color,
                           targets:p.targets, trackSec:p.trackSec, studySec:1.6, pickSec:9 },
                 meta:{ targets:p.targets } };
      },
      validate(ch){
        const r = []; const pl = ch.payload;
        const t = pl.discs.filter(d => d.isTarget).length;
        if(t !== pl.targets) r.push("عدد الأهداف لا يطابق المُعلن");
        if(t < 2) r.push("هدف واحد لا يقيس التتبّع المتعدّد");
        if(pl.discs.length <= t) r.push("لا مشتّتات — لا تتبّع يُقاس");
        if(new Set(pl.discs.map(d=>d.id)).size !== pl.discs.length) r.push("معرّفات أقراص مكررة");
        if(pl.discs.some(d => d.x < 0 || d.x > 100 || d.y < 0 || d.y > 100)) r.push("قرص خارج المسرح");
        if(pl.discs.some(d => d.vx === 0 && d.vy === 0)) r.push("قرص بلا حركة");
        return r;
      }
    }

  };

  const FOCUS_KEYS = ["stroop","flanker","simon","gonogo","switch","filtercount","tracking"];

  /* ===================== هيكل السلسلة على المسرح ===================== */
  function buildFrame(total){
    clearStage();
    const frame = document.createElement('div');
    frame.className = 'fc-frame';
    frame.innerHTML = `
      <div class="fc-counter"><span id="fcNow">${toArabicDigits(1)}</span>‏/‏${toArabicDigits(total)}</div>
      <div class="fc-stim" id="fcStim"></div>
      <div class="fc-resp" id="fcResp"></div>`;
    el.stage.appendChild(frame);
    return {
      counter: frame.querySelector('#fcNow'),
      stim: frame.querySelector('#fcStim'),
      resp: frame.querySelector('#fcResp')
    };
  }

  /* ===================== عارض السلاسل =====================
     يعرض المحاولات تباعًا، يفرض مُهلة لكل واحدة، يومض بالتصحيح، ثم يحكم.
     كل قالب يقدّم دالتي رسم وحكم فقط. */
  function playStream(ch, isWarmup, cfg){
    const pl = ch.payload;
    const parts = buildFrame(pl.trials.length);
    let index = 0, errors = 0, done = false;

    function endRound(success){
      if(done) return;
      done = true;
      clearTimeout(state.memTimeoutId);
      finishRound(success, performance.now() - state.roundStart, isWarmup);
    }

    function flash(cls){
      parts.stim.classList.remove('ok','bad');
      void parts.stim.offsetWidth;                 // إعادة تشغيل الحركة
      parts.stim.classList.add(cls === 'ok' ? 'ok' : 'bad');
    }

    function judge(correct){
      if(!correct){
        errors++;
        /* تجاوز حدّ الأخطاء ينهي الجولة فورًا: إكمال سلسلة خسرت أصلًا
           إهدار لوقت اللاعب، والتغذية الراجعة الفورية أوضح. */
        if(errors > pl.allowedErrors){ flash('bad'); return endRound(false); }
      }
      flash(correct ? 'ok' : 'bad');
      index++;
      state.memTimeoutId = setTimeout(nextTrial, FEEDBACK_MS);
    }

    function nextTrial(){
      if(done || state.locked) return;
      if(index >= pl.trials.length){
        if(cfg.onAllShown) return cfg.onAllShown(endRound, parts);
        return endRound(errors <= pl.allowedErrors);
      }
      parts.counter.textContent = toArabicDigits(index + 1);
      parts.stim.classList.remove('ok','bad');
      const trial = pl.trials[index];
      let answered = false;

      const respond = (value) => {
        if(answered || done || state.locked || state.paused) return;
        answered = true;
        clearTimeout(state.memTimeoutId);
        judge(cfg.judge(trial, value));
      };

      cfg.renderTrial(trial, respond, parts, index);

      /* انقضاء المُهلة: في Go/No-Go عدمُ الضغط هو الإجابة الصحيحة للممنوع،
         وفي غيره تأخّرٌ يُحتسب خطأً. */
      state.memTimeoutId = setTimeout(() => {
        if(answered || done) return;
        answered = true;
        judge(cfg.onTimeout ? cfg.onTimeout(trial) : false);
      }, pl.deadline);
    }

    state.locked = false;
    state.roundStart = performance.now();
    startTimer(ch.time, () => { if(!state.locked) endRound(false); }, true, 700);
    nextTrial();
  }

  /* ===================== مُصيّرات المحاولات ===================== */
  function colorButtons(parts, colors, onPick){
    parts.resp.innerHTML = '';
    colors.forEach(c => {
      const b = document.createElement('button');
      b.className = 'fc-btn';
      b.setAttribute('aria-label', colorIndef(c));
      b.title = colorIndef(c);
      b.innerHTML = `<i class="fc-swatch" style="background:${c}"></i>`;
      b.addEventListener('click', () => onPick(c));
      parts.resp.appendChild(b);
    });
  }

  function renderStroopTrial(pl){
    return (trial, respond, parts) => {
      parts.stim.innerHTML = `<div class="fc-word" style="color:${trial.ink}">${colorIndef(trial.word)}</div>`;
      colorButtons(parts, pl.options.map(o => o.value), respond);
    };
  }

  function renderFlankerTrial(pl){
    return (trial, respond, parts) => {
      const row = [];
      for(let i = 0; i < pl.flankers; i++) row.push(trial.flank);
      row.push(trial.center);
      for(let i = 0; i < pl.flankers; i++) row.push(trial.flank);
      parts.stim.innerHTML = `<div class="fc-row">` +
        row.map((d, i) => `<span class="fc-arrow${i === pl.flankers ? ' center' : ''}">` +
          arrowSVG(d, i === pl.flankers ? 'var(--world-accent)' : 'var(--muted)', 38) + `</span>`).join('') +
        `</div>`;
      parts.resp.innerHTML = '';
      /* الزرّ الذي يشير يمينًا يقع يمينًا فعلًا: في RTL أول عنصر يذهب يمينًا */
      [['right','يمين'], ['left','يسار']].forEach(([dir, label]) => {
        const b = document.createElement('button');
        b.className = 'fc-btn';
        b.setAttribute('aria-label', label); b.title = label;
        b.innerHTML = arrowSVG(dir, 'currentColor', 30);
        b.addEventListener('click', () => respond(dir));
        parts.resp.appendChild(b);
      });
    };
  }

  function renderSimonTrial(pl){
    return (trial, respond, parts) => {
      const pos = trial.side === 'right' ? 'right:8%' : 'left:8%';
      parts.stim.innerHTML = `<div class="fc-side" style="${pos}">
        <svg width="56" height="56" viewBox="0 0 44 44">${shapeSVG(trial.type, trial.color)}</svg></div>`;
      colorButtons(parts, [pl.rightColor, pl.leftColor], respond);
    };
  }

  function renderGoNoGoTrial(){
    return (trial, respond, parts) => {
      parts.resp.innerHTML = '';
      parts.stim.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'fc-tap';
      btn.setAttribute('aria-label', SHAPE_AR[trial.type]);
      btn.innerHTML = `<svg width="86" height="86" viewBox="0 0 44 44">${shapeSVG(trial.type, trial.color)}</svg>`;
      btn.addEventListener('click', () => respond('press'));
      parts.stim.appendChild(btn);
    };
  }

  function renderSwitchTrial(pl){
    return (trial, respond, parts) => {
      const cueText = trial.cue === 'color' ? 'اللون' : 'الشكل';
      parts.stim.innerHTML = `<div class="fc-cue">${cueText}</div>
        <div class="fc-shape"><svg width="64" height="64" viewBox="0 0 44 44">${shapeSVG(trial.type, trial.color)}</svg></div>`;
      if(trial.cue === 'color'){
        colorButtons(parts, pl.colors, respond);
      } else {
        parts.resp.innerHTML = '';
        pl.types.forEach(t => {
          const b = document.createElement('button');
          b.className = 'fc-btn';
          b.setAttribute('aria-label', SHAPE_AR[t]); b.title = SHAPE_AR[t];
          b.innerHTML = `<svg width="34" height="34" viewBox="0 0 44 44">${shapeSVG(t, 'var(--muted)')}</svg>`;
          b.addEventListener('click', () => respond(t));
          parts.resp.appendChild(b);
        });
      }
    };
  }

  function renderWatchTrial(){
    return (trial, respond, parts) => {
      parts.resp.innerHTML = '<div class="fc-hint">شاهد فقط</div>';
      parts.stim.innerHTML = `<div class="fc-shape"><svg width="76" height="76" viewBox="0 0 44 44">${shapeSVG(trial.type, trial.color)}</svg></div>`;
    };
  }

  /* ===================== تتبّع الأهداف ===================== */
  function renderTracking(ch, isWarmup){
    const pl = ch.payload;
    clearStage();
    let done = false;
    const endRound = (ok) => {
      if(done) return;
      done = true;
      cancelAnimationFrame(state.animId);
      clearTimeout(state.memTimeoutId);
      finishRound(ok, performance.now() - state.roundStart, isWarmup);
    };

    const nodes = pl.discs.map(d => {
      const div = document.createElement('div');
      div.className = 'fc-disc' + (d.isTarget ? ' target' : '');
      div.style.left = d.x + '%'; div.style.top = d.y + '%';
      div.innerHTML = `<svg width="34" height="34" viewBox="0 0 44 44">${shapeSVG('circle', pl.color)}</svg>`;
      el.stage.appendChild(div);
      return div;
    });

    const hint = document.createElement('div');
    hint.className = 'fc-hint float';
    hint.textContent = 'احفظ المميّزة…';
    el.stage.appendChild(hint);

    state.locked = false;
    state.roundStart = performance.now();
    startTimer(ch.time, () => { if(!state.locked) endRound(false); }, true, 400);

    /* ١) مرحلة التمييز ثم ٢) الحركة ثم ٣) الاختيار */
    state.memTimeoutId = setTimeout(() => {
      nodes.forEach(n => n.classList.remove('target'));
      hint.textContent = 'تتبّعها…';
      const stopAt = performance.now() + pl.trackSec * 1000;

      (function step(){
        if(done) return;
        if(performance.now() >= stopAt) return startPicking();
        pl.discs.forEach((d, i) => {
          d.x += d.vx; d.y += d.vy;
          if(d.x < 6 || d.x > 94){ d.vx *= -1; d.x = Math.min(94, Math.max(6, d.x)); }
          if(d.y < 12 || d.y > 88){ d.vy *= -1; d.y = Math.min(88, Math.max(12, d.y)); }
          nodes[i].style.left = d.x + '%'; nodes[i].style.top = d.y + '%';
        });
        state.animId = requestAnimationFrame(step);
      })();
    }, pl.studySec * 1000);

    function startPicking(){
      cancelAnimationFrame(state.animId);
      hint.textContent = 'اضغط الأقراص التي كانت مميّزة';
      let picked = 0;
      nodes.forEach((n, i) => {
        n.classList.add('pickable');
        n.addEventListener('click', () => {
          if(done || state.locked || n.dataset.picked) return;
          n.dataset.picked = '1';
          if(pl.discs[i].isTarget){
            n.classList.add('correct-flash', 'chosen');
            picked++;
            if(picked >= pl.targets) endRound(true);
          } else {
            n.classList.add('wrong-flash');
            endRound(false);          // مشتّت واحد يكفي: التتبّع إما تمّ أو لا
          }
        });
      });
    }
  }

  /* ===================== البناء والتدقيق ===================== */
  function buildFocusChallenge(templateKey, difficulty, roundIndex, seed){
    const rng = makeRng(seed);
    const p = focusDifficultyParams(difficulty);
    const tmpl = FOCUS_TEMPLATES[templateKey];
    const built = tmpl.generate(rng, p);
    const pl = built.payload;
    const time = pl.kind === 'tracking'
      ? Math.ceil(pl.studySec + pl.trackSec + pl.pickSec)
      : streamBudget({ trials: pl.trials.length, deadline: pl.deadline });
    const ch = makeChallenge({
      worldName:"تركيز", skill:"التركيز", input:"متنوع", action:"ركّز",
      rule: tmpl.name, modifier: pl.kind === 'tracking' ? "عناصر متحركة" : "سلسلة محاولات",
      templateKey, templateName: tmpl.name, difficulty, roundIndex, seed,
      time, goal: tmpl.goal(built.meta)
    });
    ch.world = "التركيز";
    ch.payload = pl;
    ch.mode = tmpl.mode;
    return ch;
  }

  function validateFocusChallenge(ch){
    const reasons = [];
    const pl = ch.payload;
    if(pl.kind === 'tracking'){
      if(ch.time < pl.studySec + pl.trackSec + 3) reasons.push("الوقت لا يكفي مرحلة الاختيار");
    } else {
      /* الميزانية يجب أن تسع كل المحاولات بمُهَلها، وإلا انتهى الوقت
         قبل أن يرى اللاعب سلسلته كاملة مهما أحسن. */
      const need = (pl.trials.length * (pl.deadline + FEEDBACK_MS)) / 1000;
      if(ch.time < need) reasons.push("الوقت غير كافٍ لكل المحاولات");
      if(pl.allowedErrors >= pl.trials.length) reasons.push("حدّ الأخطاء يجعل الفشل مستحيلًا");
    }
    const t = FOCUS_TEMPLATES[ch.templateKey].validate(ch);
    return { valid: reasons.length === 0 && t.length === 0, reasons: reasons.concat(t) };
  }

  /* ===================== العرض ===================== */
  function renderFocusChallenge(ch, isWarmup){
    renderChallengeHeader(ch, isWarmup);
    const pl = ch.payload;

    if(pl.kind === 'tracking') return renderTracking(ch, isWarmup);

    const renderers = {
      stroop: renderStroopTrial, flanker: renderFlankerTrial, simon: renderSimonTrial,
      gonogo: renderGoNoGoTrial, switch: renderSwitchTrial, filtercount: renderWatchTrial
    };

    const cfg = {
      renderTrial: renderers[pl.kind](pl),
      judge: (trial, value) => value === trial.answer,
      onTimeout: () => false
    };

    if(pl.kind === 'gonogo'){
      cfg.judge = (trial) => !trial.isStop;          // الضغط صحيح إلا على الممنوع
      cfg.onTimeout = (trial) => trial.isStop;       // الترك صحيح للممنوع وحده
    }

    if(pl.watchOnly){
      cfg.judge = () => true;                        // لا استجابة أثناء المشاهدة
      cfg.onTimeout = () => true;
      cfg.onAllShown = (endRound) => {
        renderMC(pl.options, pl.optionType, (correct) => endRound(correct));
      };
    }

    playStream(ch, isWarmup, cfg);
  }

  /* ===================== التسجيل في المحرك ===================== */
  MAD.registerWorld({
    key:'focus', badge:'٥',
    name:"التركيز", label:"عالم التركيز", skillName:"التركيز", input:"متنوع", action:"ركّز",
    topRank:"انتباه فولاذي",
    nebula:{ a:'#8A2E4E', b:'#5C2A6E' },
    accent:{ solid:'#FF6B8B', dim:'rgba(255,107,139,0.18)' },
    intro:{
      icon: `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>`,
      text: `<b>عالم التركيز</b> لا يطلب منك أن تجد شيئًا، بل ألّا تنخدع. ستمرّ عليك سلاسل سريعة من المحفّزات تتعمّد تضليلك — كلمة بلون مخالف لمعناها، أسهم تشدّك إلى الجهة الخطأ، أو شكل ممنوع بين أشكال اعتدت الضغط عليها. مهمتك أن تتمسّك بالقاعدة وحدها.`
    },
    keys: FOCUS_KEYS, templates: FOCUS_TEMPLATES, warmup:"stroop",
    maxAttempts: 8,
    motionLockNotice: 'قالب "تتبّع الأهداف" مُستبعد لأنه يعتمد جوهريًا على الحركة',
    /* السلاسل محكومة بمؤقّتات متسلسلة، واستئنافها بعد إيقاف يفسد قياس الزمن */
    canPause(){ return false; },
    pauseBlockedNotice: 'لا يمكن إيقاف سلسلة التركيز — أكملها أو اخرج',
    build: buildFocusChallenge,
    validate: validateFocusChallenge,
    render: renderFocusChallenge
  });

})();
