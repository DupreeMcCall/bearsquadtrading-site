(function(){
var BASE="https://uqitaxzmaoqbebucfnbe.supabase.co",KEY="%%KEY%%";
var H={headers:{Authorization:"Bearer "+KEY,apikey:KEY}};
var sb=null;try{if(window.supabase)sb=window.supabase.createClient(BASE,KEY);}catch(e){sb=null;}
var $=function(i){return document.getElementById(i);};
var PV=2,START=50000,LIMIT=1000,MINRISK=2;
var user=null,G=null,timer=null;
var cfg={mode:"daily",qty:1,stop:20,r:0,speed:1500};
/* ---------- Sim Challenge (paper money) ---------- */
var SIM={target:3000,dd:2000,minDays:5,cons:0.40,step:17},SKEY="bs_gym_sim";
function simGet(){try{return JSON.parse(localStorage.getItem(SKEY)||"null");}catch(e){return null;}}
function simSave(o){try{localStorage.setItem(SKEY,JSON.stringify(o));}catch(e){}simPush(o);}
/* account sync: progress follows the signed-in user across devices */
var simT=null,simSynced=false;
function simPush(o){if(!user||!sb||!o)return;clearTimeout(simT);simT=setTimeout(function(){
  sb.from("gym_sim").upsert({user_id:user.id,state:o,updated_at:new Date().toISOString()},{onConflict:"user_id"}).then(function(r){simSyncNote(r.error?"err":"ok");});},600);}
function simScore(o){return o?(o.days||[]).length+(o.status&&o.status!=="active"?1000:0)+(o.open?0.5:0):-1;}
function simPull(){if(!user||!sb)return;
  sb.from("gym_sim").select("state,updated_at").maybeSingle().then(function(r){
    if(r.error){simSyncNote("err");return;}
    var cloud=r.data&&r.data.state,local=simGet(),pick;
    if(!cloud)pick=local;
    else if(!local)pick=cloud;
    else if(cloud.id===local.id)pick=simScore(local)>simScore(cloud)?local:cloud;
    else pick=((cloud.days||[]).length===0&&cloud.status==="active"&&(local.days||[]).length>0)?local:cloud;
    simSynced=true;
    if(!pick){simSyncNote("ok");return;}
    try{localStorage.setItem(SKEY,JSON.stringify(pick));}catch(e){}
    if(pick!==cloud)simPush(pick);else simSyncNote("ok");
    if(cfg.mode==="sim"&&!(G&&G.started&&!G.ended)){load();}});}
function simSyncNote(st){var el=$("simSync");if(!el)return;el.className="simsync "+(st==="err"?"neg":"");
  el.textContent=!user?"Progress saves on this device. Log in to save it to your account.":st==="err"?"Couldn't sync to your account. Saved on this device.":"✓ Saved to your account";}
function simNew(){var o={id:Date.now(),seed:Math.floor(Math.random()*100000),days:[],peak:START,status:"active",reason:"",open:null,started:todayPT()};simSave(o);return o;}
function simS(){var o=simGet();if(!o)o=simNew();
  if(o.open){var lost=Math.round((o.open.realized-(o.open.risk||0))*100)/100;o.days.push({pnl:lost,n:o.open.n+(o.open.risk?1:0),wins:o.open.wins||0,best:0,session:o.open.session,blown:false,left:true});o.open=null;simSettle(o);simSave(o);}
  return o;}
function simTotal(o){return o.days.reduce(function(a,d){return a+d.pnl;},0);}
function simFloor(o){return Math.min(o.peak-SIM.dd,START);}
function simTD(o){return o.days.filter(function(d){return d.n>0;}).length;}
function simBest(o){return o.days.reduce(function(m,d){return Math.max(m,d.pnl);},0);}
function simSettle(o){var bal=START+simTotal(o);o.peak=Math.max(o.peak,bal);
  if(bal-simFloor(o)<MINRISK){o.status="failed";o.reason="Hit the $"+SIM.dd.toLocaleString()+" trailing drawdown.";return;}
  var prof=simTotal(o);if(prof>=SIM.target&&simTD(o)>=SIM.minDays&&simBest(o)<=prof*SIM.cons){o.status="passed";o.passed=todayPT();}}

function todayPT(){return new Date().toLocaleDateString("en-CA",{timeZone:"America/Los_Angeles"});}
function fmtT(m){var h=Math.floor(m/60),mi=m%60,ap=h<12?"a":"p",hh=h%12===0?12:h%12;return hh+":"+("0"+mi).slice(-2)+ap;}
function usd(v,sign){var a=Math.abs(v),s=v<0?"-":(sign&&v>0?"+":"");return s+"$"+a.toLocaleString("en-US",{minimumFractionDigits:a%1?2:0,maximumFractionDigits:2});}
function cls(v){return v>0?"pos":v<0?"neg":"";}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
var DKEY=function(){return "bs_gym_"+todayPT();};
function saved(){try{return JSON.parse(localStorage.getItem(DKEY())||"null");}catch(e){return null;}}
function save(o){try{localStorage.setItem(DKEY(),JSON.stringify(o));}catch(e){}}

/* ---------- account ---------- */
function nameOf(u){var n=(u&&u.user_metadata&&u.user_metadata.first_name)||"";n=String(n).trim().slice(0,24);return n||"Trader";}
function renderAcct(){
  $("acctBar").innerHTML=user?'<span>🔓 Signed in as <b>'+esc(nameOf(user))+'</b>. Daily Challenge scores post to the leaderboard and your Sim Challenge saves to your account.</span>'
    :'<span>👤 You\'re training as a guest. <a href="/signup/?next=/gym/">Log in or create an account</a> to post Daily Challenge scores and save your Sim Challenge progress.</span>';
}
/* ---------- session ---------- */
function load(){
  stop();$("result").classList.add("hide");$("gTitle").textContent="Loading session…";
  var sim=cfg.mode==="sim"?simS():null;renderSim();
  if(sim&&sim.status!=="active"){G=null;$("gTitle").textContent=sim.status==="passed"?"Sim Challenge passed 🎉":"Sim Challenge failed";$("gSub").textContent="";simEndCard(sim);return;}
  var u=BASE+"/functions/v1/replay?mode="+(cfg.mode==="sim"?"practice":cfg.mode)+(cfg.mode==="practice"?"&i="+Math.floor(Math.random()*100000):cfg.mode==="sim"?"&i="+(sim.seed+sim.days.length*SIM.step):"");
  fetch(u,H).then(function(r){return r.json();}).then(function(d){
    if(d.error||!d.bars)throw new Error(d.error||"no data");
    drawnKey="";drawnI=-1;G={d:d,bars:d.bars,i:d.startIdx-1,pos:null,trades:[],realized:0,ended:false,blown:false,started:false,marks:[]};
    if(cfg.mode==="daily"){var s=saved();if(s){G.ended=true;G.realized=s.pnl;G.trades=s.list||[];G.blown=s.blown;G.i=G.bars.length-1;G.restored=true;}}
    render();if(G.ended)finish(true);
  }).catch(function(){$("gTitle").textContent="Couldn't load a session. Try again in a minute.";});
}
function bar(){return G.bars[G.i];}
function remaining(){var r=LIMIT+G.realized;if(cfg.mode==="sim"){var o=simGet();if(o)r=Math.min(r,START+simTotal(o)+G.realized-simFloor(o));}return r;}
function ddLeft(){var o=simGet();return o?START+simTotal(o)+G.realized-simFloor(o):Infinity;}
function openPnl(){if(!G.pos)return 0;return (bar()[4]-G.pos.entry)*G.pos.side*PV*G.pos.qty;}
function exitPos(px,why){
  var p=G.pos,pnl=Math.round((px-p.entry)*p.side*PV*p.qty*100)/100;
  G.realized=Math.round((G.realized+pnl)*100)/100;
  G.trades.push({side:p.side,qty:p.qty,entry:p.entry,exit:px,pnl:pnl,why:why,ti:p.at,xi:G.i});
  G.marks.push({i:G.i,px:px,t:"x"});G.pos=null;persist();
  if(remaining()<MINRISK){G.blown=true;end();}
}
function persist(){
  if(cfg.mode==="sim"){var o=simGet();if(!o||o.status!=="active")return;
    if(G.ended){o.open=null;}else if(G.started){o.open={session:G.d.session,realized:G.realized,risk:G.pos?G.pos.risk:0,n:G.trades.length,wins:G.trades.filter(function(t){return t.pnl>0;}).length};}
    simSave(o);return;}
  if(cfg.mode!=="daily"||!G.started)return;
  var w=G.trades.filter(function(t){return t.pnl>0;}).length,best=G.trades.reduce(function(m,t){return Math.max(m,t.pnl);},-1e9);
  save({pnl:G.realized,trades:G.trades.length,wins:w,best:G.trades.length?best:0,blown:G.blown,final:G.ended,posted:(saved()||{}).posted||false,list:G.trades});
}
function step(){
  if(!G||G.ended)return;
  if(G.i>=G.bars.length-1){end();return;}
  G.i++;var b=bar();
  if(G.pos){var p=G.pos;
    if(p.side>0){if(b[3]<=p.stop)exitPos(p.stop,"stop");else if(p.tgt!=null&&b[2]>=p.tgt)exitPos(p.tgt,"target");}
    else{if(b[2]>=p.stop)exitPos(p.stop,"stop");else if(p.tgt!=null&&b[3]<=p.tgt)exitPos(p.tgt,"target");}
  }
  if(!G.ended&&G.i>=G.bars.length-1)end();
  render();
}
function enter(side){
  if(!G||G.ended||G.pos)return;
  if(G.i>=G.bars.length-1){msg("Session's over. No new trades.");return;}
  var risk=cfg.stop*PV*cfg.qty,rem=remaining();
  if(risk>rem){msg("That trade risks "+usd(risk)+" but you only have "+usd(rem)+" left before "+(cfg.mode==="sim"&&ddLeft()<=rem+0.01?"your max drawdown":"the daily limit")+". Lower your size or tighten your stop.","warn");return;}
  var e=bar()[4]+(side>0?0.25:0);G.started=true;
  G.pos={side:side,qty:cfg.qty,entry:e,stop:e-side*cfg.stop,tgt:cfg.r?e+side*cfg.stop*cfg.r:null,at:G.i,risk:risk};
  G.marks.push({i:G.i,px:e,t:side>0?"b":"s"});persist();render();
}
function closePos(){if(G&&G.pos&&!G.ended){exitPos(bar()[4],"manual");render();}}
function end(){
  if(G.ended&&!G.pos){render();return;}
  if(G.pos)exitPos(bar()[4],"session end");
  G.ended=true;stop();persist();render();finish(false);
}
/* ---------- render ---------- */
function msg(t,kind){$("posLine").className="posline "+(kind||"");$("posLine").innerHTML=t;}
function render(){
  if(!G)return;var d=G.d,b=bar(),open=G.i>=d.startIdx;
  var so=cfg.mode==="sim"?simGet():null;$("gTitle").textContent=(cfg.mode==="daily"?"Daily Challenge":cfg.mode==="sim"?"Sim Challenge · Day "+((so?so.days.length:0)+(G.ended&&!G.restored?0:1)):"Practice")+" · Session #"+d.session;
  $("gSub").textContent=(G.ended?d.weekday+" morning":"hidden date")+" · NQ 5-min";
  $("gTime").textContent=fmtT(b[0]+5)+" PT";
  var left=Math.max(0,(G.bars.length-1-G.i)*5);$("gLeft").textContent=G.ended?"Session over":(open?Math.floor(left/60)+"h "+left%60+"m left":"Premarket · open at 6:30a");
  var op=openPnl(),bal=START+G.realized+op;
  $("sBal").textContent=usd(bal);$("sPnl").textContent=usd(G.realized,true);$("sPnl").className=cls(G.realized);
  var rem=remaining()+Math.min(0,op);$("sLim").textContent=usd(Math.max(0,rem));$("sLim").className=rem<300?"neg":"";
  $("sOpen").textContent=G.pos?usd(op,true):"–";$("sOpen").className=cls(op);
  $("limFill").style.width=Math.max(0,Math.min(100,(1-Math.max(0,rem)/LIMIT)*100)).toFixed(0)+"%";
  var risk=cfg.stop*PV*cfg.qty;
  $("riskLine").innerHTML='Risk <b class="neg">'+usd(risk)+'</b> · '+(cfg.r?'Target <b class="pos">'+usd(risk*cfg.r)+'</b>':'No target, you manage the exit')+' · '+cfg.qty+' MNQ · stop '+cfg.stop+' pts'+(risk>remaining()?' <span class="neg">· over your remaining limit</span>':'');
  $("pxB").textContent=(b[4]+0.25).toFixed(2);$("pxS").textContent=b[4].toFixed(2);$("qv").textContent=cfg.qty;
  $("bBuy").disabled=!!G.pos||G.ended;$("bSell").disabled=!!G.pos||G.ended;$("bClose").classList.toggle("hide",!G.pos);
  ["bClose","bStep","bPlay","qm","qp"].forEach(function(id){$(id).disabled=G.ended;});
  if(G.pos){var p=G.pos;msg((p.side>0?'<b class="pos">LONG</b>':'<b class="neg">SHORT</b>')+' '+p.qty+' MNQ @ '+p.entry.toFixed(2)+' · stop '+p.stop.toFixed(2)+(p.tgt!=null?' · target '+p.tgt.toFixed(2):' · no target'));}
  else if(G.ended)msg(G.blown?(cfg.mode==="sim"&&ddLeft()<MINRISK?'<b class="neg">Max drawdown hit.</b> Challenge over.':'<b class="neg">Daily loss limit hit.</b> '+(cfg.mode==="sim"?"Done for this day.":"Account is done for today.")):"Session complete.");
  else if(!G.trades.length)msg("Flat. Set your size and stop, then pick a side. Price so far: "+b[4].toFixed(2));
  else{var t=G.trades[G.trades.length-1];msg("Flat. Last trade: "+(t.side>0?"long":"short")+" closed at "+t.why+" for <b class=\""+cls(t.pnl)+"\">"+usd(t.pnl,true)+"</b>.");}
  drawChart();
}
var LW=window.LightweightCharts,CH=null,CS=null,VS=null,MK=null,PL=[],drawnI=-1,drawnKey="";
var T0=Date.UTC(2020,0,6)/1000;function tOf(m){return T0+m*60;}function mOf(t){return Math.round((t-T0)/60);}
function tvColors(){var light=document.documentElement.getAttribute("data-theme")==="light";
  return light?{bg:"#ffffff",text:"#131722",grid:"#f0f3fa",border:"#e0e3eb",cross:"#9598a1",volU:"rgba(8,153,129,.35)",volD:"rgba(242,54,69,.35)"}
              :{bg:"#131722",text:"#d1d4dc",grid:"#1e222d",border:"#2a2e39",cross:"#758696",volU:"rgba(8,153,129,.45)",volD:"rgba(242,54,69,.45)"};}
var UP="#089981",DN="#F23645",BLUE="#2962FF";
var ECOL=["#FF9800","#AB47BC","#26C6DA","#A1887F","#EF5350","#66BB6A","#42A5F5","#EC407A"],EMAX=8,EID=0,ECACHE={};
var EMAS=[],VW={on:false,c:"#FBC02D"};
var KEYLV={on:false,c:"#787b86",oc:"#7E57C2"},LVN={pdh:"PDH",pdl:"PDL",pdc:"PDC",onh:"ONH",onl:"ONL"},LS={},LVL=[];
function clampP(v){v=Math.round(+v);return isFinite(v)?Math.min(500,Math.max(1,v)):null;}
function addEma(p,c,on){p=clampP(p);if(!p||EMAS.length>=EMAX)return null;var used=EMAS.map(function(e){return e.c;});
  var e={id:++EID,p:p,c:c||ECOL.filter(function(x){return used.indexOf(x)<0;})[0]||ECOL[EID%ECOL.length],on:on!==false};EMAS.push(e);return e;}
try{var sv=JSON.parse(localStorage.getItem("bs_gym_ind")||"null");if(sv){
  if(Array.isArray(sv.emas))sv.emas.forEach(function(e){addEma(e.p,e.c,!!e.on);});
  else[9,21,50,200].forEach(function(n){if(sv["e"+n])addEma(n);});
  VW.on=!!sv.vwap;KEYLV.on=!!sv.lv;var hx=/^#[0-9a-f]{6}$/i;if(hx.test(sv.vwc||""))VW.c=sv.vwc;if(hx.test(sv.lvc||""))KEYLV.c=sv.lvc;if(hx.test(sv.lvoc||""))KEYLV.oc=sv.lvoc;}}catch(e){}
function saveInd(){try{localStorage.setItem("bs_gym_ind",JSON.stringify({lv:KEYLV.on,vwap:VW.on,vwc:VW.c,lvc:KEYLV.c,lvoc:KEYLV.oc,emas:EMAS.map(function(e){return {p:e.p,c:e.c,on:e.on};})}));}catch(e){}}
// EMA for any period, aligned to the session bars. Uses prior closes from the server for warm-up,
// so each value only depends on candles up to that bar (no look-ahead).
function emaArr(p){if(!G||!G.bars)return null;var key=G.d.session+"|"+cfg.mode+"|"+p;if(ECACHE[key])return ECACHE[key];
  var cl=G.bars.map(function(b){return b[4];}),out;
  if(!G.d.pre&&G.d.ind&&G.d.ind["e"+p])out=G.d.ind["e"+p];
  else{var src=(G.d.pre||[]).concat(cl),k=2/(p+1),e=src[0],all=[];
    src.forEach(function(c,i){e=i?c*k+e*(1-k):c;all.push(Math.round(e*100)/100);});out=all.slice(src.length-cl.length);}
  return ECACHE[key]=out;}
function lineDefs(){var a=EMAS.map(function(e){return {k:"m"+e.id,c:e.c,w:1,on:e.on,n:"EMA "+e.p,arr:e.on?emaArr(e.p):null};});
  a.push({k:"vwap",c:VW.c,w:2,on:VW.on,n:"VWAP",arr:G&&G.d.ind?G.d.ind.vwap:null});return a;}
function syncLines(){if(!CH)return;var defs=lineDefs(),keep={};
  defs.forEach(function(d){keep[d.k]=1;if(!LS[d.k])LS[d.k]=CH.addSeries(LW.LineSeries,{priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    LS[d.k].applyOptions({color:d.c,lineWidth:d.w,visible:d.on});
    if(G&&G.bars){var vis=G.bars.slice(0,G.i+1);LS[d.k].setData(d.on&&d.arr?vis.map(function(b,i){return {time:tOf(b[0]),value:d.arr[i]};}):[]);}});
  Object.keys(LS).forEach(function(k){if(!keep[k]){CH.removeSeries(LS[k]);delete LS[k];}});}
function initChart(){
  if(CH||!LW)return;var c=tvColors(),el=$("chart");
  CH=LW.createChart(el,{autoSize:true,layout:{background:{type:"solid",color:c.bg},textColor:c.text,fontFamily:"-apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif",fontSize:11,attributionLogo:true},
    grid:{vertLines:{color:c.grid},horzLines:{color:c.grid}},crosshair:{mode:0,vertLine:{color:c.cross,labelBackgroundColor:"#2a2e39"},horzLine:{color:c.cross,labelBackgroundColor:"#2a2e39"}},
    rightPriceScale:{borderColor:c.border},handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:false,pinch:true,axisPressedMouseMove:true},timeScale:{borderColor:c.border,timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:9,minBarSpacing:3,
      tickMarkFormatter:function(t){return fmtT(mOf(t)).replace(/([ap])$/,"");}},
    localization:{timeFormatter:function(t){return fmtT(mOf(t))+" PT";},priceFormatter:function(p){return p.toFixed(2);}}});
  CS=CH.addSeries(LW.CandlestickSeries,{autoscaleInfoProvider:function(orig){var r=orig();if(r&&r.priceRange&&G&&G.pos){var ps=[G.pos.stop,G.pos.tgt,G.pos.entry].filter(function(x){return x!=null;});r.priceRange.minValue=Math.min.apply(null,[r.priceRange.minValue].concat(ps));r.priceRange.maxValue=Math.max.apply(null,[r.priceRange.maxValue].concat(ps));}return r;},upColor:UP,downColor:DN,borderVisible:false,wickUpColor:UP,wickDownColor:DN,priceLineColor:BLUE,priceLineStyle:2});
  CS.priceScale().applyOptions({scaleMargins:{top:0.08,bottom:0.22}});
  VS=CH.addSeries(LW.HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"",lastValueVisible:false,priceLineVisible:false});
  VS.priceScale().applyOptions({scaleMargins:{top:0.82,bottom:0}});
  MK=LW.createSeriesMarkers(CS,[]);
  CH.subscribeCrosshairMove(function(p){var d=p&&p.seriesData&&p.seriesData.get(CS);legend(d?[0,d.open,d.high,d.low,d.close]:null);indLegend(d&&p.time!=null?G.bars.findIndex(function(b){return tOf(b[0])===p.time;}):null);});
}
function legend(b){if(!G)return;b=b||G.bars[G.i];var ch=b[4]-b[1],up=ch>=0,c=up?"pos2":"neg2";
  $("ohlc").innerHTML='O<b class="'+c+'">'+b[1].toFixed(2)+'</b> H<b class="'+c+'">'+b[2].toFixed(2)+'</b> L<b class="'+c+'">'+b[3].toFixed(2)+'</b> C<b class="'+c+'">'+b[4].toFixed(2)+'</b> <b class="'+c+'">'+(up?"+":"")+ch.toFixed(2)+'</b>';}
function indLegend(i){if(!G||!G.bars){$("indLeg").innerHTML="";return;}if(i==null||i<0||i>G.i)i=G.i;
  $("indLeg").innerHTML=lineDefs().filter(function(d){return d.on&&d.arr;}).map(function(d){return '<span style="color:'+d.c+'">'+d.n+' <b>'+d.arr[i].toFixed(2)+'</b></span>';}).join("");}
function drawLevels(){LVL.forEach(function(l){CS.removePriceLine(l);});LVL=[];if(!KEYLV.on||!G.d.lv)return;var c=tvColors();
  Object.keys(LVN).forEach(function(k){var v=G.d.lv[k];if(v==null)return;LVL.push(CS.createPriceLine({price:v,color:k.indexOf("on")===0?KEYLV.oc:KEYLV.c,lineWidth:1,lineStyle:1,axisLabelVisible:true,title:LVN[k]}));});}
function indMenu(){
  var rows=EMAS.map(function(e){return '<div class="erow" data-id="'+e.id+'"><input type="checkbox" class="eon"'+(e.on?" checked":"")+' aria-label="Show EMA '+e.p+'">'+
    '<input type="color" class="ecol" value="'+e.c+'" aria-label="Color"><span>EMA</span><input type="number" class="ep" min="1" max="500" step="1" inputmode="numeric" value="'+e.p+'" aria-label="EMA length">'+
    '<button type="button" class="edel" aria-label="Remove EMA '+e.p+'">×</button></div>';}).join("");
  $("indMenu").innerHTML='<div class="imh">Moving averages</div>'+(rows||'<p class="imn" style="border:0;margin:0;padding-top:0">No EMAs on the chart. Add any length you use.</p>')+
   (EMAS.length<EMAX?'<div class="eadd"><input type="number" id="eNew" min="1" max="500" step="1" inputmode="numeric" placeholder="Length" aria-label="New EMA length"><button type="button" id="eAddB">+ Add EMA</button></div>'+
     '<div class="equick">'+[8,9,10,20,21,34,50,100,200].map(function(n){var has=EMAS.some(function(e){return e.p===n;});return '<button type="button" data-p="'+n+'"'+(has?' class="on"':'')+'>'+n+'</button>';}).join("")+'</div>':'<p class="imn" style="border:0">Max '+EMAX+' EMAs.</p>')+
   '<div class="imh" style="margin-top:6px">Other</div>'+
   '<div class="orow"><label><input type="checkbox" data-k="vwap"'+(VW.on?" checked":"")+'>VWAP</label><input type="color" class="ocol" data-c="vw" value="'+VW.c+'" aria-label="VWAP color" title="VWAP color"></div>'+
   '<div class="orow"><label><input type="checkbox" data-k="lv"'+(KEYLV.on?" checked":"")+'>Key levels</label></div>'+
   '<div class="orow sub"><span>Prior day <em>PDH · PDL · PDC</em></span><input type="color" class="ocol" data-c="lv" value="'+KEYLV.c+'" aria-label="Prior day levels color" title="Prior day levels color"></div>'+
   '<div class="orow sub"><span>Overnight <em>ONH · ONL</em></span><input type="color" class="ocol" data-c="lvo" value="'+KEYLV.oc+'" aria-label="Overnight levels color" title="Overnight levels color"></div><p class="imn">Everything here is optional and off by default. EMAs (1–500) use the 5-minute candles. VWAP resets at the 3pm PT Globex open. Key levels: prior day high/low/close (6:30a–1p) and overnight high/low.</p>';
  var m=$("indMenu");
  function changed(){saveInd();syncLines();indLegend();}
  m.querySelectorAll(".erow").forEach(function(r){var e=EMAS.filter(function(x){return x.id===+r.getAttribute("data-id");})[0];
    r.querySelector(".eon").addEventListener("change",function(){e.on=this.checked;changed();});
    r.querySelector(".ecol").addEventListener("input",function(){e.c=this.value;changed();});
    r.querySelector(".ep").addEventListener("change",function(){var p=clampP(this.value);if(!p){this.value=e.p;return;}e.p=p;this.value=p;changed();indMenu();});
    r.querySelector(".edel").addEventListener("click",function(ev){ev.stopPropagation();EMAS=EMAS.filter(function(x){return x!==e;});changed();indMenu();});});
  function add(p){if(addEma(p)){changed();indMenu();var n=$("eNew");if(n)n.focus();}}
  if($("eAddB")){$("eAddB").addEventListener("click",function(ev){ev.stopPropagation();add($("eNew").value);});
    $("eNew").addEventListener("keydown",function(ev){ev.stopPropagation();if(ev.key==="Enter")add(this.value);});
    m.querySelectorAll(".equick button").forEach(function(b){b.addEventListener("click",function(ev){ev.stopPropagation();add(b.getAttribute("data-p"));});});}
  m.querySelectorAll('label input[type=checkbox]').forEach(function(cb){cb.addEventListener("change",function(){var k=cb.getAttribute("data-k");
    if(k==="lv"){KEYLV.on=cb.checked;if(G&&CS)drawLevels();}else if(k==="vwap")VW.on=cb.checked;changed();});});
  m.querySelectorAll('.ocol').forEach(function(ci){ci.addEventListener("click",function(ev){ev.stopPropagation();});ci.addEventListener("input",function(){var k=ci.getAttribute("data-c");
    if(k==="vw")VW.c=ci.value;else if(k==="lv")KEYLV.c=ci.value;else KEYLV.oc=ci.value;if(k!=="vw"&&G&&CS)drawLevels();changed();});});
  m.querySelectorAll('input').forEach(function(x){x.addEventListener("keydown",function(ev){ev.stopPropagation();});});
}
function candleOf(b){return {time:tOf(b[0]),open:b[1],high:b[2],low:b[3],close:b[4]};}
function volOf(b){var c=tvColors();return {time:tOf(b[0]),value:b[5],color:b[4]>=b[1]?c.volU:c.volD};}
function drawChart(){
  if(!LW){$("chart").innerHTML='<p class="mut sm" style="padding:16px">Chart failed to load. Refresh the page.</p>';return;}
  initChart();var key=G.d.session+"|"+cfg.mode;
  if(key!==drawnKey||G.i<drawnI){var vis=G.bars.slice(0,G.i+1);CS.setData(vis.map(candleOf));VS.setData(vis.map(volOf));drawnKey=key;drawnI=G.i;
    syncLines();drawLevels();
    CH.timeScale().setVisibleLogicalRange({from:-1,to:G.bars.length+4});}
  else{for(var k=drawnI+1;k<=G.i;k++){CS.update(candleOf(G.bars[k]));VS.update(volOf(G.bars[k]));
      lineDefs().forEach(function(d){if(d.on&&d.arr&&LS[d.k])LS[d.k].update({time:tOf(G.bars[k][0]),value:d.arr[k]});});}drawnI=G.i;}
  PL.forEach(function(l){CS.removePriceLine(l);});PL=[];
  if(G.pos){var p=G.pos,lbl=(p.side>0?"Long ":"Short ")+p.qty;
    PL.push(CS.createPriceLine({price:p.entry,color:BLUE,lineWidth:2,lineStyle:0,axisLabelVisible:true,title:lbl}));
    PL.push(CS.createPriceLine({price:p.stop,color:DN,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"SL "+usd(-p.risk)}));
    if(p.tgt!=null)PL.push(CS.createPriceLine({price:p.tgt,color:UP,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"TP "+usd(p.risk*(Math.abs(p.tgt-p.entry)/Math.abs(p.entry-p.stop)),true)}));}
  var ms=[{time:tOf(G.bars[G.d.startIdx][0]),position:"aboveBar",color:"#f5a623",shape:"square",size:0.5,text:"Open"}];
  G.marks.forEach(function(m){var t=tOf(G.bars[m.i][0]);
    if(m.t==="b")ms.push({time:t,position:"belowBar",color:BLUE,shape:"arrowUp",text:"Buy"});
    else if(m.t==="s")ms.push({time:t,position:"aboveBar",color:DN,shape:"arrowDown",text:"Sell"});
    else{var tr=G.trades.filter(function(x){return x.xi===m.i;}).pop();ms.push({time:t,position:"inBar",color:"#f5a623",shape:"circle",size:0.7,text:tr?usd(tr.pnl,true):""});}});
  ms.sort(function(a,b){return a.time-b.time;});MK.setMarkers(G.d.startIdx<=G.i?ms:ms.filter(function(x){return x.text!=="Open";}));
  legend();indLegend();
}
function retheme(){if(!CH)return;var c=tvColors();CH.applyOptions({layout:{background:{type:"solid",color:c.bg},textColor:c.text},grid:{vertLines:{color:c.grid},horzLines:{color:c.grid}},rightPriceScale:{borderColor:c.border},timeScale:{borderColor:c.border}});
  if(G){VS.setData(G.bars.slice(0,G.i+1).map(volOf));}}
/* ---------- results + leaderboard ---------- */
function grade(pnl,blown,n){if(blown)return["F","Hit the daily loss limit. Size down and wait for cleaner setups."];if(!n)return["–","No trades. Sitting out is a position, but the Gym is for reps."];
  if(pnl>=500)return["A","Strong session. Protect it: this is where traders give it back."];if(pnl>=200)return["B","Solid, green and controlled."];if(pnl>=0)return["C","Green is green. Look for one more clean setup next time."];return["D","Red, but you lived to fight another day. Review your entries."];}
function finish(restored){
  if(cfg.mode==="sim"){simFinish(restored);return;}
  var t=G.trades,w=t.filter(function(x){return x.pnl>0;}).length,best=t.length?Math.max.apply(null,t.map(function(x){return x.pnl;})):0;
  var n=t.length,gr=grade(G.realized,G.blown,n),over=n>8?'<p class="warn">⚠️ '+n+' trades in 2 hours is a lot. Overtrading is how accounts die.</p>':"";
  var s=saved(),posted=s&&s.posted;
  var h='<div class="rtop"><div class="gr g'+gr[0]+'">'+gr[0]+'</div><div><b>'+(cfg.mode==="daily"?"Daily Challenge result":"Practice result")+'</b><p>'+gr[1]+'</p></div></div>'+
    '<div class="stats"><div class="stat"><small>P&amp;L</small><strong class="'+cls(G.realized)+'">'+usd(G.realized,true)+'</strong></div><div class="stat"><small>Trades</small><strong>'+n+'</strong></div><div class="stat"><small>Win rate</small><strong>'+(n?Math.round(w/n*100)+"%":"–")+'</strong></div><div class="stat"><small>Best trade</small><strong class="'+cls(best)+'">'+(n?usd(best,true):"–")+'</strong></div></div>'+over+
    (t.length?'<div class="tlist">'+t.map(function(x,k){return '<div><span>#'+(k+1)+' '+(x.side>0?"Long":"Short")+' '+x.qty+' @ '+x.entry.toFixed(2)+' → '+x.exit.toFixed(2)+' <em>('+x.why+')</em></span><b class="'+cls(x.pnl)+'">'+usd(x.pnl,true)+'</b></div>';}).join("")+'</div>':"");
  if(cfg.mode==="daily"){
    if(posted)h+='<p class="note">✅ Posted to today\'s leaderboard. New challenge at midnight PT. Keep training in Practice.</p>';
    else if(!n)h+='<p class="note">No trades, so nothing to post. New challenge at midnight PT.</p>';
    else if(user)h+='<div class="post"><button class="btnx pri" id="bPost">Post my score</button><span class="mut sm">Posts as '+esc(nameOf(user))+'</span></div>';
    else h+='<p class="note"><a href="/signup/?next=/gym/">Log in or create an account</a>, then come back to post this score. It\'s saved on this device until midnight PT.</p>';
    h+='<button class="btnx" id="bGoPractice">Train in Practice mode</button>';
  }else h+='<button class="btnx pri" id="bAgain">New practice session</button>';
  $("result").innerHTML=h;$("result").classList.remove("hide");
  if($("bPost"))$("bPost").onclick=postScore;
  if($("bGoPractice"))$("bGoPractice").onclick=function(){setMode("practice");};
  if($("bAgain"))$("bAgain").onclick=load;
  if(!restored)$("result").scrollIntoView({behavior:"smooth",block:"start"});
}
function simFinish(restored){
  var o=simGet();if(!o)return;
  if(!restored&&o.status==="active"&&G&&G.ended&&!G.simDone){G.simDone=true;var t=G.trades,w=t.filter(function(x){return x.pnl>0;}).length,best=t.length?Math.max.apply(null,t.map(function(x){return x.pnl;})):0;
    o.open=null;o.days.push({pnl:G.realized,n:t.length,wins:w,best:best,session:G.d.session,blown:G.blown});simSettle(o);simSave(o);}
  renderSim();var d=o.days[o.days.length-1]||{pnl:0,n:0};
  if(o.status!=="active"){simEndCard(o,d);return;}
  var prof=simTotal(o),need=[];if(prof<SIM.target)need.push(usd(SIM.target-prof)+" more profit");var td=simTD(o);if(td<SIM.minDays)need.push((SIM.minDays-td)+" more trading day"+(SIM.minDays-td===1?"":"s"));
  if(prof>=SIM.target&&simBest(o)>prof*SIM.cons)need.push("a smaller best day vs. total (consistency: best day ≤ "+Math.round(SIM.cons*100)+"% of profit)");
  var h='<div class="rtop"><div class="gr g'+(d.pnl>0?"B":d.pnl<0?"D":"C")+'">'+o.days.length+'</div><div><b>Day '+o.days.length+' complete: <span class="'+cls(d.pnl)+'">'+usd(d.pnl,true)+'</span></b><p>'+(d.n===0?'No trades today, so this day doesn\'t count toward your '+SIM.minDays+' trading days. ':'')+'Challenge total '+usd(prof,true)+'. Still need: '+need.join(", ")+'.</p></div></div>'+
    '<button class="btnx pri" id="bSimNext">Start Day '+(o.days.length+1)+' →</button>';
  $("result").innerHTML=h;$("result").classList.remove("hide");$("bSimNext").onclick=load;
  if(!restored)$("result").scrollIntoView({behavior:"smooth",block:"start"});
}
function simEndCard(o){
  var prof=simTotal(o),n=o.days.length,wins=o.days.filter(function(d){return d.pnl>0;}).length,h;
  if(o.status==="passed")h='<div class="rtop"><div class="gr gA">✓</div><div><b>You passed the Bear Squad Sim Challenge 🎉</b><p>+'+usd(prof)+' over '+n+' days, '+wins+' green. That took discipline. Screenshot this and share it in the Discord.</p></div></div>'+
    '<div class="simcert"><span>BEAR SQUAD · SIM CHALLENGE</span><b>PASSED</b><em>$50K sim account · '+usd(prof,true)+' · '+n+' days · '+(o.passed||todayPT())+'</em><small>Paper trading account. Not a funded account.</small></div>';
  else h='<div class="rtop"><div class="gr gF">✕</div><div><b>Challenge failed</b><p>'+esc(o.reason||"")+' Final: '+usd(prof,true)+' over '+n+' day'+(n===1?"":"s")+'. Every funded trader has blown evals. Reset and run it back.</p></div></div>';
  h+='<div class="tlist">'+o.days.map(function(d,k){return '<div><span>Day '+(k+1)+' · '+d.n+(d.n===1?' trade':' trades')+(d.left?' <em>(left mid-trade, counted as stopped)</em>':'')+(d.blown?' <em>(limit hit)</em>':'')+'</span><b class="'+cls(d.pnl)+'">'+usd(d.pnl,true)+'</b></div>';}).join("")+'</div>'+
    '<button class="btnx pri" id="bSimNew">Start a new Sim Challenge</button>';
  $("result").innerHTML=h;$("result").classList.remove("hide");
  $("bSimNew").onclick=function(){simNew();load();};
}
function renderSim(){var el=$("simCard");if(!el)return;if(cfg.mode!=="sim"){el.classList.add("hide");return;}
  var o=simGet()||simNew(),prof=simTotal(o),bal=START+prof,fl=simFloor(o),best=simBest(o),pct=Math.max(0,Math.min(100,prof/SIM.target*100));
  var consOk=prof<=0||best<=prof*SIM.cons;
  el.innerHTML='<div class="simh"><b>🎯 Sim Challenge</b><span class="tag">'+(o.status==="active"?"Day "+(o.days.length+1):o.status==="passed"?"PASSED":"FAILED")+'</span><button class="lnk" id="bSimReset">Reset</button></div>'+
    '<div class="simbar"><i style="width:'+pct.toFixed(0)+'%"></i></div>'+
    '<div class="simgrid"><div><small>Profit</small><b class="'+cls(prof)+'">'+usd(prof,true)+'</b><em>target +'+usd(SIM.target)+'</em></div>'+
    '<div><small>Balance</small><b>'+usd(bal)+'</b><em>fails below '+usd(fl)+'</em></div>'+
    '<div><small>Trading days</small><b>'+simTD(o)+' / '+SIM.minDays+'</b><em>minimum to pass</em></div>'+
    '<div><small>Best day</small><b class="'+(consOk?"":"neg")+'">'+(prof>0?Math.round(best/prof*100)+'%':'–')+'</b><em>of profit · max '+Math.round(SIM.cons*100)+'%</em></div></div>'+
    '<p class="simsync" id="simSync"></p><details class="simrules"><summary>Rules</summary><ul><li>The point: build confidence and skill before you risk real money. Pass this consistently before paying for a real evaluation.</li><li>$50K paper account. Practice how you play: every rule is real.</li><li>Pass: +$3,000 profit, at least 5 trading days, and no single day over 40% of total profit.</li><li>Fail: balance touches the $2,000 trailing drawdown. It trails your best end-of-day balance and locks at $50,000 once you\'re up $2,000.</li><li>$1,000 daily loss limit ends that day, not the challenge.</li><li>Every day is a different hidden NQ morning. Leaving mid-trade counts that trade as stopped out.</li></ul></details>';
  el.classList.remove("hide");simSyncNote(simSynced?"ok":"");
  $("bSimReset").onclick=function(){if(o.days.length&&!window.confirm("Reset your Sim Challenge? Progress will be lost."))return;simNew();load();};
}
function postScore(){
  var s=saved();if(!s||!user||!sb)return;var b=$("bPost");b.disabled=true;b.textContent="Posting…";
  var row={day:todayPT(),name:nameOf(user),pnl:Math.max(-1000,s.pnl),trades:Math.min(40,s.trades),wins:s.wins,best:s.best,blown:!!s.blown};
  sb.from("gym_scores").insert(row).then(function(r){
    if(r.error&&!/duplicate|23505/i.test(r.error.message+r.error.code)){b.disabled=false;b.textContent="Post my score";alert0("Couldn't post: "+r.error.message);return;}
    s.posted=true;save(s);finish(true);loadLb();});
}
function alert0(t){var p=document.createElement("p");p.className="warn";p.textContent=t;$("result").appendChild(p);}
var lbMode="day";
function weekStart(){var d=new Date(todayPT()+"T12:00:00Z"),wd=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-wd);return d.toISOString().slice(0,10);}
function loadLb(){
  var day=todayPT(),wk=weekStart(),url;
  if(lbMode==="day"){$("lbDay").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric",timeZone:"America/Los_Angeles"})+" · Daily Challenge · resets midnight PT";
    url=BASE+"/rest/v1/gym_scores?day=eq."+day+"&select=name,pnl,trades,wins,blown&order=pnl.desc&limit=25";}
  else{$("lbDay").textContent="Week of "+new Date(wk+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"})+" · total Daily Challenge P&L this week";
    url=BASE+"/rest/v1/gym_weekly?week=eq."+wk+"&select=name,pnl,days,trades,wins&order=pnl.desc&limit=25";}
  fetch(url,H).then(function(r){return r.ok?r.json():[];}).then(function(rows){
    if(!rows.length){$("lb").innerHTML='<p class="mut sm">No scores yet '+(lbMode==="day"?"today":"this week")+'. Be the first on the board.</p>';return;}
    $("lb").innerHTML='<div class="lbt">'+rows.map(function(r,i){var sub=lbMode==="day"?r.trades+(r.trades===1?' trade · ':' trades · ')+Math.round(r.wins/Math.max(1,r.trades)*100)+'%':r.days+(r.days===1?' day':' days')+' · '+r.trades+(r.trades===1?' trade':' trades');
      return '<div class="lr'+(i<3?" top":"")+'"><span class="rk">'+(i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1)+'</span><span class="nm">'+esc(r.name)+(r.blown?' <em>blown</em>':'')+'</span><span class="wr">'+sub+'</span><b class="'+cls(+r.pnl)+'">'+usd(+r.pnl,true)+'</b></div>';}).join("")+'</div>';
  }).catch(function(){$("lb").innerHTML='<p class="mut sm">Leaderboard unavailable right now.</p>';});
}
/* ---------- controls ---------- */
function stop(){if(timer){clearInterval(timer);timer=null;}$("bPlay").textContent="▶ Play";}
function togglePlay(){if(timer){stop();return;}if(!G||G.ended)return;timer=setInterval(step,cfg.speed);$("bPlay").textContent="❚❚ Pause";}
function setMode(m){cfg.mode=m;renderSim();document.querySelectorAll("#sMode button").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-v")===m);});load();}
function seg(id,key,num){$(id).querySelectorAll("button").forEach(function(b){b.addEventListener("click",function(){cfg[key]=num?+b.getAttribute("data-v"):b.getAttribute("data-v");$(id).querySelectorAll("button").forEach(function(x){x.classList.toggle("on",x===b);});if(key==="speed"&&timer){stop();togglePlay();}render();});});}
document.querySelectorAll("#sMode button").forEach(function(b){b.addEventListener("click",function(){setMode(b.getAttribute("data-v"));});});
$("sLb").querySelectorAll("button").forEach(function(b){b.addEventListener("click",function(){lbMode=b.getAttribute("data-v");$("sLb").querySelectorAll("button").forEach(function(x){x.classList.toggle("on",x===b);});loadLb();});});
$("qm").onclick=function(){var q=[1,2,3,5,10],i=q.indexOf(cfg.qty);cfg.qty=q[Math.max(0,i-1)];render();};$("qp").onclick=function(){var q=[1,2,3,5,10],i=q.indexOf(cfg.qty);cfg.qty=q[Math.min(q.length-1,i+1)];render();};seg("sStop","stop",1);$("sStop").querySelectorAll("button").forEach(function(bt){bt.addEventListener("click",function(){$("stopIn").value=bt.getAttribute("data-v");});});
$("stopIn").addEventListener("input",function(){var v=parseFloat($("stopIn").value);if(isFinite(v)&&v>=1&&v<=300){cfg.stop=Math.round(v*4)/4;$("sStop").querySelectorAll("button").forEach(function(x){x.classList.toggle("on",+x.getAttribute("data-v")===cfg.stop);});render();}});seg("sTgt","r",1);seg("sSpd","speed",1);
$("bBuy").onclick=function(){enter(1);};$("bSell").onclick=function(){enter(-1);};$("bClose").onclick=closePos;$("bStep").onclick=step;$("bPlay").onclick=togglePlay;
document.addEventListener("keydown",function(e){if(/INPUT|TEXTAREA/.test((e.target||{}).tagName))return;var k=e.key.toLowerCase();
  if(k==="b")enter(1);else if(k==="s")enter(-1);else if(k==="c")closePos();else if(k==="arrowright"||k==="n"){e.preventDefault();step();}else if(k===" "){e.preventDefault();togglePlay();}});
window.addEventListener("bs-theme",retheme);
indMenu();
$("bInd").onclick=function(e){e.stopPropagation();var m=$("indMenu"),open=m.classList.contains("hide"),bi=$("bInd");m.style.top=(bi.offsetTop+bi.offsetHeight+6)+"px";m.classList.toggle("hide",!open);$("bInd").setAttribute("aria-expanded",open?"true":"false");};
document.addEventListener("click",function(e){if(!$("indMenu").contains(e.target)&&e.target!==$("bInd"))$("indMenu").classList.add("hide");});
renderAcct();
if(sb){sb.auth.getSession().then(function(r){var s=r.data&&r.data.session;user=s?s.user:null;renderAcct();if(G&&G.ended&&cfg.mode!=="sim")finish(true);simPull();renderSim();});
  sb.auth.onAuthStateChange(function(ev,s){var was=user&&user.id;user=s?s.user:null;renderAcct();if(user&&user.id!==was)simPull();if(cfg.mode==="sim")renderSim();});}
if(location.hash==="#sim"){cfg.mode="sim";document.querySelectorAll("#sMode button").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-v")==="sim");});}
load();loadLb();setInterval(loadLb,120000);
})();
