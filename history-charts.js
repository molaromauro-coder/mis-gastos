export function shiftMonth(value, delta) {
  const [y,m]=value.split('-').map(Number), d=new Date(y,m-1+delta,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
export function monthItems(expenses, month, dateOf) {
  const [y,m]=month.split('-').map(Number), start=new Date(y,m-1,1), end=new Date(y,m,1);
  return expenses.filter(e=>{const d=dateOf(e);return d>=start&&d<end;});
}
export function categoryRows(items,currency){
  const map=new Map();
  for(const e of items){if((e.currency||'ARS')!==currency)continue;const name=e.category||'Sin clasificar';let r=map.get(name);if(!r){r={name,total:0,subs:new Map()};map.set(name,r);}const n=Number(e.amount)||0;r.total+=n;const sub=e.subcategory||'Sin subcategoría';r.subs.set(sub,(r.subs.get(sub)||0)+n);}
  return [...map.values()].sort((a,b)=>b.total-a.total);
}
export function installHistoryCharts({getExpenses,dateOf,onMonth,initialMonth}){
 const root=document.createElement('div');root.id='historyAnalytics';document.querySelector('#historyFilters').after(root);
 let month=initialMonth,other=shiftMonth(month,-1),kind='bar',currency='ARS',compare=false;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency}).format(n);
 const label=m=>new Date(m+'-01T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'});
 const color=name=>{let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 58% 43%)`;};
 const rows=m=>categoryRows(monthItems(getExpenses(),m,dateOf),currency);
 function graph(data,max){
  const total=data.reduce((s,r)=>s+r.total,0);if(!total)return '<p>Sin gastos en esta moneda.</p>';
  let chart='';
  if(kind==='pie'){let pos=0;const stops=data.filter(r=>r.total>0).map(r=>{const start=pos;pos+=r.total/total*100;return `${color(r.name)} ${start}% ${pos}%`;});chart=`<div class="history-pie" role="img" aria-label="Distribución de gastos por categoría" style="background:conic-gradient(${stops.join(',')})"></div>`;}
  return chart+data.map(r=>`<div class="history-category"><span style="color:${color(r.name)}">●</span> ${esc(r.name)} <strong>${money(r.total)}</strong>${kind==='bar'?`<div class="history-track"><div style="width:${Math.max(0,r.total)/max*100}%;background:${color(r.name)}"></div></div>`:''}<small>${(r.total/total*100).toFixed(1)}%</small></div>`).join('');
 }
 function detail(data){return data.map(r=>{const has=[...r.subs.keys()].some(s=>s!=='Sin subcategoría');return has?`<details class="history-subgroup"><summary><strong>${esc(r.name)}</strong> · ${money(r.total)} <small>▾ Subcategorías</small></summary>${[...r.subs].map(([s,n])=>`<div class="history-sub"><span>↳ ${esc(s)}</span><strong>${money(n)}</strong></div>`).join('')}</details>`:`<div class="history-category">${esc(r.name)} <strong>${money(r.total)}</strong></div>`;}).join('');}
 function render(){
  const a=rows(month),b=rows(other),sum=r=>r.reduce((s,x)=>s+x.total,0),max=Math.max(1,...a.map(r=>r.total),...(compare?b.map(r=>r.total):[]));
  root.innerHTML=`<div class="history-nav"><button data-step="-1" aria-label="Mes anterior">‹</button><strong>${esc(label(month))}</strong><button data-step="1" aria-label="Mes siguiente">›</button></div><p class="muted">Deslizá el gráfico a izquierda o derecha para cambiar de mes.</p><div class="history-controls"><label>Gráfico<select id="historyChartKind"><option value="bar">Barras</option><option value="pie">Torta</option></select></label><label>Moneda<select id="historyChartCurrency"><option>ARS</option><option>USD</option></select></label><label><input id="historyCompareToggle" type="checkbox" ${compare?'checked':''}> Comparar VS</label></div>${compare?`<label>Comparar con <input id="historyCompareMonth" type="month" value="${other}"></label>`:''}<div class="history-swipe"><div class="history-panels ${compare?'history-vs':''}"><article><h3>${esc(label(month))}</h3><strong>${money(sum(a))}</strong>${graph(a,max)}</article>${compare?`<article><h3>VS · ${esc(label(other))}</h3><strong>${money(sum(b))}</strong>${graph(b,max)}</article>`:''}</div></div>${compare?`<h3>Diferencia: ${esc(label(month))} vs ${esc(label(other))}</h3><p>${money(sum(a)-sum(b))} · ${sum(b)?((sum(a)-sum(b))/sum(b)*100).toFixed(1)+'%':'Sin base para calcular %'}</p><div class="history-comparisons">${[...new Set([...a,...b].map(r=>r.name))].map(name=>{const av=a.find(r=>r.name===name)?.total||0,bv=b.find(r=>r.name===name)?.total||0;return `<div class="history-category"><b>${esc(name)}</b><br>${money(av)} vs ${money(bv)}<br><small>Diferencia: ${money(av-bv)} · ${bv?((av-bv)/bv*100).toFixed(1)+'%':'Sin base %'}</small></div>`;}).join('')}</div>`:''}<h3>Categorías y subcategorías · ${esc(label(month))}</h3>${detail(a)}<h3>Detalle de movimientos</h3>`;
  root.querySelector('#historyChartKind').value=kind;root.querySelector('#historyChartCurrency').value=currency;
  root.querySelector('#historyChartKind').onchange=e=>{kind=e.target.value;render();};root.querySelector('#historyChartCurrency').onchange=e=>{currency=e.target.value;render();};root.querySelector('#historyCompareToggle').onchange=e=>{compare=e.target.checked;render();};
  const input=root.querySelector('#historyCompareMonth');if(input)input.onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){other=e.target.value;render();}};
  root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>move(Number(b.dataset.step)));
  let start=null;const surface=root.querySelector('.history-swipe');surface.addEventListener('touchstart',e=>{start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});surface.addEventListener('touchend',e=>{if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;start=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1);},{passive:true});surface.addEventListener('touchcancel',()=>{start=null;});
 }
 function move(delta){month=shiftMonth(month,delta);onMonth(month);}
 return {update(value,visible){if(value)month=value;root.hidden=!visible;if(visible)render();}};
}
