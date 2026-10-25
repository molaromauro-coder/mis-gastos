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

export function removeFixedExpenseDefinitions(snapshot,ids){
 const removed=(snapshot.fixedExpenses||[]).filter(x=>ids.includes(x.id));
 snapshot.fixedExpenses=(snapshot.fixedExpenses||[]).filter(x=>!ids.includes(x.id));
 for(const item of removed){
  const category=categoryBaseName(item.category),name=categoryBaseName(item.subcategory||item.concept);
  const remains=snapshot.fixedExpenses.some(x=>categoryBaseName(x.category)===category&&categoryBaseName(x.subcategory||x.concept)===name);
  if(remains)continue;
  for(const key of Object.keys(snapshot.subcategories||{}))if(categoryBaseName(key)===category){
   snapshot.subcategories[key]=snapshot.subcategories[key].filter(x=>categoryBaseName(x)!==name);
  }
 }
 return removed.length;
}

export function syncFixedCategories(snapshot){
 let changed=false;snapshot.categories ||= [];snapshot.subcategories ||= {};
 for(const item of snapshot.fixedExpenses||[]){
  if(!item.category)continue;
  const category=snapshot.categories.find(c=>categoryBaseName(c)===categoryBaseName(item.category))||item.category;
  if(!snapshot.categories.includes(category)){snapshot.categories.push(category);changed=true;}
  const name=item.subcategory||item.concept;if(!name)continue;
  const list=snapshot.subcategories[category] ||= [];
  const canonical=list.find(s=>categoryBaseName(s)===categoryBaseName(name))||name;
  if(!list.includes(canonical)){list.push(canonical);changed=true;}
  if(item.category!==category||item.subcategory!==canonical){item.category=category;item.subcategory=canonical;changed=true;}
 }
 return changed;
}

export function renameFixedDefinition(snapshot,item,data){
 if(!item)return;
 const old=item.subcategory||item.concept;
 // Editing the card title renames its linked subcategory when no different one was selected.
 if(data.concept!==item.concept&&data.subcategory===item.subcategory)data.subcategory=data.concept;
 if(data.category===item.category&&data.subcategory&&data.subcategory!==old){
  for(const category of Object.keys(snapshot.subcategories||{}))if(categoryBaseName(category)===categoryBaseName(item.category)){
   snapshot.subcategories[category]=[...new Set(snapshot.subcategories[category].map(s=>categoryBaseName(s)===categoryBaseName(old)?data.subcategory:s))];
  }
  const update=e=>{if(categoryBaseName(e.category)===categoryBaseName(item.category)&&categoryBaseName(e.subcategory)===categoryBaseName(old)){e.subcategory=data.subcategory;if(e.fixedExpenseId===item.id)e.concept=data.concept;}};
  for(const key of ['expenses','stock','recurring','categoryRules'])for(const e of snapshot[key]||[])update(e);
  for(const entry of snapshot.trash||[])for(const e of entry.items||[])update(e);
  for(const e of snapshot.fixedExpenses||[])if(e.id!==item.id&&categoryBaseName(e.category)===categoryBaseName(item.category)&&categoryBaseName(e.subcategory||e.concept)===categoryBaseName(old)){e.subcategory=data.subcategory;e.concept=data.concept;}
 }
}
