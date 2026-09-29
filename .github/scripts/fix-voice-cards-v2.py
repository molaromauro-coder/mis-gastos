from pathlib import Path

app_path=Path('app.js')
index_path=Path('index.html')
styles_path=Path('styles.css')
finance_path=Path('finance.js')
tests_path=Path('test/finance.test.js')
sw_path=Path('sw.js')

app=app_path.read_text(encoding='utf-8')
index=index_path.read_text(encoding='utf-8')
styles=styles_path.read_text(encoding='utf-8')
finance=finance_path.read_text(encoding='utf-8')
tests=tests_path.read_text(encoding='utf-8')
sw=sw_path.read_text(encoding='utf-8')

def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'No se encontró: {label}')
    return text.replace(old,new,1)

app=rep(app,"import { parseExpenses } from './parser.js';","import { parseExpenses, parseAmount } from './parser.js';",'import parseAmount')
app=rep(app,"import { monthKey, itemArsEquivalent, budgetOutcome, stockMetrics, recoveryMonthMetrics, dateWithCardDay, firstDueDateForCard } from './finance.js';","import { monthKey, itemArsEquivalent, budgetOutcome, stockMetrics, recoveryMonthMetrics, dateWithCardDay, firstDueDateForCard, installmentDueDates } from './finance.js';",'import installmentDueDates')

start=app.index('function seedDemoCardsOnce(){')
end=app.index('seedDemoCardsOnce();',start)+len('seedDemoCardsOnce();')
seed="""function seedDemoCardsOnce(){
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
seedDemoCardsOnce();"""
app=app[:start]+seed+app[end:]

old_inst="function installmentExpenses(expense) { if (expense.method !== 'Crédito') return [expense]; const card = state.cards.find((c) => c.name === expense.card && c.type === 'Crédito'); if (!card) return [expense]; const first = firstDueDateForCard(card, new Date(expense.purchaseDate || expense.date)); const count = Math.max(1, Number(expense.installments || 1)); if (count === 1) return [{ ...expense, dueDate: first.toISOString(), installment: 1, installments: 1 }]; return Array.from({ length: count }, (_, i) => ({ ...expense, id: crypto.randomUUID(), parentId: expense.id, dueDate: dateWithCardDay(first.getFullYear(), first.getMonth() + i, card.dueDay).toISOString(), amount: expense.amount / count, installment: i + 1, installments: count })); }"
new_inst="function installmentExpenses(expense) { if (expense.method !== 'Crédito') return [expense]; const card = state.cards.find((c) => c.name === expense.card && c.type === 'Crédito'); if (!card) return [expense]; const count = Math.max(1, Number(expense.installments || 1)); const dueDates=installmentDueDates(card,new Date(expense.purchaseDate || expense.date),count); if (count === 1) return [{ ...expense, dueDate: dueDates[0].toISOString(), installment: 1, installments: 1 }]; return dueDates.map((dueDate, i) => ({ ...expense, id: crypto.randomUUID(), parentId: expense.id, dueDate: dueDate.toISOString(), amount: expense.amount / count, installment: i + 1, installments: count })); }"
app=rep(app,old_inst,new_inst,'installmentExpenses')

old_prompt="""  if(needsInstallments){
    return `<div class=\"pending-payment-question\"><strong>¿En cuántas cuotas?</strong><select class=\"pending-installments-select\" data-index=\"${i}\"><option value=\"\">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value=\"${n}\">${n} cuota${n===1?'':'s'}</option>`).join('')}</select></div>`;
  }"""
new_prompt="""  if(needsInstallments){
    return `<div class=\"pending-payment-question\"><strong>¿En cuántas cuotas?</strong><select class=\"pending-installments-select\" data-index=\"${i}\"><option value=\"\">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value=\"${n}\">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div>`;
  }"""
app=rep(app,old_prompt,new_prompt,'botón voz cuotas')

old_credit="""  if(method==='Crédito'){
    const installmentDigits=spoken.match(/\\b(\\d+)\\s*cuotas?\\b/);
    if(installmentDigits){item.installments=Math.max(1,Number(installmentDigits[1]));item.installmentsSpecified=true;}
    else if(item.installmentsSpecified!==true)item.installmentsSpecified=false;
  }"""
new_credit="""  if(method==='Crédito'){
    const installmentDigits=spoken.match(/\\b(\\d{1,2})(?:\\s*cuotas?)?\\b/);
    let installmentCount=installmentDigits?Number(installmentDigits[1]):null;
    if(!installmentCount){
      const parsed=Number(parseAmount(spoken));
      if(Number.isInteger(parsed)&&parsed>=1&&parsed<=36) installmentCount=parsed;
    }
    if(installmentCount&&installmentCount<=36){item.installments=installmentCount;item.installmentsSpecified=true;}
    else if(item.installmentsSpecified!==true)item.installmentsSpecified=false;
  }"""
