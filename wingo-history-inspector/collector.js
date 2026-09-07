(() => {
  if (window.__wingoCollectorInstalled) return;
  window.__wingoCollectorInstalled = true;
  const DASH='https://wingo-history-inspector-gh238640-1159s-projects.vercel.app';
  let latest=[];

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

  function store(j,url){
    const rows=pickList(j);
    if(rows.length<2) return;
    latest=rows.slice(0,100);
    window.__wingoHistory=latest;
    const old=document.getElementById('__wingoCollectorBox'); if(old) old.remove();
    const box=document.createElement('div'); box.id='__wingoCollectorBox';
    Object.assign(box.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:2147483647,background:'#0d1b2d',color:'#fff',padding:'12px',border:'1px solid #5aa9ff',borderRadius:'12px',font:'13px system-ui',boxShadow:'0 8px 24px rgba(0,0,0,.35)'});
    const b=document.createElement('button'); b.textContent=`Buka Dashboard (${latest.length} history)`;
    Object.assign(b.style,{background:'#5aa9ff',border:'0',padding:'9px 12px',borderRadius:'8px',fontWeight:'700',cursor:'pointer'});
    b.onclick=()=>{const payload=btoa(unescape(encodeURIComponent(JSON.stringify({history:latest,source:url,capturedAt:new Date().toISOString()})))); location.href=DASH+'/#data='+encodeURIComponent(payload)};
    box.append('WinGo history tertangkap. ',b); document.body.appendChild(box);
  }

  const of=window.fetch;
  window.fetch=async function(...args){
    const r=await of.apply(this,args);
    try{const c=r.clone(); const t=await c.text(); const j=JSON.parse(t); store(j,typeof args[0]==='string'?args[0]:args[0]?.url||'fetch')}catch{}
    return r;
  };

  const XO=XMLHttpRequest.prototype.open, XS=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u,...rest){this.__wingoUrl=u; return XO.call(this,m,u,...rest)};
  XMLHttpRequest.prototype.send=function(...args){this.addEventListener('load',()=>{try{const j=JSON.parse(this.responseText); store(j,this.__wingoUrl||'xhr')}catch{}}); return XS.apply(this,args)};

  alert('WinGo Collector aktif. Kembali/buka halaman WinGo lalu tunggu history dimuat.');
})();