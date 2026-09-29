from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

app_path = Path('app.js')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "const defaults = { expenses: [], cards: [], categories: [], stock: [], recoveries: [], budgets: {}, recurring: [], trash: [], security:",
    "const defaults = { expenses: [], cards: [], categories: [], subcategories: {}, stock: [], recoveries: [], budgets: {}, recurring: [], trash: [], security:",
    'subcategories default'
)
app = replace_once(
    app,
    "categories: old.categories || [], stock: old.stock || []",
    "categories: old.categories || [], subcategories: old.subcategories || {}, stock: old.stock || []",
    'subcategories load state'
)

old_detail = "  const detail=[e.category,e.method,e.card,e.installments>1?`${e.installment||1}/${e.installments}`:null].filter(Boolean).join(' · ');"
new_detail = "  const detail=[e.category,e.subcategory,e.method,e.card,e.installments>1?`${e.installment||1}/${e.installments}`:null].filter(Boolean).join(' · ');"
app = replace_once(app, old_detail, new_detail, 'expense subcategory detail')

old_fill = "function fillCategories() { $('#category').innerHTML = '<option value=\"\">Sin categoría</option>' + state.categories.map((c) => `<option>${escape(c)}</option>`).join(''); $('#categoryList').innerHTML = state.categories.length ? state.categories.map((c, i) => `<button class=\"chip\" data-category-index=\"${i}\">${escape(c)} <span>×</span></button>`).join('') : '<p class=\"muted\">Creá categorías como quieras; no hay una lista cerrada.</p>'; document.querySelectorAll('[data-category-index]').forEach((b) => { b.onclick = () => { state.categories.splice(Number(b.dataset.categoryIndex), 1); save(); fillCategories(); }; }); }"
new_fill = r'''function subcategoriesFor(category){
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
}'''
app = replace_once(app, old_fill, new_fill, 'category settings with subcategories')

old_open = "function openExpense(data = {}) { $('#expenseForm').reset(); $('#amount').value = data.amount || ''; $('#concept').value = data.concept === 'Sin concepto' ? '' : data.concept || ''; const voiceNeedsMethod=data.source==='voice'&&data.method==='Sin definir'; $('#method').value = voiceNeedsMethod ? '' : data.method || 'Efectivo'; $('#installments').value = data.installments || 1; document.querySelector(`[name=currency][value=${data.currency || 'ARS'}]`).checked = true; fillCategories(); $('#category').value = data.category || ''; setManualStep(voiceNeedsMethod ? 3 : 1); updatePaymentFields(); $('#expenseCard').value = data.card || ''; updateInstallmentPreview(); $('#expenseDialog').showModal(); }"
new_open = "function openExpense(data = {}) { $('#expenseForm').reset(); $('#amount').value = data.amount || ''; $('#concept').value = data.concept === 'Sin concepto' ? '' : data.concept || ''; const voiceNeedsMethod=data.source==='voice'&&data.method==='Sin definir'; $('#method').value = voiceNeedsMethod ? '' : data.method || 'Efectivo'; $('#installments').value = data.installments || 1; document.querySelector(`[name=currency][value=${data.currency || 'ARS'}]`).checked = true; fillCategories(); $('#category').value = data.category || ''; fillSubcategories(data.subcategory || ''); setManualStep(voiceNeedsMethod ? 3 : 1); updatePaymentFields(); $('#expenseCard').value = data.card || ''; updateInstallmentPreview(); $('#expenseDialog').showModal(); }"
app = replace_once(app, old_open, new_open, 'open expense subcategory')

