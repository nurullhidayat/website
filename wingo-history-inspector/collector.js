(() => {
  if (window.__wingoCollectorInstalled) return;
  window.__wingoCollectorInstalled = true;

  const DASH='https://wingo-history-inspector-gh238640-1159s-projects.vercel.app';
  let latest=[];
  let latestRequest=null;

  const SAFE_KEYS=['pageSize','pageNo','typeId','language','random','signature','timestamp'];

  const safeRequestBody = body => {
    try {
      let obj=body;
      if(typeof body==='string') obj=JSON.parse(body);
      if(!obj || typeof obj!=='object' || Array.isArray(obj)) return null;
      const out={};
      for(const k of SAFE_KEYS) if(obj[k]!==undefined) out[k]=obj[k];
      return Object.keys(out).length?out:null;
    } catch { return null; }
  };

  const pickList = j => {
    const c=[j?.data?.list,j?.data?.data?.list,j?.list,j?.data,j?.result?.list];
    const a=c.find(Array.isArray);
    if(!a) return [];
    return a.filter(x=>x&&typeof x==='object').map(x=>({
      issueNumber:x.issueNumber??x.issue??x.period??x.periodNo??x.gameIssue,
      period:x.period??x.issueNumber,
      number:x.number??x.result??x.openNumber,
      colour:x.colour??x.color,
      color:x.color??x.colour,
      premium:x.premium,
      size:x.size
    })).filter(x=>(x.issueNumber!=null||x.period!=null)&&x.number!=null);
  };

  function renderBox(source){
    const old=document.getElementById('__wingoCollectorBox'); if(old) old.remove();
    const box=document.createElement('div'); box.id='__wingoCollectorBox';
    Object.assign(box.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:2147483647,background:'#0d1b2d',color:'#fff',padding:'12px',border:'1px solid #5aa9ff',borderRadius:'12px',font:'13px system-ui',boxShadow:'0 8px 24px rgba(0,0,0,.35)',maxWidth:'360px'});
    const info=document.createElement('div');
    info.textContent=`History: ${latest.length} • Request payload: ${latestRequest?'tertangkap':'belum'}`;
    info.style.marginBottom='8px';
    const b=document.createElement('button'); b.textContent='Buka Dashboard';
    Object.assign(b.style,{background:'#5aa9ff',border:'0',padding:'9px 12px',borderRadius:'8px',fontWeight:'700',cursor:'pointer'});
    b.onclick=()=>{
      const payload={history:latest,source,capturedAt:new Date().toISOString(),request:latestRequest};
      const enc=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      location.href=DASH+'/#data='+encodeURIComponent(enc);
    };
    box.append(info,b); document.body.appendChild(box);
  }

  function store(j,url,requestBody){
    const rows=pickList(j);
    if(rows.length<2) return;
    latest=rows.slice(0,100);
    const safe=safeRequestBody(requestBody);
    if(safe){ latestRequest={url,method:'POST',body:safe}; }
    window.__wingoHistory=latest;
    window.__wingoRequest=latestRequest;
    renderBox(url);
  }

  const of=window.fetch;
  window.fetch=async function(...args){
    const input=args[0], init=args[1]||{};
    const url=typeof input==='string'?input:input?.url||'fetch';
    const method=(init.method||input?.method||'GET').toUpperCase();
    const body=init.body;
    const r=await of.apply(this,args);
    try{
      const c=r.clone(); const t=await c.text(); const j=JSON.parse(t);
      store(j,url,method==='POST'?body:null);
    }catch{}
    return r;
  };

  const XO=XMLHttpRequest.prototype.open, XS=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u,...rest){
    this.__wingoUrl=u; this.__wingoMethod=String(m||'GET').toUpperCase();
    return XO.call(this,m,u,...rest);
  };
  XMLHttpRequest.prototype.send=function(body){
    const reqBody=body;
    this.addEventListener('load',()=>{
      try{const j=JSON.parse(this.responseText); store(j,this.__wingoUrl||'xhr',this.__wingoMethod==='POST'?reqBody:null)}catch{}
    });
    return XS.call(this,body);
  };

  alert('WinGo Collector v2 aktif. Refresh halaman WinGo lalu tunggu history dimuat. Collector hanya menyimpan field request yang dibutuhkan, tanpa cookie/header/token.');
})();