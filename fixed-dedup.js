import {categoryBaseName} from './category-display.js';
// Retain complete source definitions for recovery; never delete a payment.
export function deduplicateFixedExpenses(snapshot){
 const groups=new Map(),result=[],aliases=new Map();let changed=false;
 for(const item of snapshot.fixedExpenses||[]){
  const name=categoryBaseName(item.subcategory||item.concept);
  const key=JSON.stringify([categoryBaseName(item.category),name,item.currency||'ARS']);
  const prior=name&&groups.get(key);
  if(!prior){groups.set(key,item);result.push(item);continue;}
  prior.duplicateDefinitions=[...(prior.duplicateDefinitions||[]),structuredClone(item)];
  prior.plannedAmounts={...(item.plannedAmounts||{}),...(prior.plannedAmounts||{})};
  if(!prior.legacyAmount&&item.legacyAmount)prior.legacyAmount=item.legacyAmount;
  prior.active=prior.active!==false||item.active!==false;
  aliases.set(item.id,prior.id);changed=true;
 }
 if(!changed)return false;
 snapshot.fixedExpenses=result;
 for(const list of [snapshot.expenses,snapshot.trash])for(const entry of list||[]){
  if(aliases.has(entry.fixedExpenseId))entry.fixedExpenseId=aliases.get(entry.fixedExpenseId);
 }
 return true;
}
