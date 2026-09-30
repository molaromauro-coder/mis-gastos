function purchaseDate(item){
  const value=item?.purchaseDate||item?.date||item?.dueDate;
  const d=value?new Date(value):null;
  return d&&Number.isFinite(d.getTime())?d:null;
}

export function monthBounds(now=new Date()){
  const start=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
  const next=new Date(now.getFullYear(),now.getMonth()+1,1,0,0,0,0);
  return {start,next};
}

function groupByPurchase(items){
  const groups=new Map();
  for(const item of items||[]){
    const key=item?.parentId||item?.id||crypto.randomUUID?.()||String(Math.random());
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}

export function currentMonthExpenseCount(state,now=new Date()){
  const {start,next}=monthBounds(now);
  return (state?.expenses||[]).filter((item)=>{
    const d=purchaseDate(item);
    return d&&d>=start&&d<next;
  }).length;
}

export function previousMonthExpenseCount(state,now=new Date()){
  const {start}=monthBounds(now);
  return (state?.expenses||[]).filter((item)=>{
    const d=purchaseDate(item);
    return d&&d<start;
  }).length;
}

export function moveCurrentMonthExpensesToTrash(state,now=new Date()){
  const {start,next}=monthBounds(now);
  const removed=[],kept=[];
  for(const item of state.expenses||[]){
    const d=purchaseDate(item);
    if(d&&d>=start&&d<next)removed.push(item);
    else kept.push(item);
  }
  state.expenses=kept;
  state.trash=Array.isArray(state.trash)?state.trash:[];
  const deletedAt=now.toISOString();
  for(const items of groupByPurchase(removed)){
    state.trash.push({
      id:crypto.randomUUID?.()||('trash-'+Date.now()+'-'+Math.random().toString(16).slice(2)),
      deletedAt,
      items
    });
  }
  return {removed:removed.length,trashRecords:groupByPurchase(removed).length};
}

export function permanentlyDeletePreviousMonths(state,now=new Date()){
  const {start}=monthBounds(now);
  let removedActive=0,removedTrashItems=0;

  state.expenses=(state.expenses||[]).filter((item)=>{
    const d=purchaseDate(item);
    const remove=!!(d&&d<start);
    if(remove)removedActive++;
    return !remove;
  });

  const nextTrash=[];
  for(const record of state.trash||[]){
    const keptItems=(record.items||[]).filter((item)=>{
      const d=purchaseDate(item);
      const remove=!!(d&&d<start);
      if(remove)removedTrashItems++;
      return !remove;
    });
    if(keptItems.length)nextTrash.push({...record,items:keptItems});
  }
  state.trash=nextTrash;

  return {removedActive,removedTrashItems,totalRemoved:removedActive+removedTrashItems};
}

export function mirrorResetIntoSnapshot(snapshot,state){
  if(!snapshot)return;
  snapshot.expenses=structuredClone(state.expenses||[]);
  snapshot.trash=structuredClone(state.trash||[]);
}


export function verifyNoCurrentMonthExpenses(state,now=new Date()){
  return currentMonthExpenseCount(state,now)===0;
}

export function verifyNoPreviousMonthExpenses(state,now=new Date()){
  return previousMonthExpenseCount(state,now)===0;
}
