const $ = (id) => document.getElementById(id);
const state = { symbol:'BTCUSDT', timeframe:'15m', candles:[], ticker:null, chart:null, candleSeries:null, ema20Series:null, ema50Series:null, volumeSeries:null, analysis:null };
const fmt = (n, max=4) => Number.isFinite(+n) ? (+n).toLocaleString('en-US',{maximumFractionDigits:max}) : '—';
const money = (n) => Number.isFinite(+n) ? '$'+(+n).toLocaleString('en-US',{maximumFractionDigits:2}) : '—';
const pct = (n) => Number.isFinite(+n) ? `${+n>=0?'+':''}${(+n).toFixed(2)}%` : '—';
const toast = (msg) => { const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200); };

function setView(name){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.querySelectorAll('.nav-item').forEach(v=>v.classList.remove('active')); $('view-'+name).classList.add('active'); document.querySelectorAll(`[data-view="${name}"]`).forEach(v=>v.classList.add('active')); $('pageTitle').textContent=name==='dashboard'?'Dashboard':name==='history'?'Riwayat Analisis':'Pengaturan'; $('sidebar').classList.remove('open'); if(name==='history') renderHistory(); }
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
$('mobileMenu').addEventListener('click',()=>$('sidebar').classList.toggle('open'));

function initChart(){
  const container=$('chart');
  state.chart=LightweightCharts.createChart(container,{layout:{background:{color:'#0b1626'},textColor:'#7f91a9'},grid:{vertLines:{color:'#132238'},horzLines:{color:'#132238'}},rightPriceScale:{borderColor:'#22324a'},timeScale:{borderColor:'#22324a',timeVisible:true,secondsVisible:false},crosshair:{mode:1},autoSize:true});
  state.candleSeries=state.chart.addCandlestickSeries({upColor:'#27d69b',downColor:'#ff6475',borderVisible:false,wickUpColor:'#27d69b',wickDownColor:'#ff6475'});
  state.ema20Series=state.chart.addLineSeries({color:'#7f8cff',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
  state.ema50Series=state.chart.addLineSeries({color:'#f4b85a',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
  state.volumeSeries=state.chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'',scaleMargins:{top:.82,bottom:0}});
}

async function fetchJSON(url){ const c=new AbortController();const timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}finally{clearTimeout(timer);} }
async function loadTicker(){
  try{const d=await fetchJSON(`https://api.binance.com/api/v3/ticker/24hr?symbol=${state.symbol}`);state.ticker=d;$('price').textContent=fmt(d.lastPrice,6);$('change24').textContent=pct(d.priceChangePercent);$('change24').className=+d.priceChangePercent>=0?'up':'down';$('high24').textContent=fmt(d.highPrice,6);$('low24').textContent='Low '+fmt(d.lowPrice,6);$('vol24').textContent=fmt(d.quoteVolume,0);$('priceTime').textContent='Diperbarui '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch(e){$('priceTime').textContent='Gagal memuat ticker';}
}
async function loadCandles(){
  $('chartLoading').classList.remove('hidden');$('chartLoading').textContent='Memuat candle…';
  try{const rows=await fetchJSON(`https://api.binance.com/api/v3/klines?symbol=${state.symbol}&interval=${state.timeframe}&limit=500`);state.candles=rows.map(r=>({time:Math.floor(r[0]/1000),open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+r[5]}));
    const ema20=emaSeries(state.candles.map(c=>c.close),20); const ema50=emaSeries(state.candles.map(c=>c.close),50);
    state.candleSeries.setData(state.candles.map(({time,open,high,low,close})=>({time,open,high,low,close})));
    state.ema20Series.setData(state.candles.map((c,i)=>ema20[i]!=null?{time:c.time,value:ema20[i]}:null).filter(Boolean));
    state.ema50Series.setData(state.candles.map((c,i)=>ema50[i]!=null?{time:c.time,value:ema50[i]}:null).filter(Boolean));
    state.volumeSeries.setData(state.candles.map(c=>({time:c.time,value:c.volume,color:c.close>=c.open?'rgba(39,214,155,.30)':'rgba(255,100,117,.30)'})));
    state.chart.timeScale().fitContent(); $('chartTitle').textContent=`${state.symbol} · ${state.timeframe==='1d'?'1D':state.timeframe}`; $('chartLoading').classList.add('hidden'); updateSnapshot();
  }catch(e){$('chartLoading').textContent='Gagal memuat candle Binance. Coba refresh atau ganti jaringan.';}
}

function emaSeries(values,p){ const out=Array(values.length).fill(null); if(values.length<p)return out; const k=2/(p+1); let e=values.slice(0,p).reduce((a,b)=>a+b,0)/p; out[p-1]=e; for(let i=p;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e;} return out; }
function rsi(values,p=14){ if(values.length<=p)return null;let gain=0,loss=0;for(let i=values.length-p;i<values.length;i++){const d=values[i]-values[i-1];if(d>=0)gain+=d;else loss-=d;}gain/=p;loss/=p;if(loss===0)return 100;const rs=gain/loss;return 100-(100/(1+rs)); }
function atr(c,p=14){ if(c.length<=p)return null;const trs=[];for(let i=c.length-p;i<c.length;i++){const prev=c[i-1].close;trs.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-prev),Math.abs(c[i].low-prev)));}return trs.reduce((a,b)=>a+b,0)/trs.length; }
function avg(arr){return arr.reduce((a,b)=>a+b,0)/arr.length;}
function last(arr){return arr[arr.length-1];}
function calcTechnical(){
  const c=state.candles, closes=c.map(x=>x.close), e20s=emaSeries(closes,20), e50s=emaSeries(closes,50), e20=last(e20s),e50=last(e50s), price=last(closes), R=rsi(closes), A=atr(c), recent=c.slice(-50), support=Math.min(...recent.map(x=>x.low)), resistance=Math.max(...recent.map(x=>x.high));
  const avgv=avg(c.slice(-20).map(x=>x.volume)), relV=last(c).volume/avgv; let score=0,reasons=[];
  if(price>e20&&e20>e50){score+=2;reasons.push('Harga berada di atas EMA20 dan EMA50 dengan struktur trend bullish.');} else if(price<e20&&e20<e50){score-=2;reasons.push('Harga berada di bawah EMA20 dan EMA50 dengan struktur trend bearish.');} else reasons.push('EMA belum tersusun kuat; trend masih campuran.');
  if(R>55&&R<72){score+=1;reasons.push(`RSI ${R.toFixed(1)} mendukung momentum naik tanpa ekstrem.`);} else if(R<45&&R>28){score-=1;reasons.push(`RSI ${R.toFixed(1)} mendukung momentum turun tanpa ekstrem.`);} else if(R>=72){score-=.5;reasons.push(`RSI ${R.toFixed(1)} sudah tinggi; risiko pullback meningkat.`);} else if(R<=28){score+=.5;reasons.push(`RSI ${R.toFixed(1)} sudah rendah; risiko rebound meningkat.`);} else reasons.push(`RSI ${R.toFixed(1)} cenderung netral.`);
  if(relV>1.25){score += Math.sign(score||1)*.5; reasons.push(`Volume relatif ${relV.toFixed(2)}× rata-rata 20 candle menunjukkan partisipasi meningkat.`);} else reasons.push(`Volume relatif ${relV.toFixed(2)}× belum menunjukkan ekspansi besar.`);
  const distRes=(resistance-price)/price,distSup=(price-support)/price;if(score>0&&distRes<.004){score-=1;reasons.push('Harga terlalu dekat resistance lokal sehingga ruang naik terbatas.');}if(score<0&&distSup<.004){score+=1;reasons.push('Harga terlalu dekat support lokal sehingga ruang turun terbatas.');}
  let decision='WAIT';if(score>=2.5)decision='LONG';else if(score<=-2.5)decision='SHORT'; const confidence=Math.round(Math.min(88,52+Math.abs(score)*9));
  let entryLow,entryHigh,sl,tp1,tp2,tp3,invalidation,rr=0,waitFor='';
  if(decision==='LONG'){entryLow=Math.max(e20,price-A*.25);entryHigh=price+A*.15;sl=Math.min(entryLow-A*1.15,support-A*.15);const risk=((entryLow+entryHigh)/2)-sl;tp1=((entryLow+entryHigh)/2)+risk*1.5;tp2=((entryLow+entryHigh)/2)+risk*2.2;tp3=((entryLow+entryHigh)/2)+risk*3;rr=2.2;invalidation=`Close di bawah ${fmt(sl,6)}`;waitFor=`Pertahankan area entry dan hindari entry jika candle close di bawah ${fmt(sl,6)}.`;} else if(decision==='SHORT'){entryLow=price-A*.15;entryHigh=Math.min(e20,price+A*.25);sl=Math.max(entryHigh+A*1.15,resistance+A*.15);const risk=sl-((entryLow+entryHigh)/2);tp1=((entryLow+entryHigh)/2)-risk*1.5;tp2=((entryLow+entryHigh)/2)-risk*2.2;tp3=((entryLow+entryHigh)/2)-risk*3;rr=2.2;invalidation=`Close di atas ${fmt(sl,6)}`;waitFor=`Pertahankan rejection area entry dan hindari entry jika candle close di atas ${fmt(sl,6)}.`;} else {entryLow=entryHigh=sl=tp1=tp2=tp3=null;invalidation='Belum ada setup valid';waitFor=`Tunggu alignment trend yang lebih jelas: EMA20/EMA50 searah, momentum menguat, dan breakout/rejection level ${fmt(support,6)} / ${fmt(resistance,6)}.`;}
  const bias=score>1?'Bullish':score<-1?'Bearish':'Netral';const trend=price>e20&&e20>e50?'Uptrend':price<e20&&e20<e50?'Downtrend':'Sideways / mixed';
  return{decision,bias,confidence,entryLow,entryHigh,sl,tp1,tp2,tp3,invalidation,rr,rsi:R,atr:A,support,resistance,ema20:e20,ema50:e50,relV,trend,reasons,waitFor,score,price};
}
function setText(id,v){$(id).textContent=v;}
function updateSnapshot(){ if(state.candles.length<60)return; const a=calcTechnical();setText('ema20',fmt(a.ema20,6));setText('ema50',fmt(a.ema50,6));setText('relVol',a.relV.toFixed(2)+'×');setText('trend',a.trend); }
function applyAnalysis(a){
  state.analysis=a;const b=$('decisionBadge');b.textContent=a.decision;b.className='decision '+a.decision.toLowerCase();setText('bias',a.bias);setText('confidence',a.confidence+'%');setText('rr',a.decision==='WAIT'?'—':'1 : '+a.rr.toFixed(1));setText('entry',a.entryLow?`${fmt(a.entryLow,6)} – ${fmt(a.entryHigh,6)}`:'—');setText('sl',fmt(a.sl,6));setText('tp1',fmt(a.tp1,6));setText('tp2',fmt(a.tp2,6));setText('tp3',fmt(a.tp3,6));setText('invalidation',a.invalidation);setText('rsi',a.rsi.toFixed(1));setText('atr',fmt(a.atr,6));setText('support',fmt(a.support,6));setText('resistance',fmt(a.resistance,6));setText('summaryText',`${a.trend}. Bias ${a.bias.toLowerCase()} dengan keputusan ${a.decision}. Confidence adalah skor konsistensi indikator, bukan peluang pasti profit.`);$('reasonList').innerHTML=a.reasons.map(x=>`<li>${x}</li>`).join('');setText('waitFor',a.waitFor);setText('analysisTime',new Date().toLocaleString('id-ID'));setText('analysisTF',`${state.symbol} · ${state.timeframe==='1d'?'1D':state.timeframe}`);updateRisk();saveHistory(a);
}
function saveHistory(a){const list=JSON.parse(localStorage.getItem('mp_history')||'[]');list.unshift({id:Date.now(),symbol:state.symbol,tf:state.timeframe,decision:a.decision,confidence:a.confidence,entry:a.entryLow?`${fmt(a.entryLow,6)} – ${fmt(a.entryHigh,6)}`:'—',sl:fmt(a.sl,6),tp1:fmt(a.tp1,6),time:new Date().toISOString()});localStorage.setItem('mp_history',JSON.stringify(list.slice(0,100)));}
function renderHistory(){const list=JSON.parse(localStorage.getItem('mp_history')||'[]');$('historyEmpty').style.display=list.length?'none':'flex';$('historyList').innerHTML=list.map(x=>`<div class="history-item"><div><strong>${x.symbol}</strong><br><small>${x.tf.toUpperCase()} · ${new Date(x.time).toLocaleString('id-ID')}</small></div><span class="decision ${x.decision.toLowerCase()}">${x.decision}</span><div><small>Confidence</small><br><strong>${x.confidence}%</strong></div><div><small>Entry / SL / TP1</small><br><strong>${x.entry} / ${x.sl} / ${x.tp1}</strong></div><div><small>Source</small><br><strong>Teknis</strong></div></div>`).join('');}
function updateRisk(){const bal=+$('balance').value||0,rp=+$('riskPct').value||0,amount=bal*rp/100;setText('riskAmount',money(amount));const a=state.analysis;if(!a||!a.sl||!a.entryLow){setText('positionSize','—');return;}const entry=(a.entryLow+a.entryHigh)/2,delta=Math.abs(entry-a.sl);setText('positionSize',delta>0?`${fmt(amount/delta,6)} ${state.symbol.replace('USDT','')}`:'—');}
$('balance').addEventListener('input',updateRisk);$('riskPct').addEventListener('input',updateRisk);
$('clearHistory').addEventListener('click',()=>{localStorage.removeItem('mp_history');renderHistory();toast('Riwayat dihapus');});
$('symbolSelect').addEventListener('change',async e=>{state.symbol=e.target.value;await Promise.all([loadTicker(),loadCandles()]);state.analysis=null;setText('summaryText','Tekan “Analisa Sekarang” untuk membuat setup baru.');});
document.querySelectorAll('#tfGroup button').forEach(btn=>btn.addEventListener('click',async()=>{document.querySelectorAll('#tfGroup button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.timeframe=btn.dataset.tf;await loadCandles();state.analysis=null;}));
$('analyzeBtn').addEventListener('click',()=>{if(state.candles.length<60){toast('Candle belum siap');return;}const b=$('analyzeBtn');b.disabled=true;b.textContent='Menganalisis…';setTimeout(()=>{applyAnalysis(calcTechnical());b.disabled=false;b.textContent='✦ Analisa Sekarang';toast('Analisis selesai');},250);});
document.querySelectorAll('.tip').forEach(btn=>btn.addEventListener('mouseenter',()=>btn.title=btn.dataset.tip));
async function boot(){initChart();await Promise.all([loadTicker(),loadCandles()]);setInterval(loadTicker,10000);setInterval(loadCandles,30000);renderHistory();updateRisk();}
boot();
