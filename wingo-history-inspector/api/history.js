const TARGET='https://55u3gpn.com/';
const KNOWN_ENDPOINTS=['GetNoaverageEmerdList','GetGameIssue'];
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

async function fetchText(url,opts={}){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),8000);
  try{const r=await fetch(url,{...opts,signal:c.signal,headers:{'user-agent':UA,'accept':'*/*',...(opts.headers||{})}}); return {ok:r.ok,status:r.status,url:r.url,text:await r.text()}}
  finally{clearTimeout(t)}
}
function uniq(a){return [...new Set(a.filter(Boolean))]}
function abs(base,p){try{return new URL(p,base).href}catch{return null}}
function extractHosts(s){
  const out=[];
  for(const m of s.matchAll(/https?:\\?\/\\?\/[A-Za-z0-9._:-]+/g)){
    let u=m[0].replace(/\\\//g,'/'); try{out.push(new URL(u).origin)}catch{}
  }
  return uniq(out).filter(x=>/api|game|lot|55|bdg|wingo/i.test(x));
}
function extractEndpoints(s){return uniq([...s.matchAll(/(?:\/api\/webapi\/)?(Get[A-Za-z0-9_]{3,80})/g)].map(m=>m[1])).filter(x=>/Emerd|GameIssue|Noaverage|Lottery|WinGo/i.test(x))}
function nearbyCreds(s,needle){
  const i=s.indexOf(needle); if(i<0)return {};
  const z=s.slice(Math.max(0,i-1800),i+2200);
  const random=(z.match(/random["']?\s*[:=]\s*["']([a-fA-F0-9]{16,64})["']/)||[])[1];
  const signature=(z.match(/signature["']?\s*[:=]\s*["']([a-fA-F0-9]{16,128})["']/)||[])[1];
  return {random,signature};
}
function normalizeList(j){
  const candidates=[j?.data?.list,j?.data?.data?.list,j?.list,j?.data];
  const arr=candidates.find(Array.isArray); if(!arr)return [];
  return arr.filter(x=>x&&typeof x==='object').map(x=>({
    issueNumber:x.issueNumber??x.issue??x.period??x.periodNo??x.gameIssue,
    period:x.period??x.issueNumber,
    number:x.number??x.result??x.openNumber,
    colour:x.colour??x.color,
    color:x.color??x.colour,
    premium:x.premium,
    size:x.size
  })).filter(x=>x.issueNumber!=null||x.number!=null);
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const pageSize=Math.min(50,Math.max(1,Number(req.query?.pageSize)||20));
  const pageNo=Math.max(1,Number(req.query?.pageNo)||1);
  const notes=[],attempts=[]; let html=''; let scripts=[]; let corpus='';
  try{
    const home=await fetchText(TARGET); attempts.push({kind:'home',url:TARGET,status:home.status,ok:home.ok});
    html=home.text||''; corpus+=html;
    const srcs=uniq([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>abs(home.url||TARGET,m[1]))).slice(0,28);
    for(const src of srcs){
      try{const r=await fetchText(src); attempts.push({kind:'script',url:src,status:r.status,ok:r.ok}); if(r.ok&&r.text.length<6_000_000){scripts.push({url:src,text:r.text}); corpus+='\n'+r.text}}
      catch(e){attempts.push({kind:'script',url:src,error:e.name||e.message})}
    }
  }catch(e){notes.push('Gagal mengambil halaman utama: '+(e.message||e))}

  const detectedHosts=uniq([TARGET.replace(/\/$/,''),...extractHosts(corpus)]);
  const detectedEndpoints=uniq([...KNOWN_ENDPOINTS,...extractEndpoints(corpus)]);
  const creds={};
  for(const ep of detectedEndpoints){
    const c=nearbyCreds(corpus,ep); if(c.random||c.signature)creds[ep]=c;
  }

  const apiHosts=uniq(detectedHosts.flatMap(h=>{
    const a=[h];
    try{const u=new URL(h); if(!/^api\./i.test(u.hostname))a.push(`${u.protocol}//api.${u.hostname}`)}catch{}
    return a;
  })).slice(0,20);

  let history=[],source=null;
  for(const host of apiHosts){
    if(history.length)break;
    for(const ep of detectedEndpoints){
      if(!/Emerd|Noaverage/i.test(ep))continue;
      const url=host.replace(/\/$/,'')+'/api/webapi/'+ep;
      const c=creds[ep]||{};
      const body={pageSize,pageNo,typeId:1,language:0,timestamp:Math.floor(Date.now()/1000)};
      if(c.random)body.random=c.random; if(c.signature)body.signature=c.signature;
      try{
        const r=await fetchText(url,{method:'POST',headers:{'content-type':'application/json;charset=UTF-8','accept':'application/json, text/plain, */*','referer':TARGET},body:JSON.stringify(body)});
        let parsed=null; try{parsed=JSON.parse(r.text)}catch{}
        const list=parsed?normalizeList(parsed):[];
        attempts.push({kind:'api',url,status:r.status,ok:r.ok,rows:list.length,responsePreview:(r.text||'').slice(0,180)});
        if(list.length){history=list;source=url;break}
      }catch(e){attempts.push({kind:'api',url,error:e.name||e.message})}
    }
  }

  if(!scripts.length)notes.push('Bundle JavaScript tidak berhasil dibaca dari server target.');
  if(!history.length)notes.push('Belum ada endpoint history yang memberi daftar data terverifikasi. Diagnostik menampilkan request yang sudah dicoba.');
  res.status(200).json({ok:history.length>0,message:history.length?'History berhasil ditemukan.':'History belum ditemukan secara otomatis.',source,history,detectedHosts,detectedEndpoints,attempts:attempts.slice(-80),notes});
}