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
export function repairLegacyFeatureVisibility(settings,available,defaults=[]){
 if(Number(settings?.featureVisibilityControlVersion||0)>=2)return settings;
 const hidden=hiddenFeatureIds(settings,available,defaults),usual=available.filter(id=>!defaults.includes(id)&&!['home','hiddenFunctions'].includes(id));
 const inverted=Array.isArray(settings?.hiddenFeatureIds)&&usual.length>=4&&usual.every(id=>hidden.includes(id))&&['savings','budget'].every(id=>available.includes(id)&&!hidden.includes(id));
 return {...settings,...(inverted?{hiddenFeatureIds:[...new Set(defaults.filter(id=>available.includes(id)))],featureVisibilityKnownIds:[...available]}:{}),featureVisibilityControlVersion:2};
}