old_card = "    return `<div class=\"pending-payment-question\"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class=\"pending-card-select\" data-index=\"${i}\"><option value=\"\">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value=\"${escape(c.name)}\">${escape(c.name)}</option>`).join('')}</select>`:'<small class=\"muted\">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div>`;"
new_card = "    return `<div class=\"pending-payment-question\"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class=\"pending-card-select\" data-index=\"${i}\"><option value=\"\">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value=\"${escape(c.name)}\">${escape(c.name)}</option>`).join('')}</select>`:'<small class=\"muted\">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<div class=\"pending-payment-actions\"><button type=\"button\" class=\"secondary pending-back\" data-pending-back=\"method\" data-index=\"${i}\">← Atrás</button><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div></div>`;"
app = replace_once(app, old_card, new_card, 'pending card back button')

old_installments = "    return `<div class=\"pending-payment-question\"><strong>¿En cuántas cuotas?</strong><select class=\"pending-installments-select\" data-index=\"${i}\"><option value=\"\">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value=\"${n}\">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div>`;"
new_installments = "    return `<div class=\"pending-payment-question\"><strong>¿En cuántas cuotas?</strong><select class=\"pending-installments-select\" data-index=\"${i}\"><option value=\"\">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value=\"${n}\">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><div class=\"pending-payment-actions\"><button type=\"button\" class=\"secondary pending-back\" data-pending-back=\"card\" data-index=\"${i}\">← Atrás</button><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div></div>`;"
app = replace_once(app, old_installments, new_installments, 'pending installments back button')

old_handlers = """  document.querySelectorAll('.pending-card-select').forEach((select)=>{
    select.onchange=()=>{const item=pending[Number(select.dataset.index)];if(!item)return;item.card=select.value;showPending();};
  });"""
new_handlers = """  document.querySelectorAll('[data-pending-back]').forEach((button)=>{
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
  });"""
app = replace_once(app, old_handlers, new_handlers, 'pending back handlers')

old_feedback = "function feedback(ok) { navigator.vibrate?.(ok ? 50 : [120, 50, 120]); try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = ok ? 720 : 180; gain.gain.value = .035; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (ok ? .08 : .16)); } catch {} }"
new_feedback = """function feedback(ok) { navigator.vibrate?.(ok ? 50 : [120, 50, 120]); try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = ok ? 720 : 180; gain.gain.value = .035; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (ok ? .08 : .16)); } catch {} }
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
document.addEventListener('pointerdown',(event)=>{const button=event.target.closest?.('button');if(!button||button.disabled)return;softTapFeedback();},{passive:true});"""
app = replace_once(app, old_feedback, new_feedback, 'global tap feedback')

old_manual_event = "$('#method').onchange = updatePaymentFields; $('#expenseCard').onchange = updateInstallmentPreview; $('#installments').oninput = updateInstallmentPreview; $('#amount').oninput = updateInstallmentPreview; document.querySelectorAll('[name=currency]').forEach((i) => { i.onchange = updateInstallmentPreview; });"
new_manual_event = "$('#method').onchange = updatePaymentFields; $('#category').onchange = () => fillSubcategories(); $('#expenseCard').onchange = updateInstallmentPreview; $('#installments').oninput = updateInstallmentPreview; $('#amount').oninput = updateInstallmentPreview; document.querySelectorAll('[name=currency]').forEach((i) => { i.onchange = updateInstallmentPreview; });"
app = replace_once(app, old_manual_event, new_manual_event, 'manual category change')

old_expense_obj = "let expense={ id:crypto.randomUUID(), amount:Number($('#amount').value), currency:document.querySelector('[name=currency]:checked').value, concept:$('#concept').value || $('#category').value || 'Sin detalle', category:$('#category').value, method, card:$('#expenseCard').value, installments:method==='Crédito' ? Number($('#installments').value) : 1, date:now, purchaseDate:now, source:'manual' };"
new_expense_obj = "let expense={ id:crypto.randomUUID(), amount:Number($('#amount').value), currency:document.querySelector('[name=currency]:checked').value, concept:$('#concept').value || $('#subcategory')?.value || $('#category').value || 'Sin detalle', category:$('#category').value, subcategory:$('#subcategory')?.value || '', method, card:$('#expenseCard').value, installments:method==='Crédito' ? Number($('#installments').value) : 1, date:now, purchaseDate:now, source:'manual' };"
app = replace_once(app, old_expense_obj, new_expense_obj, 'manual expense subcategory')

