import { mergeSyncSnapshots, sameSyncValue } from './sync-merge.js';

// Transport and persistence are injected so races and storage failures are testable.
export function createSyncEngine({getLocal,getCheckpoint,readRemote,archiveLocal,commitRemote,applyLocal,saveCheckpoint,status,onConflicts}) {
  let running=false;
  return {async run(resolution) {
    if(running) return false;
    running=true;
    try {
      status('working');
      for(let attempt=0;attempt<3;attempt++) {
        const local=getLocal(), checkpoint=getCheckpoint(), remote=await readRemote();
        if(remote && (!remote.state || !Array.isArray(remote.state.expenses))) throw Error('La copia remota no es válida. Se conservaron tus datos locales.');
        let merged={state:local,conflicts:[]};
        if(remote) {
          const choices=resolution&&sameSyncValue(resolution.local,local)&&sameSyncValue(resolution.remote,remote.state)?resolution.choices:{};
          merged=mergeSyncSnapshots(checkpoint?.state||null,local,remote.state,choices);
        }
        if(merged.conflicts.length) {
          await archiveLocal(local);
          onConflicts({...merged,local,remote:remote.state});
          status('conflict');return false;
        }
        if(!sameSyncValue(local,getLocal()))continue;
        let verified=remote;
        if(!remote||!sameSyncValue(merged.state,remote.state)) {
          await archiveLocal(local);
          if(!sameSyncValue(local,getLocal()))continue;
          const result=await commitRemote(remote?.revision||0,merged.state);
          if(result.conflict)continue;
          // Read back the immutable committed revision; a newer head is possible.
          verified=await readRemote(result.revision);
          if(!verified||verified.revision!==result.revision||!sameSyncValue(verified.state,merged.state))throw Error('No se pudo verificar el guardado remoto. Los cambios siguen pendientes.');
        }
        if(!sameSyncValue(local,getLocal()))continue;
        if(!sameSyncValue(local,merged.state)) {
          await archiveLocal(local);
          if(!sameSyncValue(local,getLocal()))continue;
          await applyLocal(merged.state,local);
        }
        await saveCheckpoint({revision:verified.revision,state:merged.state,lastSyncAt:new Date().toISOString()});
        status('synced');return true;
      }
      status('pending');return false;
    } catch(error) {status('error',error.message);return false;}
    finally {running=false;}
  }};
}
