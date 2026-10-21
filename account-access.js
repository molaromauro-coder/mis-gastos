import { SYNC_URL, SYNC_PUBLIC_KEY } from './sync-config.js';
import { requestPasswordRecovery } from './password-recovery.js?v=155';
import { createSafetyEnvelope, readSafetyEnvelope } from './data-safety.js';

export const ACCOUNT_PREFIX='mis-gastos-sync-v1';
export const SIGNED_OUT_KEY=ACCOUNT_PREFIX+'-signed-out';
let clientPromise;
export function accountClient(){
  return clientPromise ||= (async()=>{
    if(!window.supabase?.createClient)await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=new URL('./vendor/supabase-2.57.4.js',import.meta.url).href;
      script.onload=resolve;script.onerror=()=>reject(Error('No se pudo cargar el acceso. Revisá la conexión.'));document.head.append(script);
    });
    return window.supabase.createClient(SYNC_URL,SYNC_PUBLIC_KEY,{
      auth:{storageKey:ACCOUNT_PREFIX+'-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
      global:{fetch:async(input,options={})=>{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
        try{return await fetch(input,{...options,signal:controller.signal});}finally{clearTimeout(timer);}
      }}
    });
  })().catch(error=>{clientPromise=null;throw error;});
}
export function installPasswordVisibility(input,button,dialog,doc=document){
  if(!input||!button)return ()=>{};
  function hide(){setVisible(false);}
  function setVisible(visible){
    input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));
    button.setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');
    button.querySelector('span').textContent=visible?'Ocultar':'Mostrar';
  }
  hide();button.addEventListener('click',()=>setVisible(input.type==='password'));
  dialog?.addEventListener('close',hide);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hide();});
  return hide;
}
export async function signInOriginalAccount(client,email,password,storage=localStorage){
  const bound=JSON.parse(storage.getItem(ACCOUNT_PREFIX+'-account')||'null');
  const {data,error}=await client.auth.signInWithPassword({email:email.trim(),password});
  if(error)throw Error('No se pudo ingresar. Revisá el correo, la contraseña y la conexión.');
  const verified=await client.auth.getUser();
  if(verified.error||!verified.data?.user||!data.session||bound&&bound!==verified.data.user.id){
    await client.auth.signOut({scope:'local'});
    throw Error(bound?'Ingresá con la cuenta original de este dispositivo. Tus datos se conservan.':'No se pudo verificar la cuenta. Intentá nuevamente.');
  }
  storage.removeItem(SIGNED_OUT_KEY);
  if(storage.getItem(SIGNED_OUT_KEY)!==null)throw Error('No se pudo habilitar el ingreso en este navegador.');
  return verified.data.user;
}
export async function saveAccountProfile(client,values,expectedId){
  const data={};
  for(const key of ['first_name','last_name','display_name','contact_phone']){
    const value=String(values[key]||'').trim();
    if(value.length>(key==='contact_phone'?40:80))throw Error('Uno de los datos es demasiado largo.');
    data[key]=value;
  }
  if(!data.first_name||!data.last_name)throw Error('Completá tu nombre y apellido.');
  const before=await client.auth.getUser();
  if(before.error||!before.data?.user||before.data.user.id!==expectedId)throw Error('Volvé a iniciar sesión antes de guardar tu perfil.');
  const result=await client.auth.updateUser({data});
  if(result.error)throw Error('No se pudo guardar el perfil. Revisá la conexión e intentá nuevamente.');
  const check=await client.auth.getUser();
  if(check.error||check.data?.user?.id!==expectedId||Object.entries(data).some(([k,v])=>check.data.user.user_metadata?.[k]!==v))throw Error('No se pudo comprobar el perfil guardado. Volvé a intentar.');
  return check.data.user;
}
export async function preserveAndSignOut({client,snapshot,storage=localStorage}){
  const key=ACCOUNT_PREFIX+'-before-signout';
  const envelope=await createSafetyEnvelope(snapshot),raw=JSON.stringify(envelope);
  storage.setItem(key,raw);
  if(storage.getItem(key)!==raw)throw Error('No se pudo verificar el respaldo. La sesión sigue abierta.');
  await readSafetyEnvelope(storage.getItem(key));
  // Persist the gate before revocation so reloads and other tabs cannot reopen local data.
  storage.setItem(SIGNED_OUT_KEY,'1');
  if(storage.getItem(SIGNED_OUT_KEY)!=='1')throw Error('No se pudo proteger el cierre de sesión.');
  const result=await client.auth.signOut({scope:'local'});
  if(result.error)throw Error('Los datos están protegidos, pero no se pudo confirmar el cierre con el servicio. Volvé a intentar con conexión.');
  const session=await client.auth.getSession();
  if(session.error||session.data?.session)throw Error('No se pudo confirmar el cierre. Los datos siguen protegidos.');
}
export async function showAccountSignIn(){
  document.querySelector('.app').hidden=true;
  const screen=document.createElement('main');screen.className='account-signin recovery-screen';
  screen.innerHTML=`<h1>Mis Gastos</h1><h2>Iniciar sesión</h2><p>Tus datos se conservan. Volvé a ingresar con tu cuenta para continuar.</p><form><label>Correo de Mis Gastos<input id="accountLoginEmail" type="email" autocomplete="username" required></label><label>Contraseña<span class="password-visibility-field"><input id="accountLoginPassword" type="password" autocomplete="current-password" required><button class="password-visibility-toggle" type="button" aria-controls="accountLoginPassword"><span>Mostrar</span></button></span></label><button type="submit">Iniciar sesión</button></form><button id="accountLoginForgot" type="button">Olvidé mi contraseña</button><p role="status" id="accountLoginMessage"></p>`;
  document.body.append(screen);
  const form=screen.querySelector('form'),email=screen.querySelector('#accountLoginEmail'),password=screen.querySelector('#accountLoginPassword'),message=screen.querySelector('#accountLoginMessage');
  const hide=installPasswordVisibility(password,screen.querySelector('.password-visibility-toggle'));
  let busy=false;
  async function action(work){
    if(busy)return;busy=true;hide();for(const b of screen.querySelectorAll('button'))b.disabled=true;
    try{await work();}catch(error){message.textContent=error.message;}
    finally{busy=false;for(const b of screen.querySelectorAll('button'))b.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void action(async()=>{
    message.textContent='Verificando cuenta…';const client=await accountClient();
    await signInOriginalAccount(client,email.value,password.value);password.value='';location.reload();
  });});
  screen.querySelector('#accountLoginForgot').addEventListener('click',()=>void action(async()=>{
    await requestPasswordRecovery(await accountClient(),email.value.trim(),new URL('./',location.href).href);
    message.textContent='Si ese correo tiene una cuenta, recibirás un enlace para recuperar la contraseña.';
  }));
}
