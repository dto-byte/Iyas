/* =====================================================================
   إياس — طبقة التقدّم (progress.js)
   وحدة جانبية مستقلّة: تسجّل تاريخ الجلسات، وتحسب السلسلة اليومية،
   وتبني شاشة التقدّم. لا يعرف المحرك بوجودها — تتصل به عبر MAD.addHook.

   نموذج التخزين (مفتاح واحد: madarat_progress_v1):
   **المفتاح يبقى على اسمه القديم عمدًا رغم تغيّر اسم اللعبة**: هو اسم داخلي لا
   يراه اللاعب، وتغييره يعني أن كل سجلّ محفوظ على أجهزة اللاعبين يصير يتيمًا —
   تضيع السلاسل والجلسات والمجاميع. لا يُغيَّر إلا مع دالة ترحيل تنقل القديم.
   {
     v: 1,
     sessions: [ { at, world, diff, xp, accuracy, react, combo, rounds, correct, mistakes } ],
     totals:   { <world>: { count, xp, sumAccuracy, sumReact, reactCount, bestXP } },
     days:     { "YYYY-MM-DD": عدد الجلسات في ذلك اليوم }
   }
   - `sessions` مقصوصة إلى آخر MAX_SESSIONS جلسة (سجلّ تفصيلي للمنحنيات).
   - `totals` و`days` تراكميّة لا تُقَص أبدًا، فالإحصاء الكلي والسلسلة يبقيان صحيحين
     حتى بعد قصّ السجلّ التفصيلي.
   - أرقام اللاعب القياسية تبقى في cogtrain_best_* الذي يكتبه المحرك: هي السجلّ
     الوحيد لما قبل هذه الميزة، فلا تُستبدل.
   ===================================================================== */
