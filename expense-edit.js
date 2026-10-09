import { installmentDueDates, dateWithCardDay, monthKey } from './finance.js';

const groupKey = (item) => item.parentId || item.id;
function localDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(value+'T12:00:00') : new Date(value);
}
export function expenseDateInput(value) {
  const d=localDate(value);
  if(!Number.isFinite(d.getTime()))return '';
  const pad=(n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function expenseEditModel(expenses,id) {
  const selected=expenses.find((item)=>item.id===id);
  if(!selected)throw new Error('Este gasto ya no está en la lista.');
  const key=groupKey(selected),items=expenses.filter((item)=>groupKey(item)===key);
  const first=items.find((item)=>Number(item.installment||1)===1)||selected;
  const installments=first.method==='Crédito'?Math.max(1,Number(first.installments||1)):1;
  const amount=first.parentId?Number(first.amount)*installments:Number(first.amount);
  return {key,items,first,amount,installments,purchaseDate:first.purchaseDate||first.date,
    firstDueDate:first.dueDate?expenseDateInput(first.dueDate).slice(0,10):''};
}

// The caller commits this result only after validation. Unrelated records and cards
// are never changed; editing any installment edits its original purchase once.
export function buildExpenseEdit(expenses,id,patch,cards,createId) {
  const model=expenseEditModel(expenses,id),first=model.first;
  const amount=Number(patch.amount),count=patch.method==='Crédito'?Number(patch.installments):1;
  if(!Number.isFinite(amount)||amount<=0)throw new Error('Ingresá un importe mayor a cero.');
  if(!['ARS','USD'].includes(patch.currency))throw new Error('Elegí pesos o dólares.');
  if(!['Efectivo','Débito','Crédito'].includes(patch.method))throw new Error('Elegí el medio de pago.');
  if(!Number.isInteger(count)||count<1||(count>48&&count!==model.installments))throw new Error('Revisá la cantidad de cuotas.');
  const bought=localDate(patch.purchaseDate);
  const calendar=String(patch.purchaseDate||'').slice(0,10),calendarDate=localDate(calendar);
  if(!Number.isFinite(bought.getTime())||!/^\d{4}-\d{2}-\d{2}$/.test(calendar)||expenseDateInput(calendarDate).slice(0,10)!==calendar)throw new Error('Revisá la fecha del gasto.');
  const card=cards.find((item)=>item.name===patch.card&&item.type===patch.method);
  if(patch.method!=='Efectivo'&&(!patch.card||(!card&&(patch.card!==first.card||patch.method!==first.method))))throw new Error('Elegí la tarjeta o cuenta usada.');
  const dateChanged=patch.purchaseDate!==model.purchaseDate;
  const creditChanged=patch.method!==first.method||patch.card!==first.card||count!==model.installments||dateChanged;
  let anchor=null;
  if(patch.method==='Crédito'&&patch.firstDueDate){
    anchor=localDate(patch.firstDueDate);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(patch.firstDueDate)||!Number.isFinite(anchor.getTime())||expenseDateInput(anchor).slice(0,10)!==patch.firstDueDate)throw new Error('Revisá el primer vencimiento.');
  }
  const dueChanged=patch.method==='Crédito'&&anchor&&patch.firstDueDate!==model.firstDueDate;
  const rebuild=creditChanged||dueChanged;
  if(patch.method==='Crédito'&&rebuild&&!anchor&&!card)throw new Error('Ingresá el primer vencimiento de esta tarjeta.');
  let dates=[];
  if(patch.method==='Crédito'&&rebuild){
    dates=anchor?Array.from({length:count},(_,i)=>dateWithCardDay(anchor.getFullYear(),anchor.getMonth()+i,anchor.getDate())):installmentDueDates(card,bought,count);
  }
  const updates={concept:String(patch.concept||'').trim()||'Sin detalle',category:patch.category||'',subcategory:patch.category?(patch.subcategory||''):'',
    currency:patch.currency,method:patch.method,card:patch.method==='Efectivo'?'':patch.card,installments:count};
  if(updates.category!==first.category||updates.subcategory!==first.subcategory)updates.categoryStatus=updates.category?'manual':'unclassified';
  const used=new Set();
  const indices=patch.method==='Crédito'&&first.method==='Crédito'&&count===model.installments&&(first.parentId||count===1||!rebuild)
    ?model.items.map((item)=>Math.max(0,Number(item.installment||1)-1))
    :Array.from({length:patch.method==='Crédito'?count:1},(_,i)=>i);
  const replacements=indices.map((i)=>{
    const old=model.items.find((item)=>Number(item.installment||1)===i+1)||(!i?first:null);
    let row={...(old||first),...updates,id:old?.id||createId()};
    if(used.has(row.id))row.id=createId();used.add(row.id);
    row.amount=amount===model.amount&&old&&!creditChanged?old.amount:(count>1&&(first.parentId||rebuild)?amount/count:amount);
    if(dateChanged){row.date=patch.purchaseDate;row.purchaseDate=patch.purchaseDate;}
    if(patch.method==='Crédito'){
      row.installment=i+1;
      if(count>1&&(first.parentId||rebuild))row.parentId=model.key;else delete row.parentId;
      if(rebuild)row.dueDate=dates[i].toISOString();
    }else{delete row.parentId;delete row.dueDate;delete row.installment;}
    if(first.currency!==patch.currency){
      for(const key of Object.keys(row).filter((key)=>key.startsWith('fx')))delete row[key];
      for(const [key,value] of Object.entries(patch).filter(([key])=>key.startsWith('fx')))row[key]=value;
    }
    if(patch.currency==='USD'&&patch.fxRate!==undefined){
      if(patch.fxRate!==''&&(!Number.isFinite(Number(patch.fxRate))||Number(patch.fxRate)<=0))throw new Error('Revisá la cotización histórica.');
      if(patch.fxRate==='')delete row.fxRate;else row.fxRate=Number(patch.fxRate);
    }
    if(dateChanged&&row.fixedExpenseMonth)row.fixedExpenseMonth=monthKey(bought);
    return row;
  });
  // Preserve list order, including existing installment positions.
  const next=[];
  let inserted=false;
  for(const item of expenses){
    if(groupKey(item)!==model.key){next.push(item);continue;}
    const replacement=replacements.find((row)=>row.id===item.id);
    if(replacement)next.push(replacement);
    if(!inserted){next.push(...replacements.filter((row)=>!model.items.some((old)=>old.id===row.id)));inserted=true;}
  }
  return {expenses:next,removedIds:model.items.filter((item)=>!replacements.some((row)=>row.id===item.id)).map((item)=>item.id)};
}

export function expenseTrashPositions(expenses,items) {
  return items.map((item)=>{
    const index=expenses.indexOf(item);
    return {id:item.id,index,before:expenses[index-1]?.id,after:expenses[index+1]?.id};
  });
}
export function restoreExpenseTrash(expenses,record) {
  const next=expenses.slice(),existing=new Set(expenses.map((item)=>item.id).filter(Boolean));
  for(const item of record.items||[]){
    if(item.id&&existing.has(item.id))continue;
    const position=record.positions?.find((entry)=>entry.id===item.id);
    const after=position?.after?next.findIndex((row)=>row.id===position.after):-1;
    const before=position?.before?next.findIndex((row)=>row.id===position.before):-1;
    const index=after>=0?after:before>=0?before+1:Number.isInteger(position?.index)?Math.min(Math.max(position.index,0),next.length):next.length;
    next.splice(index,0,{...item});if(item.id)existing.add(item.id);
  }
  return next;
}
