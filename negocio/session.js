import { SYNC_URL,SYNC_PUBLIC_KEY } from '../sync-config.js';
import { createSyncEngine } from '../sync-engine.js?v=156';
import { sameSyncValue } from '../sync-merge.js';
import { createSafetyEnvelope,readSafetyEnvelope } from '../data-safety.js';
import { validateBusinessState,saveBusinessState,writeVerified } from '../negocio-model.js';
const OWNER='04d84569-ab28-476d-8e9a-48565fc1777f'; // UX fence only; database policies enforce ownership.
export function createBusinessSession({getState,onState,canApply,message}){
  const $=s=>document.querySelector(s),storage=localStorage;
  const client=window.supabase.createClient(SYNC_URL,SYNC_PUBLIC_KEY,{auth:{storageKey:'entradas-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let user,key,engine,timer,busy=false,blocked=false,stopped=false,inflight=Promise.resolve();
  function status(kind,detail=''){
    const labels={synced:'Sincronizado · copia remota verificada',working:'Sincronizando…',pending:'Cambios pendientes',conflict:'Hay diferencias para revisar',error:'No se pudo sincronizar',offline:'Sin conexión · guardado en este dispositivo'};
    $('#syncStatus').textContent=(labels[kind]||kind)+(detail?' · '+detail:'');
  }
  async function remote(){const r=await client.from('business_heads').select('revision,state').eq('user_id',user.id).maybeSingle();if(r.error)throw r.error;return r.data;}
  function lock(){stopped=true;user=null;$('#businessApp').hidden=true;$('#login').hidden=false;for(const d of document.querySelectorAll('dialog[open]'))d.close();$('#businessMessage').textContent='';}
  async function archive(snapshot){
    const envelope=await createSafetyEnvelope(validateBusinessState(snapshot));
    writeVerified(storage,key+'-before-sync',envelope);await readSafetyEnvelope(storage.getItem(key+'-before-sync'));
    const r=await client.from('business_backups').insert({user_id:user.id,device_id:deviceId,state:snapshot}).select('id').single();if(r.error)throw r.error;
    const check=await client.from('business_backups').select('state').eq('id',r.data.id).single();
    if(check.error||!sameSyncValue(snapshot,check.data?.state))throw Error('No se pudo verificar el respaldo remoto.');
  }
  const deviceId=crypto.randomUUID();
  function conflicts(value){
    blocked=true;writeVerified(storage,key+'-conflicts',value);
    let dialog=$('#businessConflicts');if(!dialog){dialog=document.createElement('dialog');dialog.id='businessConflicts';document.body.append(dialog);}
    dialog.replaceChildren();const title=document.createElement('h2');title.textContent='Revisar diferencias del negocio';dialog.append(title);
    const choices={};
    for(const c of value.conflicts){
      const row=document.createElement('div'),label=document.createElement('p'),select=document.createElement('select');
      label.textContent=c.path.join(' / ')+' — Este dispositivo: '+JSON.stringify(c.local)+' — Copia sincronizada: '+JSON.stringify(c.remote);
      for(const [v,t] of [['','Elegí una versión'],['local','Conservar este dispositivo'],['remote','Usar copia sincronizada']]){const option=document.createElement('option');option.value=v;option.textContent=t;select.append(option);}
      select.onchange=()=>{choices[c.id]=select.value;};row.append(label,select);dialog.append(row);
    }
    const save=document.createElement('button');save.textContent='Guardar decisiones y sincronizar';save.onclick=async()=>{
      if(value.conflicts.some(c=>!choices[c.id])){message('Elegí una versión para cada diferencia.');return;}
      dialog.close();blocked=false;await run({...value,choices});
    };
    const close=document.createElement('button');close.textContent='Revisar después';close.onclick=()=>dialog.close();dialog.append(save,close);if(!dialog.open)dialog.showModal();
  }
  function run(resolution){
    if(busy||stopped||!engine)return inflight;
    if(!navigator.onLine){status('offline');return Promise.resolve();}
    if(!canApply()){status('pending','Se completará al terminar la edición.');return Promise.resolve();}
    busy=true;
    inflight=(async()=>{
      const check=await client.auth.getUser();if(check.error||check.data?.user?.id!==user?.id)throw Error('Volvé a ingresar con tu cuenta.');
      await engine.run(resolution);
    })().catch(e=>status('error',e.message)).finally(()=>{busy=false;});return inflight;
  }
  async function open(){
    const session=await client.auth.getSession();const cached=session.data?.session;
    const check=navigator.onLine?await client.auth.getUser():{data:{user:cached?.user}};
    if(check.error||!check.data?.user){lock();return;}
    if(check.data.user.id!==OWNER){await client.auth.signOut({scope:'local'});throw Error('Esta aplicación está reservada para la cuenta del negocio.');}
    user=check.data.user;key='entradas-state-v1:'+user.id;stopped=false;blocked=false;
    let value=storage.getItem(key);let initial;
    if(value){initial=validateBusinessState(JSON.parse(value));}
    else{
      if(!navigator.onLine)throw Error('Conectate a Internet para descargar tu negocio por primera vez.');
      const record=await remote();if(!record)throw Error('La copia inicial del negocio todavía no está preparada.');
      initial=validateBusinessState(record.state);saveBusinessState(storage,key,initial);writeVerified(storage,key+'-checkpoint',record);
    }
    engine=createSyncEngine({getLocal:()=>structuredClone(getState()),getCheckpoint:()=>JSON.parse(storage.getItem(key+'-checkpoint')||'null'),readRemote:async revision=>{
      if(!revision)return remote();const r=await client.from('business_backups').select('revision,state').eq('user_id',user.id).eq('revision',revision).order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;return r.data;
    },archiveLocal:archive,commitRemote:async(expected,snapshot)=>{
      validateBusinessState(snapshot);const r=await client.rpc('commit_business',{p_expected:expected,p_state:snapshot,p_device:deviceId,p_user:user.id});if(r.error)throw r.error;return r.data;
    },applyLocal:async(snapshot,captured)=>{
      if(stopped||!canApply()||!sameSyncValue(getState(),captured))throw Error('Hay una edición en curso.');
      saveBusinessState(storage,key,snapshot);onState(structuredClone(snapshot),key);
    },saveCheckpoint:async meta=>{writeVerified(storage,key+'-checkpoint',meta);storage.removeItem(key+'-conflicts');blocked=false;},status,onConflicts:conflicts});
    $('#account').textContent=user.email;$('#login').hidden=true;$('#businessApp').hidden=false;onState(initial,key);await run();
  }
  $('#loginForm').onsubmit=async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;$('#loginStatus').textContent='Verificando cuenta…';
    try{const r=await client.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});$('#password').value='';if(r.error)throw Error('Revisá el correo y la contraseña.');await open();$('#loginStatus').textContent='';}
    catch(e){lock();$('#loginStatus').textContent=e.message;}finally{button.disabled=false;}
  };
  $('#eye').onclick=()=>{const visible=$('#password').type==='password';$('#password').type=visible?'text':'password';$('#eye').textContent=visible?'Ocultar contraseña':'Mostrar contraseña';$('#eye').setAttribute('aria-pressed',String(visible));};
  $('#forgot').onclick=async()=>{
    const email=$('#email').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message('Ingresá tu correo primero.');return;}
    const r=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('../',location.href).href});message(r.error?'No se pudo solicitar el correo. Intentá nuevamente.':'Si ese correo tiene una cuenta, recibirá un enlace para recuperar la contraseña.');
  };
  $('#syncNow').onclick=()=>{blocked=false;void run();};
  $('#backup').onclick=async()=>{
    try{const envelope=await createSafetyEnvelope(getState());const raw=JSON.stringify(envelope);await readSafetyEnvelope(raw);const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mi-negocio-respaldo-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message);}
  };
  $('#logout').onclick=async()=>{
    if(!confirm('¿Cerrar sesión? Tus compras y ventas se conservan.'))return;
    stopped=true;clearTimeout(timer);await inflight;
    try{const envelope=await createSafetyEnvelope(getState());writeVerified(storage,key+'-logout-backup',envelope);await readSafetyEnvelope(storage.getItem(key+'-logout-backup'));const r=await client.auth.signOut({scope:'local'});if(r.error)throw r.error;lock();}
    catch(e){stopped=false;message('No se pudo completar el cierre: '+e.message);}
  };
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')lock();});
  setInterval(()=>{if(!document.hidden&&!blocked)void run();},10000);
  window.addEventListener('online',()=>void run());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void run();else{$('#password').type='password';}});
  return {async start(){try{await open();}catch(e){lock();$('#loginStatus').textContent=e.message;}},save(next){
    if(stopped||!user)throw Error('Iniciá sesión antes de guardar.');saveBusinessState(storage,key,next);status(navigator.onLine?'pending':'offline');clearTimeout(timer);timer=setTimeout(()=>void run(),1200);
  }};
}
