from pathlib import Path
import re

repo=Path('.')
parser=repo/'parser.js'
app=repo/'app.js'
tests=repo/'test/parser.test.js'
sw=repo/'sw.js'

p=parser.read_text()
new_parse_expense=r'''export function parseExpense(text,cards=[],categories=[],options={}){
  const raw=String(text||'').trim();
  const lower=normalized(raw);
  const referenceDate=options?.now?new Date(options.now):new Date();
  const correctionParts=lower.split(/\b(?:no+|perdon|quise decir|mejor)\b/).map((x)=>x.trim()).filter(Boolean);

  let amount=parseAmount(lower);
  for(let i=correctionParts.length-1;i>=1;i--){
    const candidate=parseAmount(correctionParts[i]);
    if(candidate!=null&&candidate>0){amount=candidate;break;}
  }
  const currency=/(?:usd|u\$s|dolar)/.test(lower)?'USD':'ARS';

  let installmentInfo=parseInstallments(lower);
  for(let i=correctionParts.length-1;i>=1;i--){
    const candidate=parseInstallments(correctionParts[i]);
    if(candidate.specified){installmentInfo=candidate;break;}
  }

  const paymentMentions=[...lower.matchAll(/\b(efectivo|debito|credito)\b/g)];
  let method=paymentMentions.length
    ? ({efectivo:'Efectivo',debito:'Débito',credito:'Crédito'}[paymentMentions.at(-1)[1]])
    : (/\bcuotas?\b/.test(lower)?'Crédito':'Sin definir');

  const namedCandidates=cards
    .filter((item)=>item?.name&&lower.includes(normalized(item.name)))
    .map((item)=>({item,index:lower.lastIndexOf(normalized(item.name))}))
    .sort((a,b)=>b.index-a.index);

  if(method==='Sin definir'){
    if(/\bmercado\s+pago\b/.test(lower)) method='Débito';
    else {
      const types=[...new Set(namedCandidates.map(({item})=>item.type).filter(Boolean))];
      if(types.length===1) method=types[0];
    }
  }

  let card=namedCandidates.find(({item})=>!item.type||item.type===method)?.item?.name||'';
  if(method==='Efectivo') card='';

  let category=categoryFor(raw,categories),subcategory='';
  const subMap=options?.subcategories||{};
  outer: for(const [parent,values] of Object.entries(subMap)){
    for(const value of Array.isArray(values)?values:[]){
      if(value&&lower.includes(normalized(value))){category=parent;subcategory=value;break outer;}
    }
  }

  const temporal=parseTemporal(raw,referenceDate);
  const correctionIndex=raw.search(/\b(?:no+|perd[oó]n|quise decir|mejor)\b/i);
  let conceptSource=correctionIndex>0?raw.slice(0,correctionIndex):raw;
  for(const item of cards){
    if(!item?.name) continue;
    const pattern=item.name.split(/\s+/).filter(Boolean).map((part)=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    if(pattern) conceptSource=conceptSource.replace(new RegExp(pattern,'ig'),' ');
  }
  let concept=cleanConcept(conceptSource);
  concept=stripNumberWords(concept).replace(/\s+/g,' ').trim();
  return {
    id:crypto.randomUUID(),amount,currency,concept:concept||subcategory||category||'Sin concepto',category,subcategory,method,card,
    installments:installmentInfo.count,installmentsSpecified:installmentInfo.specified,
    date:temporal.date,purchaseDate:temporal.date,dateSpecified:temporal.dateSpecified,timeSpecified:temporal.timeSpecified,
    dateAmbiguous:temporal.dateAmbiguous,dateChoices:temporal.dateChoices,source:'voice'
  };
}
'''
p2,n=re.subn(r"export function parseExpense\(text,cards=\[\],categories=\[\],options=\{\}\)\{.*?\n\}\n\nconst NUMBER_START",new_parse_expense+'\nconst NUMBER_START',p,flags=re.S)
assert n==1,f'parseExpense replacements={n}'
parser.write_text(p2)

a=app.read_text()
a=a.replace('parseExpenses(phrase,state.cards,state.categories)',"parseExpenses(phrase,state.cards,state.categories,{subcategories:state.subcategories})")
a=a.replace('parseExpenses(phrase, state.cards, state.categories)',"parseExpenses(phrase, state.cards, state.categories, {subcategories:state.subcategories})")

