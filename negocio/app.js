import {captureTemplate,exportOriginalTemplate} from './template-export.js';
import {freezeExistingSplit} from './sellers.js';
import {attachExcelRates} from './excel-rates.js';
import {createBusinessWorkbook,parseBusinessWorkbook,compareBusinessImport,applyBusinessImport,verifyBusinessImport} from './workbook.js';
import { installSellers } from './sellers-ui.js';
import { installSimulator } from './simulator-ui.js';
import { createBusinessSession } from './session.js';
import { normalizeSplit,ticketMetrics,partyMetrics,portfolioMetrics,withPortfolioPercent,groupResalePartiesByDate,orderResaleBalanceParties } from './metrics.js';
import { parseLocalizedNumber,formatLocalizedNumber,formatLocalizedInteger,formatNumericInputValue } from '../numeric-format.js';
import { compareResaleImport,applyResaleImport,parseResaleUpdate,parseResaleWorkbook,mergeResaleParties,verifyResaleImport,verifyResalePreservation,saveVerifiedResaleBackup } from '../resale-import.js';
const $=s=>document.querySelector(s),sharedMode=false,resaleApi=true;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(n,c='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:c,maximumFractionDigits:2}).format(n||0);
const numberText=(n,maximumFractionDigits=2)=>formatLocalizedNumber(n,{maximumFractionDigits});
const integerText=n=>formatLocalizedInteger(n);
const localizedInputNumber=s=>parseLocalizedNumber($(s)?.value||0);
function bindLocalizedNumberInputs(root=document){root.querySelectorAll('[data-local-number]').forEach(el=>{if(el.dataset.bound)return;el.dataset.bound='1';el.addEventListener('blur',()=>{const n=parseLocalizedNumber(el.value);if(Number.isFinite(n))el.value=formatNumericInputValue(n,{maximumFractionDigits:2});});});}
function showToast(message){$('#businessMessage').textContent=message;}
let state,STORAGE_KEY,session;
let bindSellers=()=>{};
const cloneState=()=>structuredClone(state),restoreState=value=>{state=value;};
const parseStoredState=raw=>raw?JSON.parse(raw):null,safeStoredValue=k=>localStorage.getItem(k);
function save(){try{session.save(state);return true;}catch(error){const old=localStorage.getItem(STORAGE_KEY);if(old)state=JSON.parse(old);showToast(error.message);throw error;}}
session=createBusinessSession({getState:()=>state,onState:(next,key)=>{state=next;STORAGE_KEY=key;renderResale();},canApply:()=>!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,select,textarea'),message:showToast});
const uid = () => crypto.randomUUID?.() || ('id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const pct = (n) => `${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
function resaleSplit() { return normalizeSplit(state.resale.ownerPercent, state.resale.sellerPercent); }
function resaleTicketResultHTML(ticket,split){
  const tm=ticketMetrics(ticket,split);
  return `<span>Recuperado <strong>${money(tm.recovered,'ARS')}</strong></span><span>Ganancia <strong>${money(tm.netGain,'ARS')}</strong></span><span>% <strong>${ticket.status==='Vendida'?pct(tm.gainPercent):'—'}</strong></span><span>Mauro <strong>${money(tm.ownerGain,'ARS')}</strong></span><span>Vendedor <strong>${money(tm.sellerGain,'ARS')}</strong></span>`;
}
function resalePartyMetricsHTML(party,split){
  const m=partyMetrics(party,split);
  return `<div class="metric-wide"><small>Total invertido</small><strong>${money(m.investment,'ARS')}</strong></div><div><small>Costo recuperado</small><strong>${money(m.recovered,'ARS')}</strong></div><div><small>Ventas</small><strong>${money(m.sales,'ARS')}</strong></div><div class="metric-wide"><small>Total Mauro</small><strong>${money(m.totalForOwner,'ARS')}</strong></div><div class="metric-wide"><small>Ganancia neta</small><strong>${money(m.netGain,'ARS')}</strong><em>${pct(m.gainPercent)} general</em></div><div class="metric-owner-gain"><small>Ganancia Mauro</small><strong>${money(m.ownerGain,'ARS')}</strong></div><div class="metric-seller-gain"><small>Total para vendedor</small><strong>${money(m.sellerGain,'ARS')}</strong></div>`;
}
function currentResaleTicketForRow(row){
  const party=state.resale.parties.find((item)=>item.id===row.dataset.partyId);
  const index=Number(row.dataset.ticketIndex);
  return Number.isInteger(index)&&index>=0?party?.tickets[index]:null;
}
function bindResaleTicketEditors(row,party,ticket){
  const price=row.querySelector('.resale-price');
  const status=row.querySelector('.resale-status');
  const persistPrice=()=>{
    const value=parseLocalizedNumber(price.value);
    if(!Number.isFinite(value)||value<0)return;
    const current=currentResaleTicketForRow(row);if(!current)return;
    current.salePrice=value;
    save();
    renderResale({totalsOnly:true});
  };
  // Save every edit before focus moves to the next ticket. Keep all inputs alive.
  price.addEventListener('input',persistPrice);
  price.addEventListener('change',persistPrice);
  price.addEventListener('blur',persistPrice);
  status.onchange=()=>{
    const current=currentResaleTicketForRow(row);if(!current)return;
    current.status=status.value;
    save();
    renderResale({totalsOnly:true});
    if(current.status==='Vendida'&&Number(current.salePrice||0)<=0){
      price.focus();price.select();showToast('Ingresá el precio de venta');
    }
  };
}
function saveAllResaleSales(){
  for(const row of document.querySelectorAll('.resale-ticket')){
    const ticket=currentResaleTicketForRow(row);if(!ticket)continue;
    const price=parseLocalizedNumber(row.querySelector('.resale-price').value);
    if(!Number.isFinite(price)||price<0)return showToast('Revisá los importes de venta');
  }
  const expected=[];
  for(const row of document.querySelectorAll('.resale-ticket')){
    const ticket=currentResaleTicketForRow(row);if(!ticket)continue;
    ticket.salePrice=parseLocalizedNumber(row.querySelector('.resale-price').value);
    ticket.status=row.querySelector('.resale-status').value;
    expected.push({partyId:row.dataset.partyId,index:Number(row.dataset.ticketIndex),price:ticket.salePrice,status:ticket.status});
  }
  save();
  const stored=parseStoredState(localStorage.getItem(STORAGE_KEY));
  const verified=expected.every((item)=>{
    const ticket=stored?.resale?.parties?.find((party)=>party.id===item.partyId)?.tickets?.[item.index];
    return ticket?.salePrice===item.price&&ticket?.status===item.status;
  });
  if(!verified)return showToast('No se pudo verificar el guardado. Mantené esta pantalla abierta.');
  renderResale({totalsOnly:true});
  showToast('✓ Todas las ventas guardadas y verificadas');
}
function resalePartyCardHTML(party,split,open=false){
    const m = partyMetrics(party, split);
    const tickets = party.tickets.map((ticket,ticketIndex)=>({ticket,ticketIndex})).sort((a,b)=>{
      const rank=(type)=>{const value=String(type||'').trim().toUpperCase();return value==='VIP'?0:value==='EARLY'?1:2;};
      return rank(a.ticket.type)-rank(b.ticket.type)||String(a.ticket.type||'').localeCompare(String(b.ticket.type||''),'es',{sensitivity:'base',numeric:true})||Number(a.ticket.number||0)-Number(b.ticket.number||0)||a.ticketIndex-b.ticketIndex;
    }).map(({ticket,ticketIndex}) => {
      return `<div class="resale-ticket" data-ticket-index="${ticketIndex}" data-ticket-id="${escape(ticket.id)}" data-party-id="${escape(party.id)}">
        <div class="resale-ticket-head"><div><strong>${escape(ticket.type)} · #${integerText(ticket.number)}</strong><small>Costo ${money(ticket.cost, 'ARS')}</small>${ticket.purchaseDate?`<small>Compra: ${escape(ticket.purchaseDate.split('-').reverse().join('/'))}</small>`:''}</div><select class="resale-status">
          ${['Disponible','Vendida','Uso personal'].map((s) => `<option ${ticket.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="resale-ticket-sale"><label>Precio de venta<span class="resale-money-input"><b>$</b><input class="resale-price" type="text" inputmode="decimal" data-local-number="2" value="${formatNumericInputValue(ticket.salePrice||0,{maximumFractionDigits:2})}"></span></label>
        <div class="resale-ticket-result">${resaleTicketResultHTML(ticket,split)}</div></div>
      </div>`;
    }).join('');
    const partyDateLabel=party.date ? new Date(party.date + 'T12:00:00').toLocaleDateString('es-AR') : 'Sin fecha';
    return `<details class="resale-party" data-party-id="${escape(party.id)}" ${open?'open':''}><summary><strong>${escape(party.name)}</strong><small class="resale-party-date">${escape(partyDateLabel)}</small><span>›</span></summary>
      <div class="resale-party-meta">${partyDateLabel} · ${integerText(m.totalTickets)} entradas</div>
      <div class="resale-metrics">${resalePartyMetricsHTML(party,split)}</div>
      <div class="resale-tickets">${tickets || '<div class="empty">Todavía no cargaste entradas para esta fiesta.</div>'}</div>
      <div class="resale-party-actions"><button class="resale-add-tickets" type="button">＋ Agregar entradas</button><button class="delete-party" type="button">Eliminar fiesta</button></div></details>`;

}
function resaleGroupedCardsHTML(parties,split,list,now=new Date()){
  const groups=groupResalePartiesByDate(parties,now);
  const openGroups=new Set(Array.from(list.querySelectorAll('[data-resale-group][open]')).map((node)=>node.dataset.resaleGroup));
  const openParties=new Set(Array.from(list.querySelectorAll('.resale-party[open]')).map((node)=>node.dataset.partyId));
  const partyCards=(rows)=>rows.map((party)=>resalePartyCardHTML(party,split,openParties.has(party.id))).join('');
  const upcoming=partyCards(groups.upcoming)+(groups.undated.length?`<div class="resale-undated-heading">Sin fecha definida</div>${partyCards(groups.undated)}`:'');
  const count=(n)=>`${integerText(n)} fiesta${n===1?'':'s'}`;
  return `<details class="resale-group" data-resale-group="upcoming" ${openGroups.has('upcoming')?'open':''}><summary><span><strong>🎉 Próximas fiestas</strong><small>${count(groups.upcoming.length)}${groups.undated.length?' · '+count(groups.undated.length)+' sin fecha':''}</small></span><b aria-hidden="true">›</b></summary><div class="resale-group-content">${upcoming||'<div class="empty">No hay próximas fiestas cargadas. Tocá “＋ Nueva fiesta” para agregar una.</div>'}</div></details>
    <details class="resale-group" data-resale-group="finished" ${openGroups.has('finished')?'open':''}><summary><span><strong>🏁 Fiestas terminadas</strong><small>${count(groups.finished.length)}</small></span><b aria-hidden="true">›</b></summary><div class="resale-group-content">${partyCards(groups.finished)||'<div class="empty">Todavía no hay fiestas terminadas.</div>'}</div></details>`;
}
function renderResale({ totalsOnly = false } = {}) {
  if (sharedMode || !$('#resaleList') || !resaleApi) return;
  const split = resaleSplit();
  const now=new Date();
  state.resale.ownerPercent = split.ownerPercent;
  state.resale.sellerPercent = split.sellerPercent;
  const total = withPortfolioPercent(portfolioMetrics(state.resale.parties, split));
  $('#resaleInvestment').textContent = money(total.investment, 'ARS');
  $('#resaleCurrentInvestment').textContent = money(total.currentInvestment, 'ARS');
  $('#resaleRecovered').textContent = money(total.recovered, 'ARS');
  $('#resaleSales').textContent = money(total.sales, 'ARS');
  $('#resaleNet').textContent = money(total.netGain, 'ARS');
  $('#resaleGainPercent').textContent = `${pct(total.gainPercent)} global de ganancias`;
  $('#resaleOwnerGain').textContent=money(total.ownerGain,'ARS');
  $('#resaleOwnerGainLabel').textContent=`Ganancia para Mauro`;
  $('#resaleOwner').textContent = money(total.totalForOwner, 'ARS');
  $('#resaleSeller').textContent = money(total.sellerGain, 'ARS');
  $('#resaleSplitLabel').textContent = `${numberText(split.ownerPercent,1)}% Mauro · ${numberText(split.sellerPercent,1)}% vendedor`;
  $('#resaleStock').textContent = `${integerText(total.available)} disponibles · ${integerText(total.sold)} vendidas · ${integerText(total.personal)} uso personal`;
  if ($('#resaleMonthlyBody')) {
    const monthly = new Map();
    state.resale.parties.forEach((party) => {
      const key = /^\d{4}-\d{2}/.test(String(party.date || '')) ? String(party.date).slice(0,7) : 'sin-fecha';
      if (!monthly.has(key)) monthly.set(key, []);
      monthly.get(key).push(party);
    });
    $('#resaleMonthlyBody').innerHTML = [...monthly.entries()]
      .sort(([a],[b]) => b.localeCompare(a))
      .map(([key, parties]) => {
        const m = withPortfolioPercent(portfolioMetrics(parties, split));
        const label = key === 'sin-fecha'
          ? 'Sin fecha'
          : new Date(key + '-01T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
        return `<tr><td><strong>${escape(displayLabel)}</strong></td><td>${money(m.investment,'ARS')}</td><td>${money(m.recovered,'ARS')}</td><td>${money(m.sales,'ARS')}</td><td>${money(m.netGain,'ARS')}</td><td>${pct(m.gainPercent)}</td><td>${money(m.ownerGain,'ARS')}</td></tr>`;
      }).join('');
  }
  if($('#resaleMonthlyOwnerHead'))$('#resaleMonthlyOwnerHead').textContent=`Ganancia Mauro`;
  if ($('#resaleOwnerHead')) $('#resaleOwnerHead').textContent = `Ganancia Mauro`;
  if ($('#resaleSellerHead')) $('#resaleSellerHead').textContent = `Total vendedores`;
  if ($('#resaleBalanceBody')) {
    const groups=groupResalePartiesByDate(state.resale.parties,now);
    const sections=[
      {title:'PRÓXIMAS FIESTAS',parties:[...groups.upcoming,...groups.undated]},
      {title:'FIESTAS FINALIZADAS',parties:groups.finished}
    ];
    $('#resaleBalanceBody').innerHTML = sections.map((section)=>
      `<tr class="resale-balance-section"><th colspan="9">${section.title}</th></tr>`+
      orderResaleBalanceParties(section.parties).map((party) => {
      const m = partyMetrics(party, split);
      return `<tr><td><strong>${escape(party.name)}</strong></td><td>${money(m.investment,'ARS')}</td><td>${money(m.recovered,'ARS')}</td><td>${money(m.sales,'ARS')}</td><td>${money(m.totalForOwner,'ARS')}</td><td>${money(m.netGain,'ARS')}</td><td>${pct(m.gainPercent)}</td><td>${money(m.ownerGain,'ARS')}</td><td>${money(m.sellerGain,'ARS')}</td></tr>`;
    }).join('') + (section.title === 'PRÓXIMAS FIESTAS' ? (() => {
      const m = withPortfolioPercent(portfolioMetrics(section.parties, split));
      return `<tr class="resale-balance-subtotal"><th>TOTAL PRÓXIMAS FIESTAS</th><th>${money(m.investment,'ARS')}</th><th>${money(m.recovered,'ARS')}</th><th>${money(m.sales,'ARS')}</th><th>${money(m.totalForOwner,'ARS')}</th><th>${money(m.netGain,'ARS')}</th><th>${pct(m.gainPercent)}</th><th>${money(m.ownerGain,'ARS')}</th><th>${money(m.sellerGain,'ARS')}</th></tr>`;
    })() : '')).join('');
  }
  if ($('#resaleBalanceTotal')) {
    $('#resaleBalanceTotal').innerHTML = `<tr><th>TOTAL GENERAL</th><th>${money(total.investment,'ARS')}</th><th>${money(total.recovered,'ARS')}</th><th>${money(total.sales,'ARS')}</th><th>${money(total.totalForOwner,'ARS')}</th><th>${money(total.netGain,'ARS')}</th><th>${pct(total.gainPercent)}</th><th>${money(total.ownerGain,'ARS')}</th><th>${money(total.sellerGain,'ARS')}</th></tr>`;
  }
  if (totalsOnly) {
    document.querySelectorAll('.resale-party').forEach((card) => {
      const party=state.resale.parties.find((item)=>item.id===card.dataset.partyId);
      if(!party)return;
      card.querySelector('.resale-metrics').innerHTML=resalePartyMetricsHTML(party,split);
      card.querySelectorAll('.resale-ticket').forEach((row)=>{
        const ticket=currentResaleTicketForRow(row);
        if(ticket)row.querySelector('.resale-ticket-result').innerHTML=resaleTicketResultHTML(ticket,split);
      });
    });
    return;
  }
  $('#resaleList').innerHTML = resaleGroupedCardsHTML(state.resale.parties,split,$('#resaleList'),now);
  bindLocalizedNumberInputs($('#resaleList'));bindSellers();
  document.querySelectorAll('.resale-ticket').forEach((row) => {
    const party = state.resale.parties.find((p) => p.id === row.dataset.partyId);
    const ticket = currentResaleTicketForRow(row);
    if (!ticket) return;
    bindResaleTicketEditors(row, party, ticket);
  });
  document.querySelectorAll('.resale-party').forEach((card) => {
    card.querySelector('.resale-add-tickets').onclick = () => {
      const party = state.resale.parties.find((p) => p.id === card.dataset.partyId);
      if(!party)return;
      $('#resalePartyForm').reset();
      $('#resalePartyForm').dataset.partyId=party.id;$('#resalePartyName').value=party.name;
      $('#resalePartyDate').value=party.date||'';
      $('#resaleQty').value=1;$('#resalePurchaseDate').value=new Date().toLocaleDateString('en-CA');
      $('#resalePartyDialog').showModal();
    };
    card.querySelector('.delete-party').onclick = () => {
      const party = state.resale.parties.find((p) => p.id === card.dataset.partyId);
      if (!party || !confirm(`¿Eliminar ${party.name} y todas sus entradas?`)) return;
      state.resale.parties = state.resale.parties.filter((p) => p.id !== party.id);
      save(); renderResale();
    };
  });
}
function addResaleBatch({ name, date, type, qty, cost }) {if(!name||!type||!date||!Number.isInteger(qty)||qty<1||qty>200||!Number.isFinite(cost)||cost<0)throw Error('Revisá los datos de la compra.');
  const selectedId=$('#resalePartyForm').dataset.partyId;let party = selectedId?state.resale.parties.find(p=>p.id===selectedId):state.resale.parties.find(p=>p.name.toLowerCase()===name.toLowerCase()&&p.date===date);
  if (!party) {
    party = { id: uid(), name, date, tickets: [] };
    state.resale.parties.push(party);
  } else if (date) party.date = date;
  const sameType = Math.max(0,...party.tickets.filter(t=>t.type.toLowerCase()===type.toLowerCase()).map(t=>Number(t.number)||0));
  for (let i = 1; i <= qty; i++) party.tickets.push({ id: uid(), type, number: sameType + i, cost, salePrice: 0, status: 'Disponible',purchaseDate:$('#resalePurchaseDate').value,sellerId:'purchase-default',sellerName:'Reparto de compra',sellerPercent:resaleSplit().sellerPercent });
}
let pendingResaleImport=null;
async function ensureExcelReader(){
  if(window.XLSX)return window.XLSX;
  const sources=[
    new URL('../vendor/xlsx-0.20.3.js',import.meta.url).href
  ];
  for(const source of sources){
    try {
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src=source;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Sin conexión al lector Excel'));};
        document.head.append(script);
      });
      if(window.XLSX)return window.XLSX;
    }catch{}
  }
  throw new Error('No se pudo cargar el lector de Excel. Revisá la conexión a Internet.');
}
function resaleImportTicketLabel(row){
  if(!row)return 'No figura';
  return `${row.partyName?row.partyName+' · ':''}${row.type} #${row.number}${row.purchaseDate?' · Compra '+row.purchaseDate:''} · Costo ${money(row.cost,'ARS')} · Venta ${money(row.salePrice,'ARS')} · ${row.status}`;
}
function showResaleImportReview(fileName,parsed,comparison){
  pendingResaleImport={fileName,parsed,comparison,baseline:JSON.stringify(state.resale)};
  $('#resaleImportSummary').textContent=`${integerText(parsed.rows.length)} entradas leídas · ${integerText(comparison.matched)} coinciden · ${integerText(comparison.issues.length)} diferencias para revisar.`;
  $('#resaleImportWarnings').innerHTML=(parsed.warnings.length||parsed.partyMerges?.length)?
    `<strong>Revisión del archivo</strong>${(parsed.partyMerges||[]).map(m=>`<p>Se unen ${escape(m.sourceNames.join(' y '))} en ${escape(m.targetName)}, conservando cada entrada.</p>`).join('')}${parsed.warnings.map((warning)=>`<p>${escape(warning)}</p>`).join('')}`:'';
  $('#resaleImportDifferences').innerHTML=comparison.issues.length?
    comparison.issues.map((issue)=>{
      const source=issue.imported;
      const current=issue.current?{...issue.current,partyName:issue.current.partyName||source?.partyName||''}:null;
      const label=issue.kind==='new'?'Entrada nueva en Excel':issue.kind==='onlyApp'?'Sólo existe en la app':'Datos diferentes';
      const selected=issue.kind==='new'?'excel':'app';
      const choices=issue.kind==='onlyApp'?
        '<option value="app">Mantener en la app</option><option value="remove">Eliminar de la app</option>':
        issue.kind==='new'?
        '<option value="excel">Agregar desde Excel</option><option value="app">No importar esta entrada</option><option value="manual">Corregir manualmente</option>':
        '<option value="app">Conservar datos de la app</option><option value="excel">Usar datos del Excel</option><option value="manual">Corregir manualmente</option>';
      return `<article class="resale-import-row"><strong>${escape(source?.partyName||current?.partyName||'')} · ${escape(source?.type||current?.type||'')} #${integerText(source?.number||current?.number||0)}</strong>
        <small>${label}${issue.fields.length?' · Cambian: '+escape(issue.fields.join(', ')):''}</small>
        <div>App: ${escape(resaleImportTicketLabel(current))}</div>
        <div>Excel: ${escape(resaleImportTicketLabel(source))}</div>
        <select class="resale-import-decision" data-import-id="${escape(issue.id)}" aria-label="Resolver diferencia">${choices}</select>
        ${source?`<div class="resale-import-manual hidden" data-manual-import-id="${escape(issue.id)}">
          <label>Costo compra<input class="import-cost" inputmode="decimal" data-local-number="2" value="${formatNumericInputValue(source.cost,{maximumFractionDigits:2})}"></label>
          <label>Precio venta<input class="import-sale" inputmode="decimal" data-local-number="2" value="${formatNumericInputValue(source.salePrice,{maximumFractionDigits:2})}"></label>
          <label>Estado<select class="import-status">${['Disponible','Vendida','Uso personal'].map((s)=>`<option ${s===source.status?'selected':''}>${s}</option>`).join('')}</select></label>
        </div>`:''}
      </article>`;
    }).join(''):'<div class="empty">No hay diferencias con lo que ya está cargado en la app.</div>';
  $('#resaleImportDifferences').querySelectorAll('.resale-import-decision').forEach((select)=>{
    select.onchange=()=>{
      const manual=$('#resaleImportDifferences').querySelector(`[data-manual-import-id="${select.dataset.importId}"]`);
      manual?.classList.toggle('hidden',select.value!=='manual');
    };
  });
  bindLocalizedNumberInputs($('#resaleImportDifferences'));
  $('#resaleImportReview').showModal();
}
async function readResaleExcelFile(file){
  if(!file)return;if(file.size>15*1024*1024)return showToast('El archivo supera los 15 MB. Dividilo en planillas más pequeñas.');
  try{
    $('#importResaleExcel').disabled=true;
    let parsed;
    if(/\.json$/i.test(file.name))parsed=parseResaleUpdate(JSON.parse(await file.text()));
    else{
      const XLSX=await ensureExcelReader();
      const templateBytes=await file.arrayBuffer();const wb=XLSX.read(templateBytes,{type:'array'});
      const sheetName=wb.SheetNames.find((name)=>/ventas?/i.test(name))||wb.SheetNames[0];
      if(!sheetName)throw new Error('El archivo no contiene hojas.');
      const sheets=Object.fromEntries(wb.SheetNames.map((name)=>[name,XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true})]));
      parsed=attachExcelRates(XLSX,wb,parseBusinessWorkbook(sheets,state.resale.parties));
    }
    const blockers=[...(parsed.blockers||[]),...(parsed.warnings||[]).filter(w=>/se omiti[oó]/i.test(w))];
    if(blockers.length)throw new Error('Importación bloqueada: '+blockers.join(' '));
    if(!parsed.rows.length)throw new Error(parsed.warnings.join(' ')||'No pude encontrar entradas en la planilla.');
    const comparison=compareBusinessImport(parsed.rows,mergeResaleParties(state.resale.parties,parsed.partyMerges||[]));
    if(/\.xlsx$/i.test(file.name))parsed.excelTemplate=captureTemplate(await file.arrayBuffer(),file.name);showResaleImportReview(file.name,parsed,comparison);
  }catch(error){showToast(error.message||'No pude leer el archivo.');}
  finally{$('#importResaleExcel').disabled=false;$('#resaleImportFile').value='';}
}

async function exportResaleCsv(){
 try{const XLSX=await ensureExcelReader();const bytes=exportOriginalTemplate(XLSX,state.resale),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download='reventa-entradas.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Excel exportado con sus fórmulas originales. Abrilo en Excel para recalcular los resultados.');}catch(error){showToast('No se pudo exportar: '+error.message);}
}




$('#addResaleParty').onclick = () => {delete $('#resalePartyForm').dataset.partyId;
  $('#resalePartyForm').reset();
  $('#resaleQty').value=1;$('#resalePurchaseDate').value=new Date().toLocaleDateString('en-CA');
  $('#resalePartyDialog').showModal();
};
$('#addResaleEvent').onclick = () => {
  $('#resaleEventForm').reset();
  $('#resaleEventDialog').showModal();
};
$('#resaleEventForm').onsubmit = (event) => {
  event.preventDefault();
  const name=$('#resaleEventName').value.trim().toUpperCase();
  const date=$('#resaleEventDate').value;
  if(!name)return showToast('Ingresá el nombre de la fiesta');
  if(!date)return showToast('Ingresá la fecha de la fiesta');
  if(state.resale.parties.some((party)=>String(party.name||'').trim().toLocaleLowerCase('es-AR')===name.toLocaleLowerCase('es-AR'))){
    return showToast('Esa fiesta ya está cargada');
  }
  state.resale.parties.push({id:uid(),name,date,tickets:[]});
  save();$('#resaleEventDialog').close();renderResale();showToast('✓ Fiesta agregada');
};
$('#resalePartyForm').onsubmit = (event) => {
  event.preventDefault();
  const resaleCost=localizedInputNumber('#resaleCost');
  if(!Number.isFinite(resaleCost)||resaleCost<0)return showToast('Ingresá un costo válido');
  addResaleBatch({
    name: $('#resalePartyName').value.trim(),
    date: $('#resalePartyDate').value,
    type: $('#resaleTicketType').value.trim(),
    qty: Number($('#resaleQty').value || 1),
    cost: resaleCost
  });
  save(); event.target.reset(); $('#resaleQty').value = 1; $('#resalePartyDialog').close(); renderResale(); showToast('Compra agregada');
};
$('#editResaleSplit').onclick = () => {
  const split = resaleSplit(); $('#ownerPercent').value = split.ownerPercent; $('#sellerPercent').value = split.sellerPercent; $('#resaleSplitDialog').showModal();
};
$('#ownerPercent').oninput = () => { const v = Math.max(0, Math.min(100, Number($('#ownerPercent').value || 0))); $('#sellerPercent').value = 100 - v; };
$('#sellerPercent').oninput = () => { const v = Math.max(0, Math.min(100, Number($('#sellerPercent').value || 0))); $('#ownerPercent').value = 100 - v; };
$('#resaleSplitForm').onsubmit = (event) => {
  event.preventDefault(); const split = normalizeSplit($('#ownerPercent').value, $('#sellerPercent').value);
  state.resale=freezeExistingSplit(state.resale);state.resale.ownerPercent = split.ownerPercent; state.resale.sellerPercent = split.sellerPercent;
  save(); $('#resaleSplitDialog').close(); renderResale(); showToast('Reparto actualizado para próximas compras. Las anteriores conservan sus porcentajes.');
};
$('#saveResaleSales').onclick=saveAllResaleSales;
$('#exportResale').onclick = exportResaleCsv;
$('#importResaleExcel').onclick=()=>$('#resaleImportFile').click();
$('#resaleImportFile').onchange=(event)=>readResaleExcelFile(event.target.files?.[0]);
$('#applyResaleImport').onclick=()=>{
  if(!pendingResaleImport)return;
  if(JSON.stringify(state.resale)!==pendingResaleImport.baseline)return showToast('La Reventa cambió durante la revisión. Volvé a abrir la planilla para comparar los datos actuales.');
  const issues=pendingResaleImport.comparison.issues.map((issue)=>({...issue,imported:issue.imported?{...issue.imported}:null}));
  const decisions={};
  for(const select of $('#resaleImportDifferences').querySelectorAll('.resale-import-decision')){
    const id=select.dataset.importId;
    const issue=issues.find((item)=>item.id===id);
    if(!issue)continue;
    decisions[id]=select.value;
    if(select.value!=='manual')continue;
    const row=select.closest('.resale-import-row');
    const cost=parseLocalizedNumber(row.querySelector('.import-cost')?.value||'');
    const sale=parseLocalizedNumber(row.querySelector('.import-sale')?.value||'');
    const status=row.querySelector('.import-status')?.value;
    if(!Number.isFinite(cost)||cost<0||!Number.isFinite(sale)||sale<0||!['Disponible','Vendida','Uso personal'].includes(status)){
      return showToast('Revisá costo, precio y estado de la entrada corregida.');
    }
    if(!issue.imported)return showToast('Esa entrada sólo existe en la app; elegí conservarla o eliminarla.');
    issue.imported={...issue.imported,cost,salePrice:sale,status};
  }
  const applied=issues.filter((issue)=>['excel','manual','remove'].includes(decisions[issue.id])).length;
  const previous=cloneState();
  let verified;
  try{
    saveVerifiedResaleBackup(localStorage,STORAGE_KEY+'-resale-before-import',previous.resale);
    state.resale.parties=applyBusinessImport(mergeResaleParties(state.resale.parties,pendingResaleImport.parsed.partyMerges||[]),issues,decisions,uid);
    verifyBusinessImport(state.resale.parties,issues,decisions);
    verifyResalePreservation(mergeResaleParties(previous.resale.parties,pendingResaleImport.parsed.partyMerges||[]),state.resale.parties,issues,decisions);
    if(pendingResaleImport.parsed.excelTemplate)state.resale.excelTemplate=pendingResaleImport.parsed.excelTemplate;state.resale.importHistory=[...(previous.resale.importHistory||[]),{date:new Date().toISOString(),file:pendingResaleImport.fileName,rows:pendingResaleImport.parsed.rows.length,decisions,changes:issues,partial:issues.some(i=>i.imported&&!['excel','manual'].includes(decisions[i.id]))}];
    if(save()===false)throw new Error('No se pudo verificar el guardado');
    const stored=parseStoredState(safeStoredValue(STORAGE_KEY));
    if(!stored?.resale||JSON.stringify(stored.resale.parties)!==JSON.stringify(state.resale.parties))throw new Error('El respaldo guardado no coincide con la importación');
    verified=verifyBusinessImport(stored.resale.parties,issues,decisions);
  }catch(error){restoreState(previous);renderResale();showToast('Importación no completada: '+error.message);return;}
  renderResale();$('#resaleImportReview').close();pendingResaleImport=null;
  showToast(verified.pending?`Actualización parcial: ${integerText(applied)} cambios guardados · ${integerText(verified.pending)} diferencias conservadas sin importar`:`✓ Importación verificada: ${integerText(verified.parties)} fiestas · ${integerText(verified.tickets)} entradas`);
};
$('#useResaleFile').onclick=()=>{$('#resaleImportDifferences').querySelectorAll('.resale-import-decision').forEach((select)=>{const issue=pendingResaleImport?.comparison.issues.find((i)=>i.id===select.dataset.importId);select.value=issue?.kind==='new'?'excel':'app';select.onchange?.();});};
$('#cancelResaleImport').onclick=()=>{pendingResaleImport=null;$('#resaleImportReview').close();};

document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
window.addEventListener('error',e=>{showToast(e.error?.message||'No se completó la operación.');});
window.addEventListener('unhandledrejection',e=>{showToast(e.reason?.message||'No se completó la operación.');});
bindLocalizedNumberInputs();
bindSellers=installSellers({getState:()=>state,save,render:()=>renderResale(),money,message:showToast});
installSimulator({getState:()=>state,money});
await session.start();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
