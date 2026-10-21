import { requestPasswordRecovery } from './password-recovery.js?v=153';
import { createSyncEngine } from './sync-engine.js';
import { syncSnapshot, sameSyncValue } from './sync-merge.js';
import { isValidSnapshot, createSafetyEnvelope, readSafetyEnvelope } from './data-safety.js';
import { SYNC_URL, SYNC_PUBLIC_KEY } from './sync-config.js';

function verifiedWrite(key,value) {
  const raw=JSON.stringify(value);localStorage.setItem(key,raw);
  if(localStorage.getItem(key)!==raw)throw Error('No se pudo verificar el respaldo local. No se reemplazaron tus datos.');
}
function readJSON(key) {const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}
async function loadSdk() {
  if(window.supabase?.createClient)return;
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('./vendor/supabase-2.57.4.js',import.meta.url).href;
    script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar la conexión. Tus datos locales se conservan.'));document.head.append(script);
  });
}
export function installPasswordVisibility(input,button,dialog,doc=document) {
  if(!input||!button)return ()=>{};
  function hide(){setVisible(false);}
  function setVisible(visible){
    input.type=visible?'text':'password';
    button.setAttribute('aria-pressed',String(visible));
    button.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');
    button.querySelector('span').textContent=visible?'Ocultar':'Mostrar';
  }
  hide();
  button.addEventListener('click',()=>setVisible(input.type==='password'));
  dialog?.addEventListener('close',hide);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hide();});
  return hide;
}

