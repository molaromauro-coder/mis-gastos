from pathlib import Path
import re

repo=Path('.')
app=repo/'app.js'
index=repo/'index.html'
styles=repo/'styles.css'
sw=repo/'sw.js'

a=app.read_text()

# Demo media de pago: conservar ediciones del usuario, completar colores y sumar Cuenta Banco Macro una sola vez.
new_seed=r'''function seedDemoCardsOnce(){
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
'''
pattern=r"function seedDemoCardsOnce\(\)\{.*?\n\}\nseedDemoCardsOnce\(\);"
matches=list(re.finditer(pattern,a,flags=re.S));assert len(matches)==1,f'seed replacements={len(matches)}'
a=re.sub(pattern,lambda _:new_seed+'seedDemoCardsOnce();',a,count=1,flags=re.S)

a=a.replace("let selectedDate = new Date(), reportRange = 'month', usdRange = 'month', historyRange = 'today', pending = [], discarded = null, manualStep = 1, editingCardId = null, editingRecurringId = null;",
            "let selectedDate = new Date(), reportRange = 'month', usdRange = 'month', historyRange = 'today', pending = [], discarded = null, manualStep = 1, editingCardId = null, editingRecurringId = null, activeCardType = '';" )

# Flecha en diálogos: mismo comportamiento de cierre, pero visualmente vuelve a la pantalla anterior.
needle="const effectiveDate = (e) => new Date(e.dueDate || e.date);"
insert="""const effectiveDate = (e) => new Date(e.dueDate || e.date);
document.querySelectorAll('dialog .close').forEach((button)=>{button.textContent='←';button.setAttribute('aria-label','Volver');button.classList.add('back-button');});"""
assert needle in a
a=a.replace(needle,insert,1)

# Reordenamiento táctil genérico. Se activa solo al tocar el cuerpo del elemento, no los botones de acción.
reorder_helper=r'''
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
'''
marker='function fillCategories() {'
assert marker in a
a=a.replace(marker,reorder_helper+marker,1)

new_fill=r'''function fillCategories() {
  const selected=$('#category')?.value||'';
  $('#category').innerHTML='<option value="">Sin categoría</option>'+state.categories.map((c)=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  if(selected&&state.categories.includes(selected))$('#category').value=selected;
  $('#categoryList').innerHTML=state.categories.length?state.categories.map((c,i)=>{
    const subs=subcategoriesFor(c);
    return `<article class="settings-item reorderable" data-category-index="${i}" data-reorder-index="${i}"><div class="reorder-row"><span class="drag-grip">↕</span><div class="reorder-content"><strong>${escape(c)}</strong><div class="chips" data-subcategory-parent="${escape(c)}">${subs.length?subs.map((s,si)=>`<span class="chip subcategory-chip reorderable" data-reorder-index="${si}"><span class="drag-grip mini">↕</span><span>${escape(s)}</span><button type="button" class="chip-delete" data-delete-subcategory="${si}" data-category-name="${escape(c)}" aria-label="Eliminar ${escape(s)}">×</button></span>`).join(''):'<small class="muted">Sin subcategorías.</small>'}</div></div></div><div class="mini-actions"><button type="button" data-add-subcategory="${i}">＋ Subcategoría</button><button type="button" data-delete-category="${i}">Eliminar</button></div></article>`;
  }).join(''):'<p class="muted">Creá categorías como quieras; cada una puede tener subcategorías.</p>';
  document.querySelectorAll('[data-add-subcategory]').forEach((b)=>{b.onclick=()=>{const category=state.categories[Number(b.dataset.addSubcategory)];if(!category)return;const value=prompt(`Nueva subcategoría dentro de ${category}:`)?.trim();if(!value)return;const list=subcategoriesFor(category);if(list.some((s)=>s.toLowerCase()===value.toLowerCase()))return showToast('Esa subcategoría ya existe');state.subcategories[category]=[...list,value];save();fillCategories();};});
  document.querySelectorAll('[data-delete-subcategory]').forEach((b)=>{b.onclick=()=>{const category=b.dataset.categoryName;const list=subcategoriesFor(category);const index=Number(b.dataset.deleteSubcategory);if(index<0||index>=list.length)return;state.subcategories[category]=list.filter((_,i)=>i!==index);save();fillCategories();};});
  document.querySelectorAll('[data-delete-category]').forEach((b)=>{b.onclick=()=>{const index=Number(b.dataset.deleteCategory);const category=state.categories[index];if(!category)return;state.categories.splice(index,1);delete state.subcategories[category];save();fillCategories();};});
  installPointerReorder($('#categoryList'),':scope > .settings-item',(from,to)=>{const [item]=state.categories.splice(from,1);state.categories.splice(to,0,item);save();fillCategories();},'button,.subcategory-chip,input,select');
  document.querySelectorAll('.chips[data-subcategory-parent]').forEach((container)=>{
    installPointerReorder(container,'.subcategory-chip',(from,to)=>{const category=container.dataset.subcategoryParent;const list=[...subcategoriesFor(category)];const [item]=list.splice(from,1);list.splice(to,0,item);state.subcategories[category]=list;save();fillCategories();},'button');
  });
  fillSubcategories();
}
'''
pattern=r"function fillCategories\(\) \{.*?\n\}\nfunction fillCardSelect"
matches=list(re.finditer(pattern,a,flags=re.S));assert len(matches)==1,f'fillCategories replacements={len(matches)}'
a=re.sub(pattern,lambda _:new_fill+'function fillCardSelect',a,count=1,flags=re.S)