app=rep(app,old_credit,new_credit,'cuotas por voz')

vstart=app.index('function startPendingPaymentVoice(index){')
vend=app.index('function showPending()',vstart)
pending_voice="""let pendingVoiceRecognition=null;
function startPendingPaymentVoice(index){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const process=(phrase)=>applyPendingPaymentVoice(index,phrase);
  const button=document.querySelector(`[data-pending-pay-voice=\"${index}\"]`);
  const restore=()=>{if(button){button.disabled=false;button.classList.remove('listening');button.textContent='🎙 Responder por voz';}};
  if(pendingVoiceRecognition){showToast('Ya estoy escuchando');return;}
  if(!SR){const phrase=prompt('Decí o escribí el medio, la tarjeta o la cantidad de cuotas.');if(phrase)process(phrase);return;}
  const rec=new SR();pendingVoiceRecognition=rec;rec.lang='es-AR';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;
  let phrase='';
  rec.onstart=()=>{if(button){button.disabled=true;button.classList.add('listening');button.textContent='🎙 Escuchando…';}showToast('🎙 Escuchando…');};
  rec.onresult=(event)=>{phrase=event.results[event.resultIndex][0].transcript.trim();};
  rec.onerror=(event)=>{if(event.error!=='aborted')showToast(event.error==='not-allowed'?'Activá el permiso del micrófono':'No pude escuchar la respuesta');};
  rec.onend=()=>{pendingVoiceRecognition=null;restore();if(phrase)process(phrase);};
  try{rec.start();}catch{pendingVoiceRecognition=null;restore();showToast('No pude iniciar el micrófono');}
}
"""
app=app[:vstart]+pending_voice+app[vend:]

app=rep(app,"let activeRecognition = null;\nlet voiceTranscript = '';\nlet voiceError = '';","let activeRecognition = null;\nlet voiceTranscript = '';\nlet voiceError = '';\nlet voiceCancelled = false;\nlet voiceGestureStartY = null;\nlet voiceCancelArmed = false;",'variables gesto voz')
app=rep(app,"function resetExpenseVoiceUI() {\n  $('#micBtn').classList.remove('listening');","function resetExpenseVoiceUI() {\n  $('#micBtn').classList.remove('listening');\n  $('#voiceZone')?.classList.remove('recording','cancel-ready');\n  $('#voiceTrash')?.classList.remove('armed');",'reset UI voz')
app=rep(app,"function finishExpenseVoice() {\n  const phrase=voiceTranscript.trim();","function finishExpenseVoice() {\n  if(voiceCancelled){voiceTranscript='';voiceError='';voiceCancelled=false;voiceGestureStartY=null;voiceCancelArmed=false;resetExpenseVoiceUI();return;}\n  const phrase=voiceTranscript.trim();",'cancelar transcripción')
app=rep(app,"  voiceTranscript=''; voiceError='';\n  const recognition = new SpeechRecognition();","  voiceTranscript=''; voiceError=''; voiceCancelled=false; voiceCancelArmed=false; voiceGestureStartY=null;\n  const recognition = new SpeechRecognition();",'reinicio grabación')
app=rep(app,"  recognition.onstart=()=>{\n    $('#micBtn').classList.add('listening');","  recognition.onstart=()=>{\n    $('#micBtn').classList.add('listening');\n    $('#voiceZone')?.classList.add('recording');",'estado grabando')

hstart=app.index("const micBtn=$('#micBtn');")
hend=app.index("micBtn.oncontextmenu",hstart)
handlers="""const micBtn=$('#micBtn');
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
"""
app=app[:hstart]+handlers+app[hend:]

old_zone='<div class="voice-zone"><button id="micBtn" class="mic" aria-label="Mantener presionado para registrar gasto por voz"><span></span></button><strong id="voiceTitle">Mantener presionado</strong><small id="voiceHint">para hablar</small></div>'
new_zone='<div class="voice-zone" id="voiceZone"><div id="voiceTrash" class="voice-trash" aria-hidden="true"><span>🗑</span><small>Arrastrá acá para cancelar</small></div><button id="micBtn" class="mic" aria-label="Mantener presionado para registrar gasto por voz"><span></span></button><strong id="voiceTitle">Mantener presionado</strong><small id="voiceHint">para hablar</small></div>'
index=rep(index,old_zone,new_zone,'tacho de voz')