old_add = "function addCategory() { const value = $('#newCategory').value.trim(); if (!value || state.categories.some((c) => c.toLowerCase() === value.toLowerCase())) return; state.categories.push(value); $('#newCategory').value = ''; save(); fillCategories(); }\n$('#categoryForm').onsubmit = (event) => { event.preventDefault(); addCategory(); }; $('#quickCategory').onclick = () => { const value = prompt('Nombre de la nueva categoría:')?.trim(); if (!value) return; $('#newCategory').value = value; addCategory(); $('#category').value = value; };"
new_add = """function addCategory() { const value = $('#newCategory').value.trim(); if (!value || state.categories.some((c) => c.toLowerCase() === value.toLowerCase())) return; state.categories.push(value); state.subcategories[value] ||= []; $('#newCategory').value = ''; save(); fillCategories(); }
function addSubcategory(category,value){ const clean=String(value||'').trim(); if(!category||!clean)return false; const list=subcategoriesFor(category); if(list.some((s)=>s.toLowerCase()===clean.toLowerCase()))return false; state.subcategories[category]=[...list,clean]; save(); return true; }
$('#categoryForm').onsubmit = (event) => { event.preventDefault(); addCategory(); };
$('#quickCategory').onclick = () => { const value = prompt('Nombre de la nueva categoría:')?.trim(); if (!value) return; $('#newCategory').value = value; addCategory(); $('#category').value = value; fillSubcategories(); };
$('#quickSubcategory').onclick = () => { const category=$('#category').value; if(!category)return showToast('Elegí primero una categoría'); const value=prompt(`Nueva subcategoría dentro de ${category}:`)?.trim(); if(!value)return; if(!addSubcategory(category,value))return showToast('Esa subcategoría ya existe'); fillSubcategories(value); };"""
app = replace_once(app, old_add, new_add, 'category add handlers')

app_path.write_text(app, encoding='utf-8')

index_path=Path('index.html')
index=index_path.read_text(encoding='utf-8')
old_step='<div class="step" data-step="2"><label>Categoría<select id="category"><option value="">Sin categoría</option></select></label><button type="button" id="quickCategory" class="text-button">＋ Crear categoría</button></div>'
new_step='<div class="step" data-step="2"><label>Categoría<select id="category"><option value="">Sin categoría</option></select></label><button type="button" id="quickCategory" class="text-button">＋ Crear categoría</button><label id="subcategoryWrap" class="hidden">Subcategoría<select id="subcategory"><option value="">Sin subcategoría</option></select></label><button type="button" id="quickSubcategory" class="text-button hidden">＋ Crear subcategoría</button></div>'
index=replace_once(index,old_step,new_step,'manual subcategory field')
old_settings='<section class="settings-section"><h3>Categorías</h3><form id="categoryForm" class="inline-form"><input id="newCategory" maxlength="30" placeholder="Nueva categoría" required><button class="primary">Agregar</button></form><div id="categoryList" class="chips"></div></section>'
new_settings='<section class="settings-section"><h3>Categorías y subcategorías</h3><p class="muted">Cada categoría puede tener subcategorías. Ejemplo: Gastos fijos → Luz, Gas, Internet, Televisión, Gimnasio.</p><form id="categoryForm" class="inline-form"><input id="newCategory" maxlength="30" placeholder="Nueva categoría" required><button class="primary">Agregar</button></form><div id="categoryList"></div></section>'
index=replace_once(index,old_settings,new_settings,'settings categories copy')
index_path.write_text(index,encoding='utf-8')

sw_path=Path('sw.js')
sw=sw_path.read_text(encoding='utf-8')
sw=replace_once(sw,"const CACHE = 'mis-gastos-v23';","const CACHE = 'mis-gastos-v24';",'service worker cache bump')
sw_path.write_text(sw,encoding='utf-8')