new_render_cards=r'''function renderCards() {
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
    const meta=card.type==='Crédito'?`Cierra el ${card.closingDay} · Vence el ${card.dueDay}`:'Débito inmediato · sin vencimiento de pago';
    const label=card.type==='Crédito'?'Crédito':'Cuenta / Débito';
    const debitDetail=card.type==='Débito'?`<details class="debit-detail"><summary>Ver movimientos</summary>${all.length?all.slice().sort((a,b)=>new Date(b.purchaseDate||b.date)-new Date(a.purchaseDate||a.date)).map((e)=>`<div class="due-line"><span>${new Date(e.purchaseDate||e.date).toLocaleDateString('es-AR')} · ${escape(e.concept||'Sin detalle')}</span><strong>${money(e.amount,e.currency)}</strong></div>`).join(''):'<small class="muted">Sin movimientos.</small>'}</details>`:'';
    return `<article class="card-item reorderable" data-card-id="${escape(card.id)}" data-reorder-index="${orderIndex}" style="--card-color:${escape(card.color||'#173f37')}"><div class="top"><div class="card-name-line"><span class="drag-grip light">↕</span><strong>${escape(card.name)}</strong></div><span>${label}</span></div><p>${meta}</p><div class="card-total"><small>${card.type==='Crédito'?'ACUMULADO DEL MES':'TOTAL ACUMULADO'}</small><strong>${card.type==='Crédito'?totalsHTML(current):totalsHTML(all)}</strong></div>${debitDetail}<div class="card-actions"><button class="edit-card" data-card-id="${escape(card.id)}">Editar</button><button class="delete-card" data-card-id="${escape(card.id)}">Eliminar</button></div></article>`;
  }).join(''):'<div class="empty">No agregaste medios de pago de este tipo.</div>';

  document.querySelectorAll('.edit-card').forEach((b)=>{b.onclick=()=>{const card=state.cards.find((c)=>c.id===b.dataset.cardId);if(!card)return;editingCardId=card.id;$('#cardDialog h2').textContent='Editar tarjeta / cuenta';$('#cardName').value=card.name;$('#cardType').value=card.type;$('#cardColor').value=card.color||'#173f37';$('#closingDay').value=card.closingDay||25;$('#dueDay').value=card.dueDay||10;$('#creditCardDates').classList.toggle('hidden',card.type!=='Crédito');$('#cardDialog').showModal();};});
  document.querySelectorAll('.delete-card').forEach((b)=>{b.onclick=()=>{const index=state.cards.findIndex((c)=>c.id===b.dataset.cardId),card=state.cards[index];if(index<0||!card)return;const linked=(state.recurring||[]).filter((r)=>r.card===card.name&&r.method===card.type);const message=linked.length?`¿Eliminar ${card.name}? Los gastos guardados no se borrarán. ${linked.length} gasto(s) recurrente(s) quedarán desactivados.`:'¿Eliminar este medio de pago? Los gastos guardados no se borrarán.';if(!confirm(message))return;state.recurring.forEach((r)=>{if(r.card===card.name&&r.method===card.type){r.card='';r.active=false;}});state.cards.splice(index,1);save();render();};});
  installPointerReorder(list,'.card-item',(from,to)=>{const positions=state.cards.map((card,index)=>card.type===type?index:-1).filter((index)=>index>=0),ordered=positions.map((index)=>state.cards[index]);const [item]=ordered.splice(from,1);ordered.splice(to,0,item);positions.forEach((position,i)=>state.cards[position]=ordered[i]);save();renderCards();},'button,details,summary');

  const credit=state.cards.filter((c)=>c.type==='Crédito');
  $('#dueList').innerHTML=credit.length?credit.map((c)=>{const due=nextDue(c),items=monthlyCardTotal(c,due).slice().sort((a,b)=>effectiveDate(a)-effectiveDate(b));const details=items.length?items.map((e)=>`<div class="due-line"><span>${escape(e.concept||'Sin detalle')}${e.installments>1?` · cuota ${e.installment||1} de ${e.installments}`:''}</span><strong>${money(e.amount,e.currency)}</strong></div>`).join(''):'<small class="muted">Sin consumos para este vencimiento.</small>';return `<article class="due-item"><div class="due-main"><strong>${escape(c.name)}</strong><p>Próximo vencimiento: ${due.toLocaleDateString('es-AR')}</p><strong class="due-total">${totalsHTML(items)}</strong><div class="due-lines">${details}</div></div></article>`;}).join(''):'<div class="empty">Agregá una tarjeta de crédito para ver vencimientos.</div>';
  $('#cardHistory').innerHTML=credit.map((c)=>`<details class="history-card"><summary>${escape(c.name)}</summary>${Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-i,1),items=monthlyCardTotal(c,d),lines=items.map((e)=>`<small>${escape(e.concept||'Sin detalle')}${e.installments>1?` · ${e.installment||1} de ${e.installments}`:''}: ${money(e.amount,e.currency)}</small>`).join('');return `<div class="history-row"><div><span>${d.toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</span>${lines}</div><strong>${totalsHTML(items)}</strong></div>`;}).join('')}</details>`).join('');
}
'''
pattern=r"function renderCards\(\) \{.*?\n\}\nfunction renderPaymentReminders"
matches=list(re.finditer(pattern,a,flags=re.S));assert len(matches)==1,f'renderCards replacements={len(matches)}'
a=re.sub(pattern,lambda _:new_render_cards+'function renderPaymentReminders',a,count=1,flags=re.S)

