import { parseExpenses, parseAmount } from './parser.js';
import { expenseArsEquivalent, boundsForRange, previousBounds, groupExpenses } from './reporting.js';
import { monthKey, itemArsEquivalent, budgetOutcome, stockMetrics, recoveryMonthMetrics, dateWithCardDay, firstDueDateForCard, installmentDueDates } from './finance.js';
const sharedMode = new URLSearchParams(location.search).get('shared') === '1';
const resaleApi = sharedMode ? null : await import('./resale.js');
const normalizeSplit = resaleApi?.normalizeSplit;
const ticketMetrics = resaleApi?.ticketMetrics;
const partyMetrics = resaleApi?.partyMetrics;
const portfolioMetrics = resaleApi?.portfolioMetrics;
const withPortfolioPercent = resaleApi?.withPortfolioPercent;
if (sharedMode) document.querySelectorAll('.owner-only').forEach((el) => el.remove());
const STORAGE_KEY = sharedMode ? 'mis-gastos-shared-v1' : 'mis-gastos-v1';
const defaults = { expenses: [], cards: [], categories: [], subcategories: {}, stock: [], recoveries: [], budgets: {}, recurring: [], trash: [], security: { enabled: false, pinHash: '', pinSalt: '', credentialId: '' }, settings: { reminderDays: [3, 2, 1], usdRateType: 'oficial', usdRateCache: {}, budgetAlerts: [80, 90, 100], hideAmounts: false, consultSpeak: true }, resale: { ownerPercent: 70, sellerPercent: 30, parties: [] }, schemaVersion: 4 };
function loadState() { try { const old = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return { ...defaults, ...old, expenses: old.expenses || [], cards: old.cards || [], categories: old.categories || [], subcategories: old.subcategories || {}, stock: old.stock || [], recoveries: old.recoveries || [], budgets: old.budgets || {}, recurring: old.recurring || [], trash: old.trash || [], security: { ...defaults.security, ...(old.security || {}) }, settings: { ...defaults.settings, ...(old.settings || {}), usdRateCache: old.settings?.usdRateCache || {} }, resale: { ...defaults.resale, ...(old.resale || {}), parties: old.resale?.parties || [] }, schemaVersion: 4 }; } catch { return structuredClone(defaults); } }
const state = loadState();
function demoCardId(){return crypto.randomUUID?.() || ('demo-' + Date.now() + '-' + Math.random().toString(16).slice(2));}
function seedDemoCardsOnce(){
  if(sharedMode || Number(state.settings?.demoCardsSeedVersion||0)>=2) return;
  if(!Array.isArray(state.cards)) state.cards=[];
  state.cards=state.cards.filter((card)=>!card.demo);
  const demos=[
    {name:'Mercado Pago',type:'Débito',closingDay:0,dueDay:0},
    {name:'Brubank',type:'Débito',closingDay:0,dueDay:0},
    {name:'Banco Francés',type:'Crédito',closingDay:20,dueDay:10},
    {name:'Banco Macro',type:'Crédito',closingDay:25,dueDay:12}
  ];
  const existing=new Set(state.cards.map((card)=>`${String(card.name||'').toLowerCase()}|${card.type||''}`));
  demos.forEach((demo)=>{
    const key=`${demo.name.toLowerCase()}|${demo.type}`;
    if(!existing.has(key)) state.cards.push({id:demoCardId(),...demo,demo:true});
  });
  state.settings={...state.settings,demoCardsSeeded:true,demoCardsSeedVersion:2};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
seedDemoCardsOnce();
function purgeExpiredTrash(){const cutoff=Date.now()-30*24*60*60*1000;state.trash=(state.trash||[]).filter((r)=>new Date(r.deletedAt).getTime()>=cutoff);} purgeExpiredTrash();
let selectedDate = new Date(), reportRange = 'month', usdRange = 'month', historyRange = 'today', pending = [], discarded = null, manualStep = 1, editingCardId = null, editingRecurringId = null;
const $ = (s) => document.querySelector(s);
const money = (n, c) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n || 0);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const effectiveDate = (e) => new Date(e.dueDate || e.date);
function renderHomeClock() {
  const now=new Date();
  if($('#homeDate')) $('#homeDate').textContent=now.toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'long'});
  if($('#homeTime')) $('#homeTime').textContent=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
}
function installmentExpenses(expense) { if (expense.method !== 'Crédito') return [expense]; const card = state.cards.find((c) => c.name === expense.card && c.type === 'Crédito'); if (!card) return [expense]; const count = Math.max(1, Number(expense.installments || 1)); const dueDates=installmentDueDates(card,new Date(expense.purchaseDate || expense.date),count); if (count === 1) return [{ ...expense, dueDate: dueDates[0].toISOString(), installment: 1, installments: 1 }]; return dueDates.map((dueDate, i) => ({ ...expense, id: crypto.randomUUID(), parentId: expense.id, dueDate: dueDate.toISOString(), amount: expense.amount / count, installment: i + 1, installments: count })); }
function totals(items) { return ['ARS', 'USD'].map((currency) => items.filter((e) => e.currency === currency).reduce((sum, e) => sum + Number(e.amount), 0)); }
function totalsHTML(items) { const [ars, usd] = totals(items); return `${money(ars, 'ARS')}${usd ? ` · ${money(usd, 'USD')}` : ''}`; }
function purchaseRows(date) { const day = state.expenses.filter((e) => sameDay(e.purchaseDate || e.date, date)); return day.filter((e) => !e.parentId || e.installment === 1); }
function purchaseAmount(e) { return e.parentId ? e.amount * e.installments : e.amount; }
function expenseHTML(e, showDate = false) {
  const detail=[e.category,e.subcategory,e.method,e.card,e.installments>1?`${e.installment||1}/${e.installments}`:null].filter(Boolean).join(' · ');
  const when=new Date(e.purchaseDate||e.date);
  return `<article class="expense" data-expense-id="${escape(e.id)}"><div class="expense-icon">${e.method==='Efectivo'?'◆':'▰'}</div><div class="expense-info"><strong>${escape(e.concept||'Sin detalle')}</strong><span class="meta">${escape(detail)}${showDate?` · ${when.toLocaleDateString('es-AR')} ${when.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`:` · ${when.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`}</span></div><div class="amount">${money(showDate?e.amount:purchaseAmount(e),e.currency)}<small>${e.currency}</small></div>${showDate?`<button class="expense-delete" type="button" data-delete-expense="${escape(e.id)}" aria-label="Eliminar gasto">⌫</button>`:''}</article>`;
}
function render() { renderHomeClock(); const rows = purchaseRows(selectedDate); const dayTotals = ['ARS', 'USD'].map((c) => rows.filter((e) => e.currency === c).reduce((s, e) => s + purchaseAmount(e), 0)); $('#arsTotal').textContent = money(dayTotals[0], 'ARS'); $('#usdTotal').textContent = money(dayTotals[1], 'USD'); $('#expenseList').innerHTML = rows.length ? rows.sort((a, b) => b.date.localeCompare(a.date)).map((e) => expenseHTML(e)).join('') : '<div class="empty">Todavía no registraste gastos este día.</div>'; renderPaymentReminders(); renderCards(); renderReport(); renderUsd(); renderHistory(); renderResale(); renderStock(); renderRecoveries(); renderBudget(); renderSavings(); renderConsultationFilters(); fillCardSelect(); fillCategories(); }
function detectUnusual(day) { const past = state.expenses.filter((e) => !sameDay(e.purchaseDate || e.date, new Date()) && (!e.parentId || e.installment === 1)); const values = past.map(purchaseAmount).sort((a, b) => a - b); const median = values.length ? values[Math.floor(values.length / 2)] : Infinity; $('#unusual').classList.toggle('hidden', !day.some((e) => purchaseAmount(e) > median * 3 && values.length >= 5)); }
function subcategoriesFor(category){
  const values=state.subcategories?.[category];
  return Array.isArray(values)?values:[];
}
function fillSubcategories(selected=''){
  const select=$('#subcategory'); if(!select)return;
  const category=$('#category')?.value||'';
  const values=category?subcategoriesFor(category):[];
  select.innerHTML='<option value="">Sin subcategoría</option>'+values.map((s)=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');
  if(selected&&values.includes(selected))select.value=selected;
  $('#subcategoryWrap')?.classList.toggle('hidden',!category);
  $('#quickSubcategory')?.classList.toggle('hidden',!category);
}
function fillCategories() {
  const selected=$('#category')?.value||'';
  $('#category').innerHTML='<option value="">Sin categoría</option>'+state.categories.map((c)=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  if(selected&&state.categories.includes(selected))$('#category').value=selected;
  $('#categoryList').innerHTML=state.categories.length?state.categories.map((c,i)=>{
    const subs=subcategoriesFor(c);
    return `<article class="settings-item" data-category-index="${i}"><div><strong>${escape(c)}</strong><div class="chips">${subs.length?subs.map((s,si)=>`<button type="button" class="chip" data-delete-subcategory="${si}" data-category-name="${escape(c)}">${escape(s)} <span>×</span></button>`).join(''):'<small class="muted">Sin subcategorías.</small>'}</div></div><div class="mini-actions"><button type="button" data-add-subcategory="${i}">＋ Subcategoría</button><button type="button" data-delete-category="${i}">Eliminar</button></div></article>`;
  }).join(''):'<p class="muted">Creá categorías como quieras; cada una puede tener subcategorías.</p>';
  document.querySelectorAll('[data-add-subcategory]').forEach((b)=>{b.onclick=()=>{const category=state.categories[Number(b.dataset.addSubcategory)];if(!category)return;const value=prompt(`Nueva subcategoría dentro de ${category}:`)?.trim();if(!value)return;const list=subcategoriesFor(category);if(list.some((s)=>s.toLowerCase()===value.toLowerCase()))return showToast('Esa subcategoría ya existe');state.subcategories[category]=[...list,value];save();fillCategories();};});
  document.querySelectorAll('[data-delete-subcategory]').forEach((b)=>{b.onclick=()=>{const category=b.dataset.categoryName;const list=subcategoriesFor(category);const index=Number(b.dataset.deleteSubcategory);if(index<0||index>=list.length)return;state.subcategories[category]=list.filter((_,i)=>i!==index);save();fillCategories();};});
  document.querySelectorAll('[data-delete-category]').forEach((b)=>{b.onclick=()=>{const index=Number(b.dataset.deleteCategory);const category=state.categories[index];if(!category)return;state.categories.splice(index,1);delete state.subcategories[category];save();fillCategories();};});
  fillSubcategories();
}
function fillCardSelect() { const method = $('#method').value; const cards = state.cards.filter((c) => c.type === method); $('#expenseCard').innerHTML = '<option value="">Elegí una tarjeta</option>' + cards.map((c) => `<option value="${escape(c.name)}">${escape(c.name)}</option>`).join(''); $('#noCardsHint').classList.toggle('hidden', method === 'Efectivo' || cards.length > 0); }
function monthlyCardTotal(card, date) { return state.expenses.filter((e) => e.card === card.name && e.method === card.type && effectiveDate(e).getFullYear() === date.getFullYear() && effectiveDate(e).getMonth() === date.getMonth()); }
function nextDue(card, now = new Date()) { const base=dateWithCardDay(now.getFullYear(),now.getMonth(),now.getDate()); let due = dateWithCardDay(base.getFullYear(), base.getMonth(), card.dueDay); if (due < base) due = dateWithCardDay(base.getFullYear(), base.getMonth() + 1, card.dueDay); return due; }
function renderCards() {
  const now = new Date();
  $('#cardList').innerHTML = state.cards.length ? state.cards.map((card, i) => {
    const all = state.expenses.filter((e) => e.card === card.name && e.method === card.type);
    const current = monthlyCardTotal(card, now);
    const accumulated = totalsHTML(all);
    const monthTotal = totalsHTML(current);
    const creditMeta = card.type === 'Crédito'
      ? `Cierra el ${card.closingDay} · Vence el ${card.dueDay}`
      : 'Débito inmediato · sin vencimiento de pago';
    const totalLabel = card.type === 'Crédito' ? 'ACUMULADO DEL MES' : 'TOTAL ACUMULADO';
    const debitDetail = card.type === 'Débito'
      ? `<details class="debit-detail"><summary>Ver movimientos</summary>${all.length ? all.slice().sort((a,b)=>new Date(b.purchaseDate||b.date)-new Date(a.purchaseDate||a.date)).map((e)=>`<div class="due-line"><span>${new Date(e.purchaseDate||e.date).toLocaleDateString('es-AR')} · ${escape(e.concept||'Sin detalle')}</span><strong>${money(e.amount,e.currency)}</strong></div>`).join('') : '<small class="muted">Sin movimientos.</small>'}</details>`
      : '';
    return `<article class="card-item"><div class="top"><strong>${escape(card.name)}</strong><span>${card.type}</span></div>
      <p>${creditMeta}</p><div class="card-total"><small>${totalLabel}</small><strong>${card.type === 'Crédito' ? monthTotal : accumulated}</strong></div>
      ${debitDetail}
      <div class="card-actions"><button class="edit-card" data-card-index="${i}">Editar</button><button class="delete-card" data-card-index="${i}">Eliminar</button></div></article>`;
  }).join('') : '<div class="empty">No agregaste tarjetas todavía.</div>';

  document.querySelectorAll('.edit-card').forEach((b) => {
    b.onclick = () => {
      const card = state.cards[Number(b.dataset.cardIndex)];
      if (!card) return;
      editingCardId = card.id;
      $('#cardDialog h2').textContent = 'Editar tarjeta';
      $('#cardName').value = card.name;
      $('#cardType').value = card.type;
      $('#closingDay').value = card.closingDay || 25;
      $('#dueDay').value = card.dueDay || 10;
      $('#creditCardDates').classList.toggle('hidden', card.type !== 'Crédito');
      $('#cardDialog').showModal();
    };
  });
  document.querySelectorAll('.delete-card').forEach((b) => {
    b.onclick = () => {
      const card=state.cards[Number(b.dataset.cardIndex)];
      const linked=(state.recurring||[]).filter((r)=>r.card===card?.name&&r.method===card?.type);
      const message=linked.length
        ? `¿Eliminar ${card.name}? Los gastos guardados no se borrarán. ${linked.length} gasto(s) recurrente(s) quedarán desactivados.`
        : '¿Eliminar esta tarjeta? Los gastos guardados no se borrarán.';
      if (!confirm(message)) return;
      if(card) state.recurring.forEach((r)=>{if(r.card===card.name&&r.method===card.type){r.card='';r.active=false;}});
      state.cards.splice(Number(b.dataset.cardIndex), 1);
      save(); render();
    };
  });

  const credit = state.cards.filter((c) => c.type === 'Crédito');
  $('#dueList').innerHTML = credit.length ? credit.map((c) => {
    const due = nextDue(c);
    const items = monthlyCardTotal(c, due).slice().sort((a,b) => effectiveDate(a) - effectiveDate(b));
    const details = items.length ? items.map((e) => `<div class="due-line"><span>${escape(e.concept || 'Sin detalle')}${e.installments > 1 ? ` · cuota ${e.installment || 1} de ${e.installments}` : ''}</span><strong>${money(e.amount,e.currency)}</strong></div>`).join('') : '<small class="muted">Sin consumos para este vencimiento.</small>';
    return `<article class="due-item"><div class="due-main"><strong>${escape(c.name)}</strong><p>Próximo vencimiento: ${due.toLocaleDateString('es-AR')}</p><strong class="due-total">${totalsHTML(items)}</strong><div class="due-lines">${details}</div></div></article>`;
  }).join('') : '<div class="empty">Agregá una tarjeta de crédito para ver vencimientos.</div>';

  $('#cardHistory').innerHTML = credit.map((c) => `<details class="history-card"><summary>${escape(c.name)}</summary>${Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const items = monthlyCardTotal(c, d);
    const lines = items.map((e) => `<small>${escape(e.concept || 'Sin detalle')}${e.installments > 1 ? ` · ${e.installment || 1} de ${e.installments}` : ''}: ${money(e.amount,e.currency)}</small>`).join('');
    return `<div class="history-row"><div><span>${d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</span>${lines}</div><strong>${totalsHTML(items)}</strong></div>`;
  }).join('')}</details>`).join('');
}
function renderPaymentReminders() { const today = new Date(); today.setHours(12, 0, 0, 0); const allowed = state.settings.reminderDays; const reminders = state.cards.filter((c) => c.type === 'Crédito').map((card) => ({ card, due: nextDue(card, today) })).map((x) => ({ ...x, days: Math.round((x.due - today) / 86400000) })).filter((x) => allowed.includes(x.days)); $('#paymentReminders').innerHTML = reminders.map(({ card, due, days }) => `<article class="payment-alert"><span>▰</span><div><strong>${days ? `Vence en ${days} día${days > 1 ? 's' : ''}` : 'Vence hoy'} · ${escape(card.name)}</strong><small>Disponible necesario: ${totalsHTML(monthlyCardTotal(card, due))}</small></div></article>`).join(''); }
function years() { const now = new Date().getFullYear(); return Array.from(new Set([now, ...state.expenses.map((e) => effectiveDate(e).getFullYear())])).sort((a, b) => b - a); }
function chartHTML(items, currency) { const months = Array.from({ length: 12 }, (_, m) => items.filter((e) => effectiveDate(e).getMonth() === m && e.currency === currency).reduce((s, e) => s + e.amount, 0)); const max = Math.max(...months, 1); return months.map((v, i) => `<div class="bar ${currency === 'USD' ? 'usd' : ''}" style="height:${v / max * 100}%" title="${money(v, currency)}"><span>${'EFMAMJJASOND'[i]}</span></div>`).join(''); }

function reportLabel(range, from, to) {
  if (range === 'today') return from.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
  if (range === 'week') return `${from.toLocaleDateString('es-AR')} al ${to.toLocaleDateString('es-AR')}`;
  if (range === 'month') return from.toLocaleDateString('es-AR', { month:'long', year:'numeric' });
  return `${from.toLocaleDateString('es-AR')} al ${to.toLocaleDateString('es-AR')}`;
}
function renderReportRows(target, rows, kind) {
  target.innerHTML = rows.length ? rows.map((r) => `<button class="report-row" data-report-kind="${kind}" data-report-key="${escape(r.key)}"><span><strong>${escape(r.key)}</strong><small>${r.count} movimiento${r.count === 1 ? '' : 's'}${r.usd ? ` · ${money(r.usd,'USD')}` : ''}</small></span><strong>${money(r.arsEquivalent,'ARS')}</strong></button>`).join('') : '<div class="empty">Sin movimientos.</div>';
}
function renderReportChart(rows){
  const target=$('#reportChart'); if(!target)return;
  const top=rows.slice(0,6), max=Math.max(...top.map((r)=>r.arsEquivalent),1);
  target.innerHTML=top.length?top.map((r)=>`<div class="report-chart-row"><span>${escape(r.key)}</span><div><i style="width:${Math.max(2,r.arsEquivalent/max*100)}%"></i></div><strong>${money(r.arsEquivalent,'ARS')}</strong></div>`).join(''):'<div class="empty">Sin datos para graficar.</div>';
}
function renderReport() {
  if (!$('#reportCategories')) return;
  const [from,to] = boundsForRange(reportRange,new Date(),$('#fromDate').value,$('#toDate').value);
  const [prevFrom,prevTo] = previousBounds(from,to);
  const items = state.expenses.filter((e) => effectiveDate(e) >= from && effectiveDate(e) <= to);
  const prevItems = state.expenses.filter((e) => effectiveDate(e) >= prevFrom && effectiveDate(e) <= prevTo);
  const [ars,usd] = totals(items);
  const combined = items.reduce((s,e) => s + expenseArsEquivalent(e),0);
  const prevCombined = prevItems.reduce((s,e) => s + expenseArsEquivalent(e),0);
  $('#reportTitle').textContent = reportLabel(reportRange,from,to);
  $('#reportArs').textContent = money(ars,'ARS');
  $('#reportUsd').textContent = money(usd,'USD');
  $('#reportCombinedArs').textContent = money(combined,'ARS');
  const diff = prevCombined ? ((combined-prevCombined)/prevCombined)*100 : null;
  $('#reportComparison').textContent = diff == null ? 'Sin período previo' : `${diff >= 0 ? '+' : ''}${diff.toLocaleString('es-AR',{maximumFractionDigits:1})}%`;
  const categoryRows=groupExpenses(items,e=>e.category || 'Sin categoría');
  renderReportChart(categoryRows);
  renderReportRows($('#reportCategories'),categoryRows,'category');
  renderReportRows($('#reportMethods'),groupExpenses(items,e=>e.method || 'Sin definir'),'method');
  const top = items.slice().sort((a,b)=>expenseArsEquivalent(b)-expenseArsEquivalent(a)).slice(0,8);
  $('#reportTop').innerHTML = top.length ? top.map((e) => `<button class="report-row report-expense"><span><strong>${escape(e.concept || 'Sin detalle')}</strong><small>${new Date(e.purchaseDate || e.date).toLocaleDateString('es-AR')} · ${escape(e.category || 'Sin categoría')} · ${escape(e.method || '')}</small></span><strong>${money(e.amount,e.currency)}</strong></button>`).join('') : '<div class="empty">Sin movimientos.</div>';
  $('#reportDrilldown').classList.add('hidden');
  document.querySelectorAll('[data-report-kind]').forEach((b) => b.onclick = () => {
    const kind=b.dataset.reportKind, key=b.dataset.reportKey;
    const filtered=items.filter((e)=> (kind==='category' ? (e.category || 'Sin categoría') : (e.method || 'Sin definir')) === key);
    $('#reportDrilldown').innerHTML=`<div class="report-drill-head"><strong>${escape(key)}</strong><button id="closeReportDetail">Cerrar</button></div>${filtered.map((e)=>expenseHTML(e,true)).join('')}`;
    $('#reportDrilldown').classList.remove('hidden');
    $('#closeReportDetail').onclick=()=>$('#reportDrilldown').classList.add('hidden');
  });
}

const USD_RATE_ENDPOINTS = {
  oficial: 'https://dolarapi.com/v1/dolares/oficial',
  tarjeta: 'https://dolarapi.com/v1/dolares/tarjeta',
  bolsa: 'https://dolarapi.com/v1/dolares/bolsa',
  blue: 'https://dolarapi.com/v1/dolares/blue'
};
async function ensureUsdRate(force=false) {
  const type=state.settings.usdRateType || 'oficial';
  const cached=state.settings.usdRateCache?.[type];
  const fresh=cached && (Date.now()-new Date(cached.fetchedAt).getTime() < 30*60*1000);
  if (!force && fresh) return cached;
  try {
    const response=await fetch(USD_RATE_ENDPOINTS[type],{cache:'no-store'});
    if (!response.ok) throw new Error('rate');
    const data=await response.json();
    const rate=Number(data.venta || data.compra || 0);
    if (!rate) throw new Error('rate');
    const item={rate,name:data.nombre || type,source:'DolarApi',updatedAt:data.fechaActualizacion || new Date().toISOString(),fetchedAt:new Date().toISOString(),type};
    state.settings.usdRateCache ||= {};
    state.settings.usdRateCache[type]=item; save();
    return item;
  } catch {
    return cached || null;
  }
}
async function stampUsdExpense(expense) {
  if (expense.currency !== 'USD') return expense;
  const rate=await ensureUsdRate(false);
  if (!rate) return expense;
  return {...expense,fxRate:rate.rate,fxRateName:rate.name,fxRateSource:rate.source,fxRateUpdatedAt:rate.updatedAt,fxCapturedAt:new Date().toISOString(),fxType:rate.type};
}
function usdBounds() {
  return boundsForRange(usdRange,new Date(),$('#usdFromDate')?.value,$('#usdToDate')?.value);
}
function renderUsd() {
  if (!$('#usdExpenseList')) return;
  const type=state.settings.usdRateType || 'oficial';
  $('#usdRateType').value=type;
  const rate=state.settings.usdRateCache?.[type];
  $('#usdRateValue').textContent=rate ? money(rate.rate,'ARS') + ' / USD' : '—';
  $('#usdRateMeta').textContent=rate ? `${rate.name} · ${rate.source} · ${new Date(rate.updatedAt).toLocaleString('es-AR')}` : 'Todavía no se obtuvo la cotización';
  const [from,to]=usdBounds();
  const items=state.expenses.filter((e)=>e.currency==='USD' && effectiveDate(e)>=from && effectiveDate(e)<=to).sort((a,b)=>effectiveDate(b)-effectiveDate(a));
  const totalUsd=items.reduce((s,e)=>s+Number(e.amount||0),0);
  const totalArs=items.reduce((s,e)=>s+expenseArsEquivalent(e),0);
  const missing=items.filter((e)=>!Number(e.fxRate)).length;
  $('#usdSectionTotal').textContent=money(totalUsd,'USD');
  $('#usdSectionArs').textContent=money(totalArs,'ARS');
  $('#usdMissingRates').classList.toggle('hidden',missing===0);
  $('#usdMissingRates').textContent=missing ? `${missing} gasto${missing===1?'':'s'} anterior${missing===1?'':'es'} no tiene${missing===1?'':'n'} cotización histórica guardada y no se recalcula${missing===1?'':'n'} con una cotización nueva.` : '';
  $('#usdExpenseList').innerHTML=items.length ? items.map((e)=>{
    const when=new Date(e.purchaseDate || e.date);
    const eq=expenseArsEquivalent(e);
    return `<article class="usd-expense"><div><strong>${escape(e.concept || 'Sin detalle')}</strong><span>${when.toLocaleDateString('es-AR')} · ${escape(e.category || 'Sin categoría')}</span><small>${e.fxRate ? `Cotización ${money(e.fxRate,'ARS')} · ${escape(e.fxRateName || e.fxType || '')} · ${e.fxRateUpdatedAt ? new Date(e.fxRateUpdatedAt).toLocaleString('es-AR') : ''}` : 'Sin cotización histórica'}</small></div><div><strong>${money(e.amount,'USD')}</strong><span>${e.fxRate ? money(eq,'ARS') : '—'}</span></div></article>`;
  }).join('') : '<div class="empty">No hay gastos en dólares en este período.</div>';
}
function historyBounds() { const now = new Date(); if (historyRange === 'today') return [new Date(now.getFullYear(), now.getMonth(), now.getDate()), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)]; if (historyRange === 'day') { const d = new Date($('#historyDate').value || now); return [new Date(d.getFullYear(), d.getMonth(), d.getDate()), new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59)]; } if (historyRange === 'month') { const [y, m] = ($('#historyMonth').value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number); return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59)]; } if (historyRange === 'year') { const y = Number($('#historyYear').value || now.getFullYear()); return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59)]; } const from = new Date($('#historyFrom').value || '2000-01-01'), to = new Date($('#historyTo').value || '2100-01-01'); to.setHours(23, 59); return [from, to]; }
function renderHistory() { $('#historyYear').innerHTML = years().map((y) => `<option>${y}</option>`).join(''); const [from, to] = historyBounds(); const items = state.expenses.filter((e) => effectiveDate(e) >= from && effectiveDate(e) <= to).sort((a, b) => effectiveDate(b) - effectiveDate(a)); const [ars, usd] = totals(items); $('#historyArs').textContent = money(ars, 'ARS'); $('#historyUsd').textContent = money(usd, 'USD'); $('#historyList').innerHTML = items.length ? items.map((e) => expenseHTML(e, true)).join('') : '<div class="empty">No hay movimientos en este período.</div>'; }
function showToast(message, undo = false) { const toast = $('#toast'); toast.textContent = undo ? `${message} · DESHACER` : message; toast.classList.add('show'); toast.style.pointerEvents = undo ? 'auto' : 'none'; toast.onclick = undo ? () => { if (discarded) pending.splice(discarded.index, 0, discarded.item); discarded = null; showPending(); showToast('Gasto recuperado'); } : null; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500); }
function feedback(ok) { navigator.vibrate?.(ok ? 50 : [120, 50, 120]); try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = ok ? 720 : 180; gain.gain.value = .035; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (ok ? .08 : .16)); } catch {} }
let tapAudioContext=null;
function softTapFeedback(){
  navigator.vibrate?.(10);
  try {
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    if(!tapAudioContext)tapAudioContext=new AudioCtx();
    if(tapAudioContext.state==='suspended')tapAudioContext.resume?.().catch?.(()=>{});
    const osc=tapAudioContext.createOscillator(),gain=tapAudioContext.createGain();
    osc.frequency.value=520; gain.gain.value=.012;
    osc.connect(gain).connect(tapAudioContext.destination); osc.start(); osc.stop(tapAudioContext.currentTime+.025);
  } catch {}
}
document.addEventListener('pointerdown',(event)=>{const button=event.target.closest?.('button');if(!button||button.disabled)return;softTapFeedback();},{passive:true});
function setManualStep(step) { manualStep = step; document.querySelectorAll('.step').forEach((e) => e.classList.toggle('active', Number(e.dataset.step) === step)); $('#stepLabel').textContent = `PASO ${step} DE 3`; $('#expenseDialogTitle').textContent = ['¿Cuánto gastaste?', 'Elegí una categoría', '¿Cómo pagaste?'][step - 1]; $('#prevStep').classList.toggle('hidden', step === 1); $('#nextStep').classList.toggle('hidden', step === 3); $('#saveExpense').classList.toggle('hidden', step !== 3); }
function openExpense(data = {}) { $('#expenseForm').reset(); $('#amount').value = data.amount || ''; $('#concept').value = data.concept === 'Sin concepto' ? '' : data.concept || ''; const voiceNeedsMethod=data.source==='voice'&&data.method==='Sin definir'; $('#method').value = voiceNeedsMethod ? '' : data.method || 'Efectivo'; $('#installments').value = data.installments || 1; document.querySelector(`[name=currency][value=${data.currency || 'ARS'}]`).checked = true; fillCategories(); $('#category').value = data.category || ''; fillSubcategories(data.subcategory || ''); setManualStep(voiceNeedsMethod ? 3 : 1); updatePaymentFields(); $('#expenseCard').value = data.card || ''; updateInstallmentPreview(); $('#expenseDialog').showModal(); }
function updatePaymentFields() { const method = $('#method').value; $('#cardFields').classList.toggle('hidden', !method || method === 'Efectivo'); $('#creditFields').classList.toggle('hidden', method !== 'Crédito'); fillCardSelect(); updateInstallmentPreview(); }
function updateInstallmentPreview() { const card = state.cards.find((c) => c.name === $('#expenseCard').value && c.type === $('#method').value), count = Number($('#installments').value || 1), amount = Number($('#amount').value || 0); if ($('#method').value !== 'Crédito' || !card || !amount) return $('#installmentPreview').innerHTML = ''; const due = firstDueDateForCard(card); $('#installmentPreview').innerHTML = `<strong>${count} × ${money(amount / count, document.querySelector('[name=currency]:checked').value)}</strong><span>Primera cuota ${due.toLocaleDateString('es-AR')}; luego vence el día ${card.dueDay} de cada mes.</span>`; }
function pendingCreditDetail(e){
  if(e.method!=='Crédito'||!e.card||!e.amount||e.installmentsSpecified===false)return '';
  const card=state.cards.find((c)=>c.name===e.card&&c.type==='Crédito'); if(!card)return '';
  const count=Math.max(1,Number(e.installments||1));
  const due=firstDueDateForCard(card,new Date(e.purchaseDate||e.date));
  return `<div class="pending-credit-detail"><span>${count} cuota${count===1?'':'s'} de <strong>${money(Number(e.amount)/count,e.currency)}</strong></span><span>Primera cuota: <strong>${due.toLocaleDateString('es-AR')}</strong></span></div>`;
}
function normVoiceChoice(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function pendingDatePrompt(e,i){
  if(!e.dateAmbiguous)return '';
  const choices=Array.isArray(e.dateChoices)?e.dateChoices:[];
  return `<div class="pending-payment-question"><strong>¿Qué fecha quisiste decir?</strong>${choices.length?`<div class="pending-payment-actions">${choices.map((choice,choiceIndex)=>`<button type="button" data-pending-date-choice="${choiceIndex}" data-index="${i}">${escape(choice.label)}</button>`).join('')}</div>`:'<small class="muted">La fecha quedó ambigua. Corregila antes de confirmar.</small>'}</div>`;
}
function pendingPaymentPrompt(e,i){
  const needsMethod=e.method==='Sin definir';
  const needsCard=['Débito','Crédito'].includes(e.method)&&!e.card;
  const needsInstallments=e.method==='Crédito'&&e.installmentsSpecified===false;
  if(needsMethod){
    return `<div class="pending-payment-question"><strong>¿Con qué pagaste?</strong><div class="pending-payment-actions"><button type="button" data-pending-method="Efectivo" data-index="${i}">Efectivo</button><button type="button" data-pending-method="Débito" data-index="${i}">Débito</button><button type="button" data-pending-method="Crédito" data-index="${i}">Crédito</button><button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Responder</button></div></div>`;
  }
  if(needsCard){
    const cards=state.cards.filter((c)=>c.type===e.method);
    return `<div class="pending-payment-question"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class="pending-card-select" data-index="${i}"><option value="">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('')}</select>`:'<small class="muted">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<div class="pending-payment-actions"><button type="button" class="secondary pending-back" data-pending-back="method" data-index="${i}">← Atrás</button><button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Responder por voz</button></div></div>`;
  }
  if(needsInstallments){
    return `<div class="pending-payment-question"><strong>¿En cuántas cuotas?</strong><select class="pending-installments-select" data-index="${i}"><option value="">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value="${n}">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><div class="pending-payment-actions"><button type="button" class="secondary pending-back" data-pending-back="card" data-index="${i}">← Atrás</button><button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Responder por voz</button></div></div>`;
  }
  return '';
}
function applyPendingPaymentVoice(index,phrase){
  const item=pending[index]; if(!item)return;
  const spoken=normVoiceChoice(phrase);
  let method=item.method;
  if(/\befectivo\b/.test(spoken)) method='Efectivo';
  else if(/\bdebito\b/.test(spoken)) method='Débito';
  else if(/\bcredito\b/.test(spoken)) method='Crédito';
  if(method==='Sin definir'){showToast('Decí efectivo, débito o crédito');return;}
  item.method=method;
  if(method==='Efectivo'){item.card='';item.installments=1;item.installmentsSpecified=true;showPending();return;}
  if(method==='Débito'){item.installments=1;item.installmentsSpecified=true;}
  if(method==='Crédito'){
    const installmentDigits=spoken.match(/\b(\d{1,2})(?:\s*cuotas?)?\b/);
    let installmentCount=installmentDigits?Number(installmentDigits[1]):null;
    if(!installmentCount){
      const parsed=Number(parseAmount(spoken));
      if(Number.isInteger(parsed)&&parsed>=1&&parsed<=36) installmentCount=parsed;
    }
    if(installmentCount&&installmentCount<=36){item.installments=installmentCount;item.installmentsSpecified=true;}
    else if(item.installmentsSpecified!==true)item.installmentsSpecified=false;
  }
  const cards=state.cards.filter((c)=>c.type===method);
  const named=cards.find((c)=>spoken.includes(normVoiceChoice(c.name)));
  if(named)item.card=named.name;
  showPending();
  if(!item.card) showToast(cards.length?'Decí o elegí qué tarjeta o cuenta usaste':'Primero agregá una tarjeta o cuenta de este tipo');
}
let pendingVoiceRecognition=null;
function pendingVoiceStartCue(){
  navigator.vibrate?.(25);
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    const ctx=new AudioCtx(),osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.frequency.value=620; gain.gain.value=.02; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+.06);
  }catch{}
}
function startPendingPaymentVoice(index){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const process=(phrase)=>applyPendingPaymentVoice(index,phrase);
  const button=document.querySelector(`[data-pending-pay-voice="${index}"]`);
  const restore=()=>{if(button){button.disabled=false;button.classList.remove('listening');button.textContent='🎙 Responder por voz';}};
  if(pendingVoiceRecognition){showToast('Ya estoy escuchando');return;}
  if(!SR){const phrase=prompt('Decí o escribí el medio, la tarjeta o la cantidad de cuotas.');if(phrase)process(phrase);return;}
  const rec=new SR();pendingVoiceRecognition=rec;rec.lang='es-AR';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;
  let phrase='';
  if(button){button.classList.add('listening');button.textContent='🎙 Escuchando…';}
  pendingVoiceStartCue();
  rec.onstart=()=>{if(button){button.disabled=true;button.classList.add('listening');button.textContent='🎙 Escuchando…';}showToast('🎙 Escuchando…');};
  rec.onresult=(event)=>{phrase=event.results[event.resultIndex][0].transcript.trim();};
  rec.onerror=(event)=>{if(event.error!=='aborted')showToast(event.error==='not-allowed'?'Activá el permiso del micrófono':'No pude escuchar la respuesta');};
  rec.onend=()=>{pendingVoiceRecognition=null;restore();if(phrase)process(phrase);};
  try{rec.start();}catch{pendingVoiceRecognition=null;restore();showToast('No pude iniciar el micrófono');}
}
function showPending() {
  if (!pending.length) { if ($('#confirmDialog').open) $('#confirmDialog').close(); return; }
  $('#pendingList').innerHTML = pending.map((e, i) => {
    const needsMethod=e.method==='Sin definir';
    const needsCard=['Débito','Crédito'].includes(e.method)&&!e.card;
    const needsInstallments=e.method==='Crédito'&&e.installmentsSpecified===false;
    const needsDate=!!e.dateAmbiguous;
    const methodLabel=needsMethod?'Medio de pago pendiente':e.method;
    const when=new Date(e.purchaseDate||e.date);
    const whenLabel=needsDate?'Fecha pendiente':(e.dateSpecified&&!e.timeSpecified?when.toLocaleDateString('es-AR'):when.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}));
    const installmentLabel=e.method==='Crédito'?(needsInstallments?'Cuotas pendientes':`${Math.max(1,Number(e.installments||1))} cuota${Number(e.installments||1)===1?'':'s'}`):'';
    const meta=[whenLabel,e.category,methodLabel,e.card,installmentLabel].filter(Boolean).join(' · ');
    return `<article class="pending" data-index="${i}"><div class="pending-head"><div><strong>${escape(e.concept)}</strong><p class="muted">${escape(meta)}</p></div><strong>${e.amount ? money(e.amount, e.currency) : 'Sin importe'}</strong></div>${pendingCreditDetail(e)}${pendingDatePrompt(e,i)}${pendingPaymentPrompt(e,i)}<div class="actions"><button class="edit">Corregir</button><button class="confirm" ${!e.amount || needsMethod || needsCard || needsInstallments || needsDate ? 'disabled' : ''}>✓ Confirmar</button></div></article>`;
  }).join('');
  if (!$('#confirmDialog').open) $('#confirmDialog').showModal();
  document.querySelectorAll('[data-pending-method]').forEach((button)=>{
    button.onclick=()=>{
      const item=pending[Number(button.dataset.index)]; if(!item)return;
      item.method=button.dataset.pendingMethod; item.card='';
      if(item.method!=='Crédito'){item.installments=1;item.installmentsSpecified=true;}
      else if(item.installmentsSpecified!==true)item.installmentsSpecified=false;
      showPending();
    };
  });
  document.querySelectorAll('[data-pending-back]').forEach((button)=>{
    button.onclick=()=>{
      const item=pending[Number(button.dataset.index)]; if(!item)return;
      if(button.dataset.pendingBack==='method'){
        item.method='Sin definir'; item.card=''; item.installments=1; item.installmentsSpecified=false;
      } else if(button.dataset.pendingBack==='card') {
        item.card='';
      }
      showPending();
    };
  });
  document.querySelectorAll('.pending-card-select').forEach((select)=>{
    select.onchange=()=>{const item=pending[Number(select.dataset.index)];if(!item)return;item.card=select.value;showPending();};
  });
  document.querySelectorAll('.pending-installments-select').forEach((select)=>{
    select.onchange=()=>{const item=pending[Number(select.dataset.index)];if(!item||!select.value)return;item.installments=Math.max(1,Number(select.value));item.installmentsSpecified=true;showPending();};
  });
  document.querySelectorAll('[data-pending-date-choice]').forEach((button)=>{
    button.onclick=()=>{
      const item=pending[Number(button.dataset.index)];if(!item)return;
      const choice=item.dateChoices?.[Number(button.dataset.pendingDateChoice)];if(!choice)return;
      item.date=choice.date;item.purchaseDate=choice.date;item.dateSpecified=true;item.dateAmbiguous=false;showPending();
    };
  });
  document.querySelectorAll('[data-pending-pay-voice]').forEach((button)=>{button.onclick=()=>startPendingPaymentVoice(Number(button.dataset.pendingPayVoice));});
  document.querySelectorAll('.pending').forEach((card) => {
    const index = Number(card.dataset.index);
    card.querySelector('.confirm').onclick = () => confirmPending(index, card);
    card.querySelector('.edit').onclick = () => { const item = pending.splice(index, 1)[0]; $('#confirmDialog').close(); openExpense(item); };
    let startY = 0;
    card.ontouchstart = (ev) => { startY = ev.touches[0].clientY; };
    card.ontouchend = (ev) => { if (startY - ev.changedTouches[0].clientY < 65) return; card.classList.add('removing'); setTimeout(() => { discarded = { item: pending.splice(index, 1)[0], index }; feedback(false); showPending(); showToast('Gasto descartado', true); }, 180); };
  });
}
const uid = () => crypto.randomUUID?.() || ('id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const pct = (n) => `${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
function resaleSplit() { return normalizeSplit(state.resale.ownerPercent, state.resale.sellerPercent); }
function renderResale() {
  if (sharedMode || !$('#resaleList') || !resaleApi) return;
  const split = resaleSplit();
  state.resale.ownerPercent = split.ownerPercent;
  state.resale.sellerPercent = split.sellerPercent;
  const total = withPortfolioPercent(portfolioMetrics(state.resale.parties, split));
  $('#resaleRecovered').textContent = money(total.recovered, 'ARS');
  $('#resaleSales').textContent = money(total.sales, 'ARS');
  $('#resaleNet').textContent = money(total.netGain, 'ARS');
  $('#resaleGainPercent').textContent = `${pct(total.gainPercent)} global de ganancias`;
  $('#resaleOwner').textContent = money(total.totalForOwner, 'ARS');
  $('#resaleSeller').textContent = money(total.sellerGain, 'ARS');
  $('#resaleSplitLabel').textContent = `${split.ownerPercent}% Mauro · ${split.sellerPercent}% vendedor`;
  $('#resaleStock').textContent = `${total.available} disponibles · ${total.sold} vendidas · ${total.personal} uso personal`;
  if ($('#resaleOwnerHead')) $('#resaleOwnerHead').textContent = `Ganancia Mauro (${split.ownerPercent}%)`;
  if ($('#resaleSellerHead')) $('#resaleSellerHead').textContent = `Total vendedor (${split.sellerPercent}%)`;
  if ($('#resaleBalanceBody')) {
    $('#resaleBalanceBody').innerHTML = state.resale.parties.map((party) => {
      const m = partyMetrics(party, split);
      return `<tr><td><strong>${escape(party.name)}</strong></td><td>${money(m.investment,'ARS')}</td><td>${money(m.recovered,'ARS')}</td><td>${money(m.sales,'ARS')}</td><td>${money(m.totalForOwner,'ARS')}</td><td>${money(m.netGain,'ARS')}</td><td>${pct(m.gainPercent)}</td><td>${money(m.ownerGain,'ARS')}</td><td>${money(m.sellerGain,'ARS')}</td></tr>`;
    }).join('');
  }
  if ($('#resaleBalanceTotal')) {
    $('#resaleBalanceTotal').innerHTML = `<tr><th>TOTAL GENERAL</th><th>${money(total.investment,'ARS')}</th><th>${money(total.recovered,'ARS')}</th><th>${money(total.sales,'ARS')}</th><th>${money(total.totalForOwner,'ARS')}</th><th>${money(total.netGain,'ARS')}</th><th>${pct(total.gainPercent)}</th><th>${money(total.ownerGain,'ARS')}</th><th>${money(total.sellerGain,'ARS')}</th></tr>`;
  }
  if (!state.resale.parties.length) {
    $('#resaleList').innerHTML = '<div class="empty">Todavía no cargaste ninguna fiesta. Tocá “＋ Compra” para empezar.</div>';
    return;
  }
  $('#resaleList').innerHTML = state.resale.parties.map((party) => {
    const m = partyMetrics(party, split);
    const tickets = party.tickets.map((ticket) => {
      const tm = ticketMetrics(ticket, split);
      const sold = ticket.status === 'Vendida';
      return `<div class="resale-ticket" data-ticket-id="${escape(ticket.id)}" data-party-id="${escape(party.id)}">
        <div class="resale-ticket-head"><div><strong>${escape(ticket.type)} · #${ticket.number}</strong><small>Costo ${money(ticket.cost, 'ARS')}</small></div><select class="resale-status">
          ${['Disponible','Vendida','Uso personal'].map((s) => `<option ${ticket.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="resale-ticket-sale"><label>Precio de venta<input class="resale-price" type="number" min="0" step="0.01" value="${Number(ticket.salePrice || 0)}"></label>
        <div class="resale-ticket-result"><span>Recuperado <strong>${money(tm.recovered, 'ARS')}</strong></span><span>Ganancia <strong>${money(tm.netGain, 'ARS')}</strong></span><span>% <strong>${sold ? pct(tm.gainPercent) : '—'}</strong></span><span>Mauro <strong>${money(tm.ownerGain, 'ARS')}</strong></span><span>Vendedor <strong>${money(tm.sellerGain, 'ARS')}</strong></span></div></div>
      </div>`;
    }).join('');
    return `<details class="resale-party" data-party-id="${escape(party.id)}"><summary><strong>${escape(party.name)}</strong><span>›</span></summary>
      <div class="resale-party-meta">${party.date ? new Date(party.date + 'T12:00:00').toLocaleDateString('es-AR') : 'Sin fecha'} · ${m.totalTickets} entradas</div>
      <div class="resale-metrics"><div><small>Costo recuperado</small><strong>${money(m.recovered,'ARS')}</strong></div><div><small>Ventas</small><strong>${money(m.sales,'ARS')}</strong></div><div class="metric-wide"><small>Ganancia neta</small><strong>${money(m.netGain,'ARS')}</strong><em>${pct(m.gainPercent)} general</em></div><div><small>Total Mauro</small><strong>${money(m.totalForOwner,'ARS')}</strong></div><div><small>Total vendedor</small><strong>${money(m.sellerGain,'ARS')}</strong></div></div>
      <div class="resale-tickets">${tickets}</div><button class="delete-party" type="button">Eliminar fiesta</button></details>`;
  }).join('');
  document.querySelectorAll('.resale-ticket').forEach((row) => {
    const party = state.resale.parties.find((p) => p.id === row.dataset.partyId);
    const ticket = party?.tickets.find((t) => t.id === row.dataset.ticketId);
    if (!ticket) return;
    row.querySelector('.resale-status').onchange = (e) => { ticket.status = e.target.value; save(); renderResale(); };
    row.querySelector('.resale-price').onchange = (e) => { ticket.salePrice = Number(e.target.value || 0); save(); renderResale(); };
  });
  document.querySelectorAll('.resale-party').forEach((card) => {
    card.querySelector('.delete-party').onclick = () => {
      const party = state.resale.parties.find((p) => p.id === card.dataset.partyId);
      if (!party || !confirm(`¿Eliminar ${party.name} y todas sus entradas?`)) return;
      state.resale.parties = state.resale.parties.filter((p) => p.id !== party.id);
      save(); renderResale();
    };
  });
}
function addResaleBatch({ name, date, type, qty, cost }) {
  let party = state.resale.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!party) {
    party = { id: uid(), name, date, tickets: [] };
    state.resale.parties.push(party);
  } else if (date) party.date = date;
  const sameType = party.tickets.filter((t) => t.type.toLowerCase() === type.toLowerCase()).length;
  for (let i = 1; i <= qty; i++) party.tickets.push({ id: uid(), type, number: sameType + i, cost, salePrice: 0, status: 'Disponible' });
}
function exportResaleCsv() {
  const split = resaleSplit();
  const rows = [['Fiesta','Fecha','Tipo','N°','Costo compra','Precio venta','Estado','Costo recuperado','Ganancia neta','% ganancia','Ganancia Mauro','Ganancia vendedor']];
  state.resale.parties.forEach((party) => party.tickets.forEach((ticket) => {
    const m = ticketMetrics(ticket, split);
    rows.push([party.name,party.date || '',ticket.type,ticket.number,ticket.cost,ticket.salePrice || 0,ticket.status,m.recovered,m.netGain,m.gainPercent,m.ownerGain,m.sellerGain]);
  }));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'reventa-entradas.csv'; a.click(); URL.revokeObjectURL(url);
}


function moveExpenseToTrash(expenseId){
  const item=state.expenses.find((e)=>e.id===expenseId); if(!item)return;
  const key=item.parentId||item.id;
  const items=state.expenses.filter((e)=>(e.parentId||e.id)===key);
  state.expenses=state.expenses.filter((e)=>(e.parentId||e.id)!==key);
  state.trash.push({id:uid(),deletedAt:new Date().toISOString(),items});
  save();render();renderTrash();showToast('Gasto enviado a Papelera');
}
function renderTrash(){
  if(!$('#trashList'))return;purgeExpiredTrash();
  $('#trashList').innerHTML=state.trash.length?state.trash.slice().reverse().map((r)=>{
    const first=r.items[0]||{},total=r.items.reduce((s,e)=>s+Number(e.amount||0),0),days=Math.max(0,30-Math.floor((Date.now()-new Date(r.deletedAt).getTime())/86400000));
    return `<article class="settings-item" data-trash-id="${escape(r.id)}"><div><strong>${escape(first.concept||'Gasto')}</strong><small>${money(total,first.currency||'ARS')} · ${days} días restantes</small></div><div class="mini-actions"><button class="restore-trash" type="button">Restaurar</button><button class="delete-trash" type="button">Eliminar</button></div></article>`;
  }).join(''):'<div class="empty">La Papelera está vacía.</div>';
  document.querySelectorAll('[data-trash-id]').forEach((row)=>{const id=row.dataset.trashId;row.querySelector('.restore-trash').onclick=()=>{const rec=state.trash.find((x)=>x.id===id);if(!rec)return;state.expenses.push(...rec.items);state.trash=state.trash.filter((x)=>x.id!==id);save();render();renderTrash();showToast('Gasto restaurado');};row.querySelector('.delete-trash').onclick=()=>{if(!confirm('¿Eliminar definitivamente este gasto?'))return;state.trash=state.trash.filter((x)=>x.id!==id);save();renderTrash();};});
}
document.addEventListener('click',(e)=>{const b=e.target.closest?.('[data-delete-expense]');if(!b)return;if(confirm('¿Enviar este gasto a Papelera?'))moveExpenseToTrash(b.dataset.deleteExpense);});

function recurringCardOptions(method,selected=''){const cards=state.cards.filter((c)=>c.type===method);return '<option value="">Elegí una tarjeta</option>'+cards.map((c)=>`<option value="${escape(c.name)}" ${c.name===selected?'selected':''}>${escape(c.name)}</option>`).join('');}
function updateRecurringCardField(){const method=$('#recurringMethod').value;$('#recurringCardWrap').classList.toggle('hidden',method==='Efectivo');$('#recurringCard').innerHTML=recurringCardOptions(method,$('#recurringCard').value);}
function openRecurringDialog(item=null){editingRecurringId=item?.id||null;$('#recurringForm').reset();$('#recurringTitle').textContent=item?'Editar recurrente':'Nuevo recurrente';$('#recurringConcept').value=item?.concept||'';$('#recurringAmount').value=item?.amount||'';$('#recurringCurrency').value=item?.currency||'ARS';$('#recurringCategory').value=item?.category||'';$('#recurringMethod').value=item?.method||'Efectivo';$('#recurringDay').value=item?.day||1;updateRecurringCardField();$('#recurringCard').value=item?.card||'';$('#recurringDialog').showModal();}
function renderRecurringSettings(){if(!$('#recurringList'))return;$('#recurringList').innerHTML=state.recurring.length?state.recurring.map((r)=>`<article class="settings-item" data-recurring-id="${escape(r.id)}"><div><strong>${escape(r.concept)}</strong><small>${money(r.amount,r.currency)} · día ${r.day} · ${escape(r.method)}${r.card?' · '+escape(r.card):''}</small></div><div class="mini-actions"><button class="edit-recurring" type="button">Editar</button><button class="toggle-recurring" type="button">${r.active===false?'Activar':'Desactivar'}</button></div></article>`).join(''):'<div class="empty">No configuraste gastos recurrentes.</div>';document.querySelectorAll('[data-recurring-id]').forEach((row)=>{const r=state.recurring.find((x)=>x.id===row.dataset.recurringId);if(!r)return;row.querySelector('.edit-recurring').onclick=()=>openRecurringDialog(r);row.querySelector('.toggle-recurring').onclick=()=>{r.active=r.active===false?true:false;save();renderRecurringSettings();};});}
function prepareRecurringDue(){const now=new Date(),key=monthKey(now),due=[];for(const r of state.recurring){if(r.active===false||Number(r.day||1)>now.getDate()||r.lastPromptedMonth===key)continue;due.push({id:uid(),amount:Number(r.amount),currency:r.currency,concept:r.concept,category:r.category||'',method:r.method,card:r.card||'',installments:1,date:now.toISOString(),purchaseDate:now.toISOString(),source:'recurring',recurringId:r.id});r.lastPromptedMonth=key;}if(due.length){pending.push(...due);save();showPending();}}

function exportRowsForConsultation(){return consultationItems().map((e)=>({Fecha:new Date(e.purchaseDate||e.date).toLocaleString('es-AR'),Concepto:e.concept||'',Categoría:e.category||'',Medio:e.method||'',Tarjeta:e.card||'',Moneda:e.currency,Importe:Number(e.amount||0),Cotización:e.fxRate||'',EquivalenteARS:expenseArsEquivalent(e)}));}
function exportConsultExcel(){
  const rows=exportRowsForConsultation(),headers=Object.keys(rows[0]||{Fecha:'',Concepto:'',Categoría:'',Medio:'',Tarjeta:'',Moneda:'',Importe:'',Cotización:'',EquivalenteARS:''});
  const csv=[headers,...rows.map((r)=>headers.map((h)=>r[h]))].map((row)=>row.map((v)=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='mis-gastos-para-excel.csv';a.click();URL.revokeObjectURL(url);
}
function exportConsultPdf(){const rows=exportRowsForConsultation(),w=window.open('','_blank');if(!w)return showToast('El navegador bloqueó la ventana de exportación');const body=rows.map((r)=>`<tr><td>${escape(r.Fecha)}</td><td>${escape(r.Concepto)}</td><td>${escape(r.Categoría)}</td><td>${escape(r.Medio)}</td><td>${escape(r.Moneda)}</td><td>${escape(r.Importe)}</td><td>${escape(r.EquivalenteARS)}</td></tr>`).join('');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mis Gastos</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:6px;text-align:left}h1{font-size:20px}</style></head><body><h1>Mis Gastos</h1><p>Exportación filtrada</p><table><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Medio</th><th>Moneda</th><th>Importe</th><th>Equiv. ARS</th></tr>${body}</table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}

function bytesToBase64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes)));}
function base64ToBytes(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
function randomBytes(n=32){const a=new Uint8Array(n);crypto.getRandomValues(a);return a;}
async function hashPin(pin,salt){
  const data=new TextEncoder().encode(String(pin)+String(salt));
  const digest=await crypto.subtle.digest('SHA-256',data);
  return bytesToBase64(digest);
}
function biometricAvailable(){return !!(window.PublicKeyCredential&&navigator.credentials&&window.isSecureContext);}
async function registerBiometric(){
  if(!biometricAvailable()) return false;
  const userId=randomBytes(16);
  const credential=await navigator.credentials.create({publicKey:{
    challenge:randomBytes(32),
    rp:{name:'Mis Gastos'},
    user:{id:userId,name:'mis-gastos-local',displayName:'Mis Gastos'},
    pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
    authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},
    timeout:60000,attestation:'none'
  }});
  if(!credential) return false;
  state.security.credentialId=bytesToBase64(credential.rawId);
  return true;
}
async function authenticateBiometric(){
  if(!biometricAvailable()||!state.security.credentialId) return false;
  try{
    const credential=await navigator.credentials.get({publicKey:{
      challenge:randomBytes(32),
      allowCredentials:[{type:'public-key',id:base64ToBytes(state.security.credentialId)}],
      userVerification:'required',timeout:60000
    }});
    return !!credential;
  }catch{return false;}
}
function renderSecurityStatus(){
  if(!$('#securityStatus'))return;
  const enabled=!!state.security.enabled;
  $('#securityStatus').textContent=enabled?(state.security.credentialId?'Face ID activo · PIN de respaldo':'PIN activo · Face ID no configurado'):'Sin protección configurada';
  $('#disableSecurityBtn').classList.toggle('hidden',!enabled);
}
function openSecuritySetup(){
  $('#securitySetupForm').reset();
  $('#securitySetupDialog').showModal();
}
async function unlockWithPin(){
  const pin=$('#unlockPin').value.trim();
  if(!/^\d{4}$/.test(pin)){ $('#lockMessage').textContent='Ingresá los 4 dígitos.'; return false; }
  const hash=await hashPin(pin,state.security.pinSalt);
  if(hash!==state.security.pinHash){ $('#lockMessage').textContent='PIN incorrecto.'; $('#unlockPin').value=''; return false; }
  $('#lockDialog').close(); $('#unlockPin').value=''; $('#lockMessage').textContent=''; setTimeout(prepareRecurringDue,100); return true;
}
async function showAppLock(){
  if(!state.security.enabled||!$('#lockDialog'))return;
  if(!$('#lockDialog').open) $('#lockDialog').showModal();
  $('#lockMessage').textContent='';
  if(state.security.credentialId){
    $('#lockMessage').textContent='Verificando Face ID…';
    const ok=await authenticateBiometric();
    if(ok){$('#lockDialog').close();$('#lockMessage').textContent='';setTimeout(prepareRecurringDue,100);return;}
    $('#lockMessage').textContent='Usá tu PIN de 4 dígitos.';
  }
}
function currentMonthKey() { return monthKey(new Date()); }
function budgetFor(key) { return state.budgets[key] || { amount: 0, reason: '', history: [] }; }
function budgetMetrics(key) { return budgetOutcome(budgetFor(key).amount, state.expenses, state.stock, key); }

function renderBudgetHomeAlert() {
  if (!$('#budgetAlert')) return;
  const key=currentMonthKey(), m=budgetMetrics(key);
  const alert=$('#budgetAlert');
  if (!m.budget) { alert.classList.add('hidden'); return; }
  const thresholds=(state.settings.budgetAlerts || [80,90,100]).slice().sort((a,b)=>a-b);
  const hit=thresholds.filter((t)=>m.percent>=t).pop();
  if (!hit) { alert.classList.add('hidden'); return; }
  alert.classList.remove('hidden');
  alert.textContent=m.excess>0
    ? `⚠ Presupuesto superado: ${money(m.excess,'ARS')} por encima del límite.`
    : `⚠ Usaste ${m.percent.toLocaleString('es-AR',{maximumFractionDigits:0})}% del presupuesto mensual.`;
}

function renderStock() {
  if (!$('#stockList')) return;
  const rows=state.stock.map((p)=>({p,m:stockMetrics(p)}));
  const totalRemaining=rows.reduce((s,x)=>s+x.m.remaining,0);
  const totalValue=rows.reduce((s,x)=>s+x.m.remainingValue,0);
  $('#stockSummary').textContent=`${totalRemaining} unidades disponibles · ${money(totalValue,'ARS')} aprox.`;
  $('#stockList').innerHTML=rows.length ? rows.map(({p,m})=>`<article class="stock-card" data-stock-id="${escape(p.id)}">
    <div class="stock-head"><div><strong>${escape(p.product)}</strong><small>${escape(p.category || 'Sin categoría')} · pagado ${new Date(p.paidDate+'T12:00:00').toLocaleDateString('es-AR')}</small></div><span class="stock-money">${p.currency==='USD' ? money(p.totalAmount,'USD') : money(p.totalAmount,'ARS')}</span></div>
    <div class="stock-stats"><div><span>Comprado</span><strong>${m.qty}</strong></div><div><span>Consumido</span><strong>${m.consumed}</strong></div><div><span>Disponible</span><strong>${m.remaining}</strong></div></div>
    <div class="stock-actions"><button class="consume">Consumir</button><button class="adjust">Ajustar</button></div></article>`).join('') : '<div class="empty">Todavía no cargaste compras de stock.</div>';
  document.querySelectorAll('.stock-card').forEach((card)=>{
    const p=state.stock.find((x)=>x.id===card.dataset.stockId);
    if(!p) return;
    card.querySelector('.consume').onclick=()=>{ const n=Number(prompt(`¿Cuántas unidades de ${p.product} consumiste?`,'1')); if(!n||n<0)return; const m=stockMetrics(p); if(n>m.remaining)return showToast('No hay suficiente stock disponible'); p.consumptions ||= []; p.consumptions.push({id:uid(),quantity:n,date:new Date().toISOString()}); save(); renderStock(); renderBudget(); showToast('Consumo registrado'); };
    card.querySelector('.adjust').onclick=()=>{ const n=Number(prompt('Cantidad total real en stock:',String(stockMetrics(p).remaining))); if(!Number.isFinite(n)||n<0)return; const m=stockMetrics(p); const delta=n-m.remaining; p.quantity=Math.max(0,Number(p.quantity||0)+delta); save(); renderStock(); showToast('Stock ajustado'); };
  });
}

async function addStockPurchase(data) {
  let item={id:uid(),product:data.product,category:data.category,quantity:data.quantity,months:data.months,totalAmount:data.totalAmount,currency:data.currency,paidDate:data.paidDate,consumptions:[]};
  if(item.currency==='USD'){
    const rate=await ensureUsdRate(false);
    if(rate) Object.assign(item,{fxRate:rate.rate,fxRateName:rate.name,fxRateSource:rate.source,fxRateUpdatedAt:rate.updatedAt});
  }
  state.stock.push(item); save();
}

function renderRecoveries() {
  if (!$('#recoveryList')) return;
  const key=$('#recoveryMonth').value || currentMonthKey();
  const m=recoveryMonthMetrics(state.recoveries,state.expenses,key);
  $('#recoveryGross').textContent=money(m.gross,'ARS');
  $('#recoveryTotal').textContent=money(m.recovered,'ARS');
  $('#recoveryNet').textContent=money(m.net,'ARS');
  const rows=state.recoveries.filter((r)=>monthKey(new Date(r.date+'T12:00:00'))===key).sort((a,b)=>b.date.localeCompare(a.date));
  $('#recoveryList').innerHTML=rows.length ? rows.map((r)=>`<article class="recovery-card"><div><strong>${escape(r.concept || 'Recupero')}</strong><span>${new Date(r.date+'T12:00:00').toLocaleDateString('es-AR')}</span><small>${r.currency==='USD' && r.fxRate ? `Cotización ${money(r.fxRate,'ARS')}` : ''}</small></div><strong>${money(r.amount,r.currency)}</strong></article>`).join('') : '<div class="empty">No hay recuperos en este mes.</div>';
}

function renderBudget() {
  if (!$('#budgetMonth')) return;
  const key=$('#budgetMonth').value || currentMonthKey();
  const entry=budgetFor(key), m=budgetMetrics(key);
  if(document.activeElement !== $('#budgetAmount')) $('#budgetAmount').value=entry.amount || '';
  if(document.activeElement !== $('#budgetReason')) $('#budgetReason').value=entry.reason || '';
  $('#budgetCurrent').textContent=money(m.budget,'ARS');
  $('#budgetSpent').textContent=money(m.spent,'ARS');
  $('#budgetAvailable').textContent=money(m.available,'ARS');
  $('#budgetPercent').textContent=`${m.percent.toLocaleString('es-AR',{maximumFractionDigits:1})}%`;
  $('#budgetProgressBar').style.width=`${Math.min(m.percent,100)}%`;
  $('#budgetExcess').classList.toggle('hidden',m.excess<=0);
  $('#budgetExcess').textContent=m.excess>0 ? `⚠ Superaste el presupuesto en ${money(m.excess,'ARS')}.` : '';
  const labels={80:'80%',90:'90%',100:'100%'};
  $('#budgetAlertSettings').innerHTML=[80,90,100].map((v)=>`<label><input type="checkbox" value="${v}" ${(state.settings.budgetAlerts||[]).includes(v)?'checked':''}>Avisar al ${labels[v]}</label>`).join('');
  $('#budgetAlertSettings').onchange=()=>{ state.settings.budgetAlerts=[...$('#budgetAlertSettings').querySelectorAll(':checked')].map((i)=>Number(i.value)); save(); renderBudgetHomeAlert(); };
  const history=(entry.history||[]).slice().reverse();
  $('#budgetHistory').innerHTML=history.length ? history.map((h)=>`<article class="budget-history-row"><div><span>${new Date(h.date).toLocaleString('es-AR')}</span><small>${escape(h.reason || 'Cambio de presupuesto')}</small></div><strong>${money(h.amount,'ARS')}</strong></article>`).join('') : '<div class="empty">Sin cambios registrados.</div>';
}

function renderSavings() {
  if (!$('#savingsList')) return;
  const now=new Date(), selected=Number($('#savingsYear').value || now.getFullYear());
  const years=new Set([now.getFullYear(),...Object.keys(state.budgets).map((k)=>Number(k.slice(0,4)))]);
  $('#savingsYear').innerHTML=[...years].sort((a,b)=>b-a).map((y)=>`<option ${y===selected?'selected':''}>${y}</option>`).join('');
  const rows=Array.from({length:12},(_,m)=>{ const key=`${selected}-${String(m+1).padStart(2,'0')}`; return {key,date:new Date(selected,m,1),...budgetMetrics(key)}; });
  const annual=rows.reduce((s,r)=>s+r.saving,0);
  $('#annualSavings').textContent=money(annual,'ARS');
  $('#savingsList').innerHTML=rows.map((r)=>`<article class="saving-row"><div><span>${r.date.toLocaleDateString('es-AR',{month:'long'})}</span><small>Presupuesto ${money(r.budget,'ARS')} · Gastado ${money(r.spent,'ARS')}</small></div><strong class="${r.excess>0?'excess':''}">${r.excess>0 ? '-'+money(r.excess,'ARS') : money(r.saving,'ARS')}</strong></article>`).join('');
}

function renderConsultationFilters() {
  if (!$('#consultCategory')) return;
  const category=$('#consultCategory').value, card=$('#consultCard').value;
  $('#consultCategory').innerHTML='<option value="">Todas</option>'+state.categories.map((c)=>`<option ${c===category?'selected':''}>${escape(c)}</option>`).join('');
  $('#consultCard').innerHTML='<option value="">Todas</option>'+state.cards.map((c)=>`<option ${c.name===card?'selected':''}>${escape(c.name)}</option>`).join('');
}

function consultationItems() {
  let from=$('#consultFrom').value ? new Date($('#consultFrom').value+'T00:00:00') : new Date('2000-01-01T00:00:00');
  let to=$('#consultTo').value ? new Date($('#consultTo').value+'T23:59:59') : new Date('2100-01-01T23:59:59');
  const cat=$('#consultCategory').value, method=$('#consultMethod').value, currency=$('#consultCurrency').value, card=$('#consultCard').value, min=Number($('#consultMin').value||0);
  return state.expenses.filter((e)=>{ const d=effectiveDate(e); const value=Number(e.amount||0); return d>=from&&d<=to&&(!cat||e.category===cat)&&(!method||e.method===method)&&(!currency||e.currency===currency)&&(!card||e.card===card)&&value>=min; });
}

function applyNaturalConsultation(text) {
  const q=text.toLowerCase(), now=new Date(), today=now.toISOString().slice(0,10);
  if(q.includes('este mes')){ $('#consultFrom').value=`${today.slice(0,8)}01`; $('#consultTo').value=today; }
  if(q.includes('hoy')){ $('#consultFrom').value=today; $('#consultTo').value=today; }
  if(q.includes('dólar')||q.includes('dolar')) $('#consultCurrency').value='USD';
  if(q.includes('efectivo')) $('#consultMethod').value='Efectivo';
  if(q.includes('débito')||q.includes('debito')) $('#consultMethod').value='Débito';
  if(q.includes('crédito')||q.includes('credito')) $('#consultMethod').value='Crédito';
  const category=state.categories.find((c)=>q.includes(c.toLowerCase())); if(category) $('#consultCategory').value=category;
  const card=state.cards.find((c)=>q.includes(c.name.toLowerCase())); if(card) $('#consultCard').value=card.name;
}

function runConsultation() {
  applyNaturalConsultation($('#consultQuery').value);
  const items=consultationItems(), [ars,usd]=totals(items), eq=items.reduce((s,e)=>s+expenseArsEquivalent(e),0);
  $('#consultArs').textContent=money(ars,'ARS'); $('#consultUsd').textContent=money(usd,'USD'); $('#consultEquivalent').textContent=money(eq,'ARS');
  const answer=`Encontré ${items.length} movimiento${items.length===1?'':'s'}. Total: ${money(ars,'ARS')}${usd ? ' y '+money(usd,'USD') : ''}.`;
  $('#consultAnswer').textContent=answer;
  $('#consultResults').innerHTML=items.length ? items.sort((a,b)=>effectiveDate(b)-effectiveDate(a)).map((e)=>expenseHTML(e,true)).join('') : '<div class="empty">No encontré movimientos con esos filtros.</div>';
  if($('#consultSpeak').checked && 'speechSynthesis' in window){ speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(answer)); }
}

function compareMonths() {
  const a=$('#compareMonthA').value,b=$('#compareMonthB').value;if(!a||!b)return;
  const sum=(key)=>state.expenses.filter((e)=>monthKey(effectiveDate(e))===key).reduce((s,e)=>s+expenseArsEquivalent(e),0);
  const av=sum(a),bv=sum(b),max=Math.max(av,bv,1),diff=bv-av,pctDiff=av ? diff/av*100 : null;
  $('#compareResult').className='compare-result';
  $('#compareResult').innerHTML=`<strong>${b}: ${money(bv,'ARS')}</strong><p class="muted">${pctDiff==null?'Sin base para comparar':(pctDiff>=0?'+':'')+pctDiff.toLocaleString('es-AR',{maximumFractionDigits:1})+'% frente a '+a}</p><div class="compare-bars"><div class="compare-bar"><span>${a}</span><i style="width:${av/max*100}%"></i><strong>${money(av,'ARS')}</strong></div><div class="compare-bar"><span>${b}</span><i style="width:${bv/max*100}%"></i><strong>${money(bv,'ARS')}</strong></div></div>`;
}

function startStockVoice() {
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const process=(phrase)=>{ const q=phrase.toLowerCase(); const product=state.stock.find((p)=>q.includes(p.product.toLowerCase())); const n=Number((q.match(/\d+(?:[.,]\d+)?/)||[])[0]?.replace(',','.')||1); if(!product)return showToast('No reconocí el producto del stock'); const m=stockMetrics(product); if(n>m.remaining)return showToast('No hay suficiente stock'); product.consumptions ||= []; product.consumptions.push({id:uid(),quantity:n,date:new Date().toISOString(),source:'voice'}); save(); renderStock(); showToast(`Consumo: ${n} de ${product.product}`); };
  if(!SR){ const p=prompt('Decí/escribí, por ejemplo: consumí 2 cafés'); if(p)process(p); return; }
  const rec=new SR();rec.lang='es-AR';rec.interimResults=false;rec.continuous=false;let phrase='';rec.onresult=(e)=>phrase=e.results[e.resultIndex][0].transcript.trim();rec.onend=()=>{if(phrase)process(phrase)};rec.onerror=()=>showToast('No pude escuchar el consumo');rec.start();
}
function goView(view) {
  document.querySelectorAll('.view, nav button').forEach((e) => e.classList.remove('active'));
  const target = document.getElementById(view);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`nav button[data-view="${view}"]`);
  nav?.classList.add('active');
  render();
  if (view === 'usd') ensureUsdRate(false).then(() => renderUsd());
}

async function confirmPending(index, card) {
  const current=pending[index]; if(!current)return;
  if(current.dateAmbiguous)return showToast('AclarÁ la fecha antes de confirmar');
  if(current.method==='Sin definir')return showToast('Elegí o decí con qué pagaste');
  if(['Débito','Crédito'].includes(current.method)&&!current.card)return showToast('Elegí o decí qué tarjeta o cuenta usaste');
  if(current.method==='Crédito'&&current.installmentsSpecified===false)return showToast('Elegí en cuántas cuotas pagaste');
  card.classList.add('confirmed');
  let item=pending.splice(index,1)[0];
  item.purchaseDate ||= item.date;
  item=await stampUsdExpense(item);
  state.expenses.push(...installmentExpenses(item));
  save(); feedback(true); showToast('✓ Gasto confirmado');
  setTimeout(()=>{showPending();render();},180);
}
document.querySelectorAll('nav button').forEach((button) => { button.onclick = () => goView(button.dataset.view); });
document.querySelectorAll('dialog .close').forEach((b) => { b.onclick = () => b.closest('dialog').close(); });
$('#manualBtn').onclick = () => openExpense(); $('#homeMenuBtn').onclick = () => $('#menuDialog').showModal();
$('#nextStep').onclick = () => { if (manualStep === 1 && !$('#amount').value) return $('#amount').reportValidity(); setManualStep(manualStep + 1); }; $('#prevStep').onclick = () => setManualStep(manualStep - 1);
$('#method').onchange = updatePaymentFields; $('#category').onchange = () => fillSubcategories(); $('#expenseCard').onchange = updateInstallmentPreview; $('#installments').oninput = updateInstallmentPreview; $('#amount').oninput = updateInstallmentPreview; document.querySelectorAll('[name=currency]').forEach((i) => { i.onchange = updateInstallmentPreview; });
$('#expenseForm').onsubmit = async (event) => {
  event.preventDefault();
  const method=$('#method').value;
  if (!method) return showToast('Elegí el medio de pago');
  if (method !== 'Efectivo' && !$('#expenseCard').value) return showToast('Elegí una tarjeta configurada');
  const now=new Date().toISOString();
  let expense={ id:crypto.randomUUID(), amount:Number($('#amount').value), currency:document.querySelector('[name=currency]:checked').value, concept:$('#concept').value || $('#subcategory')?.value || $('#category').value || 'Sin detalle', category:$('#category').value, subcategory:$('#subcategory')?.value || '', method, card:$('#expenseCard').value, installments:method==='Crédito' ? Number($('#installments').value) : 1, date:now, purchaseDate:now, source:'manual' };
  expense=await stampUsdExpense(expense);
  state.expenses.push(...installmentExpenses(expense)); save(); $('#expenseDialog').close(); feedback(true); showToast('✓ Gasto guardado'); render(); if(pending.length) setTimeout(showPending,180);
};
$('#addCard').onclick = () => { editingCardId = null; $('#cardDialog h2').textContent = 'Nueva tarjeta'; $('#cardForm').reset(); $('#creditCardDates').classList.remove('hidden'); $('#cardDialog').showModal(); }; $('#cardType').onchange = () => $('#creditCardDates').classList.toggle('hidden', $('#cardType').value !== 'Crédito'); $('#cardForm').onsubmit = (event) => {
  event.preventDefault();
  const name = $('#cardName').value.trim();
  const selectedType = $('#cardType').value;
  const duplicate = state.cards.some((c) => c.id !== editingCardId && c.name.toLowerCase() === name.toLowerCase() && c.type === selectedType);
  if (duplicate) return showToast('Ya existe una tarjeta con ese nombre');
  const data = { name, type: selectedType, closingDay: Number($('#closingDay').value), dueDay: Number($('#dueDay').value) };
  if (editingCardId) {
    const card = state.cards.find((c) => c.id === editingCardId);
    if (card) {
      const previousName = card.name;
      Object.assign(card, data);
      state.expenses.forEach((e) => { if (e.card === previousName) e.card = name; });
      state.recurring.forEach((r) => { if (r.card === previousName) r.card = name; });
    }
  } else state.cards.push({ id: crypto.randomUUID(), ...data });
  editingCardId = null;
  save(); event.target.reset(); $('#cardDialog').close(); showToast('Tarjeta guardada'); render();
};
document.querySelectorAll('[data-range]').forEach((button) => { button.onclick=()=>{ reportRange=button.dataset.range; document.querySelectorAll('[data-range]').forEach((b)=>b.classList.remove('selected')); button.classList.add('selected'); $('#customRange').classList.toggle('hidden',reportRange!=='custom'); renderReport(); }; });
$('#fromDate').onchange=renderReport; $('#toDate').onchange=renderReport;
document.querySelectorAll('[data-usd-range]').forEach((button)=>{ button.onclick=()=>{ usdRange=button.dataset.usdRange; document.querySelectorAll('[data-usd-range]').forEach((b)=>b.classList.remove('selected')); button.classList.add('selected'); $('#usdCustomRange').classList.toggle('hidden',usdRange!=='custom'); renderUsd(); }; });
$('#usdFromDate').onchange=renderUsd; $('#usdToDate').onchange=renderUsd;
$('#usdRateType').onchange=async()=>{ state.settings.usdRateType=$('#usdRateType').value; save(); renderUsd(); await ensureUsdRate(true); renderUsd(); };
$('#refreshUsdRate').onclick=async()=>{ $('#usdRateMeta').textContent='Actualizando…'; await ensureUsdRate(true); renderUsd(); };
document.querySelectorAll('[data-history]').forEach((button) => { button.onclick = () => { historyRange = button.dataset.history; document.querySelectorAll('[data-history]').forEach((b) => b.classList.remove('selected')); button.classList.add('selected'); $('#historyDate').classList.toggle('hidden', historyRange !== 'day'); $('#historyMonth').classList.toggle('hidden', historyRange !== 'month'); $('#historyYear').classList.toggle('hidden', historyRange !== 'year'); $('#historyCustom').classList.toggle('hidden', historyRange !== 'custom'); renderHistory(); }; }); ['historyDate', 'historyMonth', 'historyYear', 'historyFrom', 'historyTo'].forEach((id) => { $(`#${id}`).onchange = renderHistory; });
function addCategory() { const value = $('#newCategory').value.trim(); if (!value || state.categories.some((c) => c.toLowerCase() === value.toLowerCase())) return; state.categories.push(value); state.subcategories[value] ||= []; $('#newCategory').value = ''; save(); fillCategories(); }
function addSubcategory(category,value){ const clean=String(value||'').trim(); if(!category||!clean)return false; const list=subcategoriesFor(category); if(list.some((s)=>s.toLowerCase()===clean.toLowerCase()))return false; state.subcategories[category]=[...list,clean]; save(); return true; }
$('#categoryForm').onsubmit = (event) => { event.preventDefault(); addCategory(); };
$('#quickCategory').onclick = () => { const value = prompt('Nombre de la nueva categoría:')?.trim(); if (!value) return; $('#newCategory').value = value; addCategory(); $('#category').value = value; fillSubcategories(); };
$('#quickSubcategory').onclick = () => { const category=$('#category').value; if(!category)return showToast('Elegí primero una categoría'); const value=prompt(`Nueva subcategoría dentro de ${category}:`)?.trim(); if(!value)return; if(!addSubcategory(category,value))return showToast('Esa subcategoría ya existe'); fillSubcategories(value); };
function renderReminderSettings() { const labels = { 3: '3 días antes', 2: '2 días antes', 1: '1 día antes' }; $('#reminderSettings').innerHTML = [3, 2, 1].map((d) => `<label><input type="checkbox" value="${d}" ${state.settings.reminderDays.includes(d) ? 'checked' : ''}>${labels[d]}</label>`).join(''); $('#reminderSettings').onchange = () => { state.settings.reminderDays = [...$('#reminderSettings').querySelectorAll(':checked')].map((i) => Number(i.value)); save(); renderPaymentReminders(); }; }
$('#settingsBtn').onclick = () => { renderReminderSettings(); fillCategories(); renderRecurringSettings(); renderTrash(); renderSecurityStatus(); $('#settingsDialog').showModal(); }; $('#biometricBtn').onclick = openSecuritySetup;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition = null;
let voiceTranscript = '';
let voiceError = '';
let voiceCancelled = false;
let voiceGestureStartY = null;
let voiceCancelArmed = false;
function resetExpenseVoiceUI() {
  $('#micBtn').classList.remove('listening');
  $('#voiceZone')?.classList.remove('recording','cancel-ready');
  $('#voiceTrash')?.classList.remove('armed');
  $('#voiceTitle').textContent='Mantener presionado';
  $('#voiceHint').textContent='para hablar';
}
function finishExpenseVoice() {
  if(voiceCancelled){voiceTranscript='';voiceError='';voiceCancelled=false;voiceGestureStartY=null;voiceCancelArmed=false;resetExpenseVoiceUI();return;}
  const phrase=voiceTranscript.trim();
  const err=voiceError;
  voiceTranscript=''; voiceError='';
  resetExpenseVoiceUI();
  if (phrase) {
    pending=parseExpenses(phrase,state.cards,state.categories);
    if (pending.length) showPending();
    else showToast('Escuché el audio, pero no pude interpretar el gasto');
  } else if (!err) {
    showToast('No llegué a reconocer lo que dijiste. Probá de nuevo');
  }
}
function startExpenseVoice() {
  if (activeRecognition) return;
  window.getSelection?.()?.removeAllRanges?.();
  if (!SpeechRecognition) {
    const phrase = prompt('El navegador no ofrece reconocimiento de voz. Escribí los gastos:');
    if (phrase) { pending = parseExpenses(phrase, state.cards, state.categories); showPending(); }
    return;
  }
  voiceTranscript=''; voiceError=''; voiceCancelled=false; voiceCancelArmed=false; voiceGestureStartY=null;
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.lang='es-AR';
  recognition.interimResults=true;
  recognition.continuous=false;
  recognition.maxAlternatives=1;
  recognition.onstart=()=>{
    $('#micBtn').classList.add('listening');
    $('#voiceZone')?.classList.add('recording');
    $('#voiceTitle').textContent='Escuchando…';
    $('#voiceHint').textContent='Soltá cuando termines';
  };
  recognition.onresult=(event)=>{
    let text='';
    for(let i=0;i<event.results.length;i++) text += ' ' + (event.results[i][0]?.transcript || '');
    voiceTranscript=text.trim();
  };
  recognition.onerror=(event)=>{
    voiceError=event.error || 'error';
    if (!['aborted','no-speech'].includes(voiceError)) showToast('No pude escuchar. Revisá el permiso del micrófono');
  };
  recognition.onend=()=>{
    activeRecognition=null;
    finishExpenseVoice();
  };
  try { recognition.start(); }
  catch { activeRecognition=null; resetExpenseVoiceUI(); showToast('No pude iniciar el micrófono'); }
}
function stopExpenseVoice() {
  if (!activeRecognition) return;
  try { activeRecognition.stop(); } catch {}
}
const micBtn=$('#micBtn');
const voiceTrash=$('#voiceTrash');
function updateVoiceCancelGesture(clientY){
  if(voiceGestureStartY==null)return;
  const armed=(voiceGestureStartY-clientY)>=70;
  if(armed===voiceCancelArmed)return;
  voiceCancelArmed=armed;
  $('#voiceZone')?.classList.toggle('cancel-ready',armed);
  voiceTrash?.classList.toggle('armed',armed);
  $('#voiceHint').textContent=armed?'Soltá para cancelar':'Deslizá hacia el tacho para cancelar';
}
function cancelExpenseVoice(){
  if(!activeRecognition)return;
  voiceCancelled=true;voiceCancelArmed=false;voiceGestureStartY=null;
  feedback(false);showToast('Grabación descartada');
  try{activeRecognition.abort();}catch{resetExpenseVoiceUI();activeRecognition=null;voiceCancelled=false;}
}
if ('ontouchstart' in window) {
  micBtn.addEventListener('touchstart',(e)=>{e.preventDefault();voiceGestureStartY=e.touches[0]?.clientY??null;startExpenseVoice();},{passive:false});
  micBtn.addEventListener('touchmove',(e)=>{e.preventDefault();if(e.touches[0])updateVoiceCancelGesture(e.touches[0].clientY);},{passive:false});
  micBtn.addEventListener('touchend',(e)=>{e.preventDefault();const cancel=voiceCancelArmed;voiceGestureStartY=null;if(cancel)cancelExpenseVoice();else stopExpenseVoice();},{passive:false});
  micBtn.addEventListener('touchcancel',(e)=>{e.preventDefault();cancelExpenseVoice();},{passive:false});
} else {
  micBtn.onpointerdown=(e)=>{e.preventDefault();voiceGestureStartY=e.clientY;micBtn.setPointerCapture?.(e.pointerId);startExpenseVoice();};
  micBtn.onpointermove=(e)=>{if(activeRecognition)updateVoiceCancelGesture(e.clientY);};
  micBtn.onpointerup=(e)=>{e.preventDefault();const cancel=voiceCancelArmed;voiceGestureStartY=null;if(cancel)cancelExpenseVoice();else stopExpenseVoice();};
  micBtn.onpointercancel=cancelExpenseVoice;
}
micBtn.oncontextmenu=(e)=>e.preventDefault();
micBtn.onselectstart=(e)=>e.preventDefault();



$('#securitySetupForm').onsubmit=async(e)=>{
  e.preventDefault();
  const p1=$('#securityPin').value.trim(),p2=$('#securityPin2').value.trim();
  if(!/^\d{4}$/.test(p1))return showToast('El PIN debe tener 4 dígitos');
  if(p1!==p2)return showToast('Los PIN no coinciden');
  const salt=bytesToBase64(randomBytes(16));
  state.security.pinSalt=salt;
  state.security.pinHash=await hashPin(p1,salt);
  state.security.enabled=true;
  let face=false;
  try{face=await registerBiometric();}catch{}
  save();renderSecurityStatus();$('#securitySetupDialog').close();
  showToast(face?'Face ID y PIN activados':'PIN activado; Face ID no disponible en este dispositivo');
};
$('#disableSecurityBtn').onclick=()=>{if(!confirm('¿Desactivar la protección de acceso?'))return;state.security={...defaults.security};save();renderSecurityStatus();showToast('Protección desactivada');};
$('#unlockBiometric').onclick=async()=>{ $('#lockMessage').textContent='Verificando…'; const ok=await authenticateBiometric(); if(ok){$('#lockDialog').close();$('#lockMessage').textContent='';setTimeout(prepareRecurringDue,100);}else $('#lockMessage').textContent='No se pudo validar. Usá tu PIN.'; };
$('#unlockPinBtn').onclick=unlockWithPin;
$('#unlockPin').onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();unlockWithPin();}};
$('#lockDialog').addEventListener('cancel',(e)=>e.preventDefault());

$('#privacyBtn').onclick=()=>{state.settings.hideAmounts=!state.settings.hideAmounts;document.body.classList.toggle('hide-amounts',state.settings.hideAmounts);$('#privacyBtn').textContent=state.settings.hideAmounts?'🙈':'👁';save();};
$('#addRecurring').onclick=()=>openRecurringDialog();
$('#recurringMethod').onchange=updateRecurringCardField;
$('#recurringForm').onsubmit=(e)=>{e.preventDefault();const data={concept:$('#recurringConcept').value.trim(),amount:Number($('#recurringAmount').value),currency:$('#recurringCurrency').value,category:$('#recurringCategory').value.trim(),method:$('#recurringMethod').value,card:$('#recurringMethod').value==='Efectivo'?'':$('#recurringCard').value,day:Number($('#recurringDay').value),active:true};if(data.method!=='Efectivo'&&!data.card)return showToast('Elegí una tarjeta');if(editingRecurringId){const r=state.recurring.find((x)=>x.id===editingRecurringId);if(r)Object.assign(r,data);}else state.recurring.push({id:uid(),...data,lastPromptedMonth:null});editingRecurringId=null;save();$('#recurringDialog').close();renderRecurringSettings();showToast('Gasto recurrente guardado');};
$('#consultExportExcel').onclick=exportConsultExcel;
$('#consultExportPdf').onclick=exportConsultPdf;

$('#addStock').onclick=()=>{ $('#stockForm').reset(); $('#stockQty').value=1; $('#stockMonths').value=1; $('#stockPaidDate').value=new Date().toISOString().slice(0,10); $('#stockDialog').showModal(); };
$('#stockForm').onsubmit=async(e)=>{e.preventDefault();await addStockPurchase({product:$('#stockProduct').value.trim(),category:$('#stockCategory').value.trim(),quantity:Number($('#stockQty').value),months:Number($('#stockMonths').value),totalAmount:Number($('#stockAmount').value),currency:$('#stockCurrency').value,paidDate:$('#stockPaidDate').value});$('#stockDialog').close();renderStock();renderBudget();renderSavings();showToast('Compra de stock guardada');};
$('#stockVoiceBtn').onclick=startStockVoice;

$('#addRecovery').onclick=()=>{ $('#recoveryForm').reset(); $('#recoveryDate').value=new Date().toISOString().slice(0,10); $('#recoveryDialog').showModal(); };
$('#recoveryForm').onsubmit=async(e)=>{e.preventDefault();let item={id:uid(),amount:Number($('#recoveryAmount').value),currency:$('#recoveryCurrency').value,concept:$('#recoveryConcept').value.trim(),date:$('#recoveryDate').value};if(item.currency==='USD'){const rate=await ensureUsdRate(false);if(rate)Object.assign(item,{fxRate:rate.rate,fxRateName:rate.name,fxRateUpdatedAt:rate.updatedAt});}state.recoveries.push(item);save();$('#recoveryDialog').close();renderRecoveries();showToast('Recupero guardado');};
$('#recoveryMonth').onchange=renderRecoveries;

$('#budgetMonth').onchange=renderBudget;
$('#saveBudget').onclick=()=>{ const key=$('#budgetMonth').value||currentMonthKey(), amount=Number($('#budgetAmount').value||0), reason=$('#budgetReason').value.trim(); const current=budgetFor(key); const history=[...(current.history||[]),{date:new Date().toISOString(),amount,reason}]; state.budgets[key]={amount,reason,history}; save(); renderBudget(); renderSavings(); renderBudgetHomeAlert(); showToast('Presupuesto guardado'); };
$('#savingsYear').onchange=renderSavings;

$('#runConsult').onclick=runConsultation;
['consultFrom','consultTo','consultCategory','consultMethod','consultCurrency','consultCard','consultMin'].forEach((id)=>$('#'+id).onchange=runConsultation);
$('#consultSpeak').onchange=()=>{state.settings.consultSpeak=$('#consultSpeak').checked;save();};
$('#compareMonths').onclick=compareMonths;
$('#consultMic').onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const process=(p)=>{$('#consultQuery').value=p;runConsultation();};if(!SR){const p=prompt('Escribí tu consulta:');if(p)process(p);return;}const rec=new SR();rec.lang='es-AR';rec.interimResults=false;rec.continuous=false;let p='';rec.onresult=(e)=>p=e.results[e.resultIndex][0].transcript.trim();rec.onend=()=>{if(p)process(p)};rec.onerror=()=>showToast('No pude escuchar la consulta');rec.start();};


document.querySelectorAll('[data-menu-view]').forEach((button) => { button.onclick = () => { $('#menuDialog').close(); goView(button.dataset.menuView); }; });
document.querySelectorAll('[data-menu-coming]').forEach((button) => { button.onclick = () => showToast(`${button.dataset.menuComing}: lo terminamos en la siguiente revisión`); });
if(!sharedMode && resaleApi){
$('#addResaleParty').onclick = () => $('#resalePartyDialog').showModal();
$('#resalePartyForm').onsubmit = (event) => {
  event.preventDefault();
  addResaleBatch({
    name: $('#resalePartyName').value.trim(),
    date: $('#resalePartyDate').value,
    type: $('#resaleTicketType').value.trim(),
    qty: Number($('#resaleQty').value || 1),
    cost: Number($('#resaleCost').value || 0)
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
  state.resale.ownerPercent = split.ownerPercent; state.resale.sellerPercent = split.sellerPercent;
  save(); $('#resaleSplitDialog').close(); renderResale(); showToast('Reparto actualizado en toda Reventa');
};
$('#exportResale').onclick = exportResaleCsv;
}


window.addEventListener('pagehide',()=>{try{save();}catch{}}); document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){try{save();}catch{}}});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then((registration) => registration.update());
const todayISO = new Date().toISOString().slice(0, 10); const monthISO=todayISO.slice(0,7); $('#historyDate').value = todayISO; $('#historyMonth').value = monthISO; $('#historyFrom').value = todayISO; $('#historyTo').value = todayISO; $('#fromDate').value = todayISO.slice(0,8)+'01'; $('#toDate').value = todayISO; $('#usdFromDate').value = todayISO.slice(0,8)+'01'; $('#usdToDate').value = todayISO; $('#stockPaidDate').value=todayISO; $('#recoveryDate').value=todayISO; $('#recoveryMonth').value=monthISO; $('#budgetMonth').value=monthISO; $('#consultFrom').value=todayISO.slice(0,8)+'01'; $('#consultTo').value=todayISO; $('#compareMonthA').value=monthKey(new Date(new Date().getFullYear(),new Date().getMonth()-1,1)); $('#compareMonthB').value=monthISO; $('#consultSpeak').checked=state.settings.consultSpeak!==false; document.body.classList.toggle('hide-amounts',!!state.settings.hideAmounts); $('#privacyBtn').textContent=state.settings.hideAmounts?'🙈':'👁'; save(); render(); setInterval(renderHomeClock,30000); ensureUsdRate(false).then(()=>renderUsd()); setTimeout(()=>{if(state.security.enabled)showAppLock();else prepareRecurringDue();},250);
