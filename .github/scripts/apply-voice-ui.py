from pathlib import Path

APP=Path('app.js')
SW=Path('sw.js')
text=APP.read_text(encoding='utf-8')

def replace_between(source,start,end,replacement):
    i=source.find(start)
    if i<0: raise SystemExit(f'No se encontró inicio: {start}')
    j=source.find(end,i)
    if j<0: raise SystemExit(f'No se encontró fin: {end}')
    return source[:i]+replacement.rstrip()+"\n"+source[j:]

text=replace_between(text,"function pendingCreditDetail(e){","function normVoiceChoice(text){",r'''function pendingCreditDetail(e){
  if(e.method!=='Crédito'||!e.card||!e.amount||e.installmentsSpecified===false)return '';
  const card=state.cards.find((c)=>c.name===e.card); if(!card)return '';
  const count=Math.max(1,Number(e.installments||1));
  const due=firstDueDateForCard(card,new Date(e.purchaseDate||e.date));
  return `<div class="pending-credit-detail"><span>${count} cuota${count===1?'':'s'} de <strong>${money(Number(e.amount)/count,e.currency)}</strong></span><span>Primera cuota: <strong>${due.toLocaleDateString('es-AR')}</strong></span></div>`;
}
''')

text=replace_between(text,"function pendingPaymentPrompt(e,i){","function applyPendingPaymentVoice(index,phrase){",r'''function pendingDatePrompt(e,i){
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
    return `<div class="pending-payment-question"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class="pending-card-select" data-index="${i}"><option value="">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value="${escape(c.name)}">${escape(c.name)}</option>`).join('')}</select>`:'<small class="muted">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<button type="button" class="voice-pay" data-pending-pay-voice="${i}">🎙 Responder por voz</button></div>`;
  }
  if(needsInstallments){
    return `<div class="pending-payment-question"><strong>¿En cuántas cuotas?</strong><select class="pending-installments-select" data-index="${i}"><option value="">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value="${n}">${n} cuota${n===1?'':'s'}</option>`).join('')}</select></div>`;
  }
  return '';
}
''')

text=replace_between(text,"function applyPendingPaymentVoice(index,phrase){","function startPendingPaymentVoice(index){",r'''function applyPendingPaymentVoice(index,phrase){
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
    const installmentDigits=spoken.match(/\b(\d+)\s*cuotas?\b/);
    if(installmentDigits){item.installments=Math.max(1,Number(installmentDigits[1]));item.installmentsSpecified=true;}
    else if(item.installmentsSpecified!==true)item.installmentsSpecified=false;
  }
  const cards=state.cards.filter((c)=>c.type===method);
  const named=cards.find((c)=>spoken.includes(normVoiceChoice(c.name)));
  if(named)item.card=named.name;
  showPending();
  if(!item.card) showToast(cards.length?'Decí o elegí qué tarjeta o cuenta usaste':'Primero agregá una tarjeta o cuenta de este tipo');
}
''')

text=replace_between(text,"function showPending() {","const uid =",r'''function showPending() {
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

''')

text=replace_between(text,"async function confirmPending(index, card) {","document.querySelectorAll('nav button')",r'''async function confirmPending(index, card) {
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
''')

APP.write_text(text,encoding='utf-8')
sw=SW.read_text(encoding='utf-8')
if "mis-gastos-v18" in sw:
    sw=sw.replace("mis-gastos-v18","mis-gastos-v19")
elif "mis-gastos-v19" not in sw:
    raise SystemExit('Versión de caché inesperada')
SW.write_text(sw,encoding='utf-8')
print('app.js y sw.js actualizados')