old_add="""$('#addCard').onclick = () => { editingCardId = null; $('#cardDialog h2').textContent = 'Nueva tarjeta'; $('#cardForm').reset(); $('#creditCardDates').classList.remove('hidden'); $('#cardDialog').showModal(); }; $('#cardType').onchange = () => $('#creditCardDates').classList.toggle('hidden', $('#cardType').value !== 'Crédito'); $('#cardForm').onsubmit = (event) => {
  event.preventDefault();
  const name = $('#cardName').value.trim();
  const selectedType = $('#cardType').value;
  const duplicate = state.cards.some((c) => c.id !== editingCardId && c.name.toLowerCase() === name.toLowerCase() && c.type === selectedType);
  if (duplicate) return showToast('Ya existe una tarjeta con ese nombre');
  const data = { name, type: selectedType, closingDay: Number($('#closingDay').value), dueDay: Number($('#dueDay').value) };
"""
new_add="""$('#addCard').onclick = () => { editingCardId = null; $('#cardDialog h2').textContent = 'Nuevo medio de pago'; $('#cardForm').reset(); $('#cardType').value=activeCardType||'Crédito'; $('#cardColor').value='#173f37'; $('#creditCardDates').classList.toggle('hidden',$('#cardType').value!=='Crédito'); $('#cardDialog').showModal(); }; $('#cardType').onchange = () => $('#creditCardDates').classList.toggle('hidden', $('#cardType').value !== 'Crédito'); $('#cardForm').onsubmit = (event) => {
  event.preventDefault();
  const name = $('#cardName').value.trim();
  const selectedType = $('#cardType').value;
  const duplicate = state.cards.some((c) => c.id !== editingCardId && c.name.toLowerCase() === name.toLowerCase() && c.type === selectedType);
  if (duplicate) return showToast('Ya existe una tarjeta o cuenta con ese nombre');
  const data = { name, type: selectedType, color:$('#cardColor').value||'#173f37', closingDay: selectedType==='Crédito'?Number($('#closingDay').value):0, dueDay: selectedType==='Crédito'?Number($('#dueDay').value):0 };
"""
assert old_add in a,'card form start not found'
a=a.replace(old_add,new_add,1)
a=a.replace("save(); event.target.reset(); $('#cardDialog').close(); showToast('Tarjeta guardada'); render();","save(); event.target.reset(); $('#cardDialog').close(); activeCardType=selectedType; showToast('Medio de pago guardado'); render();",1)
app.write_text(a)

