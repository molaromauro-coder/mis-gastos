from pathlib import Path

app_path=Path('app.js')
styles_path=Path('styles.css')
sw_path=Path('sw.js')

app=app_path.read_text(encoding='utf-8')
styles=styles_path.read_text(encoding='utf-8')
sw=sw_path.read_text(encoding='utf-8')

old="""let pendingVoiceRecognition=null;
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
new="""let pendingVoiceRecognition=null;
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
  const button=document.querySelector(`[data-pending-pay-voice=\"${index}\"]`);
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
"""
if old not in app:
    raise SystemExit('No se encontró startPendingPaymentVoice esperado')
app=app.replace(old,new,1)

marker='/* pending-voice-feedback-v22 */'
if marker not in styles:
    styles += """\n/* pending-voice-feedback-v22 */\n.voice-pay,.pending-payment-actions button{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}.voice-pay.listening{animation:voiceAnswerPulse .9s ease-in-out infinite;opacity:1}@keyframes voiceAnswerPulse{50%{transform:scale(1.02);box-shadow:0 0 0 7px rgba(23,63,55,.12)}}\n"""

if "mis-gastos-v21" not in sw:
    raise SystemExit('Versión de caché inesperada')
sw=sw.replace("mis-gastos-v21","mis-gastos-v22",1)

app_path.write_text(app,encoding='utf-8')
styles_path.write_text(styles,encoding='utf-8')
sw_path.write_text(sw,encoding='utf-8')
print('Feedback de voz pendiente y protección táctil aplicados')
