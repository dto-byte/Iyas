/* =====================================================================
   إياس — طبقة التطبيق المثبَّت (pwa.js)
   وحدة جانبية أخرى: تسجّل عامل الخدمة، وتعرض زر التثبيت، وتنبّه عند
   توفّر تحديث. لا يعرف المحرك بوجودها — تتصل عبر MAD.addHook مثل progress.js.
   ===================================================================== */
(function(){
  "use strict";
  if(typeof MAD === 'undefined'){ console.error('pwa.js يحتاج engine-core.js قبله'); return; }

  const { showToast } = MAD;
  let deferredPrompt = null;   // حدث التثبيت المؤجَّل من المتصفح
  let updateReady = null;      // عامل خدمة جديد ينتظر التفعيل

  /* عامل الخدمة يحتاج http(s) — لا يعمل عبر file://، وهذا متوقّع لا خطأ */
  const supported = 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  function register(){
    if(!supported) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      /* نسخة جديدة تنتظر منذ اللحظة الأولى (اللاعب فتح الصفحة وفيها تحديث) */
      if(reg.waiting) markUpdate(reg.waiting);
      /* المتصفح يفحص sw.js عند التنقّل فقط. تطبيق مثبَّت يُفتح ويُغلق بلا
         تنقّل، فقد يبقى شهورًا بلا فحص — نطلبه صراحةً عند كل فتح وعند كل
         عودة إلى الواجهة. */
      const check = () => { try{ reg.update(); }catch(e){} };
      check();
      document.addEventListener('visibilitychange', () => { if(!document.hidden) check(); });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if(!sw) return;
        sw.addEventListener('statechange', () => {
          /* controller موجود ⇒ هذه ليست أول زيارة، فهو تحديث لا تثبيت أول */
          if(sw.state === 'installed' && navigator.serviceWorker.controller) markUpdate(sw);
        });
      });
    }).catch(err => console.warn('تعذّر تسجيل عامل الخدمة:', err));

    /* بعد موافقة اللاعب على التحديث يتبدّل المتحكّم، فنُعيد التحميل مرة واحدة */
    /* تبدّل المتحكّم يعني أن نسخة جديدة صارت فعّالة. نُعيد التحميل لتسري،
       لكن ليس فوق جلسة جارية: ننتظر عودة اللاعب إلى شاشة البداية.
       الحالة تُقرأ من body[data-screen] الذي يضبطه ui-chrome.js. */
    let reloading = false;
    function applyWhenIdle(){
      if(reloading) return;
      const busy = document.body.dataset.screen === 'game';
      if(busy){ setTimeout(applyWhenIdle, 1500); return; }
      reloading = true;
      location.reload();
    }
    navigator.serviceWorker.addEventListener('controllerchange', applyWhenIdle);
  }

  function markUpdate(sw){
    updateReady = sw;
    renderMount();
    showToast('تحديث جديد جاهز — اضغط "حدّث الآن" في الأسفل');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();            // نعرض زرنا في مكانه من الواجهة
    deferredPrompt = e;
    renderMount();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    renderMount();
    showToast('تم تثبيت إياس — ستجده بين تطبيقاتك');
  });

  /* هل يعمل الآن كتطبيق مثبَّت؟
     matchMedia غير مضمون في كل بيئة (متصفحات قديمة، WebView مقلَّصة،
     بيئات اختبار) — والمحرك يحرسه في مواضعه، فنحرسه هنا كذلك. */
  function isInstalled(){
    try{
      if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    }catch(e){}
    return window.navigator.standalone === true;
  }

  function renderMount(){
    const mount = document.getElementById('pwaMount');
    if(!mount) return;
    let html = '';

    if(updateReady){
      html += `<div class="pwa-bar update">
        <span>نسخة محدَّثة من اللعبة جاهزة</span>
        <button class="pwa-btn" id="pwaUpdate">حدّث الآن</button>
      </div>`;
    }
    if(deferredPrompt && !isInstalled()){
      html += `<div class="pwa-bar">
        <span>ثبّت إياس على جهازك لتلعب بلا إنترنت ومن شاشتك الرئيسية</span>
        <button class="pwa-btn install" id="pwaInstall">ثبّت التطبيق</button>
      </div>`;
    }
    mount.innerHTML = html;

    const up = document.getElementById('pwaUpdate');
    if(up) up.addEventListener('click', () => {
      up.disabled = true; up.textContent = 'جارٍ التحديث…';
      updateReady.postMessage('skipWaiting');   // الصفحة تُعاد تلقائيًا عند تبدّل المتحكّم
    });

    const ins = document.getElementById('pwaInstall');
    if(ins) ins.addEventListener('click', async () => {
      if(!deferredPrompt) return;
      ins.disabled = true;
      deferredPrompt.prompt();
      try{
        const { outcome } = await deferredPrompt.userChoice;
        if(outcome !== 'accepted') showToast('يمكنك تثبيته لاحقًا من قائمة المتصفح');
      }catch(e){}
      deferredPrompt = null;      // الحدث يُستهلك مرة واحدة فقط
      renderMount();
    });
  }

  MAD.addHook('setupRender', renderMount);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(renderMount,0));
  else setTimeout(renderMount, 0);

  register();

  /* واجهة للاختبارات والتشخيص */
  MAD.pwa = {
    supported,
    isInstalled,
    renderMount,
    get deferredPrompt(){ return deferredPrompt; },
    set deferredPrompt(v){ deferredPrompt = v; },
    get updateReady(){ return updateReady; },
    set updateReady(v){ updateReady = v; }
  };

})();