export function installCloudSync({getState,applyState,canApply,localSaved}) {
  const prefix='mis-gastos-sync-v1',metaKey=prefix+'-checkpoint',bindingKey=prefix+'-account';
  let client,user,engine,pending,debounce,archived='',stopped=false,lastStatus='signedout';
  const target=document.querySelector('#cloudSyncStatus'), badge=document.querySelector('#cloudSyncBadge');
  const auth=document.querySelector('#cloudSyncAuth');
  const hidePassword=installPasswordVisibility(document.querySelector('#cloudSyncPassword'),document.querySelector('#cloudSyncPasswordToggle'),document.querySelector('#settingsDialog')); 
  const conflictList=document.querySelector('#cloudSyncConflicts');
  const panel=document.querySelector('#cloudSyncConflictPanel');
  const labels={signedout:'Sin vincular · datos guardados en este dispositivo',working:'Sincronizando…',synced:'Sincronizado · copia remota verificada',pending:'Cambios pendientes de sincronización',offline:'Sin conexión · los cambios se conservan en este dispositivo',conflict:'Hay diferencias para revisar · ambas versiones conservadas',error:'No se pudo completar la sincronización'};
  function status(kind,message='') {
    lastStatus=kind;
    for(const el of [target,badge])if(el){el.textContent=labels[kind]+(message?' · '+message:'');el.dataset.status=kind;}
    const account=document.querySelector('#cloudSyncAccount');if(account)account.textContent=user?.email||'Usá el mismo correo en PC y celular.';
    auth?.classList.toggle('hidden',!!user);
    document.querySelector('#cloudSyncActions')?.classList.toggle('hidden',!user);
  }
  function deferredRun() {clearTimeout(debounce);debounce=setTimeout(()=>void run(),1200);}
  function getLocal(){return syncSnapshot(getState());}
  async function archiveLocal(snapshot) {
    if(!isValidSnapshot(snapshot))throw Error('Los datos locales no son válidos para sincronizar.');
    const full=getState();
    const envelope=await createSafetyEnvelope(full);
    verifiedWrite(prefix+'-before-download',envelope);
    await readSafetyEnvelope(localStorage.getItem(prefix+'-before-download'));
    const fingerprint=JSON.stringify(snapshot);
    if(archived===fingerprint)return;
    const {data,error}=await client.from('sync_backups').insert({user_id:user.id,device_id:deviceId,state:snapshot}).select('id').single();
    if(error)throw error;
    const check=await client.from('sync_backups').select('state').eq('id',data.id).single();
    if(check.error||!sameSyncValue(check.data?.state,snapshot))throw Error('No se pudo verificar el respaldo remoto previo.');
    archived=fingerprint;
  }
  function showConflicts(value) {
    verifiedWrite(prefix+'-conflicts',value);
    pending=value;panel?.classList.remove('hidden');conflictList.replaceChildren();
    for(const conflict of value.conflicts) {
      const row=document.createElement('div');row.className='cloud-conflict';
      const title=document.createElement('strong');title.textContent=conflict.path.join(' / ');row.append(title);
      for(const [name,choice,deleted] of [['Este dispositivo',conflict.local,conflict.localDeleted],['Copia sincronizada',conflict.remote,conflict.remoteDeleted]]) {
        const p=document.createElement('pre');p.textContent=name+': '+(deleted?'Eliminado':JSON.stringify(choice,null,2));row.append(p);
      }
      const select=document.createElement('select');select.dataset.conflictId=conflict.id;
      for(const [value,label] of [['','Elegí qué versión usar'],['local','Conservar este dispositivo'],['remote','Usar copia sincronizada']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}row.append(select);conflictList.append(row);
    }
  }
  let deviceId;
  async function setup() {
    await loadSdk();
    client=window.supabase.createClient(SYNC_URL,SYNC_PUBLIC_KEY,{
      auth:{storageKey:prefix+'-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
      global:{fetch:async(input,options={})=>{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
        try{return await fetch(input,{...options,signal:controller.signal});}finally{clearTimeout(timer);}
      }}
    });
    deviceId=readJSON(prefix+'-device');if(!deviceId){deviceId=crypto.randomUUID();verifiedWrite(prefix+'-device',deviceId);}
    engine=createSyncEngine({getLocal,getCheckpoint:()=>readJSON(metaKey),
      readRemote:async(revision)=>{
        const query=revision?client.from('sync_backups').select('revision,state').eq('user_id',user.id).eq('revision',revision).order('created_at',{ascending:false}).limit(1):client.from('sync_heads').select('revision,state').eq('user_id',user.id);
        const {data,error}=await query.maybeSingle();if(error)throw error;return data;
      },archiveLocal,
      commitRemote:async(expected,snapshot)=>{const {data,error}=await client.rpc('commit_sync',{p_expected:expected,p_state:snapshot,p_device:deviceId,p_user:readJSON(bindingKey)});if(error)throw error;return data;},
      applyLocal:async(snapshot,captured)=>{
        if(!isValidSnapshot(snapshot))throw Error('La copia sincronizada está incompleta.');
        if(stopped||!user||!canApply()||!sameSyncValue(captured,getLocal()))throw Error('Hay una edición en curso. Se sincronizará al terminar.');
        if(!localSaved())throw Error('El guardado local falló. Exportá un respaldo antes de continuar.');
        const current=getState(),full={...structuredClone(snapshot),security:current.security,settings:{...snapshot.settings,lastSafeSaveAt:current.settings?.lastSafeSaveAt,lastSafeExpenseCount:current.settings?.lastSafeExpenseCount}};
        if(!applyState(full))throw Error('No se pudo verificar la aplicación de la copia remota.');
        if(!sameSyncValue(syncSnapshot(getState()),snapshot))throw Error('La comprobación local no coincide.');
      },saveCheckpoint:async(meta)=>{verifiedWrite(metaKey,meta);pending=null;panel?.classList.add('hidden');localStorage.removeItem(prefix+'-conflicts');},status,onConflicts:showConflicts});
    client.auth.onAuthStateChange(()=>{setTimeout(()=>void run(),0);});
  }
  let ready;
  async function run(resolution) {
    if(stopped)return;
    if(!navigator.onLine){status('offline');return;}
    try {
      ready ||= setup();await ready;
      const session=await client.auth.getSession();
      if(session.error)throw session.error;
      if(!session.data.session){user=null;status('signedout');return;}
      const result=await client.auth.getUser();
      if(result.error)throw result.error;
      if(!result.data.user){user=null;status('signedout');return;}
      const bound=readJSON(bindingKey);if(bound&&bound!==result.data.user.id)throw Error('Usá la cuenta original de este dispositivo. No se mezclaron cuentas.');
      user=result.data.user;
      verifiedWrite(bindingKey,user.id);
      if(!canApply()){status('pending','Se completará al terminar la edición.');return;}
      if(!localSaved())throw Error('Guardado local pendiente. Tus datos no se reemplazaron.');
      await engine.run(resolution);
    }catch(error){status('error',error.message);}
  }
  async function login(create=false) {
    hidePassword();
    try {
      ready ||= setup();await ready;
      const email=document.querySelector('#cloudSyncEmail').value.trim(),password=document.querySelector('#cloudSyncPassword').value;
      if(!email||password.length<8)throw Error('Ingresá tu correo y una contraseña de al menos 8 caracteres.');
      status('working');
      const {data,error}=create?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});
      document.querySelector('#cloudSyncPassword').value='';
      if(error)throw error;
      if(!data.session){status('signedout','Confirmá el correo recibido y luego tocá Vincular. Si no llega, falta habilitar el envío de correo del servicio.');return;}
      await run();
    }catch(error){status('error',error.message);}
  }
  auth?.addEventListener('submit',event=>{event.preventDefault();void login();});
  document.querySelector('#cloudSyncForgot')?.addEventListener('click',async()=>{
    const button=document.querySelector('#cloudSyncForgot'),message=document.querySelector('#cloudSyncRecoveryStatus');
    if(button.disabled)return;button.disabled=true;
    message.textContent='Solicitando correo de recuperación…';
    try{
      ready ||= setup();await ready;
      const email=document.querySelector('#cloudSyncEmail').value.trim();
      await requestPasswordRecovery(client,email,new URL('./',location.href).href);
      message.textContent='Si ese correo tiene una cuenta, recibirás un enlace para elegir una contraseña nueva. Revisá también Spam. Abrí el enlace más reciente.';
    }catch(error){message.textContent=error.message?.startsWith('Ingresá')?error.message:'No se pudo solicitar el correo. Revisá la conexión e intentá nuevamente en un minuto.';}
    finally{button.disabled=false;}
  });
  document.querySelector('#cloudSyncRegister')?.addEventListener('click',()=>void login(true));
  document.querySelector('#cloudSyncNow')?.addEventListener('click',()=>void run());
  document.querySelector('#cloudSyncDisconnect')?.addEventListener('click',async()=>{
    if(!client)return;
    if(!confirm('¿Pausar la sincronización en este dispositivo? Tus datos y respaldos se conservan.'))return;
    stopped=true;await client.auth.signOut({scope:'local'});user=null;status('signedout');stopped=false;
  });
  document.querySelector('#cloudSyncResolve')?.addEventListener('click',()=>{
    if(!pending)return;const choices={};for(const select of conflictList.querySelectorAll('select')){if(!select.value){status('conflict','Elegí una versión para cada diferencia.');return;}choices[select.dataset.conflictId]=select.value;}
    void run({local:pending.local,remote:pending.remote,choices});
  });
  document.querySelector('#cloudSyncDownload')?.addEventListener('click',async()=>{
    try {
      ready ||= setup();await ready;const session=await client.auth.getUser();if(!session.data.user)throw Error('Vinculá tu cuenta primero.');
      const {data,error}=await client.from('sync_backups').select('state,created_at,revision').order('created_at',{ascending:false}).limit(1).single();if(error)throw error;
      const envelope=await createSafetyEnvelope({...data.state,security:{enabled:false}});
      const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mis-gastos-respaldo-remoto-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){status('error',error.message);}
  });
  window.addEventListener('online',()=>void run());
  window.addEventListener('offline',()=>status('offline'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void run();});
  setInterval(()=>{if(!document.hidden&&lastStatus!=='conflict')void run();},10000);
  status('signedout');void run();
  return {notify(){if(user){status(navigator.onLine?'pending':'offline');deferredRun();}},run};
}
