export const TEXT_SCALES=[1,1.5,1.8,2.3];
export function normalizeTextScale(value){return TEXT_SCALES.includes(Number(value))?Number(value):1;}
export function scaledFontRules(rules){
  return Array.from(rules||[]).map((rule)=>{
    if(rule.selectorText&&rule.style){
      const value=rule.style.getPropertyValue('font-size');
      if(!/^\d+(?:\.\d+)?px$/.test(value))return '';
      const priority=rule.style.getPropertyPriority('font-size');
      return `${rule.selectorText}{font-size:calc(${value} * var(--app-font-scale,1))${priority?' !important':''}}`;
    }
    if(rule.cssRules){
      const body=scaledFontRules(rule.cssRules);
      const header=rule.cssText.slice(0,rule.cssText.indexOf('{'));
      return body&&/^@(media|supports|layer|container)\b/.test(header)?`${header}{${body}}`:'';
    }
    return '';
  }).join('\n');
}
export function installTextScaling(doc){
  const sheet=doc.createElement('style');sheet.id='app-text-scaling';
  const fonts=[];
  for(const source of Array.from(doc.styleSheets||[])){
    try{fonts.push(scaledFontRules(source.cssRules));}catch{ /* only same-origin app styles */ }
  }
  sheet.textContent=':root{font-size:calc(16px * var(--app-font-scale,1))}\n'+fonts.join('\n');
  doc.head.append(sheet);
  const labelTables=()=>{
    for(const table of doc.querySelectorAll?.('table')||[]){
      const labels=Array.from(table.querySelectorAll('thead th')).map((cell)=>cell.textContent.trim());
      for(const row of table.querySelectorAll('tbody tr,tfoot tr'))Array.from(row.children).forEach((cell,index)=>{if(labels[index])cell.dataset.label=labels[index];});
    }
  };
  labelTables();
  const Observer=doc.defaultView?.MutationObserver;
  if(Observer)new Observer(labelTables).observe(doc.body,{childList:true,subtree:true});
  let last=null;
  return (value)=>{
    const scale=normalizeTextScale(value);if(last===scale)return scale;
    last=scale;doc.documentElement.style.setProperty('--app-font-scale',String(scale));
    doc.documentElement.toggleAttribute('data-large-text',scale>1);return scale;
  };
}
export function clampZoom(value){return Math.max(1,Math.min(4,Number(value)||1));}
export function pinchGeometry(initial,start,current,width,height){
  const distance=(points)=>Math.hypot(points[0].clientX-points[1].clientX,points[0].clientY-points[1].clientY);
  const mid=(points)=>({x:(points[0].clientX+points[1].clientX)/2,y:(points[0].clientY+points[1].clientY)/2});
  const a=mid(start),b=mid(current),scale=clampZoom(initial.scale*distance(current)/Math.max(1,distance(start)));
  const x=initial.x+(b.x-a.x)-(a.x-initial.left)*(scale/initial.scale-1);
  const y=initial.y+(b.y-a.y)-(a.y-initial.top)*(scale/initial.scale-1);
  return {scale,x:Math.max(-width*(scale-1),Math.min(0,x)),y:Math.max(-height*(scale-1),Math.min(0,y))};
}