h=index.read_text()
old_cards='<section id="cards" class="view"><div class="section-title"><div><small>TUS MEDIOS DE PAGO</small><h2>Tarjetas</h2></div><button id="addCard">＋ Agregar</button></div><p class="muted">Solo aparecen las tarjetas que vos configurás.</p><div id="cardList"></div><h2 class="card-history-title">Próximos vencimientos</h2><div id="dueList"></div><h2 class="card-history-title">Historial mensual</h2><div id="cardHistory"></div></section>'
new_cards='''<section id="cards" class="view"><div class="section-title"><div><small>TUS MEDIOS DE PAGO</small><h2>Tarjetas y cuentas</h2></div><button id="addCard">＋ Agregar</button></div><p class="muted">Elegí qué grupo querés administrar.</p><div id="cardTypeChooser" class="card-type-chooser"><button type="button" data-card-type-view="Débito"><span>▰</span><div><strong>Débito / Cuentas</strong><small>Pago inmediato, sin vencimientos</small></div><b>›</b></button><button type="button" data-card-type-view="Crédito"><span>▰</span><div><strong>Tarjetas de crédito</strong><small>Cierres, cuotas y vencimientos</small></div><b>›</b></button></div><button type="button" id="cardsBack" class="screen-back hidden">← Atrás</button><h2 id="cardSectionTitle" class="card-history-title hidden"></h2><div id="cardList"></div><div id="creditOnly" class="hidden"><h2 class="card-history-title">Próximos vencimientos</h2><div id="dueList"></div><h2 class="card-history-title">Historial mensual</h2><div id="cardHistory"></div></div></section>'''
assert old_cards in h,'cards section not found'
h=h.replace(old_cards,new_cards,1)
old_dialog='<dialog id="cardDialog"><form id="cardForm"><div class="dialog-head"><h2>Nueva tarjeta</h2><button type="button" class="close">×</button></div><label>Nombre o alias<input id="cardName" required placeholder="Ej. Tarjeta personal"></label><label>Tipo<select id="cardType"><option>Crédito</option><option>Débito</option></select></label><div id="creditCardDates" class="form-row"><label>Día de cierre<input id="closingDay" type="number" min="1" max="31" value="25"></label><label>Día de vencimiento<input id="dueDay" type="number" min="1" max="31" value="10"></label></div><button class="primary">Guardar tarjeta</button></form></dialog>'
new_dialog='<dialog id="cardDialog"><form id="cardForm"><div class="dialog-head"><h2>Nuevo medio de pago</h2><button type="button" class="close">←</button></div><label>Nombre o alias<input id="cardName" required placeholder="Ej. Cuenta Banco Macro"></label><label>Tipo<select id="cardType"><option>Crédito</option><option>Débito</option></select></label><label>Color<input id="cardColor" type="color" value="#173f37"></label><div id="creditCardDates" class="form-row"><label>Día de cierre<input id="closingDay" type="number" min="1" max="31" value="25"></label><label>Día de vencimiento<input id="dueDay" type="number" min="1" max="31" value="10"></label></div><button class="primary">Guardar</button></form></dialog>'
assert old_dialog in h,'card dialog not found'
h=h.replace(old_dialog,new_dialog,1)
index.write_text(h)

css=styles.read_text()
extra=r'''

/* Navegación, colores y reordenamiento táctil */
.card-type-chooser{display:grid;gap:10px;margin:16px 0}.card-type-chooser>button{border:0;background:#fff;border-radius:17px;padding:16px;display:flex;align-items:center;gap:12px;text-align:left;box-shadow:0 4px 16px #172f2a0b}.card-type-chooser>button>span{width:42px;height:42px;border-radius:13px;background:var(--mint);display:grid;place-items:center}.card-type-chooser>button>div{flex:1}.card-type-chooser strong,.card-type-chooser small{display:block}.card-type-chooser small{margin-top:4px}.screen-back{border:0;background:none;color:#297266;font-weight:800;padding:8px 0;margin:4px 0 2px}.card-item{background:var(--card-color,var(--green))}.card-name-line{display:flex;align-items:center;gap:8px}.drag-grip{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#18352f12;color:var(--muted);font-weight:900;touch-action:none;user-select:none;-webkit-user-select:none}.drag-grip.light{background:#ffffff24;color:#fff}.drag-grip.mini{width:20px;height:20px;font-size:11px}.reorderable{transition:transform .12s,box-shadow .12s,opacity .12s}.drag-selected{outline:2px solid #2f806f;box-shadow:0 8px 24px #173f3730!important;transform:scale(.99);opacity:.94}.drag-target{outline:2px dashed #2f806f}.reorder-row{display:flex;align-items:flex-start;gap:8px}.reorder-content{flex:1;min-width:0}.subcategory-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 7px}.chip-delete{border:0;background:none;color:var(--red);font-size:17px;padding:0 2px;line-height:1}.back-button{font-size:22px}#cardColor{height:48px;padding:5px}
'''
if 'Navegación, colores y reordenamiento táctil' not in css:css+=extra
styles.write_text(css)

s=sw.read_text().replace("const CACHE = 'mis-gastos-v25';","const CACHE = 'mis-gastos-v26';")
sw.write_text(s)