marker='/* voice-cancel-v2 */'
if marker not in styles:
    styles += """\n/* voice-cancel-v2 */\ndialog{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.voice-trash{display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;margin:0 auto 6px;opacity:0;transform:translateY(12px) scale(.9);transition:.18s;pointer-events:none;font-weight:800}.voice-trash span{font-size:24px}.voice-trash small{margin:0!important}.voice-zone.recording .voice-trash{opacity:.72;transform:translateY(0) scale(1)}.voice-zone.cancel-ready .voice-trash,.voice-trash.armed{opacity:1;transform:translateY(-2px) scale(1.08)}.voice-zone.cancel-ready .mic{background:#ef8178}.voice-pay.listening{opacity:.75;font-weight:800}\n"""

finance_old="""export function firstDueDateForCard(card,purchase=new Date()){
  const source=purchase instanceof Date?purchase:new Date(purchase);
  const bought=dateWithCardDay(source.getFullYear(),source.getMonth(),source.getDate());
  const closingDay=Number(card?.closingDay||card?.dueDay||1);
  const dueDay=Number(card?.dueDay||1);
  let closing=dateWithCardDay(bought.getFullYear(),bought.getMonth(),closingDay);
  if(bought.getTime()>closing.getTime()) closing=dateWithCardDay(bought.getFullYear(),bought.getMonth()+1,closingDay);
  let due=dateWithCardDay(closing.getFullYear(),closing.getMonth(),dueDay);
  if(due.getTime()<=closing.getTime()) due=dateWithCardDay(closing.getFullYear(),closing.getMonth()+1,dueDay);
  return due;
}
"""
finance_new=finance_old+"""export function installmentDueDates(card,purchase=new Date(),count=1){
  const total=Math.max(1,Math.floor(Number(count)||1));
  const first=firstDueDateForCard(card,purchase);
  return Array.from({length:total},(_,i)=>dateWithCardDay(first.getFullYear(),first.getMonth()+i,card?.dueDay||1));
}
"""
finance=rep(finance,finance_old,finance_new,'installmentDueDates')

tests=rep(tests,"import { monthKey, budgetOutcome, stockMetrics, recoveryMonthMetrics, firstDueDateForCard } from '../finance.js';","import { monthKey, budgetOutcome, stockMetrics, recoveryMonthMetrics, firstDueDateForCard, installmentDueDates } from '../finance.js';",'import tests')
if "planes demo de 3, 6, 12 y 18 cuotas" not in tests:
    tests += """\n\ntest('tarjetas demo respetan cierre y vencimiento del mes siguiente',()=>{
  const frances={closingDay:20,dueDay:10};
  const macro={closingDay:25,dueDay:12};
  assert.equal(firstDueDateForCard(frances,new Date('2026-09-19T12:00:00')).toISOString().slice(0,10),'2026-10-10');
  assert.equal(firstDueDateForCard(frances,new Date('2026-09-21T12:00:00')).toISOString().slice(0,10),'2026-11-10');
  assert.equal(firstDueDateForCard(macro,new Date('2026-09-25T12:00:00')).toISOString().slice(0,10),'2026-10-12');
  assert.equal(firstDueDateForCard(macro,new Date('2026-09-26T12:00:00')).toISOString().slice(0,10),'2026-11-12');
});

test('planes demo de 3, 6, 12 y 18 cuotas generan un vencimiento por mes',()=>{
  const card={closingDay:25,dueDay:12};
  for(const count of [3,6,12,18]){
    const dates=installmentDueDates(card,new Date('2026-09-26T12:00:00'),count);
    assert.equal(dates.length,count);
    assert.equal(dates[0].toISOString().slice(0,10),'2026-11-12');
    for(let i=1;i<dates.length;i++){
      const prev=dates[i-1],curr=dates[i];
      assert.equal(curr.getDate(),12);
      const diff=(curr.getFullYear()*12+curr.getMonth())-(prev.getFullYear()*12+prev.getMonth());
      assert.equal(diff,1);
    }
  }
});
"""

if "mis-gastos-v20" not in sw:
    raise SystemExit('Versión de caché inesperada')
sw=sw.replace("mis-gastos-v20","mis-gastos-v21",1)

app_path.write_text(app,encoding='utf-8')
index_path.write_text(index,encoding='utf-8')
styles_path.write_text(styles,encoding='utf-8')
finance_path.write_text(finance,encoding='utf-8')
tests_path.write_text(tests,encoding='utf-8')
sw_path.write_text(sw,encoding='utf-8')
print('Patch aplicado')
