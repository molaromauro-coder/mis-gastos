// A single platform request per lock cycle; fallback is shown only on failure.
export function createAccessLock({getSecurity,authenticate,view,afterUnlock}) {
  let inFlight=null,locked=false,attempt=0;
  function unlock(){locked=false;attempt++;view('unlocked');afterUnlock();}
  function verify() {
    if(inFlight)return inFlight;
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
      locked=true;
      if(getSecurity().credentialId)return verify();
      view('pin');
    },
    retry(){if(!locked||!getSecurity().enabled)return Promise.resolve(false);return verify();},
    unlock,
    pause(){locked=false;attempt++;view('unlocked');},
    get locked(){return locked;}
  };
}
