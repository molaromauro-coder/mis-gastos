export function hiddenFeatureIds(settings,available,defaults=[]){
 const explicit=Array.isArray(settings?.hiddenFeatureIds);
 const known=Array.isArray(settings?.featureVisibilityKnownIds)?settings.featureVisibilityKnownIds:available;
 const ids=explicit?[...settings.hiddenFeatureIds,...defaults.filter(id=>!known.includes(id))]:defaults;
 return [...new Set(ids.filter(id=>available.includes(id)&&id!=='home'&&id!=='hiddenFunctions'))];
}
export function setFeatureHidden(settings,id,hidden,available,defaults=[]){
 if(!available.includes(id)||id==='home'||id==='hiddenFunctions')throw new Error('Función no disponible');
 const ids=hiddenFeatureIds(settings,available,defaults);
 return {...settings,featureVisibilityKnownIds:[...available],hiddenFeatureIds:hidden?[...new Set([...ids,id])]:ids.filter(x=>x!==id)};
}
export function mergeVisibleFeatureOrder(order,visibleOrder){
 const visible=new Set(visibleOrder),queue=[...visibleOrder];
 return order.map(id=>visible.has(id)?queue.shift():id);
}
