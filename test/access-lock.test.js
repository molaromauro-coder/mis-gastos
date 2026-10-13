import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAccessLock} from '../access-lock.js';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Face ID is attempted first; successful verification never exposes PIN',async()=>{
  const modes=[];let requests=0,unlocks=0;
  const lock=createAccessLock({getSecurity:()=>({enabled:true,credentialId:'saved'}),authenticate:async()=>{requests++;return true;},view:mode=>modes.push(mode),afterUnlock:()=>unlocks++});
  await lock.open();assert.deepEqual(modes,['verifying','unlocked']);assert.equal(requests,1);assert.equal(unlocks,1);assert.equal(lock.locked,false);
});
test('failure, cancellation and unavailable biometric verification show PIN fallback',async()=>{
  for(const authenticate of [async()=>false,async()=>{throw Error('cancelled');}]){
    const modes=[];const lock=createAccessLock({getSecurity:()=>({enabled:true,credentialId:'saved'}),authenticate,view:mode=>modes.push(mode),afterUnlock:()=>assert.fail('must stay locked')});
    await lock.open();assert.deepEqual(modes,['verifying','pin']);assert.equal(lock.locked,true);
  }
  const modes=[];const lock=createAccessLock({getSecurity:()=>({enabled:true}),authenticate:()=>assert.fail('no stored credential'),view:mode=>modes.push(mode),afterUnlock(){}});await lock.open();assert.deepEqual(modes,['pin']);
});
test('repeated opening and retry cannot launch overlapping native prompts',async()=>{
  let done,requests=0;const modes=[];
  const lock=createAccessLock({getSecurity:()=>({enabled:true,credentialId:'saved'}),authenticate:()=>{requests++;return new Promise(resolve=>done=resolve);},view:mode=>modes.push(mode),afterUnlock(){}});
  const first=lock.open();const second=lock.open();const retry=lock.retry();assert.equal(requests,1);done(false);await Promise.all([first,second,retry]);assert.deepEqual(modes,['verifying','pin']);
});
test('disabled protection does not request Face ID; toggling off retains the saved credential and PIN',async()=>{
  let requests=0;const modes=[];
  const lock=createAccessLock({getSecurity:()=>({enabled:false,credentialId:'saved'}),authenticate:()=>requests++,view:mode=>modes.push(mode),afterUnlock(){}});await lock.open();assert.equal(requests,0);assert.deepEqual(modes,[]);
  const security={enabled:true,pinHash:'hash',pinSalt:'salt',pinDigits:6,credentialId:'saved'};
  const state={security:structuredClone(security),expenses:[{id:'keep'}]};
  const input={checked:true};const context={state,structuredClone,$:()=>input,save:()=>true,accessLock:{pause(){}},renderSecurityStatus(){},showToast(){},openSecuritySetup(){assert.fail('must not reset setup');}};
  vm.runInNewContext(app.slice(app.indexOf('function setSecurityEnabled('),app.indexOf('function currentMonthKey()',app.indexOf('function setSecurityEnabled('))),context);
  context.setSecurityEnabled(false);assert.equal(state.security.enabled,false);assert.equal(state.security.pinHash,security.pinHash);assert.equal(state.security.credentialId,'saved');
  context.setSecurityEnabled(true);assert.equal(state.security.enabled,true);assert.deepEqual(state.expenses,[{id:'keep'}]);
});
test('a failed toggle save restores the entire security configuration',()=>{
  const state={security:{enabled:true,pinHash:'hash',credentialId:'saved'}};const before=structuredClone(state);
  const context={state,structuredClone,$:()=>({}),save:()=>false,accessLock:{pause(){assert.fail('save failed');}},renderSecurityStatus(){},showToast(){},openSecuritySetup(){}};
  vm.runInNewContext(app.slice(app.indexOf('function setSecurityEnabled('),app.indexOf('function currentMonthKey()',app.indexOf('function setSecurityEnabled('))),context);
  assert.equal(context.setSecurityEnabled(false),false);assert.deepEqual(state,before);
});
test('platform credential request targets the saved internal credential; fallback field is initially hidden',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(app,/allowCredentials:\[\{type:'public-key',id:base64ToBytes\(state.security.credentialId\),transports:\['internal'\]\}\]/);
  assert.match(html,/id="securityToggle"[^>]*role="switch"/);
  assert.match(html,/id="pinUnlockFields" class="pin-unlock hidden"/);
  assert.match(html,/id="unlockPin"[^>]*maxlength="6"/);
  assert.ok(!app.includes('Usá tu PIN de 4 dígitos.'));
});
