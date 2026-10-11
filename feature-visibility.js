export function hiddenFeatureIds(settings,available,defaults=[]){
 const ids=Array.isArray(settings?.hiddenFeatureIds)?settings.hiddenFeatureIds:defaults;
 return [...new Set(ids.filter(id=>available.includes(id)&&id!=='home'&&id!=='hiddenFunctions'))];
}
export function setFeatureHidden(settings,id,hidden,available,defaults=[]){
 if(!available.includes(id)||id==='home'||id==='hiddenFunctions')throw new Error('Función no disponible');
 const ids=hiddenFeatureIds(settings,available,defaults);
 return {...settings,hiddenFeatureIds:hidden?[...new Set([...ids,id])]:ids.filter(x=>x!==id)};
}
export function mergeVisibleFeatureOrder(order,visibleOrder){
 const visible=new Set(visibleOrder),queue=[...visibleOrder];
 return order.map(id=>visible.has(id)?queue.shift():id);
}
