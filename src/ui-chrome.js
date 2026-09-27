/* ============================================================================
   وحدة جانبية: تُعلن الشاشة الظاهرة على <body data-screen="...">.

   لماذا: المحرك يبدّل الشاشات بكتابة style.display مباشرةً على العناصر
   الأربعة، فلا صفّ ولا حدث يقول أيّ شاشة تعمل — وCSS لا يستطيع بناء هيكل
   مختلف لشاشة اللعب دون أن يعرف ذلك. هذا المراقب يترجم تبديل المحرك إلى
   سمة واحدة على <body>، فيبقى المحرك جاهلًا بوجود هذه الوحدة كما تقتضي
   القاعدة الذهبية.

   الانهيار الآمن: إن لم يُحمَّل هذا الملف تبقى السمة غائبة، وقواعد CSS
   المبنية عليها مكتوبة بصيغة موجبة (body[data-screen="game"]) لا سالبة،
   فتعود الواجهة إلى شكلها السابق بلا كسر.
   ========================================================================== */
(function(){
  'use strict';

  var MAP = {
    'screen-setup':    'setup',
    'screen-game':     'game',
    'screen-result':   'result',
    'screen-progress': 'progress'
  };

  var nodes = Object.keys(MAP)
    .map(function(id){ return document.getElementById(id); })
    .filter(Boolean);

  if(!nodes.length || !document.body) return;

  function shown(n){
    /* style.display وحده لا يكفي: شاشة السجلّ تبدأ مخفيّة من الوسم نفسه */
    if(n.style.display === 'none') return false;
    return getComputedStyle(n).display !== 'none';
  }

  var last = null;
  function sync(){
    var on = null;
    for(var i = 0; i < nodes.length; i++){ if(shown(nodes[i])){ on = nodes[i]; break; } }
    var name = on ? MAP[on.id] : 'setup';
    if(name === last) return;
    last = name;
    document.body.setAttribute('data-screen', name);
  }

  var obs = new MutationObserver(sync);
  nodes.forEach(function(n){ obs.observe(n, { attributes:true, attributeFilter:['style','class'] }); });

  sync();
})();
