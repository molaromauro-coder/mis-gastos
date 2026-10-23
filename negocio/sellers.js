export function sellerRate(value){const n=Number(value);if(value===''||!Number.isFinite(n)||n<0||n>100)throw Error('El porcentaje debe estar entre 0 y 100.');return n;}
export function saveSeller(resale,{id,name,percent,active=true},makeId=()=>crypto.randomUUID()){
  name=String(name||'').trim();if(!name||name.length>80)throw Error('Ingresá un nombre de hasta 80 caracteres.');
  const next=structuredClone(resale),list=next.sellers||[];percent=sellerRate(percent);
  if(list.some(s=>s.id!==id&&s.name.toLocaleLowerCase('es')===name.toLocaleLowerCase('es')))throw Error('Ese vendedor ya existe.');
  const found=id?list.find(s=>s.id===id):null;if(id&&!found)throw Error('No se encontró el vendedor.');
  if(found)Object.assign(found,{name,percent,active:!!active});else list.push({id:makeId(),name,percent,active:!!active});
  next.sellers=list;return next;
}
export function assignSeller(ticket,seller){
  if(!seller||seller.active===false)throw Error('Elegí un vendedor activo.');
  return {...structuredClone(ticket),sellerId:seller.id,sellerName:seller.name,sellerPercent:sellerRate(seller.percent)};
}
export function sellerBalances(resale){
  const map=new Map((resale.sellers||[]).map(s=>[s.id,{id:s.id,name:s.name,sold:0,sales:0,netGain:0,commission:0}]));
  for(const p of resale.parties||[])for(const t of p.tickets||[]){
    if(t.status!=='Vendida'||!(t.salePrice>0))continue;
    const id=t.sellerId||'legacy',name=t.sellerName||'Ale (ventas anteriores)';
    if(!map.has(id))map.set(id,{id,name,sold:0,sales:0,netGain:0,commission:0});
    const row=map.get(id),gain=t.salePrice-t.cost,rate=t.sellerId?sellerRate(t.sellerPercent):sellerRate(resale.sellerPercent??30);
    row.sold++;row.sales+=t.salePrice;row.netGain+=gain;row.commission+=gain*rate/100;
  }
  return [...map.values()];
}
// Before changing defaults, stamp the current split on every unassigned existing ticket.
export function freezeExistingSplit(resale){
 const next=structuredClone(resale),percent=sellerRate(resale.sellerPercent??(100-(resale.ownerPercent??70)));
 for(const p of next.parties||[])for(const t of p.tickets||[])if(!t.sellerId)Object.assign(t,{sellerId:'previous-default',sellerName:'Reparto anterior',sellerPercent:percent});
 return next;
}