new_apply=r'''function applyPendingPaymentVoice(index,phrase){
  const item=pending[index]; if(!item)return;
  const spoken=normVoiceChoice(phrase);
  const namedAll=state.cards
    .filter((c)=>c?.name&&spoken.includes(normVoiceChoice(c.name)))
    .map((c)=>({c,index:spoken.lastIndexOf(normVoiceChoice(c.name))}))
    .sort((a,b)=>b.index-a.index);
  const explicit=[...spoken.matchAll(/\b(efectivo|debito|credito)\b/g)];
  let method=explicit.length?({efectivo:'Efectivo',debito:'Débito',credito:'Crédito'}[explicit.at(-1)[1]]):item.method;
  if(!explicit.length&&namedAll.length){
    if(namedAll.some(({c})=>normVoiceChoice(c.name)==='mercado pago')) method='Débito';
    else {
      const types=[...new Set(namedAll.map(({c})=>c.type).filter(Boolean))];
      if(types.length===1) method=types[0];
    }
  }
  if(method==='Sin definir'){showToast('Decí efectivo, débito o crédito, o nombrá una tarjeta configurada');return;}
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
  const named=namedAll.find(({c})=>c.type===method)?.c || cards.find((c)=>spoken.includes(normVoiceChoice(c.name)));
  if(named)item.card=named.name;
  else if(methodChanged)item.card='';
  showPending();
  if(!item.card) showToast(cards.length?'Decí o elegí qué tarjeta o cuenta usaste':'Primero agregá una tarjeta o cuenta de este tipo');
}
'''
a,n=re.subn(r"function applyPendingPaymentVoice\(index,phrase\)\{.*?\n\}\nlet pendingVoiceRecognition",new_apply+'let pendingVoiceRecognition',a,flags=re.S)
assert n==1,f'applyPendingPaymentVoice replacements={n}'

new_pending_start=r'''function startPendingPaymentVoice(index){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const process=(phrase)=>applyPendingPaymentVoice(index,phrase);
  const button=document.querySelector(`[data-pending-pay-voice="${index}"]`);
  const restore=()=>{if(button){button.disabled=false;button.classList.remove('listening');button.textContent='🎙 Responder por voz';}};
  if(pendingVoiceRecognition){showToast('Ya estoy escuchando');return;}
  if(!SR){const phrase=prompt('Decí o escribí el medio, la tarjeta o la cantidad de cuotas.');if(phrase)process(phrase);return;}
  const rec=new SR();pendingVoiceRecognition=rec;rec.lang='es-AR';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
  let phrase='';
  if(button){button.classList.add('listening');button.textContent='🎙 Escuchando…';}
  pendingVoiceStartCue();
  rec.onstart=()=>{if(button){button.disabled=true;button.classList.add('listening');button.textContent='🎙 Escuchando…';}showToast('🎙 Escuchando…');};
  rec.onresult=(event)=>{let text='';for(let i=0;i<event.results.length;i++)text+=' '+(event.results[i][0]?.transcript||'');phrase=text.trim();};
  rec.onerror=(event)=>{if(event.error!=='aborted')showToast(event.error==='not-allowed'?'Activá el permiso del micrófono':'No pude escuchar la respuesta');};
  rec.onend=()=>{pendingVoiceRecognition=null;restore();if(phrase)process(phrase);else showToast('No escuché una respuesta. Probá de nuevo o elegí manualmente');};
  try{rec.start();}catch{pendingVoiceRecognition=null;restore();showToast('No pude iniciar el micrófono');}
}
'''
a,n=re.subn(r"function startPendingPaymentVoice\(index\)\{.*?\n\}\nfunction showPending",new_pending_start+'function showPending',a,flags=re.S)
assert n==1,f'startPendingPaymentVoice replacements={n}'

