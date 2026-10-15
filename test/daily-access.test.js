import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessLock} from '../access-lock.js';
function setup(){
  const values=new Map();
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let today=new Date(2026,9,15),requests=0,success=false,mode;
  const security={enabled:true,credentialId:'device',pinHash:'pin'};
  const make=()=>createAccessLock({getSecurity:()=>security,storage,now:()=>today,authenticate:async()=>{requests++;return success;},view:m=>mode=m,afterUnlock(){}});
  return {make,security,get requests(){return requests},get mode(){return mode},nextDay(){today=new Date(2026,9,16)},succeed(){success=true}};
}
test('cancelled automatic prompt is not repeated that day; PIN is still required',async()=>{
  const s=setup();await s.make().open();assert.equal(s.requests,1);assert.equal(s.mode,'pin');
  const second=s.make();await second.open();assert.equal(s.requests,1);assert.equal(second.locked,true);assert.equal(s.mode,'pin');
  await second.retry();assert.equal(s.requests,2);assert.equal(second.locked,true);
  second.unlock();await s.make().open();assert.equal(s.requests,2);assert.equal(s.mode,'unlocked');
});
test('successful access survives reopening but expires on the next local calendar day or credential change',async()=>{
  const s=setup();s.succeed();await s.make().open();await s.make().open();assert.equal(s.requests,1);
  s.nextDay();await s.make().open();assert.equal(s.requests,2);
  s.security.pinHash='changed';await s.make().open();assert.equal(s.requests,3);
});