// Magnification is a view-only camera. It never reads or writes app records.
export function installViewZoom(doc,win){
  const views=new WeakMap();let gesture=null,lastTap=null,suppressUntil=0,queued=null;
  const now=()=>Date.now();
  const viewFor=(target)=>target?.closest?.('dialog')||doc.querySelector('.app');
  const stateFor=(view)=>views.get(view)||{scale:1,x:0,y:0};
  const apply=(view,value)=>{
    views.set(view,value);
    view.style.setProperty('--view-zoom',String(value.scale));
    view.style.setProperty('--view-pan-x',value.x+'px');view.style.setProperty('--view-pan-y',value.y+'px');
    view.toggleAttribute('data-view-zoomed',value.scale>1);
  };
  const cancelQueued=()=>{if(queued){win.clearTimeout(queued.timer);queued=null;}};
  const reset=(view)=>{cancelQueued();gesture=null;lastTap=null;suppressUntil=now()+400;if(view)apply(view,{scale:1,x:0,y:0});};
  const block=(event)=>{if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();};
  const points=(touches)=>Array.from(touches).slice(0,2).map(({clientX,clientY,identifier})=>({clientX,clientY,identifier}));
  doc.addEventListener('touchstart',(event)=>{
    const view=viewFor(event.target);if(!view)return;
    const initial=stateFor(view),rect=view.getBoundingClientRect();
    if(event.touches.length>=2){
      cancelQueued();lastTap=null;
      // Cancel a one-finger hold before the second finger becomes a pinch.
      const firstTarget=gesture?.target;
      if(firstTarget)firstTarget.dispatchEvent(new win.Event('touchcancel',{bubbles:true}));
      gesture={view,target:event.target,pinch:true,start:points(event.touches),initial:{...initial,left:rect.left,top:rect.top},width:rect.width/initial.scale,height:rect.height/initial.scale};
      block(event);return;
    }
    if(event.touches.length===1){
      const point=points(event.touches)[0];
      gesture={view,target:event.target,start:[point],initial,width:rect.width/initial.scale,height:rect.height/initial.scale,time:now(),moved:false};
    }
  },{capture:true,passive:false});
  doc.addEventListener('touchmove',(event)=>{
    if(!gesture)return;
    if(gesture.pinch){
      if(event.touches.length<2)return;
      apply(gesture.view,pinchGeometry(gesture.initial,gesture.start,points(event.touches),gesture.width,gesture.height));block(event);return;
    }
    if(event.touches.length!==1)return;
    const p=points(event.touches)[0],a=gesture.start[0],dx=p.clientX-a.clientX,dy=p.clientY-a.clientY;
    if(Math.hypot(dx,dy)>8)gesture.moved=true;
    if(gesture.initial.scale<=1||!gesture.moved||gesture.target.closest?.('input,select,textarea,.drag-selected'))return;
    cancelQueued();lastTap=null;
    if(!gesture.panning){
      const active=gesture;
      active.target.dispatchEvent(new win.Event('touchcancel',{bubbles:true}));
      gesture=active;
    }
    const scale=gesture.initial.scale;
    apply(gesture.view,{scale,x:Math.max(-gesture.width*(scale-1),Math.min(0,gesture.initial.x+dx)),y:Math.max(-gesture.height*(scale-1),Math.min(0,gesture.initial.y+dy))});
    const camera=stateFor(gesture.view);
    if(Math.abs(dx)<8&&((dy>0&&camera.y===0)||(dy<0&&camera.y===-gesture.height*(scale-1))))return;
    gesture.panning=true;block(event);
  },{capture:true,passive:false});
  doc.addEventListener('touchend',(event)=>{
    if(!gesture)return;
    if(gesture.pinch||gesture.panning){
      block(event);suppressUntil=now()+400;if(!event.touches.length)gesture=null;return;
    }
    const g=gesture;gesture=null;
    if(g.moved||now()-g.time>300){lastTap=null;return;}
    const point=points(event.changedTouches)[0]||g.start[0];
    if(stateFor(g.view).scale>1&&lastTap?.view===g.view&&now()-lastTap.time<=300&&Math.hypot(point.clientX-lastTap.x,point.clientY-lastTap.y)<30){reset(g.view);block(event);return;}
    lastTap={view:g.view,time:now(),x:point.clientX,y:point.clientY};
  },{capture:true,passive:false});
  doc.addEventListener('touchcancel',()=>{gesture=null;lastTap=null;cancelQueued();},{capture:true});
  doc.addEventListener('click',(event)=>{
    if(event.__viewZoomReplay)return;
    if(now()<suppressUntil){block(event);return;}
    const view=viewFor(event.target);if(!view||stateFor(view).scale<=1||event.isTrusted===false)return;
    const control=event.target.closest?.('button,a,summary,label');if(!control)return;
    block(event);if(queued){const prior=queued;cancelQueued();prior.replay();}
    const replay=()=>{
      if(control.isConnected===false||control.disabled)return;
      const replay=new win.MouseEvent('click',{bubbles:true,cancelable:true,view:win});
      replay.__viewZoomReplay=true;control.dispatchEvent(replay);
    };
    queued={replay,timer:win.setTimeout(()=>{queued=null;replay();},310)};
  },{capture:true});
  doc.addEventListener('dblclick',(event)=>{
    const view=viewFor(event.target);if(view&&stateFor(view).scale>1){reset(view);block(event);}
  },{capture:true});
  return {reset:(target)=>reset(viewFor(target)),state:(target)=>({...stateFor(viewFor(target))})};
}

export function installButtonFeedback(doc,win){
  let audio=null;const lastPress=new WeakMap(),timers=new WeakMap();
  function tone(){
    try{
      const Context=win.AudioContext||win.webkitAudioContext;if(!Context)return;
      audio||=new Context();
      const play=()=>{try{
        const osc=audio.createOscillator(),gain=audio.createGain();
        osc.frequency.value=540;gain.gain.setValueAtTime(.018,audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.04);
        osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.045);
      }catch{}};
      if(audio.state==='suspended')audio.resume().then(play).catch(()=>{});else play();
    }catch{}
  }
  function respond(control){
    if(!control||control.disabled||control.closest?.('[inert]'))return;
    lastPress.set(control,Date.now());
    control.classList.add('button-tap-feedback');win.clearTimeout(timers.get(control));
    timers.set(control,win.setTimeout(()=>control.classList.remove('button-tap-feedback'),220));
    try{
      const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      control.animate?.(reduced?[{opacity:1},{opacity:.75},{opacity:1}]:[{scale:1},{scale:.94},{scale:1}],{duration:190,easing:'ease-out'});
    }catch{}
    try{win.navigator.vibrate?.(10);}catch{}
    tone();
  }
  const press=(event)=>{
    if(event.isPrimary===false||event.button>0||event.touches?.length>1)return;
    respond(event.target.closest?.('button,[role="button"],summary'));
  };
  if('PointerEvent' in win)doc.addEventListener('pointerdown',press,{capture:true,passive:true});
  else doc.addEventListener('touchstart',press,{capture:true,passive:true});
  doc.addEventListener('click',(event)=>{
    if(event.isTrusted===false||event.__viewZoomReplay)return;
    const control=event.target.closest?.('button,[role="button"],summary');
    if(control&&(Date.now()-(lastPress.get(control)||0)>350))respond(control);
  },{capture:true,passive:true});
  return {respond};
}