new_voice=r'''let activeRecognition = null;
let voiceTranscript = '';
let voiceCycleText = '';
let voiceError = '';
let voiceCancelled = false;
let voiceHoldActive = false;
let voiceStopRequested = false;
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
  voiceHoldActive=false; voiceStopRequested=false;
  if(voiceCancelled){voiceTranscript='';voiceCycleText='';voiceError='';voiceCancelled=false;voiceGestureStartY=null;voiceCancelArmed=false;resetExpenseVoiceUI();return;}
  const phrase=voiceTranscript.trim();
  const err=voiceError;
  voiceTranscript=''; voiceCycleText=''; voiceError='';
  resetExpenseVoiceUI();
  if (phrase) {
    pending=parseExpenses(phrase,state.cards,state.categories,{subcategories:state.subcategories});
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
  recognition.lang='es-AR'; recognition.interimResults=true; recognition.continuous=false; recognition.maxAlternatives=1;
  recognition.onstart=()=>{
    $('#micBtn').classList.add('listening');
    $('#voiceZone')?.classList.add('recording');
    $('#voiceTitle').textContent='Escuchando…';
    $('#voiceHint').textContent='Seguí hablando; soltá cuando termines';
  };
  recognition.onresult=(event)=>{let text='';for(let i=0;i<event.results.length;i++)text+=' '+(event.results[i][0]?.transcript||'');voiceCycleText=text.trim();};
  recognition.onerror=(event)=>{voiceError=event.error||'error';if(!['aborted','no-speech'].includes(voiceError))showToast('No pude escuchar. Revisá el permiso del micrófono');};
  recognition.onend=()=>{
    if(voiceCycleText){voiceTranscript=[voiceTranscript,voiceCycleText].filter(Boolean).join(' ').trim();}
    activeRecognition=null; voiceCycleText='';
    if(voiceCancelled){finishExpenseVoice();return;}
    if(voiceHoldActive&&!voiceStopRequested){setTimeout(launchExpenseRecognitionCycle,120);return;}
    finishExpenseVoice();
  };
  try{recognition.start();}catch{activeRecognition=null;if(voiceHoldActive&&!voiceStopRequested)setTimeout(launchExpenseRecognitionCycle,180);else finishExpenseVoice();}
}
function startExpenseVoice() {
  if (activeRecognition||voiceHoldActive) return;
  window.getSelection?.()?.removeAllRanges?.();
  if (!SpeechRecognition) {
    const phrase = prompt('El navegador no ofrece reconocimiento de voz. Escribí los gastos:');
    if (phrase) { pending = parseExpenses(phrase, state.cards, state.categories, {subcategories:state.subcategories}); showPending(); }
    return;
  }
  voiceTranscript='';voiceCycleText='';voiceError='';voiceCancelled=false;voiceCancelArmed=false;voiceGestureStartY=null;voiceStopRequested=false;voiceHoldActive=true;
  launchExpenseRecognitionCycle();
}
function stopExpenseVoice() {
  if(!voiceHoldActive&&!activeRecognition)return;
  voiceHoldActive=false;voiceStopRequested=true;
  if(activeRecognition){try{activeRecognition.stop();}catch{activeRecognition=null;finishExpenseVoice();}}
  else finishExpenseVoice();
}
'''
a,n=re.subn(r"let activeRecognition = null;.*?function stopExpenseVoice\(\) \{.*?\n\}\n",new_voice,a,flags=re.S)
assert n==1,f'voice block replacements={n}'

old_cancel="""function cancelExpenseVoice(){
  if(!activeRecognition)return;
  voiceCancelled=true;voiceCancelArmed=false;voiceGestureStartY=null;
  feedback(false);showToast('Grabación descartada');
  try{activeRecognition.abort();}catch{resetExpenseVoiceUI();activeRecognition=null;voiceCancelled=false;}
}
"""
new_cancel="""function cancelExpenseVoice(){
  if(!activeRecognition&&!voiceHoldActive)return;
  voiceCancelled=true;voiceHoldActive=false;voiceStopRequested=true;voiceCancelArmed=false;voiceGestureStartY=null;
  feedback(false);showToast('Grabación descartada');
  if(activeRecognition){try{activeRecognition.abort();}catch{activeRecognition=null;finishExpenseVoice();}}
  else finishExpenseVoice();
}
"""
assert old_cancel in a,'cancelExpenseVoice block not found'
a=a.replace(old_cancel,new_cancel)
app.write_text(a)

t=tests.read_text()
append=r'''

test('infere el tipo por una tarjeta configurada univoca y limpia el concepto',()=>{
  const cards=[{name:'Mercado Pago',type:'Débito'},{name:'Banco Macro',type:'Crédito'}];
  const e=parseExpense('Gasté 10 lucas de vianda, pagué con Banco Macro',cards);
  assert.equal(e.amount,10000);
  assert.equal(e.method,'Crédito');
  assert.equal(e.card,'Banco Macro');
  assert.equal(e.installmentsSpecified,false);
  assert.match(e.concept,/vianda/i);
  assert.doesNotMatch(e.concept,/macro/i);
});

test('la ultima correccion verbal reemplaza importe y medio de pago',()=>{
  const cards=[{name:'Mercado Pago',type:'Débito'}];
  const e=parseExpense('Gasté 60 mil en kiosco en efectivo, no perdón, 50 mil con débito Mercado Pago',cards);
  assert.equal(e.amount,50000);
  assert.equal(e.method,'Débito');
  assert.equal(e.card,'Mercado Pago');
  assert.match(e.concept,/kiosco/i);
});

test('reconoce subcategoria por voz y asigna su categoria madre',()=>{
  const e=parseExpense('Gasté 25.000 pesos de luz',[],['Gastos fijos'],{subcategories:{'Gastos fijos':['Luz','Gas']}});
  assert.equal(e.category,'Gastos fijos');
  assert.equal(e.subcategory,'Luz');
});
'''
if "infere el tipo por una tarjeta configurada univoca" not in t:t+=append
tests.write_text(t)

s=sw.read_text().replace("const CACHE = 'mis-gastos-v24';","const CACHE = 'mis-gastos-v25';")
sw.write_text(s)
