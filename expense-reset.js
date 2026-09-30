export function resetExpenseData(state,snapshot=null){
  const clearArray=(owner,key)=>{
    if(Array.isArray(owner?.[key])) owner[key].splice(0,owner[key].length);
    else if(owner) owner[key]=[];
  };
  clearArray(state,'expenses');
  clearArray(state,'trash');
  if(snapshot){
    clearArray(snapshot,'expenses');
    clearArray(snapshot,'trash');
  }
  return state;
}
