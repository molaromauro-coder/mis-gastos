// A single platform request per lock cycle; fallback is shown only on failure.
export function createAccessLock({getSecurity,authenticate,view,afterUnlock,storage=globalThis.localStorage,now=()=>new Date()}) {
  let inFlight=null,locked=false,attempt=0,memorySession=null,memoryPrompt=null;
  const sessionKey='mis-gastos-access-day-v1';
  function identity(){const s=getSecurity();return JSON.stringify([s.credentialId||'',s.pinSalt||'',s.pinHash||'']);}
  function day(){const d=now();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}
  function remembered(){try{const s=memorySession||JSON.parse(storage.getItem(sessionKey));return s?.day===day()&&s.identity===identity();}catch{return false;}}
  function remember(){memorySession={day:day(),identity:identity()};try{storage.setItem(sessionKey,JSON.stringify(memorySession));}catch{}}
  function prompted(){try{const s=memoryPrompt||JSON.parse(storage.getItem(sessionKey+'-prompt'));return s?.day===day()&&s.identity===identity();}catch{return false;}}
  function markPrompt(){memoryPrompt={day:day(),identity:identity()};try{storage.setItem(sessionKey+'-prompt',JSON.stringify(memoryPrompt));}catch{}}
  function forget(){memorySession=null;try{storage.removeItem(sessionKey);}catch{}}
  function unlock(){remember();locked=false;attempt++;view('unlocked');afterUnlock();}
  function verify() {
    if(inFlight)return inFlight;
    markPrompt();
    const sequence=++attempt;
    view('verifying');
    inFlight=(async()=>{
      try{
        const ok=await authenticate();
        if(sequence!==attempt||!locked)return false;
        if(ok){unlock();return true;}
        view('pin');return false;
      }catch{
        if(sequence===attempt&&locked)view('pin');
        return false;
      }finally{inFlight=null;}
    })();
    return inFlight;
  }
  return {
    async open(){
      if(!getSecurity().enabled||locked)return;
      if(remembered()){view('unlocked');afterUnlock();return;}
      locked=true;
      if(getSecurity().credentialId&&!prompted())return verify();
      view('pin');
    },
    retry(){if(!locked||!getSecurity().enabled)return Promise.resolve(false);return verify();},
    unlock,
    pause(){forget();locked=false;attempt++;view('unlocked');},
    get locked(){return locked;}
  };
}
