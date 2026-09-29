from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

app_path = Path('app.js')
app = app_path.read_text(encoding='utf-8')

old_card = """    return `<div class=\"pending-payment-question\"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class=\"pending-card-select\" data-index=\"${i}\"><option value=\"\">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value=\"${escape(c.name)}\">${escape(c.name)}</option>`).join('')}</select>`:'<small class=\"muted\">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div>`;"""
new_card = """    return `<div class=\"pending-payment-question\"><strong>¿Con qué ${e.method.toLowerCase()} pagaste?</strong>${cards.length?`<select class=\"pending-card-select\" data-index=\"${i}\"><option value=\"\">Elegí tarjeta o cuenta</option>${cards.map((c)=>`<option value=\"${escape(c.name)}\">${escape(c.name)}</option>`).join('')}</select>`:'<small class=\"muted\">Primero agregá una tarjeta o cuenta de este tipo.</small>'}<div class=\"pending-payment-actions\"><button type=\"button\" class=\"secondary pending-back\" data-pending-back=\"method\" data-index=\"${i}\">← Atrás</button><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div></div>`;"""
app = replace_once(app, old_card, new_card, 'card back button')

old_installments = """    return `<div class=\"pending-payment-question\"><strong>¿En cuántas cuotas?</strong><select class=\"pending-installments-select\" data-index=\"${i}\"><option value=\"\">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value=\"${n}\">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div>`;"""
new_installments = """    return `<div class=\"pending-payment-question\"><strong>¿En cuántas cuotas?</strong><select class=\"pending-installments-select\" data-index=\"${i}\"><option value=\"\">Elegí la cantidad</option>${Array.from({length:36},(_,n)=>n+1).map((n)=>`<option value=\"${n}\">${n} cuota${n===1?'':'s'}</option>`).join('')}</select><div class=\"pending-payment-actions\"><button type=\"button\" class=\"secondary pending-back\" data-pending-back=\"card\" data-index=\"${i}\">← Atrás</button><button type=\"button\" class=\"voice-pay\" data-pending-pay-voice=\"${i}\">🎙 Responder por voz</button></div></div>`;"""
app = replace_once(app, old_installments, new_installments, 'installments back button')

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

old_feedback = """function feedback(ok) { navigator.vibrate?.(ok ? 50 : [120, 50, 120]); try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = ok ? 720 : 180; gain.gain.value = .035; osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (ok ? .08 : .16)); } catch {} }"""
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

app_path.write_text(app, encoding='utf-8')

sw_path = Path('sw.js')
sw = sw_path.read_text(encoding='utf-8')
m = re.search(r"const CACHE = 'mis-gastos-v(\d+)';", sw)
if not m:
    raise SystemExit('service worker cache: version not found')
current = int(m.group(1))
next_version = current + 1
sw = sw[:m.start()] + f"const CACHE = 'mis-gastos-v{next_version}';" + sw[m.end():]
sw_path.write_text(sw, encoding='utf-8')
print(f'cache bumped v{current} -> v{next_version}')
