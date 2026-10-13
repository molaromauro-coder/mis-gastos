// Three-way reconciliation: absent fields on first connection are not deletions.
const missing = Symbol('missing');
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
export const sameSyncValue = (a,b) => canonical(a) === canonical(b);
function canonical(v) {
  if(v === missing || v === undefined) return 'missing';
  if(Array.isArray(v)) return '['+v.map(canonical).join(',')+']';
  if(plain(v)) return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
const copy = v => v === missing ? missing : structuredClone(v);
export function syncSnapshot(state) {
  const value = structuredClone(state);
  delete value.security; // Biometric credentials and PIN remain on their device.
  if(value.settings) for(const k of ['lastSafeSaveAt','lastSafeExpenseCount']) delete value.settings[k];
  return value;
}
export function mergeSyncSnapshots(base, local, remote, choices = {}) {
  const conflicts=[];
  const initial=!base;
  function conflict(b,l,r,path) {
    const id=JSON.stringify(path);
    if(choices[id]==='local') return copy(l);
    if(choices[id]==='remote') return copy(r);
    conflicts.push({id,path,local:l===missing?null:copy(l),remote:r===missing?null:copy(r),localDeleted:l===missing,remoteDeleted:r===missing});
    return copy(l);
  }
  function merge(b,l,r,path) {
    if(sameSyncValue(l,r)) return copy(l);
    if(!initial && sameSyncValue(l,b)) return copy(r);
    if(!initial && sameSyncValue(r,b)) return copy(l);
    if(initial && l===missing) return copy(r);
    if(initial && r===missing) return copy(l);
    if(plain(l)&&plain(r)&&(b===missing||plain(b))) {
      const result={};
      for(const k of new Set([...Object.keys(b===missing?{}:b),...Object.keys(l),...Object.keys(r)])) {
        if(['__proto__','constructor','prototype'].includes(k)) throw Error('Campo no seguro en la sincronización.');
        const v=merge(b!==missing&&Object.hasOwn(b,k)?b[k]:missing,Object.hasOwn(l,k)?l[k]:missing,Object.hasOwn(r,k)?r[k]:missing,[...path,k]);
        if(v!==missing) result[k]=v;
      }
      return result;
    }
    if(Array.isArray(l)&&Array.isArray(r)&&(b===missing||Array.isArray(b))) {
      const all=[...(b===missing?[]:b),...l,...r];
      const keyed=all.every(v=>typeof v==='string'||(plain(v)&&typeof v.id==='string'&&v.id));
      if(keyed) {
        const key=v=>typeof v==='string'?'text:'+v:'id:'+v.id;
        const map=arr=>{
          const m=new Map();
          for(const v of arr){const k=key(v);if(m.has(k))throw Error('Registros duplicados: '+path.join(' / '));m.set(k,v);}
          return m;
        };
        const bm=map(b===missing?[]:b),lm=map(l),rm=map(r),result=[];
        for(const k of new Set([...rm.keys(),...lm.keys(),...bm.keys()])) {
          const v=merge(bm.has(k)?bm.get(k):missing,lm.has(k)?lm.get(k):missing,rm.has(k)?rm.get(k):missing,[...path,k]);
          if(v!==missing)result.push(v);
        }
        return result;
      }
    }
    return conflict(b,l,r,path);
  }
  return {state:merge(base||missing,local,remote,[]),conflicts};
}
