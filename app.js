import { parseExpenses, parseAmount } from './parser.js';
import { expenseArsEquivalent, boundsForRange, previousBounds, groupExpenses, recentPurchases } from './reporting.js';
import { monthKey, itemArsEquivalent, budgetOutcome, stockMetrics, recoveryMonthMetrics, dateWithCardDay, firstDueDateForCard, installmentDueDates, nextClosingDateForCard, nextDueDateForCard } from './finance.js';
import { learnCategoryRule, applyLearnedCategory } from './category-learning.js';
import { parseLocalizedNumber, formatLocalizedNumber, formatLocalizedInteger, formatNumericInputValue } from './numeric-format.js';
import { currentMonthExpenseCount, previousMonthExpenseCount, moveCurrentMonthExpensesToTrash, permanentlyDeletePreviousMonths, mirrorResetIntoSnapshot, verifyNoCurrentMonthExpenses, verifyNoPreviousMonthExpenses } from './expense-reset.js';
import { needsPaymentMethod, needsPaymentCard, needsPaymentInstallments } from './pending-validation.js';
const sharedMode = new URLSearchParams(location.search).get('shared') === '1';
const resaleApi = sharedMode ? null : await import('./resale.js?v=59');
const normalizeSplit = resaleApi?.normalizeSplit;
const ticketMetrics = resaleApi?.ticketMetrics;
const partyMetrics = resaleApi?.partyMetrics;
const portfolioMetrics = resaleApi?.portfolioMetrics;
const withPortfolioPercent = resaleApi?.withPortfolioPercent;
if (sharedMode) document.querySelectorAll('.owner-only').forEach((el) => el.remove());
const STORAGE_KEY = sharedMode ? 'mis-gastos-shared-v1' : 'mis-gastos-v1';
const defaults = { expenses: [], cards: [], categories: [], subcategories: {}, categoryRules: [], stock: [], recoveries: [], budgets: {}, recurring: [], fixedExpenses: [], trash: [], security: { enabled: false, pinHash: '', pinSalt: '', credentialId: '' }, settings: { reminderDays: [3, 2, 1], usdRateType: 'oficial', usdRateCache: {}, budgetAlerts: [80, 90, 100], hideAmounts: false, consultSpeak: true }, resale: { ownerPercent: 70, sellerPercent: 30, parties: [] }, schemaVersion: 5 };
function loadState() {
  try {
    const old = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const legacyRecurring = Array.isArray(old.recurring) ? old.recurring : [];
    const fixedExpenses = Array.isArray(old.fixedExpenses)
      ? old.fixedExpenses
      : legacyRecurring.map((r,i)=>({
          id:r.id || `legacy-fixed-${i+1}`,
          concept:r.concept || 'Gasto fijo',
          currency:r.currency || 'ARS',
          category:r.category || '',
          subcategory:r.subcategory || '',
          method:r.method || 'Efectivo',
          card:r.card || '',
          day:Number(r.day || 1),
          active:r.active !== false,
          legacyAmount:Number(r.amount || 0)
        }));
    return {
      ...defaults,
      ...old,
      expenses: old.expenses || [],
      cards: old.cards || [],
      categories: old.categories || [],
      subcategories: old.subcategories || {},
      categoryRules: old.categoryRules || [],
      stock: old.stock || [],
      recoveries: old.recoveries || [],
      budgets: old.budgets || {},
      recurring: legacyRecurring,
      fixedExpenses,
      trash: old.trash || [],
      security: { ...defaults.security, ...(old.security || {}) },
      settings: { ...defaults.settings, ...(old.settings || {}), usdRateCache: old.settings?.usdRateCache || {} },
      resale: { ...defaults.resale, ...(old.resale || {}), parties: old.resale?.parties || [] },
      schemaVersion: 5
    };
  } catch { return structuredClone(defaults); }
}
const state = loadState();
function demoCardId(){return crypto.randomUUID?.() || ('demo-' + Date.now() + '-' + Math.random().toString(16).slice(2));}
function seedDemoCardsOnce(){
  if(sharedMode || Number(state.settings?.demoCardsSeedVersion||0)>=3) return;
  if(!Array.isArray(state.cards)) state.cards=[];
  const demos=[
    {name:'Mercado Pago',type:'Débito',closingDay:0,dueDay:0,color:'#3787e8'},
    {name:'Brubank',type:'Débito',closingDay:0,dueDay:0,color:'#7657d5'},
    {name:'Cuenta Banco Macro',type:'Débito',closingDay:0,dueDay:0,color:'#2f80ed'},
    {name:'Banco Francés',type:'Crédito',closingDay:20,dueDay:10,color:'#b9942f'},
    {name:'Banco Macro',type:'Crédito',closingDay:25,dueDay:12,color:'#2f80ed'}
  ];
  demos.forEach((demo)=>{
    const found=state.cards.find((card)=>String(card.name||'').toLowerCase()===demo.name.toLowerCase()&&card.type===demo.type);
    if(found){if(!found.color)found.color=demo.color;return;}
    state.cards.push({id:demoCardId(),...demo,demo:true});
  });
  state.settings={...state.settings,demoCardsSeeded:true,demoCardsSeedVersion:3};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
seedDemoCardsOnce();

const DEMO_CATEGORY_SEED_VERSION = 1;
const DEMO_CATEGORIES = {
  'Alimentación': ['Supermercado','Kiosco','Restaurante','Delivery','Café'],
  'Transporte': ['Combustible','Peajes','Estacionamiento','Taxi / Uber','Transporte público'],
  'Hogar': ['Alquiler','Expensas','Electricidad','Gas','Internet','Limpieza'],
  'Salud': ['Farmacia','Médico','Odontología','Gimnasio'],
  'Entretenimiento': ['Salidas','Streaming','Cine / Teatro','Eventos'],
  'Compras': ['Ropa','Tecnología','Regalos','Artículos para el hogar'],
  'Trabajo': ['Insumos','Herramientas','Comidas laborales','Traslados'],
  'Educación': ['Cursos','Libros','Suscripciones'],
  'Viajes': ['Alojamiento','Pasajes','Comidas','Actividades'],
  'Mascotas': ['Alimento','Veterinaria','Accesorios'],
  'Servicios personales': ['Peluquería','Cuidado personal'],
  'Impuestos y tasas': ['Impuestos','Tasas','Monotributo'],
  'Otros': ['Varios']
};
function seedDemoCategoriesOnce(){
  if(Number(state.settings?.demoCategoriesSeedVersion||0)>=DEMO_CATEGORY_SEED_VERSION)return;
  if(!Array.isArray(state.categories))state.categories=[];
  if(!state.subcategories||typeof state.subcategories!=='object')state.subcategories={};
  Object.entries(DEMO_CATEGORIES).forEach(([category,subs])=>{
    let actual=state.categories.find((value)=>String(value).trim().toLowerCase()===category.toLowerCase());
    if(!actual){actual=category;state.categories.push(actual);}
    const current=Array.isArray(state.subcategories[actual])?[...state.subcategories[actual]]:[];
    subs.forEach((sub)=>{
      if(!current.some((value)=>String(value).trim().toLowerCase()===sub.toLowerCase()))current.push(sub);
    });
    state.subcategories[actual]=current;
  });
  state.settings={...state.settings,demoCategoriesSeedVersion:DEMO_CATEGORY_SEED_VERSION};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
seedDemoCategoriesOnce();

function purgeExpiredTrash(){const cutoff=Date.now()-30*24*60*60*1000;state.trash=(state.trash||[]).filter((r)=>new Date(r.deletedAt).getTime()>=cutoff);} purgeExpiredTrash();
let selectedDate = new Date(), reportRange = 'month', usdRange = 'month', historyRange = 'today', pending = [], discarded = null, manualStep = 1, editingCardId = null, editingRecurringId = null, editingFixedExpenseId = null, editingFixedPaymentExpenseId = null, activeCardType = '', activeSettingsCategory = '', settingsSnapshot = null, recentHomeLimit = 4;
const $ = (s) => document.querySelector(s);
const money = (n, c) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n || 0);
const numberText=(n,maximumFractionDigits=2)=>formatLocalizedNumber(n,{maximumFractionDigits});
const integerText=(n)=>formatLocalizedInteger(n);
function formatLocalizedInputElement(input){
  if(!input)return;
  const max=Number(input.dataset.localNumber??2);
  const raw=String(input.value??'');
  if(!raw)return;
  const hasComma=raw.includes(',');
  const [wholeRaw,fractionRaw='']=raw.split(',');
  const wholeDigits=wholeRaw.replace(/[^0-9-]/g,'');
  if(!wholeDigits||wholeDigits==='-')return;
  const negative=wholeDigits.startsWith('-');
  const digits=wholeDigits.replace(/-/g,'').replace(/^0+(?=\d)/,'')||'0';
  const grouped=integerText(Number(digits));
  const fraction=max>0?fractionRaw.replace(/\D/g,'').slice(0,max):'';
  input.value=(negative?'-':'')+grouped+(hasComma&&max>0?','+fraction:'');
  try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
}
function bindLocalizedNumberInputs(root=document){
  root.querySelectorAll?.('[data-local-number]').forEach((input)=>{
    if(input.dataset.localNumberBound==='1')return;
    input.dataset.localNumberBound='1';
    input.addEventListener('input',()=>formatLocalizedInputElement(input));
    input.addEventListener('blur',()=>formatLocalizedInputElement(input));
    formatLocalizedInputElement(input);
  });
}
function localizedInputNumber(selector){return parseLocalizedNumber($(selector)?.value||0);}
function setLocalizedInput(selector,value,max=2){
  const input=$(selector);if(!input)return;
  input.value=value===''||value===null||value===undefined?'':formatNumericInputValue(value,{maximumFractionDigits:max});
}

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const effectiveDate = (e) => new Date(e.dueDate || e.date);
document.querySelectorAll('dialog .close').forEach((button)=>{button.textContent='←';button.setAttribute('aria-label','Volver');button.classList.add('back-button');});
let previousViewId='home';
const menuViewIds=new Set([...document.querySelectorAll('[data-menu-view]')].map((button)=>button.dataset.menuView).filter(Boolean));
function returnToMainMenu(){
  goView('home');
  setTimeout(()=>{
    const menu=$('#menuDialog');
    if(menu&&!menu.open)menu.showModal();
  },0);
}
document.addEventListener('click',(event)=>{
  const trigger=event.target.closest?.('[data-menu-view],[data-view]');
  if(!trigger)return;
  const destination=trigger.dataset.menuView||trigger.dataset.view;
  const current=document.querySelector('.view.active')?.id||'home';
  if(!trigger.dataset.menuView&&destination&&destination!==current)previousViewId=current;
  if(destination==='cards'){activeCardType='';setTimeout(renderCards,0);}
},true);
document.querySelectorAll('main > .view:not(#home)').forEach((view)=>{
  if(view.querySelector(':scope > .view-back'))return;
  const button=document.createElement('button');
  button.type='button';button.className='view-back';button.textContent='← Atrás';button.setAttribute('aria-label','Volver a la pantalla anterior');
  button.onclick=()=>{
    if(view.id==='fixedExpenses'){
      goView('home');
      setTimeout(()=>{const dialog=$('#functionsDialog');if(dialog&&!dialog.open)dialog.showModal();},0);
      return;
    }
    if(menuViewIds.has(view.id)){
      returnToMainMenu();
      return;
    }
    goView(previousViewId||'home');
  };
  view.prepend(button);
});
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
  const detail=[e.category,e.subcategory,e.method,e.card,e.installments>1?`${integerText(e.installment||1)}/${integerText(e.installments)}`:null].filter(Boolean).join(' · ');
  const when=new Date(e.purchaseDate||e.date);
  return `<article class="expense" data-expense-id="${escape(e.id)}"><div class="expense-icon">${e.method==='Efectivo'?'◆':'▰'}</div><div class="expense-info"><strong>${escape(e.concept||'Sin detalle')}</strong><span class="meta">${escape(detail)}${showDate?` · ${when.toLocaleDateString('es-AR')} ${when.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`:` · ${when.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`}</span></div><div class="amount">${money(showDate?e.amount:purchaseAmount(e),e.currency)}<small>${e.currency}</small></div>${showDate?`<button class="expense-delete" type="button" data-delete-expense="${escape(e.id)}" aria-label="Eliminar gasto">⌫</button>`:''}</article>`;
}
function chronologicalPurchases(){
  return recentPurchases(state.expenses);
}
function prepareCategoryLearning(items){
  return (items||[]).map((item)=>{
    if(item.category)return {...item,categoryStatus:item.categoryStatus||'direct'};
    return applyLearnedCategory({...item,categoryStatus:'unclassified'},state.categoryRules);
  });
}
function learnFromExpense(item,category,subcategory=''){
  state.categoryRules=learnCategoryRule(state.categoryRules,item.concept,category,subcategory);
}
function expenseGroupKey(item){return item?.parentId||item?.id||'';}
function classifyExpenseGroup(item,category,subcategory=''){
  const key=expenseGroupKey(item);
  state.expenses.forEach((expense)=>{
    if(expenseGroupKey(expense)!==key)return;
    expense.category=category;
    expense.subcategory=subcategory||'';
    expense.categoryStatus='manual';
  });
  learnFromExpense(item,category,subcategory);
  save();render();
}
function renderUnclassified(){
  const target=$('#unclassifiedList');if(!target)return;
  const items=recentPurchases(state.expenses).filter((e)=>!e.category);
  $('#unclassifiedCount').textContent=items.length?`${integerText(items.length)} pendiente${items.length===1?'':'s'}`:'Todo clasificado';
  target.innerHTML=items.length?items.map((e)=>{
    const key=escape(expenseGroupKey(e));
    const categoryOptions=state.categories.map((category)=>`<option value="${escape(category)}">${escape(category)}</option>`).join('');
    return `<article class="unclassified-item" data-unclassified-id="${key}"><div class="unclassified-head"><div><strong>${escape(e.concept||'Sin detalle')}</strong><small>${new Date(e.purchaseDate||e.date).toLocaleDateString('es-AR')} · ${money(purchaseAmount(e),e.currency)}</small></div><span>Sin clasificar</span></div><label>Categoría<select class="unclassified-category"><option value="">Elegí categoría</option>${categoryOptions}</select></label><button type="button" class="category-create-button unclassified-add-category">＋ Agregar categoría</button><div class="unclassified-subcategory-wrap hidden"><label>Subcategoría<select class="unclassified-subcategory"><option value="">Sin subcategoría</option></select></label><button type="button" class="category-create-button unclassified-add-subcategory">＋ Agregar subcategoría</button></div><button type="button" class="primary unclassified-save">Guardar y aprender</button></article>`;
  }).join(''):'<div class="empty">No tenés compras sin clasificar.</div>';
  document.querySelectorAll('.unclassified-item').forEach((row)=>{
    const item=items.find((e)=>expenseGroupKey(e)===row.dataset.unclassifiedId);if(!item)return;
    const categorySelect=row.querySelector('.unclassified-category');
    const subWrap=row.querySelector('.unclassified-subcategory-wrap');
    const subSelect=row.querySelector('.unclassified-subcategory');
    const refreshSubcategories=(selected='')=>{
      const values=subcategoriesFor(categorySelect.value);
      subWrap.classList.toggle('hidden',!categorySelect.value);
      subSelect.innerHTML='<option value="">Sin subcategoría</option>'+values.map((value)=>`<option value="${escape(value)}">${escape(value)}</option>`).join('');
      if(selected&&values.includes(selected))subSelect.value=selected;
    };
    categorySelect.onchange=()=>refreshSubcategories();
    row.querySelector('.unclassified-add-category').onclick=()=>{
      const value=prompt('Nombre de la nueva categoría:')?.trim();
      if(!value)return;
      const category=createCategoryEverywhere(value);
      if(!category)return;
      renderUnclassified();
      const updated=[...document.querySelectorAll('.unclassified-item')].find((card)=>card.dataset.unclassifiedId===row.dataset.unclassifiedId);
      const select=updated?.querySelector('.unclassified-category');
      if(select){select.value=category;select.dispatchEvent(new Event('change'));}
    };
    row.querySelector('.unclassified-add-subcategory').onclick=()=>{
      const category=categorySelect.value;if(!category)return;
      const value=prompt(`Nueva subcategoría dentro de ${category}:`)?.trim();
      if(!value)return;
      if(!addSubcategory(category,value)){
        const existing=subcategoriesFor(category).find((sub)=>sub.toLowerCase()===value.toLowerCase());
        if(existing)return refreshSubcategories(existing);
        return showToast('Esa subcategoría ya existe');
      }
      refreshSubcategories(value);
    };
    row.querySelector('.unclassified-save').onclick=()=>{
      if(!categorySelect.value)return showToast('Elegí una categoría');
      classifyExpenseGroup(item,categorySelect.value,subSelect.value);
      showToast('✓ Clasificado · la app aprendió esta relación');
    };
  });
}
function renderHomeRecent(){
  const target=$('#recentMovements'); if(!target)return;
  const all=chronologicalPurchases(), visible=all.slice(0,recentHomeLimit);
  target.innerHTML=visible.length?visible.map((e)=>{
    const when=new Date(e.purchaseDate||e.date);
    const category=[e.category,e.subcategory].filter(Boolean).join(' · ')||'Sin categoría';
    return `<article class="recent-movement"><div><strong>${escape(e.concept||'Sin detalle')}</strong><small>${when.toLocaleDateString('es-AR')} · ${escape(category)}</small></div><strong class="recent-amount">${money(purchaseAmount(e),e.currency)}</strong></article>`;
  }).join(''):'<div class="recent-empty">Todavía no registraste movimientos.</div>';
  const more=$('#recentMore');
  if(more){
    const remaining=Math.max(0,all.length-recentHomeLimit);
    more.classList.toggle('hidden',remaining===0);
    more.textContent=remaining>0?'＋ Ver más':'';
  }
  $('#home')?.classList.toggle('recent-expanded',recentHomeLimit>4);
}
function render() { if(reclassifyUncategorizedExpenses())save(); renderHomeClock(); const rows = purchaseRows(selectedDate); const dayTotals = ['ARS', 'USD'].map((c) => rows.filter((e) => e.currency === c).reduce((s, e) => s + purchaseAmount(e), 0)); $('#arsTotal').textContent = money(dayTotals[0], 'ARS'); $('#usdTotal').textContent = money(dayTotals[1], 'USD'); $('#expenseList').innerHTML = rows.length ? rows.sort((a, b) => b.date.localeCompare(a.date)).map((e) => expenseHTML(e)).join('') : '<div class="empty">Todavía no registraste gastos este día.</div>'; renderHomeRecent(); renderUnclassified(); renderPaymentReminders(); renderCards(); renderReport(); renderUsd(); renderHistory(); renderResale(); renderStock(); renderRecoveries(); renderBudget(); renderSavings(); renderFixedExpenses(); renderConsultationFilters(); fillCardSelect(); fillCategories(); fillRecurringCategoryOptions(); fillStockCategoryOptions(); fillFixedExpenseCategoryOptions(); }
function detectUnusual(day) { const past = state.expenses.filter((e) => !sameDay(e.purchaseDate || e.date, new Date()) && (!e.parentId || e.installment === 1)); const values = past.map(purchaseAmount).sort((a, b) => a - b); const median = values.length ? values[Math.floor(values.length / 2)] : Infinity; $('#unusual').classList.toggle('hidden', !day.some((e) => purchaseAmount(e) > median * 3 && values.length >= 5)); }
function subcategoriesFor(category){
  const values=state.subcategories?.[category];
  return Array.isArray(values)?values:[];
}
function fillCategorySelect(selector,selected=''){
  const select=$(selector); if(!select)return '';
  const current=selected||select.value||'';
  select.innerHTML='<option value="">Sin categoría</option>'+state.categories.map((c)=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  if(current&&state.categories.includes(current))select.value=current;
  return select.value||'';
}
function fillScopedSubcategories(categorySelector,subcategorySelector,wrapSelector,selected=''){
  const category=$(categorySelector)?.value||'';
  const select=$(subcategorySelector); if(!select)return;
  const values=category?subcategoriesFor(category):[];
  select.innerHTML='<option value="">Sin subcategoría</option>'+values.map((s)=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');
  if(selected&&values.includes(selected))select.value=selected;
  $(wrapSelector)?.classList.toggle('hidden',!category);
}
function fillRecurringCategoryOptions(selected=''){
  fillCategorySelect('#recurringCategory',selected);
  fillScopedSubcategories('#recurringCategory','#recurringSubcategory','#recurringSubcategoryWrap');
}
function fillStockCategoryOptions(selected=''){
  fillCategorySelect('#stockCategory',selected);
  fillScopedSubcategories('#stockCategory','#stockSubcategory','#stockSubcategoryWrap');
}
function fillFixedExpenseCategoryOptions(selected=''){
  fillCategorySelect('#fixedExpenseCategory',selected);
  fillScopedSubcategories('#fixedExpenseCategory','#fixedExpenseSubcategory','#fixedExpenseSubcategoryWrap');
}
function reclassifyUncategorizedExpenses(){
  let changed=false;
  for(const e of state.expenses){
    if(e.category||e.categoryStatus==='unclassified')continue;
    const learned=applyLearnedCategory(e,state.categoryRules);
    if(learned.category){
      Object.assign(e,learned);
      changed=true;
    }
  }
  return changed;
}
function syncCategoryConsumers(){
  if(reclassifyUncategorizedExpenses())save();
  fillCategories();
  fillSubcategories();
  fillRecurringCategoryOptions();
  fillStockCategoryOptions();
  fillFixedExpenseCategoryOptions();
  renderConsultationFilters();
  renderReport();
  renderUnclassified();
}
function renameCategoryEverywhere(oldName,newName){
  const clean=String(newName||'').trim();
  if(!oldName||!clean||oldName===clean)return false;
  if(state.categories.some((c)=>c!==oldName&&c.toLowerCase()===clean.toLowerCase()))return false;
  const index=state.categories.indexOf(oldName); if(index<0)return false;
  state.categories[index]=clean;
  state.subcategories[clean]=state.subcategories[oldName]||[];
  delete state.subcategories[oldName];
  state.expenses.forEach((e)=>{if(e.category===oldName)e.category=clean;});
  state.recurring.forEach((e)=>{if(e.category===oldName)e.category=clean;});
  state.stock.forEach((e)=>{if(e.category===oldName)e.category=clean;});
  state.fixedExpenses.forEach((e)=>{if(e.category===oldName)e.category=clean;});
  pending.forEach((e)=>{if(e.category===oldName)e.category=clean;});
  state.categoryRules.forEach((rule)=>{if(rule.category===oldName)rule.category=clean;});
  if(activeSettingsCategory===oldName)activeSettingsCategory=clean;
  save();syncCategoryConsumers();return true;
}
function deleteCategoryEverywhere(category){
  const index=state.categories.indexOf(category); if(index<0)return;
  state.categories.splice(index,1);delete state.subcategories[category];
  state.expenses.forEach((e)=>{if(e.category===category){e.category='';e.subcategory='';e.categoryStatus='unclassified';}});
  state.categoryRules=state.categoryRules.filter((rule)=>rule.category!==category);
  state.recurring.forEach((e)=>{if(e.category===category)e.category='';});
  state.stock.forEach((e)=>{if(e.category===category){e.category='';e.subcategory='';}});
  state.fixedExpenses.forEach((e)=>{if(e.category===category){e.category='';e.subcategory='';}});
  pending.forEach((e)=>{if(e.category===category){e.category='';e.subcategory='';e.categoryStatus='unclassified';}});
  save();syncCategoryConsumers();
}
function renameSubcategoryEverywhere(category,oldName,newName){
  const clean=String(newName||'').trim(), list=[...subcategoriesFor(category)];
  const index=list.indexOf(oldName);
  if(index<0||!clean||list.some((s)=>s!==oldName&&s.toLowerCase()===clean.toLowerCase()))return false;
  list[index]=clean;state.subcategories[category]=list;
  state.expenses.forEach((e)=>{if(e.category===category&&e.subcategory===oldName)e.subcategory=clean;});
  state.stock.forEach((e)=>{if(e.category===category&&e.subcategory===oldName)e.subcategory=clean;});
  state.fixedExpenses.forEach((e)=>{if(e.category===category&&e.subcategory===oldName)e.subcategory=clean;});
  pending.forEach((e)=>{if(e.category===category&&e.subcategory===oldName)e.subcategory=clean;});
  state.categoryRules.forEach((rule)=>{if(rule.category===category&&rule.subcategory===oldName)rule.subcategory=clean;});
  save();syncCategoryConsumers();return true;
}
function fillSubcategories(selected=''){
  const select=$('#subcategory'); if(!select)return;
  const category=$('#category')?.value||'';
  const values=category?subcategoriesFor(category):[];
  select.innerHTML='<option value="">Sin subcategoría</option>'+values.map((s)=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');
  if(selected&&values.includes(selected))select.value=selected;
  $('#subcategoryWrap')?.classList.toggle('hidden',!category);
  $('#quickSubcategory')?.classList.toggle('hidden',!category);
  $('#editSelectedCategory')?.classList.toggle('hidden',!category);
  $('#editSelectedSubcategory')?.classList.toggle('hidden',!category||!select.value);
}

function installPointerReorder(container,selector,onMove,ignore='button,input,select,summary,details,a'){
  if(!container)return;
  let source=null,target=null,pointerId=null;
  const clear=()=>{source?.classList.remove('drag-selected');target?.classList.remove('drag-target');source=null;target=null;pointerId=null;};
  container.querySelectorAll(selector).forEach((row)=>{
    row.onpointerdown=(event)=>{
      if(event.target.closest?.(ignore))return;
      source=row;target=row;pointerId=event.pointerId;row.classList.add('drag-selected');
      row.setPointerCapture?.(pointerId);event.preventDefault();
    };
    row.onpointermove=(event)=>{
      if(!source||event.pointerId!==pointerId)return;
      const candidate=document.elementFromPoint(event.clientX,event.clientY)?.closest?.(selector);
      if(!candidate||!container.contains(candidate)||candidate===target)return;
      target?.classList.remove('drag-target');target=candidate;if(target!==source)target.classList.add('drag-target');
    };
    row.onpointerup=(event)=>{
      if(!source||event.pointerId!==pointerId){clear();return;}
      const from=Number(source.dataset.reorderIndex),to=Number(target?.dataset.reorderIndex);
      if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to)onMove(from,to);
      clear();
    };
    row.onpointercancel=clear;
  });
}
function fillCategories() {
  const selected=$('#category')?.value||'';
  $('#category').innerHTML='<option value="">Sin categoría</option>'+state.categories.map((c)=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  if(selected&&state.categories.includes(selected))$('#category').value=selected;

  const list=$('#categoryList');
  if(!list)return;
  const active=activeSettingsCategory&&state.categories.includes(activeSettingsCategory)?activeSettingsCategory:'';
  activeSettingsCategory=active;
  $('#categoryForm')?.classList.toggle('hidden',!!active);
  $('#categorySettingsIntro')?.classList.toggle('hidden',!!active);
  if($('#categorySettingsTitle')) $('#categorySettingsTitle').textContent=active?active:'Categorías';

  if(active){
    const subs=subcategoriesFor(active);
    list.innerHTML=`<div class="category-folder-head"><button type="button" id="categoryFolderBack" class="screen-back">← Categorías</button><small>SUBCATEGORÍAS DE</small><div class="category-folder-title"><strong>${escape(active)}</strong><button type="button" id="renameActiveCategory">Editar</button></div></div>
      <form id="subcategoryInlineForm" class="inline-form"><input id="newInlineSubcategory" maxlength="40" placeholder="Nueva subcategoría" required><button class="primary">Agregar</button></form>
      <div id="subcategoryFolderList" class="subcategory-folder-list">${subs.length?subs.map((s,si)=>`<article class="subcategory-folder-item reorderable" data-reorder-index="${si}"><span class="drag-grip">↕</span><strong>${escape(s)}</strong><div class="category-row-actions"><button type="button" class="mini-edit" data-edit-subcategory="${si}">Editar</button><button type="button" class="chip-delete" data-delete-subcategory="${si}" aria-label="Eliminar ${escape(s)}">×</button></div></article>`).join(''):'<div class="empty">Todavía no agregaste subcategorías dentro de esta categoría.</div>'}</div>`;
    $('#categoryFolderBack').onclick=()=>{activeSettingsCategory='';fillCategories();};
    $('#renameActiveCategory').onclick=()=>{
      const value=prompt('Nuevo nombre de la categoría:',active)?.trim();
      if(!value)return;
      if(!renameCategoryEverywhere(active,value))return showToast('No pude cambiar el nombre. Revisá que no esté repetido.');
      fillCategories();render();
    };
    $('#subcategoryInlineForm').onsubmit=(event)=>{
      event.preventDefault();
      const value=$('#newInlineSubcategory').value.trim();
      if(!value)return;
      const current=subcategoriesFor(active);
      if(current.some((s)=>s.toLowerCase()===value.toLowerCase()))return showToast('Esa subcategoría ya existe');
      state.subcategories[active]=[...current,value];
      $('#newInlineSubcategory').value='';
      save();syncCategoryConsumers();fillCategories();render();
    };
    document.querySelectorAll('#subcategoryFolderList [data-edit-subcategory]').forEach((button)=>{
      button.onclick=()=>{
        const index=Number(button.dataset.editSubcategory), oldName=subcategoriesFor(active)[index];
        const value=prompt('Nuevo nombre de la subcategoría:',oldName)?.trim();
        if(!value)return;
        if(!renameSubcategoryEverywhere(active,oldName,value))return showToast('No pude cambiar el nombre. Revisá que no esté repetido.');
        fillCategories();render();
      };
    });
    document.querySelectorAll('#subcategoryFolderList [data-delete-subcategory]').forEach((button)=>{
      button.onclick=()=>{
        const index=Number(button.dataset.deleteSubcategory), current=[...subcategoriesFor(active)];
        if(index<0||index>=current.length)return;
        const removed=current[index];
        if(!confirm(`¿Eliminar la subcategoría ${removed}?`))return;
        state.subcategories[active]=current.filter((_,i)=>i!==index);
        state.expenses.forEach((e)=>{if(e.category===active&&e.subcategory===removed)e.subcategory='';});
        state.stock.forEach((e)=>{if(e.category===active&&e.subcategory===removed)e.subcategory='';});
        state.recurring.forEach((e)=>{if(e.category===active&&e.subcategory===removed)e.subcategory='';});
        state.fixedExpenses.forEach((e)=>{if(e.category===active&&e.subcategory===removed)e.subcategory='';});
        pending.forEach((e)=>{if(e.category===active&&e.subcategory===removed)e.subcategory='';});
        state.categoryRules.forEach((rule)=>{if(rule.category===active&&rule.subcategory===removed)rule.subcategory='';});
        save();syncCategoryConsumers();fillCategories();render();
      };
    });
    installPointerReorder($('#subcategoryFolderList'),'.subcategory-folder-item',(from,to)=>{
      const current=[...subcategoriesFor(active)], [item]=current.splice(from,1);
      current.splice(to,0,item);state.subcategories[active]=current;save();syncCategoryConsumers();fillCategories();
    },'button');
  } else {
    list.innerHTML=state.categories.length?state.categories.map((c,i)=>{
      const count=subcategoriesFor(c).length;
      return `<article class="category-folder-row reorderable" data-reorder-index="${i}"><span class="drag-grip">↕</span><button type="button" class="category-folder-open" data-open-category="${i}"><span><strong>${escape(c)}</strong><small>${count?integerText(count)+' subcategoría'+(count===1?'':'s'):'Sin subcategorías'}</small></span><b>›</b></button><button type="button" class="category-folder-delete" data-delete-category="${i}" aria-label="Eliminar ${escape(c)}">×</button></article>`;
    }).join(''):'<p class="muted">Creá categorías como quieras; cada una puede tener subcategorías.</p>';
    document.querySelectorAll('[data-open-category]').forEach((button)=>{
      button.onclick=()=>{activeSettingsCategory=state.categories[Number(button.dataset.openCategory)]||'';fillCategories();};
    });
    document.querySelectorAll('[data-delete-category]').forEach((button)=>{
      button.onclick=()=>{
        const category=state.categories[Number(button.dataset.deleteCategory)];
        if(!category)return;
        if(!confirm(`¿Eliminar la categoría ${category}? Los gastos que la usaban quedarán sin categoría.`))return;
        deleteCategoryEverywhere(category);fillCategories();render();
      };
    });
    installPointerReorder(list,'.category-folder-row',(from,to)=>{
      const [item]=state.categories.splice(from,1);state.categories.splice(to,0,item);save();syncCategoryConsumers();fillCategories();renderReport();
    },'button');
  }
  fillSubcategories();
}
function fillCardSelect() { const method = $('#method').value; const cards = state.cards.filter((c) => c.type === method); $('#expenseCard').innerHTML = '<option value="">Elegí una tarjeta</option>' + cards.map((c) => `<option value="${escape(c.name)}">${escape(c.name)}</option>`).join(''); $('#noCardsHint').classList.toggle('hidden', method === 'Efectivo' || cards.length > 0); }
function monthlyCardTotal(card, date) { return state.expenses.filter((e) => e.card === card.name && e.method === card.type && effectiveDate(e).getFullYear() === date.getFullYear() && effectiveDate(e).getMonth() === date.getMonth()); }
function dateInputValue(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateFromInput(value){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?dateWithCardDay(Number(match[1]),Number(match[2])-1,Number(match[3])):null;}
function setCreditDateDefaults(card=null){
  const closeField=$('#closingDate'),dueField=$('#dueDate');if(!closeField||!dueField)return;
  const base=card||{closingDay:25,dueDay:10};
  if(!closeField.value)closeField.value=card?.closingDate||dateInputValue(nextClosingDateForCard(base,new Date()));
  if(!dueField.value)dueField.value=card?.dueDate||dateInputValue(firstDueDateForCard(base,new Date()));
}
function nextDue(card, now = new Date()) { return nextDueDateForCard(card,now); }
function renderCards() {
  const chooser=$('#cardTypeChooser'),back=$('#cardsBack'),list=$('#cardList'),title=$('#cardSectionTitle'),creditOnly=$('#creditOnly');
  if(!chooser||!list)return;
  const type=activeCardType;
  chooser.classList.toggle('hidden',!!type);back?.classList.toggle('hidden',!type);title?.classList.toggle('hidden',!type);creditOnly?.classList.toggle('hidden',type!=='Crédito');
  if(title)title.textContent=type==='Débito'?'Débito / Cuentas':'Tarjetas de crédito';
  document.querySelectorAll('[data-card-type-view]').forEach((button)=>{button.onclick=()=>{activeCardType=button.dataset.cardTypeView;renderCards();};});
  if(back)back.onclick=()=>{activeCardType='';renderCards();};
  if(!type){list.innerHTML='';return;}

  const now=new Date(),rows=state.cards.map((card,index)=>({card,index})).filter(({card})=>card.type===type);
  list.innerHTML=rows.length?rows.map(({card,index},orderIndex)=>{
    const all=state.expenses.filter((e)=>e.card===card.name&&e.method===card.type),current=monthlyCardTotal(card,now);
    const closeForCycle=card.type==='Crédito'?nextClosingDateForCard(card,now):null,dueForCycle=card.type==='Crédito'?firstDueDateForCard(card,now):null;
    const meta=card.type==='Crédito'?`Cierra ${closeForCycle.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})} · Vence ${dueForCycle.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}`:'Débito inmediato · sin vencimiento de pago';
    const label=card.type==='Crédito'?'Crédito':'Cuenta / Débito';
    const debitDetail=card.type==='Débito'?`<details class="debit-detail"><summary>Ver movimientos</summary>${all.length?all.slice().sort((a,b)=>new Date(b.purchaseDate||b.date)-new Date(a.purchaseDate||a.date)).map((e)=>`<div class="due-line"><span>${new Date(e.purchaseDate||e.date).toLocaleDateString('es-AR')} · ${escape(e.concept||'Sin detalle')}</span><strong>${money(e.amount,e.currency)}</strong></div>`).join(''):'<small class="muted">Sin movimientos.</small>'}</details>`:'';
    return `<article class="card-item reorderable" data-card-id="${escape(card.id)}" data-reorder-index="${orderIndex}" style="--card-color:${escape(card.color||'#173f37')}"><div class="top"><div class="card-name-line"><span class="drag-grip light">↕</span><strong>${escape(card.name)}</strong></div><span>${label}</span></div><p>${meta}</p><div class="card-total"><small>${card.type==='Crédito'?'ACUMULADO DEL MES':'TOTAL ACUMULADO'}</small><strong>${card.type==='Crédito'?totalsHTML(current):totalsHTML(all)}</strong></div>${debitDetail}<div class="card-actions"><button class="edit-card" data-card-id="${escape(card.id)}">Editar</button><button class="delete-card" data-card-id="${escape(card.id)}">Eliminar</button></div></article>`;
  }).join(''):'<div class="empty">No agregaste medios de pago de este tipo.</div>';

  document.querySelectorAll('.edit-card').forEach((b)=>{b.onclick=()=>{const card=state.cards.find((c)=>c.id===b.dataset.cardId);if(!card)return;editingCardId=card.id;$('#cardDialog h2').textContent='Editar tarjeta / cuenta';$('#cardName').value=card.name;$('#cardType').value=card.type;$('#cardColor').value=card.color||'#173f37';$('#closingDate').value='';$('#dueDate').value='';$('#creditCardDates').classList.toggle('hidden',card.type!=='Crédito');if(card.type==='Crédito')setCreditDateDefaults(card);$('#cardDialog').showModal();};});
  document.querySelectorAll('.delete-card').forEach((b)=>{b.onclick=()=>{const index=state.cards.findIndex((c)=>c.id===b.dataset.cardId),card=state.cards[index];if(index<0||!card)return;const linked=(state.recurring||[]).filter((r)=>r.card===card.name&&r.method===card.type);const message=linked.length?`¿Eliminar ${card.name}? Los gastos guardados no se borrarán. ${integerText(linked.length)} gasto(s) recurrente(s) quedarán desactivados.`:'¿Eliminar este medio de pago? Los gastos guardados no se borrarán.';if(!confirm(message))return;state.recurring.forEach((r)=>{if(r.card===card.name&&r.method===card.type){r.card='';r.active=false;}});state.cards.splice(index,1);save();render();};});
  installPointerReorder(list,'.card-item',(from,to)=>{const positions=state.cards.map((card,index)=>card.type===type?index:-1).filter((index)=>index>=0),ordered=positions.map((index)=>state.cards[index]);const [item]=ordered.splice(from,1);ordered.splice(to,0,item);positions.forEach((position,i)=>state.cards[position]=ordered[i]);save();renderCards();},'button,details,summary');

  const credit=state.cards.filter((c)=>c.type==='Crédito');
  $('#dueList').innerHTML=credit.length?credit.map((c)=>{const due=nextDue(c),items=monthlyCardTotal(c,due).slice().sort((a,b)=>effectiveDate(a)-effectiveDate(b));const details=items.length?items.map((e)=>`<div class="due-line"><span>${escape(e.concept||'Sin detalle')}${e.installments>1?` · cuota ${integerText(e.installment||1)} de ${integerText(e.installments)}`:''}</span><strong>${money(e.amount,e.currency)}</strong></div>`).join(''):'<small class="muted">Sin consumos para este vencimiento.</small>';return `<article class="due-item"><div class="due-main"><strong>${escape(c.name)}</strong><p>Próximo vencimiento: ${due.toLocaleDateString('es-AR')}</p><strong class="due-total">${totalsHTML(items)}</strong><div class="due-lines">${details}</div></div></article>`;}).join(''):'<div class="empty">Agregá una tarjeta de crédito para ver vencimientos.</div>';
  $('#cardHistory').innerHTML=credit.map((c)=>`<details class="history-card"><summary>${escape(c.name)}</summary>${Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-i,1),items=monthlyCardTotal(c,d),lines=items.map((e)=>`<small>${escape(e.concept||'Sin detalle')}${e.installments>1?` · ${integerText(e.installment||1)} de ${integerText(e.installments)}`:''}: ${money(e.amount,e.currency)}</small>`).join('');return `<div class="history-row"><div><span>${d.toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</span>${lines}</div><strong>${totalsHTML(items)}</strong></div>`;}).join('')}</details>`).join('');
}
function renderPaymentReminders() { const today = new Date(); today.setHours(12, 0, 0, 0); const allowed = state.settings.reminderDays; const reminders = state.cards.filter((c) => c.type === 'Crédito').map((card) => ({ card, due: nextDue(card, today) })).map((x) => ({ ...x, days: Math.round((x.due - today) / 86400000) })).filter((x) => allowed.includes(x.days)); $('#paymentReminders').innerHTML = reminders.map(({ card, due, days }) => `<article class="payment-alert"><span>▰</span><div><strong>${days ? `Vence en ${integerText(days)} día${days > 1 ? 's' : ''}` : 'Vence hoy'} · ${escape(card.name)}</strong><small>Disponible necesario: ${totalsHTML(monthlyCardTotal(card, due))}</small></div></article>`).join(''); }
function years() { const now = new Date().getFullYear(); return Array.from(new Set([now, ...state.expenses.map((e) => effectiveDate(e).getFullYear())])).sort((a, b) => b - a); }
function chartHTML(items, currency) { const months = Array.from({ length: 12 }, (_, m) => items.filter((e) => effectiveDate(e).getMonth() === m && e.currency === currency).reduce((s, e) => s + e.amount, 0)); const max = Math.max(...months, 1); return months.map((v, i) => `<div class="bar ${currency === 'USD' ? 'usd' : ''}" style="height:${v / max * 100}%" title="${money(v, currency)}"><span>${'EFMAMJJASOND'[i]}</span></div>`).join(''); }

function reportLabel(range, from, to) {
  if (range === 'today') return from.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
  if (range === 'week') return `${from.toLocaleDateString('es-AR')} al ${to.toLocaleDateString('es-AR')}`;
  if (range === 'month') return from.toLocaleDateString('es-AR', { month:'long', year:'numeric' });
  return `${from.toLocaleDateString('es-AR')} al ${to.toLocaleDateString('es-AR')}`;
}
function renderReportRows(target, rows, kind) {
  target.innerHTML = rows.length ? rows.map((r) => `<button class="report-row" data-report-kind="${kind}" data-report-key="${escape(r.key)}"><span><strong>${escape(r.key)}</strong><small>${integerText(r.count)} movimiento${r.count === 1 ? '' : 's'}${r.usd ? ` · ${money(r.usd,'USD')}` : ''}</small></span><strong>${money(r.arsEquivalent,'ARS')}</strong></button>`).join('') : '<div class="empty">Sin movimientos.</div>';
}
function renderReportChart(rows){
  const target=$('#reportChart'); if(!target)return;
  const top=rows.slice(0,6), max=Math.max(...top.map((r)=>r.arsEquivalent),1);
  target.innerHTML=top.length?top.map((r)=>`<div class="report-chart-row"><span>${escape(r.key)}</span><div><i style="width:${Math.max(2,r.arsEquivalent/max*100)}%"></i></div><strong>${money(r.arsEquivalent,'ARS')}</strong></div>`).join(''):'<div class="empty">Sin datos para graficar.</div>';
}
function configuredCategoryRows(items){
  const grouped=groupExpenses(items,e=>e.category || 'Sin categoría');
  const map=new Map(grouped.map((row)=>[row.key,row]));
  const configured=state.categories.map((category)=>map.get(category)||{key:category,ars:0,usd:0,arsEquivalent:0,count:0});
  const extras=grouped.filter((row)=>!state.categories.includes(row.key));
  return [...configured,...extras];
}
function configuredCardRows(items,method){
  const grouped=groupExpenses(items.filter((e)=>e.method===method),e=>e.card || 'Sin tarjeta');
  const map=new Map(grouped.map((row)=>[row.key,row]));
  const configured=state.cards.filter((card)=>card.type===method).map((card)=>map.get(card.name)||{key:card.name,ars:0,usd:0,arsEquivalent:0,count:0});
  const extras=grouped.filter((row)=>!state.cards.some((card)=>card.type===method&&card.name===row.key));
  return [...configured,...extras];
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
  const categoryRows=configuredCategoryRows(items);
  renderReportChart(categoryRows.filter((r)=>r.arsEquivalent>0));
  renderReportRows($('#reportCategories'),categoryRows,'category');
  renderReportRows($('#reportMethods'),groupExpenses(items,e=>e.method || 'Sin definir'),'method');
  const top = items.slice().sort((a,b)=>expenseArsEquivalent(b)-expenseArsEquivalent(a)).slice(0,8);
  $('#reportTop').innerHTML = top.length ? top.map((e) => `<button class="report-row report-expense"><span><strong>${escape(e.concept || 'Sin detalle')}</strong><small>${new Date(e.purchaseDate || e.date).toLocaleDateString('es-AR')} · ${escape(e.category || 'Sin categoría')} · ${escape(e.method || '')}</small></span><strong>${money(e.amount,e.currency)}</strong></button>`).join('') : '<div class="empty">Sin movimientos.</div>';
  $('#reportDrilldown').classList.add('hidden');
  document.querySelectorAll('[data-report-kind]').forEach((b) => b.onclick = () => {
    const kind=b.dataset.reportKind, key=b.dataset.reportKey;
    if(kind==='category'){
      const filtered=items.filter((e)=>(e.category||'Sin categoría')===key);
      const configuredSubs=subcategoriesFor(key);
      const groupedSubs=groupExpenses(filtered,e=>e.subcategory || 'Sin subcategoría');
      const subMap=new Map(groupedSubs.map((row)=>[row.key,row]));
      const rows=[
        ...configuredSubs.map((sub)=>subMap.get(sub)||{key:sub,ars:0,usd:0,arsEquivalent:0,count:0}),
        ...groupedSubs.filter((row)=>!configuredSubs.includes(row.key))
      ];
      $('#reportDrilldown').innerHTML=`<div class="report-drill-head"><strong>${escape(key)}</strong><button id="closeReportDetail">← Atrás</button></div><p class="muted">Subcategorías</p><div class="report-list">${rows.length?rows.map((row)=>`<div class="report-row static"><span><strong>${escape(row.key)}</strong><small>${integerText(row.count)} movimiento${row.count===1?'':'s'}</small></span><strong>${money(row.arsEquivalent,'ARS')}</strong></div>`).join(''):'<div class="empty">Sin subcategorías.</div>'}</div>${filtered.length?filtered.map((e)=>expenseHTML(e,true)).join(''):'<div class="empty">Todavía no hay gastos en esta categoría.</div>'}`;
    } else if(kind==='method'&&['Débito','Crédito'].includes(key)){
      const filtered=items.filter((e)=>e.method===key);
      const rows=configuredCardRows(items,key);
      $('#reportDrilldown').innerHTML=`<div class="report-drill-head"><strong>${escape(key)}</strong><button id="closeReportDetail">← Atrás</button></div><p class="muted">${key==='Débito'?'Tarjetas y cuentas de débito':'Tarjetas de crédito'}</p><div class="report-list">${rows.map((row)=>`<div class="report-row static"><span><strong>${escape(row.key)}</strong><small>${integerText(row.count)} movimiento${row.count===1?'':'s'}</small></span><strong>${money(row.arsEquivalent,'ARS')}</strong></div>`).join('')}</div>${filtered.length?filtered.map((e)=>expenseHTML(e,true)).join(''):'<div class="empty">Todavía no hay gastos con este medio de pago.</div>'}`;
    } else {
      const filtered=items.filter((e)=>(e.method||'Sin definir')===key);
      $('#reportDrilldown').innerHTML=`<div class="report-drill-head"><strong>${escape(key)}</strong><button id="closeReportDetail">← Atrás</button></div>${filtered.length?filtered.map((e)=>expenseHTML(e,true)).join(''):'<div class="empty">Sin movimientos.</div>'}`;
    }
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
function openExpense(data = {}) { $('#expenseForm').reset(); setLocalizedInput('#amount',data.amount||'',2); $('#concept').value = data.concept === 'Sin concepto' ? '' : data.concept || ''; const voiceNeedsMethod=data.source==='voice'&&needsPaymentMethod(data); $('#method').value = voiceNeedsMethod ? '' : data.method || 'Efectivo'; $('#installments').value = data.installments || 1; document.querySelector(`[name=currency][value=${data.currency || 'ARS'}]`).checked = true; fillCategories(); $('#category').value = data.category || ''; fillSubcategories(data.subcategory || ''); const firstMissingStep=!Number(data.amount)?1:(!data.category&&data.categoryStatus==='unclassified'?2:(voiceNeedsMethod?3:1)); setManualStep(firstMissingStep); updatePaymentFields(); $('#expenseCard').value = data.card || ''; updateInstallmentPreview(); $('#expenseDialog').showModal(); }
function updatePaymentFields() { const method = $('#method').value; $('#cardFields').classList.toggle('hidden', !method || method === 'Efectivo'); $('#creditFields').classList.toggle('hidden', method !== 'Crédito'); fillCardSelect(); updateInstallmentPreview(); }
function updateInstallmentPreview() { const card = state.cards.find((c) => c.name === $('#expenseCard').value && c.type === $('#method').value), count = Number($('#installments').value || 1), amount = localizedInputNumber('#amount'); if ($('#method').value !== 'Crédito' || !card || !amount) return $('#installmentPreview').innerHTML = ''; const due = firstDueDateForCard(card); $('#installmentPreview').innerHTML = `<strong>${integerText(count)} × ${money(amount / count, document.querySelector('[name=currency]:checked').value)}</strong><span>Primera cuota ${due.toLocaleDateString('es-AR')}; luego vence el día ${integerText(card.dueDay)} de cada mes.</span>`; }
function pendingCreditDetail(e){
  if(e.method!=='Crédito'||!e.card||!e.amount||e.installmentsSpecified===false)return '';
  const card=state.cards.find((c)=>c.name===e.card&&c.type==='Crédito'); if(!card)return '';
  const count=Math.max(1,Number(e.installments||1));
  const due=firstDueDateForCard(card,new Date(e.purchaseDate||e.date));
  return `<div class="pending-credit-detail"><span>${integerText(count)} cuota${count===1?'':'s'} de <strong>${money(Number(e.amount)/count,e.currency)}</strong></span><span>Primera cuota: <strong>${due.toLocaleDateString('es-AR')}</strong></span></div>`;
}
function normVoiceChoice(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function pendingDatePrompt(e,i){
  if(!e.dateAmbiguous)return '';
  const choices=Array.isArray(e.dateChoices)?e.dateChoices:[];
  return `<div class="pending-payment-question"><strong>¿Qué fecha quisiste decir?</strong>${choices.length?`<div class="pending-payment-actions">${choices.map((choice,choiceIndex)=>`<button type="button" data-pending-date-choice="${choiceIndex}" data-index="${i}">${escape(choice.label)}</button>`).join('')}</div>`:'<small class="muted">La fecha quedó ambigua. Corregila antes de confirmar.</small>'}</div>`;
}
function pendingAmountPrompt(e,i){
  if(e.amount)return '';
  return `<div class="pending-payment-question pending-amount-question"><strong>¿Cuánto pagaste?</strong><div class="pending-amount-row"><input class="pending-amount-input" data-index="${i}" inputmode="decimal" data-local-number="2" autocomplete="off" placeholder="Ej. 50.000"><button type="button" data-pending-amount-save="${i}">Guardar importe</button></div><button type="button" class="voice-pay" data-pending-amount-voice="${i}">🎙 Mantener para responder</button><small class="muted">Falta el importe: no se puede confirmar hasta completarlo.</small></div>`;
}
function pendingCategoryPrompt(e,i){
  const needsCategory=!e.category;
  if(!needsCategory)return '';
  const options=state.categories.map((category)=>`<option value="${escape(category)}">${escape(category)}</option>`).join('');
  return `<div class="pending-payment-question pending-category-question"><strong>No estoy seguro de la categoría</strong>${state.categories.length?`<select class="pending-category-select" data-index="${i}"><option value="">Clasificar ahora (opcional)</option>${options}</select>`:'<small class="muted">Todavía no tenés categorías creadas.</small>'}<button type="button" class="category-create-button pending-create-category" data-pending-add-category="${i}">＋ Agregar categoría</button><div class="pending-payment-actions pending-category-actions"><button type="button" data-pending-uncategorized="${i}">Dejar sin clasificar</button><button type="button" class="voice-pay" data-pending-category-voice="${i}">🎙 Decir categoría</button></div><small class="muted">Podés confirmar el gasto sin clasificar y ordenarlo después desde “Compras sin clasificar”.</small></div>`;
}
function pendingSubcategoryPrompt(e,i){
  if(!e.category)return '';
  const values=subcategoriesFor(e.category);
  return `<div class="pending-subcategory-choice"><label>Subcategoría (opcional)${values.length?`<select class="pending-subcategory-select" data-index="${i}"><option value="">Sin subcategoría</option>${values.map((value)=>`<option value="${escape(value)}" ${e.subcategory===value?'selected':''}>${escape(value)}</option>`).join('')}</select>`:'<small class="muted">Todavía no hay subcategorías en esta categoría.</small>'}</label><button type="button" class="category-create-button pending-create-subcategory" data-pending-add-subcategory="${i}">＋ Agregar subcategoría</button></div>`;
}
function pendingPaymentPrompt(e,i){
  const needsMethod=needsPaymentMethod(e);
  const needsCard=needsPaymentCard(e);
  const needsInstallments=needsPaymentInstallments(e);
  if(needsMethod){
    return `<div class="pending-payment-question"><strong>¿Con qué pagaste?</strong><div class="pending-payment-actions"><button type="button" data-pending-method="Efectivo" data-index="${i}">Efectivo</button><button type="button" data-pending-method="Débito" data-index="${i}">Débito</button><button type="button" data-pending-method="Crédito" data-index="${i}">Crédito</button><button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Mantener para responder</button></div></div>`;
  }
  if(needsCard){
    const cards=state.cards.filter((c)=>c.type===e.method);
    return `<div class="pending-payment-question"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class="pending-card-select" data-index="${i}"><option value="">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('')}</select>`:'<small class="muted">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<div class="pending-payment-actions"><button type="button" class="secondary pending-back" data-pending-back="method" data-index="${i}">← Atrás</button><button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Mantener para responder</button></div></div>`;
  }
  if(needsInstallments){
    return `<div class="pending-payment-question"><strong>¿En cuántas cuotas?</strong><select class="pending-installments-select" data-index="${i}"><option value="">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value="${n}">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><div class="pending-payment-actions"><button type="button" class="secondary pending-back" data-pending-back="card" data-index="${i}">← Atrás</button><button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Mantener para responder</button></div></div>`;
  }
  return '';
}
function applyPendingAmountVoice(index,phrase){
  const item=pending[index];if(!item)return;
  const amount=Number(parseAmount(phrase));
  if(!Number.isFinite(amount)||amount<=0){showToast('No pude reconocer el importe. Decilo de nuevo o escribilo');return;}
  item.amount=amount;
  showPending();
}
function applyPendingCategoryVoice(index,phrase){
  const item=pending[index];if(!item)return;
  const spoken=normVoiceChoice(phrase);
  if(/\bsin categoria\b/.test(spoken)){
    item.category='';item.subcategory='';item.categoryStatus='unclassified';showPending();return;
  }
  const subMatches=[];
  for(const [parent,values] of Object.entries(state.subcategories||{})){
    for(const value of Array.isArray(values)?values:[]){
      const normalizedValue=normVoiceChoice(value);
      if(normalizedValue&&spoken.includes(normalizedValue))subMatches.push({parent,value,length:normalizedValue.length});
    }
  }
  subMatches.sort((a,b)=>b.length-a.length);
  if(subMatches.length){
    item.category=subMatches[0].parent;item.subcategory=subMatches[0].value;item.categoryStatus='manual';item.learnCategory=true;showPending();return;
  }
  const categoryMatches=state.categories
    .map((category)=>({category,normalized:normVoiceChoice(category)}))
    .filter(({normalized})=>normalized&&spoken.includes(normalized))
    .sort((a,b)=>b.normalized.length-a.normalized.length);
  if(categoryMatches.length){
    item.category=categoryMatches[0].category;item.subcategory='';item.categoryStatus='manual';item.learnCategory=true;showPending();return;
  }
  showToast('No reconocí esa categoría. Elegila de la lista o decí “sin categoría”');
}
function paymentVoiceAlias(name){
  return normVoiceChoice(name)
    .replace(/\b(?:cuenta|tarjeta|debito|credito)\b/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function applyPendingPaymentVoice(index,phrase){
  const item=pending[index]; if(!item)return;
  const spoken=normVoiceChoice(phrase);
  const namedAll=state.cards
    .filter((c)=>{
      if(!c?.name)return false;
      const full=normVoiceChoice(c.name),alias=paymentVoiceAlias(c.name);
      return spoken.includes(full)||(alias&&spoken.includes(alias));
    })
    .map((c)=>{
      const full=normVoiceChoice(c.name),alias=paymentVoiceAlias(c.name);
      return {c,index:Math.max(spoken.lastIndexOf(full),alias?spoken.lastIndexOf(alias):-1)};
    })
    .sort((a,b)=>b.index-a.index);
  const explicit=[...spoken.matchAll(/\b(efectivo|debito|credito)\b/g)];
  const explicitMethod=explicit.length?({efectivo:'Efectivo',debito:'Débito',credito:'Crédito'}[explicit.at(-1)[1]]):'';
  const mentionsPayment=namedAll.length>0 || explicit.length>0 || /\bcuotas?\b/.test(spoken);
  let method=needsPaymentMethod(item)?'Sin definir':item.method;
  if(explicitMethod) method=explicitMethod;
  else if(/\bcuotas?\b/.test(spoken)) method='Crédito';
  else if(namedAll.length) method='Débito';
  else if(method==='Sin definir'&&mentionsPayment) method='Débito';

  if(method==='Sin definir'){showToast('Decí efectivo, débito o crédito, o nombrá una tarjeta o cuenta');return;}
  const methodChanged=item.method!==method;
  item.method=method;
  if(method==='Efectivo'){item.card='';item.installments=1;item.installmentsSpecified=true;showPending();return;}
  if(method==='Débito'){item.installments=1;item.installmentsSpecified=true;}
  if(method==='Crédito'){
    if(methodChanged&&item.installmentsSpecified!==true)item.installmentsSpecified=false;
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
  const named=namedAll.find(({c})=>c.type===method)?.c;
  if(named)item.card=named.name;
  else if(methodChanged||namedAll.length)item.card='';
  showPending();
  if(['Débito','Crédito'].includes(method)&&!item.card){
    showToast(cards.length?'Decí o elegí qué tarjeta o cuenta usaste':'Primero agregá una tarjeta o cuenta de este tipo');
  }
}
let pendingVoiceRecognition=null;
let pendingVoiceSession=null;
function pendingVoiceStartCue(){
  navigator.vibrate?.(25);
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    const ctx=new AudioCtx(),osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.frequency.value=620; gain.gain.value=.02; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+.06);
  }catch{}
}
function restorePendingVoiceButton(button){
  if(!button)return;
  button.classList.remove('listening');
  button.textContent='🎙 Mantener para responder';
}
function finishPendingPaymentVoice(){
  const session=pendingVoiceSession;
  if(!session)return;
  const phrase=[session.transcript,session.cycle].filter(Boolean).join(' ').trim();
  const button=session.button;
  pendingVoiceSession=null;
  pendingVoiceRecognition=null;
  restorePendingVoiceButton(button);
  if(phrase){
    if(session.mode==='amount')applyPendingAmountVoice(session.index,phrase);
    else if(session.mode==='category')applyPendingCategoryVoice(session.index,phrase);
    else applyPendingPaymentVoice(session.index,phrase);
  } else showToast('No escuché una respuesta. Mantené presionado y hablá');
}
function launchPendingPaymentVoiceCycle(){
  const session=pendingVoiceSession;
  if(!session||!session.pressed||pendingVoiceRecognition)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return;
  const rec=new SR();
  pendingVoiceRecognition=rec;
  session.cycle='';
  rec.lang='es-AR';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
  rec.onstart=()=>{
    session.button?.classList.add('listening');
    if(session.button)session.button.textContent='🎙 Escuchando… soltá para terminar';
  };
  rec.onresult=(event)=>{
    let text='';
    for(let i=0;i<event.results.length;i++)text+=' '+(event.results[i][0]?.transcript||'');
    session.cycle=text.trim();
  };
  rec.onerror=(event)=>{
    if(event.error==='not-allowed')showToast('Activá el permiso del micrófono');
    else if(!['aborted','no-speech'].includes(event.error))showToast('No pude escuchar la respuesta');
  };
  rec.onend=()=>{
    const current=pendingVoiceSession;
    pendingVoiceRecognition=null;
    if(!current)return;
    if(current.cycle){
      current.transcript=[current.transcript,current.cycle].filter(Boolean).join(' ').trim();
      current.cycle='';
    }
    if(current.pressed){setTimeout(launchPendingPaymentVoiceCycle,25);return;}
    finishPendingPaymentVoice();
  };
  try{rec.start();}catch{
    pendingVoiceRecognition=null;
    if(session.pressed)setTimeout(launchPendingPaymentVoiceCycle,60);
    else finishPendingPaymentVoice();
  }
}
function startPendingPaymentVoice(index,button,mode='payment'){
  if(pendingVoiceSession)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    const question=mode==='amount'?'Decí o escribí cuánto pagaste.':mode==='category'?'Decí o escribí la categoría (o “sin categoría”).':'Decí o escribí el medio, la tarjeta o la cantidad de cuotas.';
    const phrase=prompt(question);
    if(phrase){
      if(mode==='amount')applyPendingAmountVoice(index,phrase);
      else if(mode==='category')applyPendingCategoryVoice(index,phrase);
      else applyPendingPaymentVoice(index,phrase);
    }
    return;
  }
  pendingVoiceSession={index,button,mode,pressed:true,transcript:'',cycle:''};
  if(button){
    button.classList.add('listening');
    button.textContent='🎙 Escuchando… soltá para terminar';
  }
  pendingVoiceStartCue();
  launchPendingPaymentVoiceCycle();
}
function stopPendingPaymentVoice(){
  const session=pendingVoiceSession;
  if(!session)return;
  session.pressed=false;
  if(pendingVoiceRecognition){
    try{pendingVoiceRecognition.stop();}catch{pendingVoiceRecognition=null;finishPendingPaymentVoice();return;}
    setTimeout(()=>{
      if(pendingVoiceSession!==session)return;
      if(pendingVoiceRecognition){try{pendingVoiceRecognition.abort();}catch{}pendingVoiceRecognition=null;}
      finishPendingPaymentVoice();
    },900);
  }else finishPendingPaymentVoice();
}
function showPending() {
  if (!pending.length) { if ($('#confirmDialog').open) $('#confirmDialog').close(); return; }
  $('#pendingList').innerHTML = pending.map((e, i) => {
    const needsMethod=needsPaymentMethod(e);
    const needsCard=needsPaymentCard(e);
    const needsInstallments=needsPaymentInstallments(e);
    const needsDate=!!e.dateAmbiguous;
    const needsCategory=!e.category;
    const methodLabel=needsMethod?'Medio de pago pendiente':e.method;
    const when=new Date(e.purchaseDate||e.date);
    const whenLabel=needsDate?'Fecha pendiente':(e.dateSpecified&&!e.timeSpecified?when.toLocaleDateString('es-AR'):when.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'}));
    const installmentLabel=e.method==='Crédito'?(needsInstallments?'Cuotas pendientes':`${integerText(Math.max(1,Number(e.installments||1)))} cuota${Number(e.installments||1)===1?'':'s'}`):'';
    const categoryLabel=needsCategory?'Sin clasificar':e.category;
    const meta=[whenLabel,categoryLabel,methodLabel,e.card,installmentLabel].filter(Boolean).join(' · ');
    const incomplete=!e.amount||needsMethod||needsCard||needsInstallments||needsDate;
    return `<article class="pending" data-index="${i}"><div class="pending-head"><div><strong>${escape(e.concept)}</strong><p class="muted">${escape(meta)}</p></div><strong>${e.amount ? money(e.amount, e.currency) : 'Sin importe'}</strong></div>${pendingAmountPrompt(e,i)}${pendingDatePrompt(e,i)}${pendingPaymentPrompt(e,i)}${pendingCategoryPrompt(e,i)}${pendingSubcategoryPrompt(e,i)}${pendingCreditDetail(e)}<div class="actions"><button class="edit">${incomplete?'✎ Corregir / completar':'Corregir'}</button><button class="confirm" ${incomplete ? 'disabled' : ''}>✓ Confirmar</button></div></article>`;
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
  document.querySelectorAll('.pending-category-select').forEach((select)=>{
    select.onchange=()=>{
      const item=pending[Number(select.dataset.index)];if(!item||!select.value)return;
      item.category=select.value;item.subcategory='';item.categoryStatus='manual';item.learnCategory=true;showPending();
    };
  });
  document.querySelectorAll('[data-pending-add-category]').forEach((button)=>{
    button.onclick=()=>{
      const item=pending[Number(button.dataset.pendingAddCategory)];if(!item)return;
      const value=prompt('Nombre de la nueva categoría:')?.trim();
      if(!value)return;
      const category=createCategoryEverywhere(value);
      if(!category)return;
      item.category=category;item.subcategory='';item.categoryStatus='manual';item.learnCategory=true;showPending();
    };
  });
  document.querySelectorAll('[data-pending-add-subcategory]').forEach((button)=>{
    button.onclick=()=>{
      const item=pending[Number(button.dataset.pendingAddSubcategory)];if(!item||!item.category)return;
      const value=prompt(`Nueva subcategoría dentro de ${item.category}:`)?.trim();
      if(!value)return;
      if(!addSubcategory(item.category,value)){
        const existing=subcategoriesFor(item.category).find((s)=>s.toLowerCase()===value.toLowerCase());
        if(existing){item.subcategory=existing;showPending();return;}
        return showToast('Esa subcategoría ya existe');
      }
      item.subcategory=value;item.categoryStatus='manual';item.learnCategory=true;showPending();
    };
  });
  document.querySelectorAll('.pending-subcategory-select').forEach((select)=>{
    select.onchange=()=>{
      const item=pending[Number(select.dataset.index)];if(!item)return;
      item.subcategory=select.value||'';showPending();
    };
  });
  document.querySelectorAll('[data-pending-uncategorized]').forEach((button)=>{
    button.onclick=()=>{
      const item=pending[Number(button.dataset.pendingUncategorized)];if(!item)return;
      item.category='';item.subcategory='';item.categoryStatus='unclassified';showPending();
    };
  });
  document.querySelectorAll('[data-pending-category-voice]').forEach((button)=>{
    const index=Number(button.dataset.pendingCategoryVoice);
    button.onclick=(event)=>event.preventDefault();
    button.oncontextmenu=(event)=>event.preventDefault();
    button.onpointerdown=(event)=>{
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      startPendingPaymentVoice(index,button,'category');
    };
    button.onpointerup=(event)=>{event.preventDefault();stopPendingPaymentVoice();};
    button.onpointercancel=(event)=>{event.preventDefault();stopPendingPaymentVoice();};
    button.onpointerleave=(event)=>{if(event.buttons===0)stopPendingPaymentVoice();};
  });
  const savePendingAmount=(index)=>{
    const input=document.querySelector(`.pending-amount-input[data-index="${index}"]`);
    const item=pending[index];if(!input||!item)return;
    const amount=parseLocalizedNumber(input.value);
    if(!Number.isFinite(amount)||amount<=0)return showToast('Ingresá un importe válido');
    item.amount=amount;showPending();
  };
  bindLocalizedNumberInputs($('#pendingList'));
  document.querySelectorAll('[data-pending-amount-save]').forEach((button)=>{
    button.onclick=()=>savePendingAmount(Number(button.dataset.pendingAmountSave));
  });
  document.querySelectorAll('.pending-amount-input').forEach((input)=>{
    input.onkeydown=(event)=>{if(event.key==='Enter'){event.preventDefault();savePendingAmount(Number(input.dataset.index));}};
  });
  document.querySelectorAll('[data-pending-amount-voice]').forEach((button)=>{
    const index=Number(button.dataset.pendingAmountVoice);
    button.onclick=(event)=>event.preventDefault();
    button.oncontextmenu=(event)=>event.preventDefault();
    button.onpointerdown=(event)=>{
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      startPendingPaymentVoice(index,button,'amount');
    };
    button.onpointerup=(event)=>{event.preventDefault();stopPendingPaymentVoice();};
    button.onpointercancel=(event)=>{event.preventDefault();stopPendingPaymentVoice();};
    button.onpointerleave=(event)=>{if(event.buttons===0)stopPendingPaymentVoice();};
  });
  document.querySelectorAll('[data-pending-pay-voice]').forEach((button)=>{
    const index=Number(button.dataset.pendingPayVoice);
    button.onclick=(event)=>event.preventDefault();
    button.oncontextmenu=(event)=>event.preventDefault();
    button.onpointerdown=(event)=>{
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      startPendingPaymentVoice(index,button);
    };
    button.onpointerup=(event)=>{event.preventDefault();stopPendingPaymentVoice();};
    button.onpointercancel=(event)=>{event.preventDefault();stopPendingPaymentVoice();};
    button.onpointerleave=(event)=>{if(event.buttons===0)stopPendingPaymentVoice();};
  });
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
  $('#resaleInvestment').textContent = money(total.investment, 'ARS');
  $('#resaleRecovered').textContent = money(total.recovered, 'ARS');
  $('#resaleSales').textContent = money(total.sales, 'ARS');
  $('#resaleNet').textContent = money(total.netGain, 'ARS');
  $('#resaleGainPercent').textContent = `${pct(total.gainPercent)} global de ganancias`;
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
        return `<tr><td><strong>${escape(displayLabel)}</strong></td><td>${money(m.investment,'ARS')}</td><td>${money(m.recovered,'ARS')}</td><td>${money(m.sales,'ARS')}</td><td>${money(m.netGain,'ARS')}</td><td>${pct(m.gainPercent)}</td></tr>`;
      }).join('');
  }
  if ($('#resaleOwnerHead')) $('#resaleOwnerHead').textContent = `Ganancia Mauro (${numberText(split.ownerPercent,1)}%)`;
  if ($('#resaleSellerHead')) $('#resaleSellerHead').textContent = `Total vendedor (${numberText(split.sellerPercent,1)}%)`;
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
        <div class="resale-ticket-head"><div><strong>${escape(ticket.type)} · #${integerText(ticket.number)}</strong><small>Costo ${money(ticket.cost, 'ARS')}</small></div><select class="resale-status">
          ${['Disponible','Vendida','Uso personal'].map((s) => `<option ${ticket.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="resale-ticket-sale"><label>Precio de venta<span class="resale-money-input"><b>$</b><input class="resale-price" type="text" inputmode="decimal" data-local-number="2" value="${formatNumericInputValue(ticket.salePrice||0,{maximumFractionDigits:2})}"></span></label>
        <div class="resale-ticket-result"><span>Recuperado <strong>${money(tm.recovered, 'ARS')}</strong></span><span>Ganancia <strong>${money(tm.netGain, 'ARS')}</strong></span><span>% <strong>${sold ? pct(tm.gainPercent) : '—'}</strong></span><span>Mauro <strong>${money(tm.ownerGain, 'ARS')}</strong></span><span>Vendedor <strong>${money(tm.sellerGain, 'ARS')}</strong></span></div></div>
      </div>`;
    }).join('');
    return `<details class="resale-party" data-party-id="${escape(party.id)}"><summary><strong>${escape(party.name)}</strong><span>›</span></summary>
      <div class="resale-party-meta">${party.date ? new Date(party.date + 'T12:00:00').toLocaleDateString('es-AR') : 'Sin fecha'} · ${integerText(m.totalTickets)} entradas</div>
      <div class="resale-metrics"><div><small>Costo recuperado</small><strong>${money(m.recovered,'ARS')}</strong></div><div><small>Ventas</small><strong>${money(m.sales,'ARS')}</strong></div><div class="metric-wide"><small>Ganancia neta</small><strong>${money(m.netGain,'ARS')}</strong><em>${pct(m.gainPercent)} general</em></div><div><small>Total Mauro</small><strong>${money(m.totalForOwner,'ARS')}</strong></div><div><small>Total vendedor</small><strong>${money(m.sellerGain,'ARS')}</strong></div></div>
      <div class="resale-tickets">${tickets}</div><button class="delete-party" type="button">Eliminar fiesta</button></details>`;
  }).join('');
  bindLocalizedNumberInputs($('#resaleList'));
  document.querySelectorAll('.resale-ticket').forEach((row) => {
    const party = state.resale.parties.find((p) => p.id === row.dataset.partyId);
    const ticket = party?.tickets.find((t) => t.id === row.dataset.ticketId);
    if (!ticket) return;
    const refreshKeepingPartyOpen = (update, { focusPrice = false } = {}) => {
      const partyId = row.dataset.partyId;
      const ticketId = row.dataset.ticketId;
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      update();
      save();
      renderResale();
      const updatedParty = [...document.querySelectorAll('.resale-party')].find((card) => card.dataset.partyId === partyId);
      if (updatedParty) updatedParty.open = true;
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop, left: 0, behavior: 'instant' });
        if (focusPrice) {
          const updatedRow = [...document.querySelectorAll('.resale-ticket')].find((item) => item.dataset.ticketId === ticketId);
          const priceInput = updatedRow?.querySelector('.resale-price');
          priceInput?.focus();
          priceInput?.select();
          showToast('Ingresá el precio de venta');
        }
      });
    };
    row.querySelector('.resale-status').onchange = (e) => {
      const nextStatus = e.target.value;
      const needsPrice = nextStatus === 'Vendida' && Number(ticket.salePrice || 0) <= 0;
      refreshKeepingPartyOpen(() => { ticket.status = nextStatus; }, { focusPrice: needsPrice });
    };
    row.querySelector('.resale-price').onchange = (e) => refreshKeepingPartyOpen(() => { ticket.salePrice = parseLocalizedNumber(e.target.value); });
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
    return `<article class="settings-item" data-trash-id="${escape(r.id)}"><div><strong>${escape(first.concept||'Gasto')}</strong><small>${money(total,first.currency||'ARS')} · ${integerText(days)} días restantes</small></div><div class="mini-actions"><button class="restore-trash" type="button">Restaurar</button><button class="delete-trash" type="button">Eliminar</button></div></article>`;
  }).join(''):'<div class="empty">La Papelera está vacía.</div>';
  document.querySelectorAll('[data-trash-id]').forEach((row)=>{const id=row.dataset.trashId;row.querySelector('.restore-trash').onclick=()=>{const rec=state.trash.find((x)=>x.id===id);if(!rec)return;state.expenses.push(...rec.items);state.trash=state.trash.filter((x)=>x.id!==id);save();render();renderTrash();showToast('Gasto restaurado');};row.querySelector('.delete-trash').onclick=()=>{if(!confirm('¿Eliminar definitivamente este gasto?'))return;state.trash=state.trash.filter((x)=>x.id!==id);save();renderTrash();};});
}
document.addEventListener('click',(e)=>{const b=e.target.closest?.('[data-delete-expense]');if(!b)return;if(confirm('¿Enviar este gasto a Papelera?'))moveExpenseToTrash(b.dataset.deleteExpense);});

function recurringCardOptions(method,selected=''){const cards=state.cards.filter((c)=>c.type===method);return '<option value="">Elegí una tarjeta</option>'+cards.map((c)=>`<option value="${escape(c.name)}" ${c.name===selected?'selected':''}>${escape(c.name)}</option>`).join('');}
function updateRecurringCardField(){const method=$('#recurringMethod').value;$('#recurringCardWrap').classList.toggle('hidden',method==='Efectivo');$('#recurringCard').innerHTML=recurringCardOptions(method,$('#recurringCard').value);}
function openRecurringDialog(item=null){editingRecurringId=item?.id||null;$('#recurringForm').reset();$('#recurringTitle').textContent=item?'Editar recurrente':'Nuevo recurrente';$('#recurringConcept').value=item?.concept||'';setLocalizedInput('#recurringAmount',item?.amount||'',2);$('#recurringCurrency').value=item?.currency||'ARS';fillRecurringCategoryOptions(item?.category||'');$('#recurringMethod').value=item?.method||'Efectivo';$('#recurringDay').value=item?.day||1;updateRecurringCardField();$('#recurringCard').value=item?.card||'';$('#recurringDialog').showModal();}
function renderRecurringSettings(){if(!$('#recurringList'))return;$('#recurringList').innerHTML=state.recurring.length?state.recurring.map((r)=>`<article class="settings-item" data-recurring-id="${escape(r.id)}"><div><strong>${escape(r.concept)}</strong><small>${money(r.amount,r.currency)} · día ${integerText(r.day)} · ${escape(r.method)}${r.card?' · '+escape(r.card):''}</small></div><div class="mini-actions"><button class="edit-recurring" type="button">Editar</button><button class="toggle-recurring" type="button">${r.active===false?'Activar':'Desactivar'}</button></div></article>`).join(''):'<div class="empty">No configuraste gastos recurrentes.</div>';document.querySelectorAll('[data-recurring-id]').forEach((row)=>{const r=state.recurring.find((x)=>x.id===row.dataset.recurringId);if(!r)return;row.querySelector('.edit-recurring').onclick=()=>openRecurringDialog(r);row.querySelector('.toggle-recurring').onclick=()=>{r.active=r.active===false?true:false;save();renderRecurringSettings();};});}
function prepareRecurringDue(){ /* legado: los gastos fijos variables reemplazan el alta automática de recurrentes */ }

function previousMonthKey(key){
  const match=String(key||'').match(/^(\d{4})-(\d{2})$/);
  const date=match?new Date(Number(match[1]),Number(match[2])-2,1):new Date(new Date().getFullYear(),new Date().getMonth()-1,1);
  return monthKey(date);
}
function fixedExpensePayments(item,key){
  return state.expenses.filter((e)=>e.fixedExpenseId===item.id&&e.fixedExpenseMonth===key);
}
function fixedExpenseAmountForMonth(item,key){
  return fixedExpensePayments(item,key).reduce((sum,e)=>sum+Number(e.amount||0),0);
}
function fixedExpensePreviousAmount(item,key){
  const amount=fixedExpenseAmountForMonth(item,previousMonthKey(key));
  return amount || Number(item.legacyAmount||0);
}
function fixedExpenseIsPaid(item,key){
  return fixedExpensePayments(item,key).length>0;
}
function fixedExpensePendingForMonth(key){
  return state.fixedExpenses.filter((item)=>item.active!==false&&!fixedExpenseIsPaid(item,key));
}
function fixedExpenseCardOptions(method,selected=''){
  const cards=state.cards.filter((c)=>c.type===method);
  return '<option value="">Elegí una tarjeta</option>'+cards.map((c)=>`<option value="${escape(c.name)}" ${c.name===selected?'selected':''}>${escape(c.name)}</option>`).join('');
}
function updateFixedExpenseCardField(selected=''){
  const method=$('#fixedExpenseMethod')?.value||'Efectivo';
  $('#fixedExpenseCardWrap')?.classList.toggle('hidden',method==='Efectivo');
  if($('#fixedExpenseCard'))$('#fixedExpenseCard').innerHTML=fixedExpenseCardOptions(method,selected||$('#fixedExpenseCard').value);
}
function openFixedExpenseDialog(item=null){
  editingFixedExpenseId=item?.id||null;
  $('#fixedExpenseForm').reset();
  $('#fixedExpenseDialogTitle').textContent=item?'Editar gasto fijo':'Nuevo gasto fijo';
  $('#fixedExpenseConcept').value=item?.concept||'';
  $('#fixedExpenseCurrency').value=item?.currency||'ARS';
  $('#fixedExpenseDay').value=item?.day||10;
  fillFixedExpenseCategoryOptions(item?.category||'');
  if(item?.category){
    $('#fixedExpenseCategory').value=item.category;
    fillScopedSubcategories('#fixedExpenseCategory','#fixedExpenseSubcategory','#fixedExpenseSubcategoryWrap',item?.subcategory||'');
  }
  $('#fixedExpenseMethod').value=item?.method||'Efectivo';
  updateFixedExpenseCardField(item?.card||'');
  if(item?.card)$('#fixedExpenseCard').value=item.card;
  $('#fixedExpenseDialog').showModal();
}
function openFixedExpensePayment(item,key){
  const current=fixedExpensePayments(item,key)[0]||null;
  editingFixedPaymentExpenseId=current?.id||null;
  $('#fixedExpensePaymentForm').reset();
  $('#fixedExpensePaymentTitle').textContent=`${current?'Editar':'Registrar'} pago · ${item.concept}`;
  const previous=fixedExpensePreviousAmount(item,key);
  const ref=$('#fixedExpensePreviousReference');
  const use=$('#usePreviousFixedAmount');
  if(previous>0){
    ref.classList.remove('hidden');
    ref.textContent=`El mes anterior pagaste ${money(previous,item.currency)}. Puede coincidir o podés ingresar otro importe.`;
    use.classList.remove('hidden');
    use.textContent=`Usar ${money(previous,item.currency)}`;
    use.onclick=()=>setLocalizedInput('#fixedExpensePaymentAmount',previous,2);
  }else{
    ref.classList.add('hidden');use.classList.add('hidden');
  }
  if(current)setLocalizedInput('#fixedExpensePaymentAmount',current.amount,2);
  $('#fixedExpensePaymentDate').value=current?.purchaseDate?.slice?.(0,10)||new Date().toISOString().slice(0,10);
  $('#fixedExpensePaymentForm').dataset.fixedExpenseId=item.id;
  $('#fixedExpensePaymentForm').dataset.month=key;
  $('#fixedExpensePaymentDialog').showModal();
}
function renderFixedExpenses(){
  if(!$('#fixedExpenseList'))return;
  const key=$('#fixedExpenseMonth')?.value||monthKey(new Date());
  const active=state.fixedExpenses.filter((item)=>item.active!==false);
  const paidCount=active.filter((item)=>fixedExpenseIsPaid(item,key)).length;
  const pendingCount=active.length-paidCount;
  $('#fixedExpenseSummary').textContent=active.length
    ? `${integerText(paidCount)} pagado${paidCount===1?'':'s'} · ${integerText(pendingCount)} pendiente${pendingCount===1?'':'s'} en ${key}`
    : 'Todavía no configuraste gastos fijos.';
  $('#fixedExpenseList').innerHTML=state.fixedExpenses.length?state.fixedExpenses.map((item)=>{
    const paid=fixedExpenseIsPaid(item,key);
    const current=fixedExpenseAmountForMonth(item,key);
    const previous=fixedExpensePreviousAmount(item,key);
    const category=[item.category,item.subcategory].filter(Boolean).join(' · ')||'Sin categoría';
    return `<article class="fixed-expense-card ${item.active===false?'disabled':''}" data-fixed-expense-id="${escape(item.id)}">
      <div class="fixed-expense-head"><div><strong>${escape(item.concept)}</strong><small>${escape(category)} · día ${integerText(item.day||1)} · ${escape(item.method||'Efectivo')}${item.card?' · '+escape(item.card):''}</small></div><span class="${paid?'paid':'pending'}">${item.active===false?'Inactivo':paid?'Pagado':'Pendiente'}</span></div>
      <div class="fixed-expense-values"><span>Este mes <strong>${paid?money(current,item.currency):'—'}</strong></span><span>Mes anterior <strong>${previous?money(previous,item.currency):'Sin dato'}</strong></span></div>
      <div class="fixed-expense-actions"><button type="button" class="fixed-pay">${paid?'Editar pago':'Registrar pago'}</button><button type="button" class="fixed-edit">Editar</button><button type="button" class="fixed-toggle">${item.active===false?'Activar':'Desactivar'}</button></div>
    </article>`;
  }).join(''):'<div class="empty">Agregá tus gastos fijos para controlar cada mes cuánto pagaste.</div>';
  document.querySelectorAll('[data-fixed-expense-id]').forEach((row)=>{
    const item=state.fixedExpenses.find((x)=>x.id===row.dataset.fixedExpenseId);if(!item)return;
    row.querySelector('.fixed-pay').onclick=()=>openFixedExpensePayment(item,key);
    row.querySelector('.fixed-edit').onclick=()=>openFixedExpenseDialog(item);
    row.querySelector('.fixed-toggle').onclick=()=>{item.active=item.active===false?true:false;save();renderFixedExpenses();};
  });
}

function exportRowsForConsultation(){return consultationRows().map((row)=>({Tipo:row.type,Fecha:row.date.toLocaleString('es-AR'),Concepto:row.concept||'',Categoría:row.category||'',Subcategoría:row.subcategory||'',Medio:row.method||'',Tarjeta:row.card||'',Moneda:row.currency,Importe:Number(row.amount||0),EquivalenteARS:Number(row.arsEquivalent||0)}));}
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
  $('#stockSummary').textContent=`${integerText(totalRemaining)} unidades disponibles · ${money(totalValue,'ARS')} aprox.`;
  $('#stockList').innerHTML=rows.length ? rows.map(({p,m})=>`<article class="stock-card" data-stock-id="${escape(p.id)}">
    <div class="stock-head"><div><strong>${escape(p.product)}</strong><small>${escape([p.category,p.subcategory].filter(Boolean).join(' · ') || 'Sin categoría')} · pagado ${new Date(p.paidDate+'T12:00:00').toLocaleDateString('es-AR')}</small></div><span class="stock-money">${p.currency==='USD' ? money(p.totalAmount,'USD') : money(p.totalAmount,'ARS')}</span></div>
    <div class="stock-stats"><div><span>Comprado</span><strong>${numberText(m.qty)}</strong></div><div><span>Consumido</span><strong>${numberText(m.consumed)}</strong></div><div><span>Disponible</span><strong>${numberText(m.remaining)}</strong></div></div>
    <div class="stock-actions"><button class="consume">Consumir</button><button class="adjust">Ajustar</button></div></article>`).join('') : '<div class="empty">Todavía no cargaste compras de stock.</div>';
  document.querySelectorAll('.stock-card').forEach((card)=>{
    const p=state.stock.find((x)=>x.id===card.dataset.stockId);
    if(!p) return;
    card.querySelector('.consume').onclick=()=>{ const n=Number(prompt(`¿Cuántas unidades de ${p.product} consumiste?`,'1')); if(!n||n<0)return; const m=stockMetrics(p); if(n>m.remaining)return showToast('No hay suficiente stock disponible'); p.consumptions ||= []; p.consumptions.push({id:uid(),quantity:n,date:new Date().toISOString()}); save(); renderStock(); renderBudget(); showToast('Consumo registrado'); };
    card.querySelector('.adjust').onclick=()=>{ const n=Number(prompt('Cantidad total real en stock:',String(stockMetrics(p).remaining))); if(!Number.isFinite(n)||n<0)return; const m=stockMetrics(p); const delta=n-m.remaining; p.quantity=Math.max(0,Number(p.quantity||0)+delta); save(); renderStock(); showToast('Stock ajustado'); };
  });
}

async function addStockPurchase(data) {
  let item={id:uid(),product:data.product,category:data.category,subcategory:data.subcategory||'',quantity:data.quantity,months:data.months,totalAmount:data.totalAmount,currency:data.currency,paidDate:data.paidDate,consumptions:[]};
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
  if(document.activeElement !== $('#budgetAmount')) setLocalizedInput('#budgetAmount',entry.amount||'',2);
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
  const category=$('#consultCategory').value, subcategory=$('#consultSubcategory')?.value||'', card=$('#consultCard').value;
  $('#consultCategory').innerHTML='<option value="">Todas</option>'+state.categories.map((c)=>`<option value="${escape(c)}" ${c===category?'selected':''}>${escape(c)}</option>`).join('');
  const subValues=category?subcategoriesFor(category):[];
  if($('#consultSubcategory')){
    $('#consultSubcategory').innerHTML='<option value="">Todas</option>'+subValues.map((s)=>`<option value="${escape(s)}" ${s===subcategory?'selected':''}>${escape(s)}</option>`).join('');
    $('#consultSubcategory').disabled=!category;
  }
  $('#consultCard').innerHTML='<option value="">Todas</option>'+state.cards.map((c)=>`<option value="${escape(c.name)}" ${c.name===card?'selected':''}>${escape(c.name)}</option>`).join('');
}
function globalSearchRows(){
  const expenses=state.expenses.map((e)=>({
    type:e.source==='fixed'?'Pago de gasto fijo':'Gasto / pago',
    date:new Date(e.purchaseDate||e.date),
    concept:e.concept||'Sin detalle',
    category:e.category||'',
    subcategory:e.subcategory||'',
    method:e.method||'',
    card:e.card||'',
    currency:e.currency||'ARS',
    amount:Number(e.amount||0),
    arsEquivalent:expenseArsEquivalent(e),
    raw:e
  }));
  const stock=state.stock.map((p)=>({
    type:'Compra',
    date:new Date((p.paidDate||new Date().toISOString().slice(0,10))+'T12:00:00'),
    concept:p.product||'Compra de stock',
    category:p.category||'',
    subcategory:p.subcategory||'',
    method:p.method||'',
    card:p.card||'',
    currency:p.currency||'ARS',
    amount:Number(p.totalAmount||0),
    arsEquivalent:p.currency==='USD'?Number(p.totalAmount||0)*Number(p.fxRate||0):Number(p.totalAmount||0),
    raw:p
  }));
  const recoveries=state.recoveries.map((r)=>({
    type:'Recupero de gasto',
    date:new Date((r.date||new Date().toISOString().slice(0,10))+'T12:00:00'),
    concept:r.concept||'Recupero',
    category:r.category||'',
    subcategory:r.subcategory||'',
    method:'',
    card:'',
    currency:r.currency||'ARS',
    amount:Number(r.amount||0),
    arsEquivalent:r.currency==='USD'?Number(r.amount||0)*Number(r.fxRate||0):Number(r.amount||0),
    raw:r
  }));
  return [...expenses,...stock,...recoveries];
}
function applyNaturalConsultation(text) {
  const q=String(text||'').toLowerCase(), now=new Date(), today=now.toISOString().slice(0,10);
  if(q.includes('este mes')){ $('#consultFrom').value=`${today.slice(0,8)}01`; $('#consultTo').value=today; }
  if(q.includes('mes pasado')){ const d=new Date(now.getFullYear(),now.getMonth()-1,1), last=new Date(now.getFullYear(),now.getMonth(),0); $('#consultFrom').value=d.toISOString().slice(0,10); $('#consultTo').value=last.toISOString().slice(0,10); }
  if(q.includes('hoy')){ $('#consultFrom').value=today; $('#consultTo').value=today; }
  if(q.includes('dólar')||q.includes('dolar')) $('#consultCurrency').value='USD';
  if(q.includes('efectivo')) $('#consultMethod').value='Efectivo';
  if(q.includes('débito')||q.includes('debito')) $('#consultMethod').value='Débito';
  if(q.includes('crédito')||q.includes('credito')) $('#consultMethod').value='Crédito';
  let category=state.categories.find((c)=>q.includes(c.toLowerCase()));
  let sub='';
  const subMatches=[];
  for(const [parent,values] of Object.entries(state.subcategories||{})){
    for(const value of Array.isArray(values)?values:[])if(q.includes(String(value).toLowerCase()))subMatches.push({parent,value,length:String(value).length});
  }
  subMatches.sort((a,b)=>b.length-a.length);
  if(!category&&subMatches.length)category=subMatches[0].parent;
  if(category){ $('#consultCategory').value=category; renderConsultationFilters(); }
  if(subMatches.length&&subMatches[0].parent===category)sub=subMatches[0].value;
  if(sub&&$('#consultSubcategory'))$('#consultSubcategory').value=sub;
  const card=state.cards.find((c)=>q.includes(c.name.toLowerCase())); if(card) $('#consultCard').value=card.name;
}
function consultationRows() {
  const from=$('#consultFrom').value ? new Date($('#consultFrom').value+'T00:00:00') : new Date('2000-01-01T00:00:00');
  const to=$('#consultTo').value ? new Date($('#consultTo').value+'T23:59:59') : new Date('2100-01-01T23:59:59');
  const cat=$('#consultCategory').value, sub=$('#consultSubcategory')?.value||'', method=$('#consultMethod').value, currency=$('#consultCurrency').value, card=$('#consultCard').value;
  const min=localizedInputNumber('#consultMin'), exact=localizedInputNumber('#consultAmount');
  const query=String($('#consultQuery').value||'').toLowerCase().trim();
  const generic=/^(|.*\b(cuanto|cuánto|gaste|gasté|gasto|gastos|pague|pagué|pago|pagos|compra|compras|recupero|recuperos|este mes|mes pasado|hoy|en|de|por|con|que|qué|cuál|cual)\b.*)$/i.test(query);
  return globalSearchRows().filter((row)=>{
    if(!(row.date>=from&&row.date<=to))return false;
    if(cat&&row.category!==cat)return false;
    if(sub&&row.subcategory!==sub)return false;
    if(method&&row.method!==method)return false;
    if(currency&&row.currency!==currency)return false;
    if(card&&row.card!==card)return false;
    if(Number.isFinite(min)&&min>0&&row.arsEquivalent<min)return false;
    if(Number.isFinite(exact)&&exact>0&&Math.abs(row.arsEquivalent-exact)>0.01)return false;
    if(query&&!generic){
      const haystack=[row.type,row.concept,row.category,row.subcategory,row.method,row.card].join(' ').toLowerCase();
      const tokens=query.replace(/[^a-záéíóúüñ0-9 ]/gi,' ').split(/\s+/).filter((t)=>t.length>2);
      if(tokens.length&&!tokens.every((token)=>haystack.includes(token)))return false;
    }
    return true;
  });
}
function renderConsultationRow(row){
  return `<article class="search-result-card"><div><span class="search-result-type">${escape(row.type)}</span><strong>${escape(row.concept)}</strong><small>${row.date.toLocaleDateString('es-AR')} · ${escape([row.category,row.subcategory].filter(Boolean).join(' · ')||'Sin categoría')}${row.method?' · '+escape(row.method):''}</small></div><strong>${money(row.amount,row.currency)}</strong></article>`;
}
function renderFixedPendingConsultation(){
  const key=monthKey(new Date());
  const items=fixedExpensePendingForMonth(key);
  $('#consultArs').textContent=money(0,'ARS'); $('#consultUsd').textContent=money(0,'USD'); $('#consultEquivalent').textContent=money(0,'ARS');
  $('#consultAnswer').textContent=items.length?`Tenés ${integerText(items.length)} gasto${items.length===1?'':'s'} fijo${items.length===1?'':'s'} pendiente${items.length===1?'':'s'} de pago este mes.`:'No tenés gastos fijos pendientes de pago este mes.';
  $('#consultResults').innerHTML=items.length?items.map((item)=>{
    const previous=fixedExpensePreviousAmount(item,key);
    return `<article class="search-result-card fixed-pending-search" data-consult-fixed-id="${escape(item.id)}"><div><span class="search-result-type">Gasto fijo pendiente</span><strong>${escape(item.concept)}</strong><small>Día habitual ${integerText(item.day||1)}${previous?' · Mes anterior '+money(previous,item.currency):' · Sin importe anterior'}</small></div><button type="button">Registrar pago</button></article>`;
  }).join(''):'<div class="empty">Todo al día.</div>';
  document.querySelectorAll('[data-consult-fixed-id]').forEach((row)=>{
    const item=state.fixedExpenses.find((x)=>x.id===row.dataset.consultFixedId);
    row.querySelector('button').onclick=()=>item&&openFixedExpensePayment(item,key);
  });
  return items;
}
function runConsultation() {
  const query=String($('#consultQuery').value||'');
  if(/gastos?\s+fijos?.*pendient|pendient.*gastos?\s+fijos?/i.test(query)){
    const items=renderFixedPendingConsultation();
    if($('#consultSpeak').checked&&'speechSynthesis' in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance($('#consultAnswer').textContent));}
    return items;
  }
  applyNaturalConsultation(query);
  renderConsultationFilters();
  const rows=consultationRows();
  const ars=rows.filter((r)=>r.currency==='ARS').reduce((s,r)=>s+r.amount,0);
  const usd=rows.filter((r)=>r.currency==='USD').reduce((s,r)=>s+r.amount,0);
  const eq=rows.reduce((s,r)=>s+r.arsEquivalent,0);
  $('#consultArs').textContent=money(ars,'ARS'); $('#consultUsd').textContent=money(usd,'USD'); $('#consultEquivalent').textContent=money(eq,'ARS');
  const answer=`Encontré ${integerText(rows.length)} movimiento${rows.length===1?'':'s'}. Equivalente total: ${money(eq,'ARS')}.`;
  $('#consultAnswer').textContent=answer;
  $('#consultResults').innerHTML=rows.length?rows.sort((a,b)=>b.date-a.date).map(renderConsultationRow).join(''):'<div class="empty">No encontré movimientos con esos filtros.</div>';
  if($('#consultSpeak').checked && 'speechSynthesis' in window){ speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(answer)); }
}

function compareMonths() {
  const a=$('#compareMonthA').value,b=$('#compareMonthB').value;if(!a||!b)return;
  const sum=(key)=>state.expenses.filter((e)=>monthKey(effectiveDate(e))===key).reduce((s,e)=>s+expenseArsEquivalent(e),0);
  const av=sum(a),bv=sum(b),max=Math.max(av,bv,1),diff=bv-av,pctDiff=av ? diff/av*100 : null;
  $('#compareResult').className='compare-result';
  $('#compareResult').innerHTML=`<strong>${b}: ${money(bv,'ARS')}</strong><p class="muted">${pctDiff==null?'Sin base para comparar':(pctDiff>=0?'+':'')+pctDiff.toLocaleString('es-AR',{maximumFractionDigits:1})+'% frente a '+a}</p><div class="compare-bars"><div class="compare-bar"><span>${a}</span><i style="width:${av/max*100}%"></i><strong>${money(av,'ARS')}</strong></div><div class="compare-bar"><span>${b}</span><i style="width:${bv/max*100}%"></i><strong>${money(bv,'ARS')}</strong></div></div>`;
}

function processStockVoice(phrase){
  const q=String(phrase||'').toLowerCase();
  const product=state.stock.find((p)=>q.includes(String(p.product||'').toLowerCase()));
  const parsed=Number(parseAmount(q));
  const n=Number.isFinite(parsed)&&parsed>0?parsed:1;
  if(!product)return showToast('No reconocí el producto del stock');
  const m=stockMetrics(product);
  if(n>m.remaining)return showToast('No hay suficiente stock');
  product.consumptions ||= [];
  product.consumptions.push({id:uid(),quantity:n,date:new Date().toISOString(),source:'voice'});
  save();renderStock();showToast(`Consumo: ${n} de ${product.product}`);
}

function bindHoldToTalk(button,{process,fallbackPrompt,idleText,listeningText,errorText}){
  if(!button||button.dataset.holdVoiceBound==='1')return;
  button.dataset.holdVoiceBound='1';
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec=null,held=false,stopping=false,finished=true,transcript='',cycle='',finishTimer=null;
  const reset=()=>{
    button.classList.remove('listening');
    if(idleText!=null)button.textContent=idleText;
  };
  const finish=()=>{
    if(finished)return;
    finished=true;
    if(finishTimer){clearTimeout(finishTimer);finishTimer=null;}
    held=false;stopping=false;
    const phrase=[transcript,cycle].filter(Boolean).join(' ').trim();
    transcript='';cycle='';rec=null;reset();
    if(phrase)process(phrase);
    else showToast('No escuché nada. Mantené presionado y hablá');
  };
  const launch=()=>{
    if(!held||stopping||finished||rec)return;
    const recognition=new SR();rec=recognition;cycle='';
    recognition.lang='es-AR';recognition.interimResults=true;recognition.continuous=true;recognition.maxAlternatives=1;
    recognition.onstart=()=>{
      button.classList.add('listening');
      if(listeningText!=null)button.textContent=listeningText;
    };
    recognition.onresult=(event)=>{
      let text='';
      for(let i=0;i<event.results.length;i++)text+=' '+(event.results[i][0]?.transcript||'');
      cycle=text.trim();
    };
    recognition.onerror=(event)=>{
      if(event.error==='not-allowed')showToast('Activá el permiso del micrófono');
      else if(!['aborted','no-speech'].includes(event.error))showToast(errorText||'No pude escuchar');
    };
    recognition.onend=()=>{
      if(finished){rec=null;cycle='';return;}
      if(cycle){transcript=[transcript,cycle].filter(Boolean).join(' ').trim();cycle='';}
      rec=null;
      if(held&&!stopping){setTimeout(launch,25);return;}
      finish();
    };
    try{recognition.start();}
    catch{rec=null;if(held&&!stopping)setTimeout(launch,60);else finish();}
  };
  const start=(event)=>{
    event?.preventDefault?.();
    if(held||rec)return;
    window.getSelection?.()?.removeAllRanges?.();
    if(!SR){
      const phrase=prompt(fallbackPrompt||'Escribí lo que querías decir:');
      if(phrase)process(phrase);
      return;
    }
    held=true;stopping=false;finished=false;transcript='';cycle='';
    button.classList.add('listening');
    if(listeningText!=null)button.textContent=listeningText;
    pendingVoiceStartCue();
    launch();
  };
  const stop=(event)=>{
    event?.preventDefault?.();
    if(!held&&!rec)return;
    held=false;stopping=true;
    if(rec){
      try{rec.stop();}catch{rec=null;finish();return;}
      finishTimer=setTimeout(()=>{
        if(finished)return;
        if(rec){try{rec.abort();}catch{}rec=null;}
        finish();
      },900);
    }else finish();
  };
  button.onclick=(event)=>event.preventDefault();
  button.oncontextmenu=(event)=>event.preventDefault();
  button.onselectstart=(event)=>event.preventDefault();
  if('ontouchstart' in window){
    button.addEventListener('touchstart',start,{passive:false});
    button.addEventListener('touchend',stop,{passive:false});
    button.addEventListener('touchcancel',stop,{passive:false});
  }else{
    button.onpointerdown=(event)=>{button.setPointerCapture?.(event.pointerId);start(event);};
    button.onpointerup=stop;
    button.onpointercancel=stop;
  }
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
  if(!Number(current.amount))return showToast('Completá cuánto pagaste antes de confirmar');
  if(current.dateAmbiguous)return showToast('AclarÁ la fecha antes de confirmar');
  if(needsPaymentMethod(current))return showToast('Elegí o decí con qué pagaste');
  if(['Débito','Crédito'].includes(current.method)&&!current.card)return showToast('Elegí o decí qué tarjeta o cuenta usaste');
  if(current.method==='Crédito'&&current.installmentsSpecified===false)return showToast('Elegí en cuántas cuotas pagaste');
  if(current.learnCategory&&current.category)learnFromExpense(current,current.category,current.subcategory||'');
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
$('#manualBtn').onclick = () => openExpense(); $('#recentMore').onclick=()=>{recentHomeLimit+=5;renderHomeRecent();}; $('#homeMenuBtn').onclick = () => $('#menuDialog').showModal();
$('#nextStep').onclick = () => { if (manualStep === 1 && !$('#amount').value) return $('#amount').reportValidity(); setManualStep(manualStep + 1); }; $('#prevStep').onclick = () => setManualStep(manualStep - 1);
$('#method').onchange = updatePaymentFields; $('#category').onchange = () => fillSubcategories(); $('#subcategory').onchange=()=>$('#editSelectedSubcategory')?.classList.toggle('hidden',!$('#subcategory').value); $('#expenseCard').onchange = updateInstallmentPreview; $('#installments').oninput = updateInstallmentPreview; $('#amount').oninput = ()=>{formatLocalizedInputElement($('#amount'));updateInstallmentPreview();}; document.querySelectorAll('[name=currency]').forEach((i) => { i.onchange = updateInstallmentPreview; });
$('#expenseForm').onsubmit = async (event) => {
  event.preventDefault();
  const method=$('#method').value;
  if (!method) return showToast('Elegí el medio de pago');
  if (method !== 'Efectivo' && !$('#expenseCard').value) return showToast('Elegí una tarjeta configurada');
  const now=new Date().toISOString();
  let expense={ id:crypto.randomUUID(), amount:localizedInputNumber('#amount'), currency:document.querySelector('[name=currency]:checked').value, concept:$('#concept').value || $('#subcategory')?.value || $('#category').value || 'Sin detalle', category:$('#category').value, subcategory:$('#subcategory')?.value || '', categoryStatus:$('#category').value?'manual':'unclassified', method, card:$('#expenseCard').value, installments:method==='Crédito' ? Number($('#installments').value) : 1, date:now, purchaseDate:now, source:'manual' };
  if(!Number.isFinite(expense.amount)||expense.amount<=0)return showToast('Ingresá un importe válido');
  expense=await stampUsdExpense(expense);
  state.expenses.push(...installmentExpenses(expense)); save(); $('#expenseDialog').close(); feedback(true); showToast('✓ Gasto guardado'); render(); if(pending.length) setTimeout(showPending,180);
};
$('#addCard').onclick = () => { editingCardId = null; $('#cardDialog h2').textContent = 'Nuevo medio de pago'; $('#cardForm').reset(); $('#cardType').value=activeCardType||'Crédito'; $('#cardColor').value='#173f37'; $('#creditCardDates').classList.toggle('hidden',$('#cardType').value!=='Crédito'); if($('#cardType').value==='Crédito')setCreditDateDefaults(); $('#cardDialog').showModal(); }; $('#cardType').onchange = () => { const isCredit=$('#cardType').value==='Crédito'; $('#creditCardDates').classList.toggle('hidden',!isCredit); if(isCredit)setCreditDateDefaults(); }; $('#cardForm').onsubmit = (event) => {
  event.preventDefault();
  const name = $('#cardName').value.trim();
  const selectedType = $('#cardType').value;
  const duplicate = state.cards.some((c) => c.id !== editingCardId && c.name.toLowerCase() === name.toLowerCase() && c.type === selectedType);
  if (duplicate) return showToast('Ya existe una tarjeta o cuenta con ese nombre');
  const closingDate=selectedType==='Crédito'?$('#closingDate').value:'',dueDate=selectedType==='Crédito'?$('#dueDate').value:'';
  if(selectedType==='Crédito'&&(!closingDate||!dueDate))return showToast('Completá fecha de cierre y fecha de vencimiento');
  const closingParsed=dateFromInput(closingDate),dueParsed=dateFromInput(dueDate);
  if(selectedType==='Crédito'&&(!closingParsed||!dueParsed||dueParsed.getTime()<=closingParsed.getTime()))return showToast('El vencimiento debe ser posterior al cierre');
  const data = { name, type: selectedType, color:$('#cardColor').value||'#173f37', closingDate, dueDate, closingDay: selectedType==='Crédito'?closingParsed.getDate():0, dueDay: selectedType==='Crédito'?dueParsed.getDate():0 };
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
  save(); event.target.reset(); $('#cardDialog').close(); activeCardType=selectedType; showToast('Medio de pago guardado'); render();
};
document.querySelectorAll('[data-range]').forEach((button) => { button.onclick=()=>{ reportRange=button.dataset.range; document.querySelectorAll('[data-range]').forEach((b)=>b.classList.remove('selected')); button.classList.add('selected'); $('#customRange').classList.toggle('hidden',reportRange!=='custom'); renderReport(); }; });
$('#fromDate').onchange=renderReport; $('#toDate').onchange=renderReport;
document.querySelectorAll('[data-usd-range]').forEach((button)=>{ button.onclick=()=>{ usdRange=button.dataset.usdRange; document.querySelectorAll('[data-usd-range]').forEach((b)=>b.classList.remove('selected')); button.classList.add('selected'); $('#usdCustomRange').classList.toggle('hidden',usdRange!=='custom'); renderUsd(); }; });
$('#usdFromDate').onchange=renderUsd; $('#usdToDate').onchange=renderUsd;
$('#usdRateType').onchange=async()=>{ state.settings.usdRateType=$('#usdRateType').value; save(); renderUsd(); await ensureUsdRate(true); renderUsd(); };
$('#refreshUsdRate').onclick=async()=>{ $('#usdRateMeta').textContent='Actualizando…'; await ensureUsdRate(true); renderUsd(); };
document.querySelectorAll('[data-history]').forEach((button) => { button.onclick = () => { historyRange = button.dataset.history; document.querySelectorAll('[data-history]').forEach((b) => b.classList.remove('selected')); button.classList.add('selected'); $('#historyDate').classList.toggle('hidden', historyRange !== 'day'); $('#historyMonth').classList.toggle('hidden', historyRange !== 'month'); $('#historyYear').classList.toggle('hidden', historyRange !== 'year'); $('#historyCustom').classList.toggle('hidden', historyRange !== 'custom'); renderHistory(); }; }); ['historyDate', 'historyMonth', 'historyYear', 'historyFrom', 'historyTo'].forEach((id) => { $(`#${id}`).onchange = renderHistory; });
function createCategoryEverywhere(value){
  const clean=String(value||'').trim();
  if(!clean)return '';
  const existing=state.categories.find((c)=>c.toLowerCase()===clean.toLowerCase());
  if(existing)return existing;
  state.categories.push(clean);
  state.subcategories[clean] ||= [];
  save();
  syncCategoryConsumers();
  render();
  return clean;
}
function addCategory() {
  const input=$('#newCategory');
  const created=createCategoryEverywhere(input?.value||'');
  if(created&&input)input.value='';
  return created;
}
function addSubcategory(category,value){ const clean=String(value||'').trim(); if(!category||!clean)return false; const list=subcategoriesFor(category); if(list.some((s)=>s.toLowerCase()===clean.toLowerCase()))return false; state.subcategories[category]=[...list,clean]; save(); syncCategoryConsumers(); return true; }
function createCategoryFromPrompt(selectSelector){
  const value=prompt('Nombre de la nueva categoría:')?.trim();
  if(!value)return '';
  const category=createCategoryEverywhere(value);
  if(category&&$(selectSelector)){fillCategorySelect(selectSelector,category);$(selectSelector).value=category;}
  return category;
}
function createSubcategoryFromPrompt(categorySelector,subcategorySelector,wrapSelector){
  const category=$(categorySelector)?.value||'';
  if(!category){showToast('Elegí primero una categoría');return '';}
  const value=prompt(`Nueva subcategoría dentro de ${category}:`)?.trim();
  if(!value)return '';
  if(!addSubcategory(category,value)){
    const existing=subcategoriesFor(category).find((s)=>s.toLowerCase()===value.toLowerCase());
    if(!existing){showToast('Esa subcategoría ya existe');return '';}
    fillScopedSubcategories(categorySelector,subcategorySelector,wrapSelector,existing);return existing;
  }
  fillScopedSubcategories(categorySelector,subcategorySelector,wrapSelector,value);
  return value;
}
function editCategoryFromSelect(selectSelector){
  const select=$(selectSelector),oldName=select?.value||'';
  if(!oldName)return showToast('Elegí una categoría para editar');
  const value=prompt('Nuevo nombre de la categoría:',oldName)?.trim();
  if(!value||value===oldName)return;
  if(!renameCategoryEverywhere(oldName,value))return showToast('No pude cambiar el nombre. Revisá que no esté repetido.');
  fillCategorySelect(selectSelector,value);select.value=value;showToast('✓ Categoría actualizada en toda la app');
}
function editSubcategoryFromSelect(categorySelector,subcategorySelector,wrapSelector){
  const category=$(categorySelector)?.value||'',select=$(subcategorySelector),oldName=select?.value||'';
  if(!category)return showToast('Elegí una categoría');
  if(!oldName)return showToast('Elegí una subcategoría para editar');
  const value=prompt('Nuevo nombre de la subcategoría:',oldName)?.trim();
  if(!value||value===oldName)return;
  if(!renameSubcategoryEverywhere(category,oldName,value))return showToast('No pude cambiar el nombre. Revisá que no esté repetido.');
  fillScopedSubcategories(categorySelector,subcategorySelector,wrapSelector,value);showToast('✓ Subcategoría actualizada en toda la app');
}
function openCategoryManager(){
  settingsSnapshot=cloneState();activeSettingsCategory='';
  renderReminderSettings();fillCategories();renderTrash();renderSecurityStatus();
  $('#settingsDialog').showModal();
}
$('#categoryForm').onsubmit = (event) => { event.preventDefault(); addCategory(); };
$('#quickCategory').onclick = () => { const category=createCategoryFromPrompt('#category'); if(category){$('#category').value=category;fillSubcategories();} };
$('#quickSubcategory').onclick = () => createSubcategoryFromPrompt('#category','#subcategory','#subcategoryWrap');
$('#editSelectedCategory').onclick=()=>editCategoryFromSelect('#category');
$('#editSelectedSubcategory').onclick=()=>editSubcategoryFromSelect('#category','#subcategory','#subcategoryWrap');
function renderReminderSettings() { const labels = { 3: '3 días antes', 2: '2 días antes', 1: '1 día antes' }; $('#reminderSettings').innerHTML = [3, 2, 1].map((d) => `<label><input type="checkbox" value="${d}" ${state.settings.reminderDays.includes(d) ? 'checked' : ''}>${labels[d]}</label>`).join(''); $('#reminderSettings').onchange = () => { state.settings.reminderDays = [...$('#reminderSettings').querySelectorAll(':checked')].map((i) => Number(i.value)); save(); renderPaymentReminders(); }; }
function cloneState(){return typeof structuredClone==='function'?structuredClone(state):JSON.parse(JSON.stringify(state));}
function restoreState(snapshot){
  Object.keys(state).forEach((key)=>delete state[key]);
  Object.assign(state,cloneState.call(null,snapshot));
}
function settingsHasChanges(){return settingsSnapshot&&JSON.stringify(state)!==JSON.stringify(settingsSnapshot);}
function closeSettingsKeepingChanges(){
  save();settingsSnapshot=null;activeSettingsCategory='';$('#settingsDialog').close();render();
}
function closeSettingsDiscardingChanges(){
  if(settingsSnapshot){restoreState(settingsSnapshot);save();}
  settingsSnapshot=null;activeSettingsCategory='';$('#settingsSaveDialog')?.close();$('#settingsDialog').close();render();
}
$('#settingsBtn').onclick = () => {
  settingsSnapshot=cloneState();activeSettingsCategory='';
  renderReminderSettings();fillCategories();renderRecurringSettings();renderTrash();renderSecurityStatus();
  $('#settingsDialog').showModal();
};
function closeDialogById(id){const dialog=$(id);if(dialog?.open)dialog.close();}
function refreshAfterExpenseReset(){
  recentHomeLimit=4;
  if($('#confirmDialog')?.open)$('#confirmDialog').close();
  save();
  renderTrash();
  render();
}
$('#resetCurrentMonthBtn').onclick=()=>{
  const count=currentMonthExpenseCount(state,new Date());
  $('#resetCurrentMonthSummary').textContent=count
    ?`Se moverán a Papelera ${integerText(count)} movimiento${count===1?'':'s'} del mes en curso.`
    :'No hay movimientos del mes en curso para borrar.';
  $('#resetCurrentMonthConfirm').disabled=count===0;
  $('#resetCurrentMonthDialog').showModal();
};
$('#resetCurrentMonthCancel').onclick=()=>closeDialogById('#resetCurrentMonthDialog');
$('#resetCurrentMonthCancelX').onclick=()=>closeDialogById('#resetCurrentMonthDialog');
$('#resetCurrentMonthDialog').addEventListener('cancel',(event)=>{event.preventDefault();closeDialogById('#resetCurrentMonthDialog');});
$('#resetCurrentMonthConfirm').onclick=()=>{
  const now=new Date();
  const result=moveCurrentMonthExpensesToTrash(state,now);
  pending=[];
  discarded=null;
  mirrorResetIntoSnapshot(settingsSnapshot,state);
  closeDialogById('#resetCurrentMonthDialog');
  refreshAfterExpenseReset();
  if(!verifyNoCurrentMonthExpenses(state,now))return showToast('No pude completar el borrado del mes. Probá nuevamente.');
  showToast(result.removed?`✓ ${integerText(result.removed)} movimiento${result.removed===1?'':'s'} enviado${result.removed===1?'':'s'} a Papelera`:'No había movimientos para borrar');
};
$('#resetPreviousMonthsBtn').onclick=()=>{
  const count=previousMonthExpenseCount(state,new Date());
  const trashOld=(state.trash||[]).reduce((sum,record)=>sum+(record.items||[]).filter((item)=>{
    const d=new Date(item.purchaseDate||item.date||0);
    const start=new Date(new Date().getFullYear(),new Date().getMonth(),1);
    return Number.isFinite(d.getTime())&&d<start;
  }).length,0);
  $('#resetPreviousMonthsSummary').textContent=`Se eliminarán definitivamente ${integerText(count)} movimiento${count===1?'':'s'} activo${count===1?'':'s'} de meses anteriores${trashOld?` y ${integerText(trashOld)} movimiento${trashOld===1?'':'s'} que ya está${trashOld===1?'':'n'} en Papelera`:''}.`;
  $('#resetPreviousMonthsFirstConfirm').disabled=(count+trashOld)===0;
  $('#resetPreviousMonthsDialog').showModal();
};
$('#resetPreviousMonthsCancel').onclick=()=>closeDialogById('#resetPreviousMonthsDialog');
$('#resetPreviousMonthsCancelX').onclick=()=>closeDialogById('#resetPreviousMonthsDialog');
$('#resetPreviousMonthsDialog').addEventListener('cancel',(event)=>{event.preventDefault();closeDialogById('#resetPreviousMonthsDialog');});
$('#resetPreviousMonthsFirstConfirm').onclick=()=>{
  closeDialogById('#resetPreviousMonthsDialog');
  $('#resetPreviousMonthsFinalDialog').showModal();
};
$('#resetPreviousMonthsFinalCancel').onclick=()=>closeDialogById('#resetPreviousMonthsFinalDialog');
$('#resetPreviousMonthsFinalCancelX').onclick=()=>closeDialogById('#resetPreviousMonthsFinalDialog');
$('#resetPreviousMonthsFinalDialog').addEventListener('cancel',(event)=>{event.preventDefault();closeDialogById('#resetPreviousMonthsFinalDialog');});
$('#resetPreviousMonthsFinalConfirm').onclick=()=>{
  const now=new Date();
  const result=permanentlyDeletePreviousMonths(state,now);
  mirrorResetIntoSnapshot(settingsSnapshot,state);
  closeDialogById('#resetPreviousMonthsFinalDialog');
  refreshAfterExpenseReset();
  if(!verifyNoPreviousMonthExpenses(state,now))return showToast('No pude completar el borrado histórico. Probá nuevamente.');
  showToast(result.totalRemoved?`✓ ${integerText(result.totalRemoved)} movimiento${result.totalRemoved===1?'':'s'} eliminado${result.totalRemoved===1?'':'s'} definitivamente`:'No había movimientos anteriores para borrar');
};
$('#settingsBack').onclick=()=>{
  if(activeSettingsCategory){activeSettingsCategory='';fillCategories();return;}
  closeSettingsKeepingChanges();
};
$('#settingsClose').onclick=()=>{
  if(!settingsHasChanges()){settingsSnapshot=null;activeSettingsCategory='';$('#settingsDialog').close();return;}
  $('#settingsSaveDialog').showModal();
};
$('#settingsKeep').onclick=()=>{ $('#settingsSaveDialog').close(); closeSettingsKeepingChanges(); };
$('#settingsDiscard').onclick=()=>closeSettingsDiscardingChanges();
$('#settingsCancelClose').onclick=()=>$('#settingsSaveDialog').close();
$('#settingsDialog').addEventListener('cancel',(event)=>{event.preventDefault();$('#settingsClose').click();});
$('#biometricBtn').onclick = openSecuritySetup;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition = null;
let voiceTranscript = '';
let voiceCycleText = '';
let voiceError = '';
let voiceCancelled = false;
let voiceHoldActive = false;
let voiceStopRequested = false;
let voiceGestureStartY = null;
let voiceCancelArmed = false;
let voiceFinishTimer = null;
let voiceSessionFinished = true;
function resetExpenseVoiceUI() {
  $('#micBtn').classList.remove('listening');
  $('#voiceZone')?.classList.remove('recording','cancel-ready');
  $('#voiceTrash')?.classList.remove('armed');
  $('#voiceTitle').textContent='Mantener presionado';
  $('#voiceHint').textContent='para hablar';
}
function finishExpenseVoice() {
  if(voiceSessionFinished)return;
  voiceSessionFinished=true;
  if(voiceFinishTimer){clearTimeout(voiceFinishTimer);voiceFinishTimer=null;}
  voiceHoldActive=false; voiceStopRequested=false;
  if(voiceCancelled){voiceTranscript='';voiceCycleText='';voiceError='';voiceCancelled=false;voiceGestureStartY=null;voiceCancelArmed=false;resetExpenseVoiceUI();return;}
  const phrase=[voiceTranscript,voiceCycleText].filter(Boolean).join(' ').trim();
  const err=voiceError;
  voiceTranscript=''; voiceCycleText=''; voiceError='';
  resetExpenseVoiceUI();
  if (phrase) {
    pending=prepareCategoryLearning(parseExpenses(phrase,state.cards,state.categories,{subcategories:state.subcategories}));
    if (pending.length) showPending();
    else showToast('Escuché el audio, pero no pude interpretar el gasto');
  } else if (!err) {
    showToast('No llegué a reconocer lo que dijiste. Probá de nuevo');
  }
}
function launchExpenseRecognitionCycle(){
  if(!voiceHoldActive||voiceCancelled||voiceStopRequested||activeRecognition)return;
  const recognition=new SpeechRecognition();
  activeRecognition=recognition; voiceCycleText='';
  recognition.lang='es-AR'; recognition.interimResults=true; recognition.continuous=true; recognition.maxAlternatives=1;
  recognition.onstart=()=>{
    $('#micBtn').classList.add('listening');
    $('#voiceZone')?.classList.add('recording');
    $('#voiceTitle').textContent='Escuchando…';
    $('#voiceHint').textContent='Seguí hablando · arrastrá al tacho para anular';
  };
  recognition.onresult=(event)=>{let text='';for(let i=0;i<event.results.length;i++)text+=' '+(event.results[i][0]?.transcript||'');voiceCycleText=text.trim();};
  recognition.onerror=(event)=>{voiceError=event.error||'error';if(!['aborted','no-speech'].includes(voiceError))showToast('No pude escuchar. Revisá el permiso del micrófono');};
  recognition.onend=()=>{
    if(voiceSessionFinished){activeRecognition=null;voiceCycleText='';return;}
    if(voiceCycleText){voiceTranscript=[voiceTranscript,voiceCycleText].filter(Boolean).join(' ').trim();}
    activeRecognition=null; voiceCycleText='';
    if(voiceCancelled){finishExpenseVoice();return;}
    if(voiceHoldActive&&!voiceStopRequested){setTimeout(launchExpenseRecognitionCycle,25);return;}
    finishExpenseVoice();
  };
  try{recognition.start();}catch{activeRecognition=null;if(voiceHoldActive&&!voiceStopRequested)setTimeout(launchExpenseRecognitionCycle,60);else finishExpenseVoice();}
}
function startExpenseVoice() {
  if (activeRecognition||voiceHoldActive) return;
  window.getSelection?.()?.removeAllRanges?.();
  if (!SpeechRecognition) {
    const phrase = prompt('El navegador no ofrece reconocimiento de voz. Escribí los gastos:');
    if (phrase) { pending = prepareCategoryLearning(parseExpenses(phrase, state.cards, state.categories, {subcategories:state.subcategories})); showPending(); }
    return;
  }
  voiceTranscript='';voiceCycleText='';voiceError='';voiceCancelled=false;voiceCancelArmed=false;voiceStopRequested=false;voiceHoldActive=true;voiceSessionFinished=false;
  if(voiceFinishTimer){clearTimeout(voiceFinishTimer);voiceFinishTimer=null;}
  $('#voiceZone')?.classList.add('recording');
  $('#voiceTitle').textContent='Escuchando…';
  $('#voiceHint').textContent='Arrastrá el dedo al tacho para anular';
  launchExpenseRecognitionCycle();
}
function stopExpenseVoice() {
  if(!voiceHoldActive&&!activeRecognition)return;
  voiceHoldActive=false;voiceStopRequested=true;
  if(activeRecognition){
    try{activeRecognition.stop();}catch{activeRecognition=null;finishExpenseVoice();return;}
    voiceFinishTimer=setTimeout(()=>{
      if(voiceSessionFinished)return;
      if(activeRecognition){try{activeRecognition.abort();}catch{}activeRecognition=null;}
      finishExpenseVoice();
    },900);
  } else finishExpenseVoice();
}
const micBtn=$('#micBtn');
const voiceTrash=$('#voiceTrash');
function updateVoiceCancelGesture(clientX,clientY){
  if(voiceGestureStartY==null)return;
  const rect=voiceTrash?.getBoundingClientRect?.();
  const armed=!!rect && clientX>=rect.left-18 && clientX<=rect.right+18 && clientY>=rect.top-18 && clientY<=rect.bottom+18;
  if(armed===voiceCancelArmed)return;
  voiceCancelArmed=armed;
  $('#voiceZone')?.classList.toggle('cancel-ready',armed);
  voiceTrash?.classList.toggle('armed',armed);
  $('#voiceHint').textContent=armed?'Soltá sobre el tacho para eliminar':'Arrastrá el dedo hasta el tacho para borrar';
}
function cancelExpenseVoice(){
  if(!activeRecognition&&!voiceHoldActive)return;
  voiceCancelled=true;voiceHoldActive=false;voiceStopRequested=true;voiceCancelArmed=false;voiceGestureStartY=null;
  feedback(false);showToast('Grabación descartada');
  if(activeRecognition){try{activeRecognition.abort();}catch{}activeRecognition=null;}
  finishExpenseVoice();
}
if ('ontouchstart' in window) {
  micBtn.addEventListener('touchstart',(e)=>{e.preventDefault();voiceGestureStartY=e.touches[0]?.clientY??null;startExpenseVoice();},{passive:false});
  micBtn.addEventListener('touchmove',(e)=>{e.preventDefault();if(e.touches[0])updateVoiceCancelGesture(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  micBtn.addEventListener('touchend',(e)=>{e.preventDefault();const point=e.changedTouches?.[0];if(point)updateVoiceCancelGesture(point.clientX,point.clientY);const cancel=voiceCancelArmed;voiceGestureStartY=null;if(cancel)cancelExpenseVoice();else stopExpenseVoice();},{passive:false});
  micBtn.addEventListener('touchcancel',(e)=>{e.preventDefault();cancelExpenseVoice();},{passive:false});
} else {
  micBtn.onpointerdown=(e)=>{e.preventDefault();voiceGestureStartY=e.clientY;micBtn.setPointerCapture?.(e.pointerId);startExpenseVoice();};
  micBtn.onpointermove=(e)=>{if(activeRecognition)updateVoiceCancelGesture(e.clientX,e.clientY);};
  micBtn.onpointerup=(e)=>{e.preventDefault();updateVoiceCancelGesture(e.clientX,e.clientY);const cancel=voiceCancelArmed;voiceGestureStartY=null;if(cancel)cancelExpenseVoice();else stopExpenseVoice();};
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
$('#globalSearchBtn').onclick=()=>{goView('consultations');setTimeout(()=>$('#consultQuery')?.focus(),0);};
$('#functionsMenuBtn').onclick=()=>{if($('#menuDialog')?.open)$('#menuDialog').close();$('#functionsDialog').showModal();};
$('#addFixedExpense').onclick=()=>openFixedExpenseDialog();
$('#fixedExpenseMonth').onchange=renderFixedExpenses;
$('#fixedExpenseMethod').onchange=()=>updateFixedExpenseCardField();
$('#fixedExpenseCategory').onchange=()=>fillScopedSubcategories('#fixedExpenseCategory','#fixedExpenseSubcategory','#fixedExpenseSubcategoryWrap');
$('#fixedExpenseForm').onsubmit=(event)=>{
  event.preventDefault();
  const data={
    concept:$('#fixedExpenseConcept').value.trim(),
    currency:$('#fixedExpenseCurrency').value,
    category:$('#fixedExpenseCategory').value,
    subcategory:$('#fixedExpenseSubcategory').value,
    method:$('#fixedExpenseMethod').value,
    card:$('#fixedExpenseMethod').value==='Efectivo'?'':$('#fixedExpenseCard').value,
    day:Number($('#fixedExpenseDay').value||1),
    active:true
  };
  if(!data.concept)return showToast('Ingresá el concepto');
  if(data.method!=='Efectivo'&&!data.card)return showToast('Elegí una tarjeta o cuenta');
  if(editingFixedExpenseId){
    const item=state.fixedExpenses.find((x)=>x.id===editingFixedExpenseId);
    if(item)Object.assign(item,data,{active:item.active!==false});
  }else state.fixedExpenses.push({id:uid(),...data});
  editingFixedExpenseId=null;save();$('#fixedExpenseDialog').close();renderFixedExpenses();showToast('✓ Gasto fijo guardado');
};
$('#fixedExpensePaymentForm').onsubmit=async(event)=>{
  event.preventDefault();
  const item=state.fixedExpenses.find((x)=>x.id===$('#fixedExpensePaymentForm').dataset.fixedExpenseId);
  const key=$('#fixedExpensePaymentForm').dataset.month||monthKey(new Date());
  if(!item)return;
  const amount=localizedInputNumber('#fixedExpensePaymentAmount');
  if(!Number.isFinite(amount)||amount<=0)return showToast('Ingresá el importe de este mes');
  const paidDate=$('#fixedExpensePaymentDate').value||new Date().toISOString().slice(0,10);
  let expense={
    id:editingFixedPaymentExpenseId||uid(),
    amount,currency:item.currency,concept:item.concept,category:item.category||'',subcategory:item.subcategory||'',
    method:item.method||'Efectivo',card:item.method==='Efectivo'?'':item.card||'',installments:1,
    date:paidDate+'T12:00:00',purchaseDate:paidDate+'T12:00:00',source:'fixed',
    fixedExpenseId:item.id,fixedExpenseMonth:key,categoryStatus:'manual'
  };
  if(expense.currency==='USD')expense=await stampUsdExpense(expense);
  if(editingFixedPaymentExpenseId){
    const index=state.expenses.findIndex((e)=>e.id===editingFixedPaymentExpenseId);
    if(index>=0)state.expenses[index]=expense;
  }else state.expenses.push(expense);
  editingFixedPaymentExpenseId=null;save();$('#fixedExpensePaymentDialog').close();render();showToast('✓ Pago del gasto fijo registrado');
};
$('#fixedQuickCategory').onclick=()=>{const category=createCategoryFromPrompt('#fixedExpenseCategory');if(category)fillScopedSubcategories('#fixedExpenseCategory','#fixedExpenseSubcategory','#fixedExpenseSubcategoryWrap');};
$('#fixedQuickSubcategory').onclick=()=>createSubcategoryFromPrompt('#fixedExpenseCategory','#fixedExpenseSubcategory','#fixedExpenseSubcategoryWrap');
$('#fixedEditCategory').onclick=()=>editCategoryFromSelect('#fixedExpenseCategory');
$('#fixedEditSubcategory').onclick=()=>editSubcategoryFromSelect('#fixedExpenseCategory','#fixedExpenseSubcategory','#fixedExpenseSubcategoryWrap');

$('#addRecurring').onclick=()=>openRecurringDialog();
$('#recurringMethod').onchange=updateRecurringCardField;
$('#recurringCategory').onchange=()=>fillScopedSubcategories('#recurringCategory','#recurringSubcategory','#recurringSubcategoryWrap');
$('#recurringQuickCategory').onclick=()=>{const category=createCategoryFromPrompt('#recurringCategory');if(category)fillScopedSubcategories('#recurringCategory','#recurringSubcategory','#recurringSubcategoryWrap');};
$('#recurringQuickSubcategory').onclick=()=>createSubcategoryFromPrompt('#recurringCategory','#recurringSubcategory','#recurringSubcategoryWrap');
$('#recurringEditCategory').onclick=()=>editCategoryFromSelect('#recurringCategory');
$('#recurringEditSubcategory').onclick=()=>editSubcategoryFromSelect('#recurringCategory','#recurringSubcategory','#recurringSubcategoryWrap');
$('#recurringForm').onsubmit=(e)=>{e.preventDefault();const data={concept:$('#recurringConcept').value.trim(),amount:localizedInputNumber('#recurringAmount'),currency:$('#recurringCurrency').value,category:$('#recurringCategory').value.trim(),subcategory:$('#recurringSubcategory').value.trim(),method:$('#recurringMethod').value,card:$('#recurringMethod').value==='Efectivo'?'':$('#recurringCard').value,day:Number($('#recurringDay').value),active:true};if(!Number.isFinite(data.amount)||data.amount<=0)return showToast('Ingresá un importe válido');if(data.method!=='Efectivo'&&!data.card)return showToast('Elegí una tarjeta');if(editingRecurringId){const r=state.recurring.find((x)=>x.id===editingRecurringId);if(r)Object.assign(r,data);}else state.recurring.push({id:uid(),...data,lastPromptedMonth:null});editingRecurringId=null;save();$('#recurringDialog').close();renderRecurringSettings();showToast('Gasto recurrente guardado');};
$('#reportManageCategories').onclick=openCategoryManager;
$('#consultManageCategories').onclick=openCategoryManager;
$('#unclassifiedManageCategories').onclick=openCategoryManager;
$('#consultExportExcel').onclick=exportConsultExcel;
$('#consultExportPdf').onclick=exportConsultPdf;

function syncStockPreset(selectId,inputId){
  const select=$(selectId),input=$(inputId);if(!select||!input)return;
  const manual=select.value==='manual';
  input.classList.toggle('hidden',!manual);
  input.required=manual;
  if(!manual)input.value='';
}
function stockPresetValue(selectId,inputId){
  const select=$(selectId),input=$(inputId);
  if(!select)return 0;
  const value=select.value==='manual'?parseLocalizedNumber(input?.value):Number(select.value);
  return Number.isFinite(value)&&value>=1?value:0;
}
$('#stockQtyPreset').onchange=()=>syncStockPreset('#stockQtyPreset','#stockQtyManual');
$('#stockMonthsPreset').onchange=()=>syncStockPreset('#stockMonthsPreset','#stockMonthsManual');
$('#addStock').onclick=()=>{
  $('#stockForm').reset();
  fillStockCategoryOptions();
  $('#stockQtyPreset').value='1';
  $('#stockMonthsPreset').value='1';
  $('#stockQtyManual').value='';
  $('#stockMonthsManual').value='';
  syncStockPreset('#stockQtyPreset','#stockQtyManual');
  syncStockPreset('#stockMonthsPreset','#stockMonthsManual');
  $('#stockPaidDate').value=new Date().toISOString().slice(0,10);
  $('#stockDialog').showModal();
};
$('#stockCategory').onchange=()=>fillScopedSubcategories('#stockCategory','#stockSubcategory','#stockSubcategoryWrap');
$('#stockQuickCategory').onclick=()=>{const category=createCategoryFromPrompt('#stockCategory');if(category)fillScopedSubcategories('#stockCategory','#stockSubcategory','#stockSubcategoryWrap');};
$('#stockQuickSubcategory').onclick=()=>createSubcategoryFromPrompt('#stockCategory','#stockSubcategory','#stockSubcategoryWrap');
$('#stockEditCategory').onclick=()=>editCategoryFromSelect('#stockCategory');
$('#stockEditSubcategory').onclick=()=>editSubcategoryFromSelect('#stockCategory','#stockSubcategory','#stockSubcategoryWrap');
$('#stockForm').onsubmit=async(e)=>{
  e.preventDefault();
  const quantity=stockPresetValue('#stockQtyPreset','#stockQtyManual');
  const months=stockPresetValue('#stockMonthsPreset','#stockMonthsManual');
  if(!quantity)return showToast('Elegí o ingresá una cantidad válida');
  if(!months)return showToast('Elegí o ingresá los meses estimados');
  const totalAmount=localizedInputNumber('#stockAmount');
  if(!Number.isFinite(totalAmount)||totalAmount<0)return showToast('Ingresá un importe válido');
  await addStockPurchase({product:$('#stockProduct').value.trim(),category:$('#stockCategory').value.trim(),subcategory:$('#stockSubcategory').value.trim(),quantity,months,totalAmount,currency:$('#stockCurrency').value,paidDate:$('#stockPaidDate').value});
  $('#stockDialog').close();renderStock();renderBudget();renderSavings();showToast('Compra de stock guardada');
};
bindHoldToTalk($('#stockVoiceBtn'),{
  process:processStockVoice,
  fallbackPrompt:'Decí o escribí, por ejemplo: consumí 2 cafés',
  idleText:'🎙 Registrar consumo',
  listeningText:'🎙 Escuchando… soltá para terminar',
  errorText:'No pude escuchar el consumo'
});

$('#addRecovery').onclick=()=>{ $('#recoveryForm').reset(); $('#recoveryDate').value=new Date().toISOString().slice(0,10); $('#recoveryDialog').showModal(); };
$('#recoveryForm').onsubmit=async(e)=>{e.preventDefault();let item={id:uid(),amount:localizedInputNumber('#recoveryAmount'),currency:$('#recoveryCurrency').value,concept:$('#recoveryConcept').value.trim(),date:$('#recoveryDate').value};if(!Number.isFinite(item.amount)||item.amount<=0)return showToast('Ingresá un importe válido');if(item.currency==='USD'){const rate=await ensureUsdRate(false);if(rate)Object.assign(item,{fxRate:rate.rate,fxRateName:rate.name,fxRateUpdatedAt:rate.updatedAt});}state.recoveries.push(item);save();$('#recoveryDialog').close();renderRecoveries();showToast('Recupero guardado');};
$('#recoveryMonth').onchange=renderRecoveries;

$('#budgetMonth').onchange=renderBudget;
$('#saveBudget').onclick=()=>{ const key=$('#budgetMonth').value||currentMonthKey(), amount=localizedInputNumber('#budgetAmount'), reason=$('#budgetReason').value.trim(); const current=budgetFor(key); const history=[...(current.history||[]),{date:new Date().toISOString(),amount,reason}]; state.budgets[key]={amount,reason,history}; save(); renderBudget(); renderSavings(); renderBudgetHomeAlert(); showToast('Presupuesto guardado'); };
$('#savingsYear').onchange=renderSavings;

$('#runConsult').onclick=runConsultation;
['consultFrom','consultTo','consultSubcategory','consultMethod','consultCurrency','consultCard','consultAmount','consultMin'].forEach((id)=>$('#'+id).onchange=runConsultation);
$('#consultCategory').onchange=()=>{renderConsultationFilters();runConsultation();};
$('#consultSpeak').onchange=()=>{state.settings.consultSpeak=$('#consultSpeak').checked;save();};
$('#compareMonths').onclick=compareMonths;
bindHoldToTalk($('#consultMic'),{
  process:(phrase)=>{$('#consultQuery').value=phrase;runConsultation();},
  fallbackPrompt:'Escribí tu consulta:',
  idleText:'🎙',
  listeningText:'🎙 Escuchando…',
  errorText:'No pude escuchar la consulta'
});


document.querySelectorAll('[data-menu-view]').forEach((button) => { button.onclick = () => { const dialog=button.closest('dialog'); if(dialog?.open)dialog.close(); if($('#menuDialog')?.open)$('#menuDialog').close(); goView(button.dataset.menuView); }; });
document.querySelectorAll('[data-menu-coming]').forEach((button) => { button.onclick = () => showToast(`${button.dataset.menuComing}: lo terminamos en la siguiente revisión`); });
if(!sharedMode && resaleApi){
$('#addResaleParty').onclick = () => $('#resalePartyDialog').showModal();
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
  state.resale.ownerPercent = split.ownerPercent; state.resale.sellerPercent = split.sellerPercent;
  save(); $('#resaleSplitDialog').close(); renderResale(); showToast('Reparto actualizado en toda Reventa');
};
$('#exportResale').onclick = exportResaleCsv;
}


window.addEventListener('pagehide',()=>{try{save();}catch{}}); document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){try{save();}catch{}}});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then((registration) => registration.update());
bindLocalizedNumberInputs();
const todayISO = new Date().toISOString().slice(0, 10); const monthISO=todayISO.slice(0,7); $('#historyDate').value = todayISO; $('#historyMonth').value = monthISO; $('#historyFrom').value = todayISO; $('#historyTo').value = todayISO; $('#fromDate').value = todayISO.slice(0,8)+'01'; $('#toDate').value = todayISO; $('#usdFromDate').value = todayISO.slice(0,8)+'01'; $('#usdToDate').value = todayISO; $('#stockPaidDate').value=todayISO; $('#recoveryDate').value=todayISO; $('#recoveryMonth').value=monthISO; $('#budgetMonth').value=monthISO; $('#fixedExpenseMonth').value=monthISO; $('#consultFrom').value=todayISO.slice(0,8)+'01'; $('#consultTo').value=todayISO; $('#compareMonthA').value=monthKey(new Date(new Date().getFullYear(),new Date().getMonth()-1,1)); $('#compareMonthB').value=monthISO; $('#consultSpeak').checked=state.settings.consultSpeak!==false; document.body.classList.toggle('hide-amounts',!!state.settings.hideAmounts); $('#privacyBtn').textContent=state.settings.hideAmounts?'🙈':'👁'; save(); render(); setInterval(renderHomeClock,30000); ensureUsdRate(false).then(()=>renderUsd()); setTimeout(()=>{if(state.security.enabled)showAppLock();else prepareRecurringDue();},250);
