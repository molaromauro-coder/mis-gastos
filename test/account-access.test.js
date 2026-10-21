import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACCOUNT_PREFIX,SIGNED_OUT_KEY,signInOriginalAccount,preserveAndSignOut,saveAccountProfile,installPasswordVisibility} from '../account-access.js';
import {readSafetyEnvelope} from '../data-safety.js';
function storage(values={}){const data=new Map(Object.entries(values));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};}
const snapshot={expenses:[{id:'e',amount:32100}],cards:[{id:'c',closingDate:'2026-10-20'}],trash:[{id:'t',items:[{id:'deleted'}]}],settings:{hideAmounts:true},resale:{parties:[{id:'p',tickets:[{id:'ticket',status:'Vendida',salePrice:60000}]}]},security:{enabled:true,pinHash:'retained'},futureField:{anything:['retained']}};
function authClient(id='original'){
 const calls=[];const user={id,email:'persona@example.com',user_metadata:{role:'unchanged',other:'keep'}};
 return {calls,user,auth:{
  signInWithPassword:async v=>{calls.push(['signin',v]);return {data:{session:{access_token:'fake'},user},error:null};},
  getUser:async()=>({data:{user},error:null}),
  signOut:async v=>{calls.push(['signout',v]);return {error:null};},
  getSession:async()=>({data:{session:null},error:null}),
  updateUser:async v=>{calls.push(['update',v]);Object.assign(user.user_metadata,v.data);return {data:{user},error:null};}
 }};
}
test('logout creates a verified recoverable backup while preserving every financial and unknown field',async()=>{
 const s=storage({'mis-gastos-v1':JSON.stringify(snapshot),[ACCOUNT_PREFIX+'-account']:JSON.stringify('original')}),before=structuredClone(snapshot),c=authClient();
 await preserveAndSignOut({client:c,snapshot,storage:s});
 assert.deepEqual(await readSafetyEnvelope(s.getItem(ACCOUNT_PREFIX+'-before-signout')),before);
 assert.equal(s.getItem('mis-gastos-v1'),JSON.stringify(before));assert.deepEqual(snapshot,before);
 assert.equal(s.getItem(SIGNED_OUT_KEY),'1');assert.deepEqual(c.calls,[['signout',{scope:'local'}]]);
 assert.equal(s.getItem(ACCOUNT_PREFIX+'-account'),JSON.stringify('original'));
});
test('failed backup storage and readback block logout without revoking the session',async()=>{
 for(const fail of ['quota','readback']){
  const s=storage(),c=authClient();s.setItem=(k,v)=>{if(fail==='quota')throw Error('quota');s.data.set(k,'{}');};
  await assert.rejects(()=>preserveAndSignOut({client:c,snapshot,storage:s}));assert.equal(c.calls.length,0);assert.equal(s.getItem(SIGNED_OUT_KEY),null);
 }
});
test('logout gate write failure blocks revocation after preserving backup',async()=>{
 const s=storage(),c=authClient();s.setItem=(k,v)=>{if(k===SIGNED_OUT_KEY)throw Error('quota');s.data.set(k,v);};
 await assert.rejects(()=>preserveAndSignOut({client:c,snapshot,storage:s}));assert.equal(c.calls.length,0);assert.ok(s.getItem(ACCOUNT_PREFIX+'-before-signout'));
});
test('server logout failure and surviving session leave local data gated',async()=>{
 for(const fail of ['server','session']){
  const s=storage(),c=authClient();if(fail==='server')c.auth.signOut=async()=>({error:Error('network')});else c.auth.getSession=async()=>({data:{session:{access_token:'still-present'}}});
  await assert.rejects(()=>preserveAndSignOut({client:c,snapshot,storage:s}),/cierre/);assert.equal(s.getItem(SIGNED_OUT_KEY),'1');
 }
});
test('original-account password login unlocks without writing financial data',async()=>{
 const s=storage({[SIGNED_OUT_KEY]:'1',[ACCOUNT_PREFIX+'-account']:JSON.stringify('original'),'mis-gastos-v1':JSON.stringify(snapshot)}),c=authClient();
 await signInOriginalAccount(c,' persona@example.com ','new-password',s);
 assert.equal(s.getItem(SIGNED_OUT_KEY),null);assert.equal(s.getItem('mis-gastos-v1'),JSON.stringify(snapshot));assert.equal(c.calls[0][1].email,'persona@example.com');
});
test('different identity, missing session, invalid credentials and failed identity verification never unlock',async()=>{
 for(const fail of ['different','no-session','password','identity']){
  const s=storage({[SIGNED_OUT_KEY]:'1',[ACCOUNT_PREFIX+'-account']:JSON.stringify('original')}),c=authClient(fail==='different'?'other':'original');
  if(fail==='password')c.auth.signInWithPassword=async()=>({error:Error('invalid')});
  if(fail==='identity')c.auth.getUser=async()=>({error:Error('offline'),data:{user:null}});
  if(fail==='no-session')c.auth.signInWithPassword=async()=>({data:{session:null},error:null});
  await assert.rejects(()=>signInOriginalAccount(c,'p@example.com','bad',s));assert.equal(s.getItem(SIGNED_OUT_KEY),'1');
  if(fail!=='password')assert.deepEqual(c.calls.at(-1),['signout',{scope:'local'}]);
 }
});
test('profile saves only personal fields and verifies the reread, retaining unrelated metadata',async()=>{
 const c=authClient();const result=await saveAccountProfile(c,{first_name:' Ana ',last_name:' Pérez ',display_name:'Anita',contact_phone:'12345',role:'admin',email:'other@example.com',password:'do-not-store'},'original');
 assert.deepEqual(c.calls,[['update',{data:{first_name:'Ana',last_name:'Pérez',display_name:'Anita',contact_phone:'12345'}}]]);
 assert.equal(result.user_metadata.role,'unchanged');assert.equal(result.user_metadata.other,'keep');
});
test('incomplete or overlong personal data and different identity block profile writes',async()=>{
 for(const values of [{first_name:'Ana'},{first_name:'x'.repeat(81),last_name:'P'},{first_name:'Ana',last_name:'P',contact_phone:'1'.repeat(41)}]){
  const c=authClient();await assert.rejects(()=>saveAccountProfile(c,values,'original'));assert.equal(c.calls.length,0);
 }
 const c=authClient('other');await assert.rejects(()=>saveAccountProfile(c,{first_name:'Ana',last_name:'P'},'original'));assert.equal(c.calls.length,0);
});
test('profile update and verification failures are never reported as success',async()=>{
 for(const fail of ['update','readback']){
  const c=authClient();c.auth.updateUser=async()=>({error:fail==='update'?Error('offline'):null});
  await assert.rejects(()=>saveAccountProfile(c,{first_name:'Ana',last_name:'P'},'original'));
 }
});
test('password eye toggles in place and conceals on dialog close and background',()=>{
 const events=()=>({handlers:{},addEventListener(k,f){this.handlers[k]=f;}});
 const input={type:'password',value:'private'},span={},button={...events(),setAttribute(){},querySelector(){return span;}},dialog=events(),doc={...events(),hidden:false};
 installPasswordVisibility(input,button,dialog,doc);button.handlers.click();assert.equal(input.type,'text');assert.equal(span.textContent,'Ocultar');
 dialog.handlers.close();assert.equal(input.type,'password');button.handlers.click();doc.hidden=true;doc.handlers.visibilitychange();assert.equal(input.type,'password');assert.equal(input.value,'private');
});
test('closed-session startup precedes financial initialization and handles other tabs and bfcache',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8'),sync=readFileSync(new URL('../cloud-sync.js',import.meta.url),'utf8');
 assert.ok(app.indexOf('await showAccountSignIn();')<app.indexOf('const state = loadState()'));
 assert.ok(app.indexOf('await showAccountSignIn();')<app.indexOf('seedDemoCardsOnce();'));
 assert.match(sync,/addEventListener\('storage'/);assert.match(sync,/addEventListener\('pageshow'/);
 assert.ok(sync.indexOf('await Promise.allSettled([...runningJobs])')<sync.indexOf('await preserveAndSignOut'));
});
