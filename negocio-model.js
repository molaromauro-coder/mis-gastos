// Pure business-domain helpers. Never import resale.js here: its legacy boot seeds personal storage.
import { sameSyncValue } from './sync-merge.js';

export function validateBusinessState(state) {
  if (!state || state.schemaVersion!==1 || !Array.isArray(state.expenses) || state.expenses.length ||
      Object.keys(state).some(k=>!['schemaVersion','expenses','resale'].includes(k)) ||
      !state.resale || !Array.isArray(state.resale.parties)) throw Error('Copia del negocio inválida.');
  const ids=new Set();
  for(const party of state.resale.parties){
    if(!party || typeof party.id!=='string' || !party.id || ids.has(party.id) || typeof party.name!=='string' || !Array.isArray(party.tickets)) throw Error('Fiesta inválida o repetida.');
    ids.add(party.id);const tickets=new Set();
    for(const t of party.tickets){
      if(!t || typeof t.id!=='string' || !t.id || tickets.has(t.id) || !Number.isFinite(t.cost) || t.cost<0 || !Number.isFinite(t.salePrice) || t.salePrice<0 || !['Disponible','Vendida','Uso personal'].includes(t.status)) throw Error('Entrada inválida o repetida.');
      if(t.sellerId&&(!Number.isFinite(t.sellerPercent)||t.sellerPercent<0||t.sellerPercent>100))throw Error('Porcentaje de vendedor inválido.');
      tickets.add(t.id);
    }
  }
  return state;
}

// Detect only exact duplicate business records, never infer deletion from a missing spreadsheet row.
export function exactDuplicateParties(parties){
  const groups=[];
  for(const p of parties){
    const value=structuredClone(p);delete value.id;
    value.tickets=value.tickets.map(t=>{const x={...t};delete x.id;return x;});
    const match=groups.find(g=>sameSyncValue(g.value,value));
    if(match)match.ids.push(p.id);else groups.push({value,ids:[p.id]});
  }
  return groups.filter(g=>g.ids.length>1).map(g=>({name:g.value.name,keepId:g.ids[0],duplicateIds:g.ids.slice(1),tickets:g.value.tickets.length}));
}

export function prepareBusinessCopy(resale,{duplicateChoices=[]}={}){
  if(!resale || !Array.isArray(resale.parties))throw Error('Falta la copia completa de Reventa.');
  const copy=structuredClone(resale),detected=exactDuplicateParties(copy.parties),removed=[];
  for(const choice of duplicateChoices){
    const group=detected.find(g=>g.keepId===choice.keepId&&sameSyncValue(g.duplicateIds,choice.duplicateIds));
    if(!group)throw Error('Los duplicados cambiaron. Es necesario revisarlos nuevamente.');
    for(const id of group.duplicateIds)removed.push(copy.parties.find(p=>p.id===id));
  }
  copy.parties=copy.parties.filter(p=>!removed.some(r=>r.id===p.id));
  if(removed.length)copy.separationArchive={...(copy.separationArchive||{}),duplicateParties:removed};
  return validateBusinessState({schemaVersion:1,expenses:[],resale:copy});
}

export function writeVerified(storage,key,value){
  const raw=JSON.stringify(value);storage.setItem(key,raw);
  if(storage.getItem(key)!==raw)throw Error('No se pudo verificar el guardado. Tus datos anteriores se conservan.');
}

export function saveBusinessState(storage,key,next){
  validateBusinessState(next);
  const previous=storage.getItem(key);
  if(previous!==null){
    validateBusinessState(JSON.parse(previous));
    storage.setItem(key+'-previous',previous);
    if(storage.getItem(key+'-previous')!==previous)throw Error('No se pudo verificar el respaldo previo.');
  }
  try{writeVerified(storage,key,next);}catch(error){
    if(previous!==null){
      try{storage.setItem(key,previous);if(storage.getItem(key)!==previous)throw Error('relectura');}
      catch{throw Error('Falló el guardado y la restauración local. Conservá este dispositivo: hay un respaldo previo en '+key+'-previous.');}
    }
    throw error;
  }
}
