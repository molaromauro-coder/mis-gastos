const arrayFields = ['expenses','cards','cardPayments','categories','categoryRules','stock','recoveries','recurring','fixedExpenses','trash'];
export function isValidSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.expenses)) return false;
  if (Object.keys(value).some((key)=>['__proto__','prototype','constructor'].includes(key))) return false;
  if (arrayFields.some((key)=>key in value && !Array.isArray(value[key]))) return false;
  for (const key of ['subcategories','budgets','settings','security','resale']) {
    if (key in value && (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))) return false;
  }
  if (value.categories?.some((item)=>typeof item !== 'string')) return false;
  for (const key of arrayFields.filter((key)=>key!=='categories')) {
    if (value[key]?.some((item)=>!item || typeof item !== 'object' || Array.isArray(item))) return false;
  }
  if (value.resale?.parties && (!Array.isArray(value.resale.parties) || value.resale.parties.some((party)=>!party || typeof party!=='object' || !Array.isArray(party.tickets||[])))) return false;
  return true;
}
export function snapshotInventory(snapshot) {
  return {
    gastos:(snapshot.expenses||[]).length,
    tarjetas:(snapshot.cards||[]).length,
    pagosTarjeta:(snapshot.cardPayments||[]).length,
    categorias:(snapshot.categories||[]).length,
    stock:(snapshot.stock||[]).length,
    recuperos:(snapshot.recoveries||[]).length,
    fiestas:(snapshot.resale?.parties||[]).length,
    entradas:(snapshot.resale?.parties||[]).reduce((sum,party)=>sum+(party.tickets||[]).length,0)
  };
}
export function chooseSnapshot(candidates) {
  return candidates.filter(isValidSnapshot).slice().sort((a,b)=>{
    const time=(value)=>Date.parse(value.settings?.lastSafeSaveAt||'')||0;
    return time(b)-time(a) || Object.values(snapshotInventory(b)).reduce((s,n)=>s+n,0)-Object.values(snapshotInventory(a)).reduce((s,n)=>s+n,0);
  })[0] || null;
}
export function protectExpenseRecords(previous, next, allowed=false) {
  if (allowed || !previous) return {missing:[]};
  const key=(item)=>item.id || JSON.stringify([item.parentId,item.purchaseDate||item.date,item.amount,item.concept,item.installment]);
  const retained=[...(next.expenses||[]),...(next.trash||[]).flatMap((record)=>record.items||[])];
  const keys=new Set(retained.map(key));
  const missing=(previous.expenses||[]).filter((item)=>!keys.has(key(item)));
  if(missing.length) next.expenses.push(...structuredClone(missing));
  return {missing};
}
async function digest(snapshot) {
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}
export async function createSafetyEnvelope(snapshot,createdAt=new Date().toISOString()) {
  if(!isValidSnapshot(snapshot)) throw new Error('Los datos no tienen un formato válido para respaldar.');
  const state=structuredClone(snapshot);
  return {format:'mis-gastos-backup-v3',createdAt,inventory:snapshotInventory(state),integrity:{algorithm:'SHA-256',digest:await digest(state)},state};
}
export async function readSafetyEnvelope(raw) {
  const parsed=JSON.parse(raw), snapshot=parsed?.state||parsed;
  if(!isValidSnapshot(snapshot)) throw new Error('El archivo no es un respaldo válido de Mis Gastos.');
  if(parsed.format==='mis-gastos-backup-v3') {
    if(parsed.integrity?.algorithm!=='SHA-256' || parsed.integrity.digest!==await digest(snapshot)) throw new Error('El respaldo está alterado o incompleto. No se modificó ningún dato.');
  } else if(parsed.format && !['mis-gastos-backup-v1','mis-gastos-backup-v2'].includes(parsed.format)) throw new Error('Formato de respaldo desconocido.');
  return structuredClone(snapshot);
}
