/* خادم ملفات ساكن بسيط لمعاينة src/ محليًا — للتطوير فقط */
const http=require("http"),fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..","src");
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",
  ".webmanifest":"application/manifest+json; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
/* نقطة حفظ تطويرية فقط: تتيح للصفحة كتابة أصول مولَّدة (أيقونات) مباشرة في src/
   بدل تمريرها عبر أدوات خارجية. مقصورة على أسماء مسموح بها وعلى امتداد .png. */
const ALLOW_WRITE = /^[a-z0-9._-]+.png$/;
http.createServer((req,res)=>{
  if(req.method === "PUT" && req.url.startsWith("/__save/")){
    const name = decodeURIComponent(req.url.slice("/__save/".length));
    if(!ALLOW_WRITE.test(name)){ res.writeHead(400); return res.end("اسم غير مسموح"); }
    const chunks=[];
    req.on("data", c=>chunks.push(c));
    req.on("end", ()=>{
      try{
        fs.writeFileSync(path.join(ROOT, name), Buffer.concat(chunks));
        console.log("حُفظ", name, Buffer.concat(chunks).length, "بايت");
        res.writeHead(200); res.end("ok");
      }catch(e){ res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  const rel=decodeURIComponent(req.url.split("?")[0]);
  const file=path.join(ROOT, rel==="/"?"index.html":rel);
  if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
  fs.readFile(file,(e,buf)=>{
    if(e){ res.writeHead(404); return res.end("not found"); }
    res.writeHead(200,{"Content-Type":TYPES[path.extname(file)]||"application/octet-stream"});
    res.end(buf);
  });
}).listen(8131, ()=>console.log("http://localhost:8131"));