(function(){
  "use strict";
  if(typeof MAD === 'undefined'){ console.error('progress.js يحتاج engine-core.js قبله'); return; }

  const { state, el, toArabicDigits, counted, countedWith, WORLDS, WORLD_ORDER,
          loadBest, showSetup, addHook } = MAD;

  const KEY = 'madarat_progress_v1';   // لا يُغيَّر: انظر الترويسة
  const MAX_SESSIONS = 500;   // ~٦٠ ك.ب في أسوأ الحالات
  const TREND_WINDOW = 5;     // عدد الجلسات في كل نصف عند مقارنة الاتجاه
  const HEATMAP_WEEKS = 8;

  /* صيغ المعدود العربي — ١ مفرد، ٢ مثنى، ٣-١٠ جمع، ١١+ مفرد منصوب */
  const N_SESSION = { one:'جلسة', two:'جلستان', few:'جلسات', many:'جلسة', zero:'جلسات' };
  /* "سلسلة" مضاف، فالمعدود بعده مجرور: "سلسلة يومين" لا "سلسلة يومان" */
  const N_DAY     = { one:'يوم',  two:'يومين',  few:'أيام',   many:'يومًا' };
  const N_ACTIVE  = { one:'يوم نشِط', two:'يومان نشِطان', few:'أيام نشِطة', many:'يومًا نشِطًا' };

  /* أيقونة السلسلة — SVG مضمّن كبقية أيقونات اللعبة، لا محرف قد لا يُرسم */
  const FLAME_SVG = '<svg class="st-icon" width="13" height="15" viewBox="0 0 24 28" aria-hidden="true">' +
    '<path d="M12 1c1.2 4.6-4.6 5.8-4.6 10.4a4.6 4.6 0 009.2 0c0-2.3-1.2-3.5-1.2-3.5s2.3 1.2 2.3 4.6a5.8 5.8 0 01-11.5 0C6.2 6.8 12 5.6 12 1z" fill="currentColor"/></svg>';

  /* أسماء عربية ثابتة — لا نعتمد على Intl حتى لا تتغيّر اللغة بتغيّر البيئة */
  const WEEKDAYS_AR = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                     'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  /* ===================== التخزين ===================== */
  function emptyData(){ return { v:1, sessions:[], totals:{}, days:{} }; }

  function load(){
    let raw = null;
    try{ raw = localStorage.getItem(KEY); }catch(e){ return emptyData(); }
    if(!raw) return emptyData();
    try{
      const d = JSON.parse(raw);
      if(!d || typeof d !== 'object') return emptyData();
      const list = Array.isArray(d.sessions) ? d.sessions.slice() : [];
      /* الترتيب الزمني تصاعديًا شرط لكل ما يليه: المنحنى والاتجاه وتواريخ المحور
         تفترض أن أول عنصر هو الأقدم. الترتيب عند القراءة يحصّن الوحدة ضد أي
         كتابة بترتيب مختلف (ساعة النظام تغيّرت، أو بيانات مستوردة). */
      list.sort((a,b)=>(a.at||0)-(b.at||0));
      return {
        v: 1,
        sessions: list,
        totals: (d.totals && typeof d.totals === 'object') ? d.totals : {},
        days: (d.days && typeof d.days === 'object') ? d.days : {}
      };
    }catch(e){ return emptyData(); }   // بيانات تالفة: نبدأ نظيفًا بدل أن نتعطّل
  }

  function save(d){
    try{ localStorage.setItem(KEY, JSON.stringify(d)); return true; }
    catch(e){ return false; }          // الحصّة ممتلئة أو التخزين محجوب
  }

  MAD.progressData = load;             // للاختبارات والتشخيص

  /* ===================== التواريخ ===================== */
  /* مفتاح اليوم بالتوقيت المحلي — لا UTC، وإلا انقطعت السلسلة قبل منتصف الليل */
  function dayKey(ts){
    const d = new Date(ts);
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function keyToDate(k){ const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); }
  function shiftDays(date, n){ const d = new Date(date.getTime()); d.setDate(d.getDate()+n); return d; }
  function arabicDate(ts){
    const d = new Date(ts);
    return `${toArabicDigits(d.getDate())} ${MONTHS_AR[d.getMonth()]}`;
  }

  /* ===================== التسجيل ===================== */
  function recordSession(s){
    const d = load();
    d.sessions.push({
      at: s.at, world: s.world, diff: s.diff, xp: s.xp, accuracy: s.accuracy,
      react: s.avgReactMs, combo: s.maxCombo, rounds: s.rounds,
      correct: s.correct, mistakes: s.mistakes
    });
    if(d.sessions.length > MAX_SESSIONS) d.sessions = d.sessions.slice(-MAX_SESSIONS);

    const t = d.totals[s.world] || { count:0, xp:0, sumAccuracy:0, sumReact:0, reactCount:0, bestXP:0 };
    t.count++; t.xp += s.xp; t.sumAccuracy += s.accuracy;
    if(s.avgReactMs != null){ t.sumReact += s.avgReactMs; t.reactCount++; }
    t.bestXP = Math.max(t.bestXP, s.xp);
    d.totals[s.world] = t;

    const k = dayKey(s.at);
    d.days[k] = (d.days[k] || 0) + 1;

    return { data: d, saved: save(d) };
  }

  /* ===================== السلسلة اليومية ===================== */
  /* تُشتق من مجموعة الأيام لا من عدّاد محفوظ، فلا يمكن أن تتعارض مع البيانات */
  function computeStreak(days, now){
    const today = dayKey(now);
    const yesterday = dayKey(shiftDays(new Date(now), -1));
    const playedToday = !!days[today];

    // السلسلة الحالية تُحسب من اليوم إن لُعب، وإلا من الأمس (فاليوم لم ينتهِ بعد)
    let cursor = playedToday ? today : (days[yesterday] ? yesterday : null);
    let current = 0;
    while(cursor && days[cursor]){
      current++;
      cursor = dayKey(shiftDays(keyToDate(cursor), -1));
    }

    // أطول سلسلة على كل التاريخ
    const sorted = Object.keys(days).filter(k=>days[k]>0).sort();
    let longest = 0, run = 0, prev = null;
    for(const k of sorted){
      run = (prev && dayKey(shiftDays(keyToDate(prev), 1)) === k) ? run+1 : 1;
      if(run > longest) longest = run;
      prev = k;
    }

    return { current, longest: Math.max(longest, current), playedToday, activeDays: sorted.length };
  }

  /* ===================== الاتجاه ===================== */
  /* يقارن متوسط دقّة آخر ٥ جلسات بالـ٥ التي قبلها. يحتاج ٤ جلسات على الأقل
     في كل نصف حتى لا نعلن اتجاهًا من عيّنة تافهة. */
  function computeTrend(sessions){
    const n = sessions.length;
    if(n < TREND_WINDOW + 4) return null;
    const recent = sessions.slice(-TREND_WINDOW);
    const older = sessions.slice(-(TREND_WINDOW*2), -TREND_WINDOW);
    if(older.length < 4) return null;
    const avg = (a)=> a.reduce((x,s)=>x+s.accuracy, 0) / a.length;
    const delta = Math.round(avg(recent) - avg(older));
    return { delta, dir: delta > 2 ? 'up' : (delta < -2 ? 'down' : 'flat') };
  }

  function worldSessions(d, world){ return d.sessions.filter(s=>s.world===world); }

  /* ===================== رسم بياني خطّي (SVG مضمّن) ===================== */
  /* الزمن يسير من اليمين (الأقدم) إلى اليسار (الأحدث) موافقًا لاتجاه القراءة */
  function lineChart(values, opts){
    opts = opts || {};
    const W = 300, H = 90, padX = 6, padY = 10;
    if(values.length < 2){
      return `<div class="prog-empty">تحتاج جلستين على الأقل لرسم المنحنى</div>`;
    }
    const max = opts.max != null ? opts.max : Math.max(...values);
    const min = opts.min != null ? opts.min : Math.min(...values);
    const span = (max - min) || 1;
    const n = values.length;
    const pts = values.map((v,i)=>{
      const x = W - padX - ((W - padX*2) * (i/(n-1)));   // i=0 أقدم ← يمين
      const y = padY + (H - padY*2) * (1 - (v - min)/span);
      return [x, y];
    });
    const path = pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${path} L${pts[pts.length-1][0].toFixed(1)},${H-padY} L${pts[0][0].toFixed(1)},${H-padY} Z`;
    const dots = pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="var(--world-accent)"/>`).join('');
    return `<svg class="prog-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
        aria-label="منحنى آخر ${countedWith(n, N_SESSION)}">
      <path d="${area}" fill="var(--world-accent-dim)"/>
      <path d="${path}" fill="none" stroke="var(--world-accent)" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
  }

  /* ===================== خريطة النشاط ===================== */
  /* أعمدة = أسابيع (الأقدم يمينًا)، صفوف = أيام الأسبوع من الأحد */
  function heatmap(days, now){
    const todayKey = dayKey(now);
    // نبدأ من أحد أول أسبوع في النطاق
    const start = shiftDays(new Date(now), -(HEATMAP_WEEKS*7 - 1));
    start.setDate(start.getDate() - start.getDay());
    const cols = [];
    for(let w=0; w<HEATMAP_WEEKS+1; w++){
      const col = [];
      for(let dow=0; dow<7; dow++){
        const date = shiftDays(start, w*7 + dow);
        const k = dayKey(date);
        const count = days[k] || 0;
        const future = date.getTime() > now;
        col.push({ k, count, future, isToday: k===todayKey, date });
      }
      cols.push(col);
    }
    const cells = cols.map(col=>
      `<div class="hm-col">` + col.map(c=>{
        if(c.future) return `<i class="hm-cell future"></i>`;
        const lvl = c.count === 0 ? 0 : (c.count === 1 ? 1 : (c.count <= 3 ? 2 : 3));
        const label = `${WEEKDAYS_AR[c.date.getDay()]} ${toArabicDigits(c.date.getDate())} ${MONTHS_AR[c.date.getMonth()]}` +
          (c.count ? ` — ${countedWith(c.count, N_SESSION)}` : ' — بلا جلسات');
        return `<i class="hm-cell lvl${lvl}${c.isToday?' today':''}" title="${label}" aria-label="${label}"></i>`;
      }).join('') + `</div>`
    ).join('');
    /* عمود أسماء الأيام يعطي الشبكة بنية مقروءة بدل مربّعات معلّقة في فراغ.
       نُظهر ثلاثة فقط (الأحد/الأربعاء/السبت) حتى لا تتزاحم الأسطر. */
    const dayLabels = `<div class="hm-days">` +
      WEEKDAYS_AR.map((name,i)=> i%3===0 ? `<i class="hm-day">${name}</i>` : `<i class="hm-day empty"></i>`).join('') +
      `</div>`;
    return `<div class="heatmap" dir="rtl">${dayLabels}${cells}</div>
      <div class="hm-legend">
        <span>الأقدم</span>
        <span class="hm-scale"><i class="hm-cell lvl0"></i><i class="hm-cell lvl1"></i><i class="hm-cell lvl2"></i><i class="hm-cell lvl3"></i></span>
        <span>الأحدث</span>
      </div>`;
  }

  /* يضع الرقم وحده داخل <b> — خط الأرقام (JetBrains Mono) لا يصلح للعربية —
     ويحذف الرقم مع المثنى لأن العربية لا تسبق المثنى برقم.
     التركيب اليدوي في كل موضع هو ما أفلت من إصلاح countedWith سابقًا
     فأنتج "سلسلة ٢ يومان"؛ فلنُبقِه في مكان واحد. */
  function boldCount(n, forms){
    const word = counted(n, forms);
    return n === 2 ? word : '<b>' + toArabicDigits(n) + '</b> ' + word;
  }

  /* ===================== شريط السلسلة على شاشة الإعداد ===================== */
  function streakLine(st){
    if(st.current === 0){
      return FLAME_SVG + (st.activeDays === 0
        ? ' لم تبدأ سلسلتك بعد — جلسة واحدة اليوم تفتحها'
        : ' انقطعت سلسلتك — جلسة واحدة اليوم تبدأ واحدة جديدة');
    }
    const todayNote = st.playedToday ? 'أكملت اليوم ✓' : 'أكمل جلسة اليوم لتحافظ عليها';
    return FLAME_SVG + ` سلسلة ${boldCount(st.current, N_DAY)} · ${todayNote}`;
  }

  /* ===================== اقتراح مستوى البداية =====================
     التكيّف داخل الجلسة يصحّح المسار بعد أن يبدأ خطأً. هذا يصحّحه قبل أن يبدأ:
     يقرأ آخر ٣ جلسات في العالم المختار ويقترح مستوى أنسب.
     لا يغيّر شيئًا تلقائيًا — الاختيار يبقى بيد اللاعب بضغطة واحدة. */
  const SUGGEST = { minSessions:3, window:3, tooEasy:85, tooHard:45 };
  const DIFF_NAMES = { 1:'سهل', 2:'متوسط', 3:'صعب', 4:'خبير' };

  function suggestDifficulty(d, world, currentDiff){
    const mine = worldSessions(d, world);
    if(mine.length < SUGGEST.minSessions) return null;
    const recent = mine.slice(-SUGGEST.window);
    const avgAcc = Math.round(recent.reduce((a,s)=>a+s.accuracy, 0) / recent.length);
    /* المستوى المرجعي هو ما لعبه فعلًا لا ما هو مختار الآن */
    const playedDiff = Math.round(recent.reduce((a,s)=>a+(s.diff||1), 0) / recent.length);
    let target = playedDiff;
    if(avgAcc >= SUGGEST.tooEasy) target = Math.min(4, playedDiff + 1);
    else if(avgAcc <= SUGGEST.tooHard) target = Math.max(1, playedDiff - 1);
    if(target === currentDiff) return null;      // لا نُزعج بلا فائدة
    return { target, avgAcc, harder: target > currentDiff, sample: recent.length };
  }

  function suggestionLine(sg){
    const why = sg.harder
      ? `دقّتك <b>${toArabicDigits(sg.avgAcc)}٪</b> في آخر ${countedWith(sg.sample, N_SESSION)}`
      : `دقّتك <b>${toArabicDigits(sg.avgAcc)}٪</b> في آخر ${countedWith(sg.sample, N_SESSION)}`;
    const verb = sg.harder ? 'جرّب مستوى' : 'قد يناسبك مستوى';
    return `${why} — ${verb} <b>${DIFF_NAMES[sg.target]}</b>`;
  }

  function renderStreakMount(){
    const mount = document.getElementById('streakMount');
    if(!mount) return;
    const d = load();
    const st = computeStreak(d.days, Date.now());
    const total = Object.keys(d.totals).reduce((a,k)=>a + d.totals[k].count, 0);
    const sg = suggestDifficulty(d, state.world, state.diff);

    mount.innerHTML = `
      <div class="streak-bar${st.current>0 ? ' lit' : ''}">
        <div class="st-text">${streakLine(st)}</div>
        <button class="prog-open" id="openProgress" title="سجلّ التقدّم" aria-label="سجلّ التقدّم">
          سجلّ التقدّم${total ? ` · ${countedWith(total, N_SESSION)}` : ''}
        </button>
      </div>` +
      (sg ? `<div class="diff-suggest${sg.harder ? ' up' : ''}">
        <span>${suggestionLine(sg)}</span>
        <button class="sg-apply" id="applySuggest" data-d="${sg.target}">طبّق</button>
      </div>` : '');

    document.getElementById('openProgress').addEventListener('click', openProgress);
    const apply = document.getElementById('applySuggest');
    if(apply) apply.addEventListener('click', ()=>{
      /* نضغط زر الصعوبة نفسه، فيتولّى المحرك ضبط الحالة والواجهة — لا ازدواج */
      const btn = document.querySelector(`.diff-btn[data-d="${apply.dataset.d}"]`);
      if(btn) btn.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      renderStreakMount();
    });
  }

  /* ===================== شاشة التقدّم ===================== */
  let chartWorld = null;   // العالم المعروض في المنحنى

  function openProgress(){
    chartWorld = state.world;
    el.setup.style.display = 'none';
    el.game.style.display = 'none';
    el.result.style.display = 'none';
    const screen = document.getElementById('screen-progress');
    screen.style.display = 'block';
    renderProgress();
  }
  function closeProgress(){
    document.getElementById('screen-progress').style.display = 'none';
    showSetup();
  }

  function dirMark(dir, delta){
    if(dir === 'up')   return `<span class="tr up">▲ ${toArabicDigits(Math.abs(delta))}٪</span>`;
    if(dir === 'down') return `<span class="tr down">▼ ${toArabicDigits(Math.abs(delta))}٪</span>`;
    return `<span class="tr flat">■ ثابت</span>`;
  }

  function renderProgress(){
    const screen = document.getElementById('screen-progress');
    const d = load();
    const now = Date.now();
    const st = computeStreak(d.days, now);
    const totalSessions = Object.keys(d.totals).reduce((a,k)=>a + d.totals[k].count, 0);
    const totalXP = Object.keys(d.totals).reduce((a,k)=>a + d.totals[k].xp, 0);

    if(totalSessions === 0){
      screen.innerHTML = `
        <div class="result">
          <h2>سجلّ التقدّم</h2>
          <div class="prog-empty big">لا توجد جلسات مسجّلة بعد.<br>
            أكمل جلستك الأولى وسيبدأ سجلّك من هنا — السلسلة اليومية، منحنى الدقة، وخريطة النشاط.</div>
          <button class="replay-btn" id="progBack">رجوع</button>
        </div>`;
      document.getElementById('progBack').addEventListener('click', closeProgress);
      return;
    }

    /* صفوف العوالم */
    const worldRows = WORLD_ORDER.map(k=>{
      const t = d.totals[k];
      const w = WORLDS[k];
      if(!t) return `<div class="pw-row empty"><span class="pw-name"><i class="pw-badge">${w.badge}</i>${w.label}</span>
        <span class="pw-none">لم تُلعب بعد</span></div>`;
      const avgAcc = Math.round(t.sumAccuracy / t.count);
      const avgReact = t.reactCount ? (t.sumReact / t.reactCount / 1000).toFixed(2) : null;
      const tr = computeTrend(worldSessions(d, k));
      const best = Math.max(t.bestXP, loadBest(k).bestXP || 0);
      return `<div class="pw-row${k===chartWorld?' sel':''}" data-w="${k}" role="button" tabindex="0"
          title="اعرض منحنى ${w.label}">
        <span class="pw-name"><i class="pw-badge">${w.badge}</i>${w.label}</span>
        <span class="pw-stats">
          <b>${toArabicDigits(t.count)}</b> ${counted(t.count, N_SESSION)} ·
          دقة <b>${toArabicDigits(avgAcc)}٪</b>
          ${avgReact ? ` · <b>${toArabicDigits(avgReact)}</b> ث` : ''} ·
          أفضل <b>${toArabicDigits(best)}</b>
          ${tr ? ' ' + dirMark(tr.dir, tr.delta) : ''}
        </span>
      </div>`;
    }).join('');

    /* المنحنى للعالم المختار */
    const chartSessions = worldSessions(d, chartWorld).slice(-20);
    const chartLabel = WORLDS[chartWorld] ? WORLDS[chartWorld].label : '';
    const chartBody = chartSessions.length >= 2
      ? lineChart(chartSessions.map(s=>s.accuracy), { min:0, max:100 }) +
        `<div class="ch-axis"><span>الأقدم · ${arabicDate(chartSessions[0].at)}</span>
           <span>الأحدث · ${arabicDate(chartSessions[chartSessions.length-1].at)}</span></div>`
      : `<div class="prog-empty">تحتاج جلستين على الأقل في ${chartLabel} لرسم المنحنى</div>`;

    const streakClass = st.current > 0 ? 'lit' : '';
    screen.innerHTML = `
      <div class="result prog">
        <h2>سجلّ التقدّم</h2>

        <div class="prog-cards">
          <div class="pcard ${streakClass}">
            <div class="pc-v">${toArabicDigits(st.current)}</div>
            <div class="pc-l">سلسلة الأيام</div>
            <div class="pc-sub">أطول سلسلة: ${toArabicDigits(st.longest)}</div>
          </div>
          <div class="pcard">
            <div class="pc-v">${toArabicDigits(totalSessions)}</div>
            <div class="pc-l">${counted(totalSessions, N_SESSION)} مكتملة</div>
            <div class="pc-sub">${countedWith(st.activeDays, N_ACTIVE)}</div>
          </div>
          <div class="pcard">
            <div class="pc-v">${toArabicDigits(totalXP)}</div>
            <div class="pc-l">إجمالي الخبرة</div>
            <div class="pc-sub">${st.playedToday ? 'لعبت اليوم ✓' : 'لم تلعب اليوم'}</div>
          </div>
        </div>

        <div class="prog-sec">
          <div class="prog-h">خريطة النشاط — آخر ${countedWith(HEATMAP_WEEKS, {one:'أسبوع',two:'أسبوعان',few:'أسابيع',many:'أسبوعًا'})}</div>
          ${heatmap(d.days, now)}
        </div>

        <div class="prog-sec">
          <div class="prog-h">منحنى الدقة — ${chartLabel}</div>
          ${chartBody}
        </div>

        <div class="prog-sec">
          <div class="prog-h">حسب العالم — انقر عالمًا لعرض منحناه</div>
          <div class="pw-list">${worldRows}</div>
        </div>

        <div class="prog-note">البيانات محفوظة في هذا المتصفح فقط — تفريغ بيانات الموقع يمحوها،
          ولا تنتقل بين الأجهزة.</div>

        <button class="replay-btn" id="progBack">رجوع</button>
      </div>`;

    document.getElementById('progBack').addEventListener('click', closeProgress);
    screen.querySelectorAll('.pw-row[data-w]').forEach(row=>{
      const pick = ()=>{ chartWorld = row.dataset.w; renderProgress(); };
      row.addEventListener('click', pick);
      row.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pick(); } });
    });
  }

  /* ===================== الوصل بالمحرك ===================== */
  addHook('sessionEnd', (s)=>{
    const { data, saved } = recordSession(s);
    const st = computeStreak(data.days, s.at);
    const mine = worldSessions(data, s.world);
    const tr = computeTrend(mine);

    let line;
    if(st.current >= 2){
      line = `سلسلة ${boldCount(st.current, N_DAY)} متواصلة` +
             (st.current >= st.longest ? ' — أطول سلسلة لك حتى الآن!' : '');
    } else if(mine.length === 1){
      line = `أول جلسة مسجّلة في سجلّك — عُد غدًا لتبدأ سلسلة`;
    } else {
      line = `بدأت سلسلة جديدة — عُد غدًا لتصل إلى يومين`;
    }

    const trPart = tr
      ? ` · دقّتك في آخر ${countedWith(TREND_WINDOW, N_SESSION)} ${
          tr.dir==='up' ? `أعلى بـ<b>${toArabicDigits(tr.delta)}٪</b>` :
          tr.dir==='down' ? `أقل بـ<b>${toArabicDigits(Math.abs(tr.delta))}٪</b>` : 'ثابتة'
        } مقارنة بما قبلها`
      : '';

    const warn = saved ? '' :
      `<div class="prog-warn">تعذّر حفظ هذه الجلسة — تخزين المتصفح ممتلئ أو محجوب</div>`;

    return `<div class="streak-result">${line}${trPart}</div>${warn}`;
  });

  addHook('setupRender', renderStreakMount);

  /* أول عرض: خطّاف setupRender لا يُطلق عند الإقلاع، فنرسم يدويًا بعده */
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(renderStreakMount,0));
  else setTimeout(renderStreakMount, 0);

  /* واجهة للاختبارات */
  MAD.progress = { load, save, recordSession, computeStreak, computeTrend, suggestDifficulty,
                   dayKey, KEY, MAX_SESSIONS, SUGGEST };

})();
