const STOPWORDS=new Set([
  'a','al','algo','con','de','del','el','en','la','las','lo','los','mi','mis','para','por','que','un','una','unos','unas',
  'pague','pago','gaste','gasto','compre','compra','comprar','pesos','peso','dolares','dolar','usd','efectivo','debito','credito',
  'tarjeta','banco','cuota','cuotas','hoy','ayer','anteayer'
]);

export function normalizeCategoryConcept(value){
  return String(value||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function categoryConceptTokens(value){
  return normalizeCategoryConcept(value)
    .split(' ')
    .filter((token)=>token.length>=3&&!STOPWORDS.has(token)&&!/^[0-9]+$/.test(token));
}

function ruleKey(concept){
  const tokens=categoryConceptTokens(concept);
  return tokens.join(' ');
}

export function learnCategoryRule(rules,concept,category,subcategory=''){
  const phrase=ruleKey(concept);
  if(!phrase||!category)return Array.isArray(rules)?rules:[];
  const list=Array.isArray(rules)?rules.map((rule)=>({...rule})):[];
  const existing=list.find((rule)=>rule.phrase===phrase);
  if(existing){
    existing.category=category;
    existing.subcategory=subcategory||'';
    existing.updatedAt=new Date().toISOString();
    existing.uses=Number(existing.uses||0)+1;
  }else{
    list.push({phrase,category,subcategory:subcategory||'',uses:1,updatedAt:new Date().toISOString()});
  }
  return list;
}

function scoreRule(rule,conceptPhrase,conceptTokens){
  const phrase=normalizeCategoryConcept(rule?.phrase||'');
  if(!phrase)return 0;
  if(phrase===conceptPhrase)return 1000+phrase.length;
  const ruleTokens=phrase.split(' ').filter(Boolean);
  if(!ruleTokens.length)return 0;
  const tokenSet=new Set(conceptTokens);
  const allPresent=ruleTokens.every((token)=>tokenSet.has(token));
  if(allPresent)return 700+ruleTokens.length*20+phrase.length;
  if(conceptPhrase.includes(phrase)||phrase.includes(conceptPhrase))return 500+Math.min(phrase.length,conceptPhrase.length);
  return 0;
}

export function matchCategoryRule(rules,concept){
  const conceptPhrase=ruleKey(concept);
  if(!conceptPhrase)return null;
  const conceptTokens=conceptPhrase.split(' ').filter(Boolean);
  const matches=(Array.isArray(rules)?rules:[])
    .map((rule)=>({rule,score:scoreRule(rule,conceptPhrase,conceptTokens)}))
    .filter((entry)=>entry.score>0)
    .sort((a,b)=>b.score-a.score);
  if(!matches.length)return null;
  const best=matches[0];
  const tied=matches.filter((entry)=>entry.score===best.score);
  const destinations=new Set(tied.map(({rule})=>`${rule.category}::${rule.subcategory||''}`));
  if(destinations.size>1)return null;
  return {category:best.rule.category,subcategory:best.rule.subcategory||'',score:best.score,phrase:best.rule.phrase};
}

export function applyLearnedCategory(item,rules){
  if(!item||item.category)return item;
  const match=matchCategoryRule(rules,item.concept);
  if(!match)return {...item,categoryStatus:'unclassified'};
  return {...item,category:match.category,subcategory:match.subcategory,categoryStatus:'learned',categoryLearnedFrom:match.phrase};
}
