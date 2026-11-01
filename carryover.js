import {dateWithCardDay} from './finance.js';
export function buildCarryover(input, card, existing=[]) {
  const {planId,concept,currency,firstDue}=input;
  const amount=Number(input.amount),total=Number(input.total),first=Number(input.first);
  const date=new Date(firstDue+'T12:00:00');
  if(!planId||card?.type!=='Crédito'||!String(concept||'').trim()||!Number.isFinite(amount)||amount<=0||!['ARS','USD'].includes(currency)||!Number.isInteger(total)||total<1||total>120||!Number.isInteger(first)||first<1||first>total||!/^\d{4}-\d{2}-\d{2}$/.test(firstDue||'')||!Number.isFinite(date.getTime())||date.getDate()!==Number(firstDue.slice(8)))throw Error('Revisá el detalle, importe, cuotas y vencimiento.');
  return Array.from({length:total-first+1},(_,i)=>{
    const installment=first+i,due=dateWithCardDay(date.getFullYear(),date.getMonth()+i,date.getDate()).toISOString();
    const old=existing.find(e=>e.installment===installment);
    return {...old,id:old?.id||`${planId}-${installment}`,parentId:planId,carryoverPlanId:planId,carryover:true,source:'carryover',concept:concept.trim(),amount,currency,method:'Crédito',card:card.name,category:old?.category||'CUOTAS ANTERIORES',subcategory:old?.subcategory||'',installment,installments:total,date:due,dueDate:due,purchaseDate:null,carryoverFirst:first,carryoverFirstDue:firstDue};
  });
}
