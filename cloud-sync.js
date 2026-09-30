const PROJECT_URL='https://iksqhsbesqjdtkjjqpvt.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_tiHv76GFBFc7sGUzYBwEtw_RRA6ALoA';
const SUPABASE_MODULE='https://esm.sh/@supabase/supabase-js@2.58.0?bundle';
const TOKEN_KEY='mis-gastos-sync-token-v1';

let client=null;
let channel=null;
let token=localStorage.getItem(TOKEN_KEY)||'';
let getState=null;
let applyState=null;
let statusCb=null;
let pushTimer=null;
let lastVersion=0;
let connected=false;
let pushing=false;
let pendingPush=false;

function status(state,message=''){
  statusCb?.({state,message,connected,hasToken:!!token,lastVersion});
}

async function getClient(){
  if(client)return client;
  const {createClient}=await import(SUPABASE_MODULE);
  client=createClient(PROJECT_URL,PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    realtime:{params:{eventsPerSecond:10}}
  });
  return client;
}

async function tokenHash(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,'0')).join('');
}

function normalizeToken(value){
  return String(value||'').trim().toUpperCase().replace(/\s+/g,'');
}

function validToken(value){return normalizeToken(value).length>=32;}

async function subscribe(){
  if(channel){try{await client?.removeChannel(channel);}catch{} channel=null;}
  if(!token)return;
  const c=await getClient();
  const hash=await tokenHash(token);
  channel=c.channel('mg-sync-'+hash.slice(0,32),{config:{broadcast:{self:false}}});
  channel
    .on('broadcast',{event:'changed'},async(payload)=>{
      const remoteVersion=Number(payload?.payload?.version||0);
      if(remoteVersion>lastVersion)await pullNow();
    })
    .subscribe((s)=>{
      connected=s==='SUBSCRIBED';
      status(connected?'synced':'connecting',connected?'Sincronización activa':'Conectando…');
    });
}

export function generateSyncToken(){
  const bytes=crypto.getRandomValues(new Uint8Array(20));
  const hex=[...bytes].map((b)=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  return 'MG'+hex;
}

export function formatSyncToken(value){
  const clean=normalizeToken(value);
  return clean.match(/.{1,4}/g)?.join('-')||clean;
}

export function getSyncToken(){return token;}
export function hasSyncToken(){return !!token;}

export function configureCloudSync({getState:reader,applyState:writer,onStatus}){
  getState=reader;
  applyState=writer;
  statusCb=onStatus;
  status(token?'connecting':'local',token?'Preparando sincronización':'Solo en este dispositivo');
}

export async function createCloudSync(newToken){
  const clean=normalizeToken(newToken||generateSyncToken());
  if(!validToken(clean))throw new Error('Código de sincronización inválido');
  token=clean;localStorage.setItem(TOKEN_KEY,token);lastVersion=0;
  status('connecting','Creando sincronización…');
  await pushNow(true);
  await subscribe();
  return token;
}

export async function joinCloudSync(existingToken){
  const clean=normalizeToken(existingToken);
  if(!validToken(clean))throw new Error('El código debe tener al menos 32 caracteres');
  token=clean;localStorage.setItem(TOKEN_KEY,token);lastVersion=0;
  status('connecting','Buscando datos en la nube…');
  const found=await pullNow(true);
  if(!found){
    localStorage.removeItem(TOKEN_KEY);token='';lastVersion=0;
    status('local','No encontré una sincronización con ese código');
    throw new Error('No encontré una sincronización con ese código');
  }
  await subscribe();
  return true;
}

export async function startCloudSync(){
  if(!token){status('local','Solo en este dispositivo');return false;}
  try{
    status('connecting','Conectando…');
    const found=await pullNow(true);
    if(!found)await pushNow(true);
    await subscribe();
    return true;
  }catch(error){
    connected=false;
    status('offline','Sin conexión: los cambios quedan guardados localmente');
    return false;
  }
}

export async function disconnectCloudSync(){
  if(channel&&client){try{await client.removeChannel(channel);}catch{}}
  channel=null;connected=false;lastVersion=0;token='';
  localStorage.removeItem(TOKEN_KEY);
  status('local','Solo en este dispositivo');
}

export function queueCloudPush(){
  if(!token||!getState)return;
  clearTimeout(pushTimer);
  pushTimer=setTimeout(()=>pushNow(false),180);
}

export async function pushNow(force=false){
  if(!token||!getState)return false;
  if(pushing){pendingPush=true;return false;}
  pushing=true;
  try{
    const c=await getClient();
    const {data,error}=await c.rpc('mg_sync_put',{p_token:token,p_payload:getState()});
    if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;
    lastVersion=Number(row?.version||lastVersion);
    connected=true;
    status('synced','Sincronizado');
    if(channel){
      try{await channel.send({type:'broadcast',event:'changed',payload:{version:lastVersion}});}catch{}
    }
    return true;
  }catch(error){
    connected=false;
    status('offline','Sin conexión: se sincronizará cuando vuelva internet');
    if(force)throw error;
    return false;
  }finally{
    pushing=false;
    if(pendingPush){pendingPush=false;queueCloudPush();}
  }
}

export async function pullNow(force=false){
  if(!token||!applyState)return false;
  try{
    const c=await getClient();
    const {data,error}=await c.rpc('mg_sync_get',{p_token:token});
    if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;
    if(!row)return false;
    const remoteVersion=Number(row.version||0);
    if(force||remoteVersion>lastVersion){
      lastVersion=remoteVersion;
      await applyState(row.payload||{});
    }
    connected=true;
    status('synced','Sincronizado');
    return true;
  }catch(error){
    connected=false;
    status('offline','Sin conexión: usando datos locales');
    if(force)throw error;
    return false;
  }
}

window.addEventListener('online',()=>{if(token)startCloudSync();});
