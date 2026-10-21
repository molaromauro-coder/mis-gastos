import { SYNC_URL, SYNC_PUBLIC_KEY } from './sync-config.js';
export function isRecoveryLink(hash){const p=new URLSearchParams(hash.replace(/^#/,''));return p.get('type')==='recovery'||p.has('error_code')||p.has('error_description');}
export function recoveryTokens(hash){const p=new URLSearchParams(hash.replace(/^#/,''));if(p.get('type')!=='recovery'||!p.get('access_token')||!p.get('refresh_token'))throw Error('El enlace venció o está incompleto. Solicitá otro desde Olvidé mi contraseña.');return {access_token:p.get('access_token'),refresh_token:p.get('refresh_token')};}
export function validateNewPassword(password,confirmation){if(password.length<8)throw Error('Usá una contraseña de al menos 8 caracteres.');if(password!==confirmation)throw Error('Las contraseñas no coinciden.');}
export async function requestPasswordRecovery(client,email,redirectTo){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Ingresá el correo de tu cuenta de Mis Gastos.');
 const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;
}
export async function changeRecoveredPassword(client,password,confirmation){
 validateNewPassword(password,confirmation);
 const identity=await client.auth.getUser();if(identity.error||!identity.data?.user)throw Error('El enlace venció. Solicitá otro correo de recuperación.');
 const {error}=await client.auth.updateUser({password});if(error)throw error;
}
async function sdk(){if(window.supabase?.createClient)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/supabase-2.57.4.js',import.meta.url).href;script.onload=resolve;script.onerror=()=>reject(Error('No se pudo conectar. Volvé a abrir el enlace con Internet.'));document.head.append(script);});}
export async function startPasswordRecovery(){
 const hash=location.hash;
 // Remove credentials from the address before any other app startup or requests.
 history.replaceState(null,'',location.pathname+location.search);
 document.querySelector('.app').hidden=true;
 const section=document.createElement('main');section.className='recovery-screen';
 section.innerHTML='<h1>Mis Gastos</h1><h2>Crear contraseña nueva</h2><p id="recoveryStatus" role="status">Verificando el enlace…</p><form id="newPasswordForm" hidden><label>Nueva contraseña<input id="newPassword" type="password" autocomplete="new-password" minlength="8" required></label><label>Repetí la nueva contraseña<input id="newPasswordConfirm" type="password" autocomplete="new-password" minlength="8" required></label><button id="recoveryEye" type="button" aria-pressed="false">👁 Mostrar contraseñas</button><button id="saveNewPassword" class="primary" type="submit">Guardar contraseña nueva</button></form><button id="returnFromRecovery" type="button">Volver a Mis Gastos</button>';
 document.body.append(section);
 const message=section.querySelector('#recoveryStatus'),form=section.querySelector('form'),submit=section.querySelector('#saveNewPassword');let client,busy=false;
 section.querySelector('#returnFromRecovery').onclick=()=>location.reload();
 section.querySelector('#recoveryEye').onclick=(event)=>{const visible=section.querySelector('#newPassword').type==='password';for(const input of form.querySelectorAll('input'))input.type=visible?'text':'password';event.currentTarget.textContent=visible?'Ocultar contraseñas':'👁 Mostrar contraseñas';event.currentTarget.setAttribute('aria-pressed',String(visible));};
 try{
  const tokens=recoveryTokens(hash);await sdk();
  client=window.supabase.createClient(SYNC_URL,SYNC_PUBLIC_KEY,{auth:{storageKey:'mis-gastos-recovery-temporary',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const session=await client.auth.setSession(tokens);if(session.error)throw session.error;
  const check=await client.auth.getUser();if(check.error||!check.data?.user)throw Error('Enlace inválido.');
  message.textContent='Elegí una contraseña nueva para '+check.data.user.email+'. Tus gastos se conservan.';form.hidden=false;
 }catch{message.textContent='No se pudo verificar el enlace. Puede haber vencido o ya haberse usado. Volvé a Mis Gastos y solicitá otro desde Olvidé mi contraseña.';return;}
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;submit.disabled=true;
  try{
   await changeRecoveredPassword(client,section.querySelector('#newPassword').value,section.querySelector('#newPasswordConfirm').value);
   for(const input of form.querySelectorAll('input'))input.value='';form.hidden=true;
   message.textContent='Contraseña actualizada. Volvé a Mis Gastos y vinculá el dispositivo con tu correo y la contraseña nueva.';
   try{await client.auth.signOut({scope:'local'});}catch{ /* ephemeral recovery session is never persisted */ }
  }catch(error){message.textContent=error.message?.includes('contraseña')||error.message?.includes('contraseñas')?error.message:'No se pudo actualizar la contraseña. Revisá la conexión o solicitá un enlace nuevo.';}
  finally{busy=false;submit.disabled=false;}
 };
}
