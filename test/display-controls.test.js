import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {normalizeTextScale,scaledFontRules,installTextScaling,pinchGeometry,installViewZoom,installButtonFeedback,homeLayoutDensity,installHomeLayout} from '../display-controls.js';
const font=(selector,value,important='')=>({selectorText:selector,style:{getPropertyValue:()=>value,getPropertyPriority:()=>important}});
function harness(){
  const events={},timers=new Map();let next=1;
  const view={style:{values:{},setProperty(k,v){this.values[k]=v;}},toggleAttribute(k,v){this[k]=v;},getBoundingClientRect(){const scale=Number(this.style.values['--view-zoom']||1);return {left:Number.parseFloat(this.style.values['--view-pan-x']||0),top:Number.parseFloat(this.style.values['--view-pan-y']||0),width:400*scale,height:800*scale};}};
  const doc={addEventListener(name,handler){(events[name]||=[]).push(handler);},querySelector:()=>view};
  const win={navigator:{vibrate(n){win.pulses.push(n);}},pulses:[],PointerEvent:class{},Event:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},MouseEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},setTimeout(fn){timers.set(next,fn);return next++;},clearTimeout(id){timers.delete(id);}};
  const target={connected:true,isConnected:true,disabled:false,clicks:0,classes:new Set(),classList:{add(){},remove(){}},closest(selector){if(selector==='dialog'||selector.includes('input,select')||selector==='[inert]')return null;return this;},dispatchEvent(e){if(e.type==='click')this.clicks++;},animate(frames){this.animation=frames;}};
  const emit=(name,properties={})=>{const e={target,touches:[],changedTouches:[],cancelable:true,isTrusted:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...properties};for(const handler of events[name]||[]){handler(e);if(e.stopped)break;}return e;};
  const touch=(x,y)=>({clientX:x,clientY:y,identifier:x});
  const drain=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
  return {view,doc,win,target,emit,touch,drain,timers};
}
test('only requested font choices are accepted; missing old setting preserves ×1',()=>{
  for(const n of [1,1.2,1.3,1.5])assert.equal(normalizeTextScale(String(n)),n);
  assert.equal(normalizeTextScale(1.8),1.5);assert.equal(normalizeTextScale(2.3),1.5);assert.equal(normalizeTextScale(1.7),1.5);
  for(const n of [undefined,0,-1,2,NaN,Infinity])assert.equal(normalizeTextScale(n),1);
});
test('font scaling preserves media queries, specificity and important without cumulative multiplication',()=>{
  const rule={cssText:'@media (max-width: 450px) { }',cssRules:[font('#home strong','23px','important')]};
  assert.equal(scaledFontRules([font('button','14px'),rule,font('input','inherit')]),'button{font-size:calc(14px * var(--app-font-scale,1))}\n@media (max-width: 450px) {#home strong{font-size:calc(23px * var(--app-font-scale,1)) !important}}\n');
});
test('switching font size and back only updates presentation and creates one stylesheet',()=>{
  const root={values:{},style:{setProperty(k,v){root.values[k]=v;}},toggleAttribute(k,v){root[k]=v;}};
  const children=[];const doc={documentElement:root,styleSheets:[{cssRules:[font('button','14px')]}],createElement:()=>({}),head:{append:child=>children.push(child)}};
  const set=installTextScaling(doc);set(1.5);assert.equal(root['data-large-text'],true);set(1);set(1);
  assert.equal(root.values['--app-font-scale'],'1');assert.equal(root['data-large-text'],false);assert.equal(children.length,1);
  assert.match(children[0].textContent,/calc\(14px \* var/);
});
test('pinch stays anchored at its midpoint and clamps the camera',()=>{
  const initial={scale:1,x:0,y:0,left:0,top:0},start=[{clientX:100,clientY:200},{clientX:200,clientY:200}];
  assert.deepEqual(pinchGeometry(initial,start,[{clientX:50,clientY:200},{clientX:250,clientY:200}],400,800),{scale:2,x:-150,y:-200});
  assert.deepEqual(pinchGeometry(initial,start,start,400,800),{scale:1,x:0,y:0});
});
test('pinch persists after release and double tap resets without replaying a destructive button',()=>{
  const h=harness(),zoom=installViewZoom(h.doc,h.win),p=h.touch;
  h.emit('touchstart',{touches:[p(100,200),p(200,200)]});h.emit('touchmove',{touches:[p(50,200),p(250,200)]});h.emit('touchend');
  assert.equal(zoom.state(h.target).scale,2);
  // Pinch click suppression is deliberate; reset timing using a controllable clock.
  const original=Date.now;let time=original()+500;Date.now=()=>time;
  try{
    const tap=()=>{h.emit('touchstart',{touches:[p(150,200)]});h.emit('touchend',{changedTouches:[p(150,200)]});};
    tap();h.emit('click');assert.equal(h.target.clicks,0);time+=100;tap();h.emit('click');h.drain();
    assert.deepEqual(zoom.state(h.target),{scale:1,x:0,y:0});assert.equal(h.target.clicks,0);
  }finally{Date.now=original;}
});
test('single tap in a magnified view activates a button exactly once',()=>{
  const h=harness(),zoom=installViewZoom(h.doc,h.win),p=h.touch;
  h.emit('touchstart',{touches:[p(100,200),p(200,200)]});h.emit('touchmove',{touches:[p(50,200),p(250,200)]});h.emit('touchend');
  const original=Date.now;Date.now=()=>original()+500;
  try{h.emit('click');assert.equal(h.target.clicks,0);h.drain();assert.equal(h.target.clicks,1);assert.equal(zoom.state(h.target).scale,2);}finally{Date.now=original;}
});
test('normal size does not delay clicks or consume ordinary vertical scrolling',()=>{
  const h=harness();installViewZoom(h.doc,h.win);const p=h.touch;
  assert.equal(h.emit('click').prevented,undefined);
  h.emit('touchstart',{touches:[p(100,100)]});assert.equal(h.emit('touchmove',{touches:[p(100,50)]}).prevented,undefined);
});
test('all dynamic buttons receive feedback without replacing their positioning transform',()=>{
  const h=harness();installButtonFeedback(h.doc,h.win);h.emit('pointerdown');assert.deepEqual(h.win.pulses,[10]);
  assert.deepEqual(h.target.animation,[{scale:1},{scale:.94},{scale:1}]);assert.equal(h.target.animation.some(frame=>'transform' in frame),false);
});
test('disabled buttons and secondary touches do not respond',()=>{
  const h=harness();installButtonFeedback(h.doc,h.win);h.target.disabled=true;h.emit('pointerdown');h.target.disabled=false;h.emit('pointerdown',{isPrimary:false});
  assert.deepEqual(h.win.pulses,[]);
});
test('font preference saves only its setting, rolls back on failed storage, and leaves expense/card/resale values intact',()=>{
  const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const handler=source.slice(source.indexOf("$('#fontScale').onchange="),source.indexOf("$('#resetViewZoom').onclick="));
  const state={settings:{textScale:1},expenses:[{amount:65000,date:'2026-10-09',category:'Hogar',cardId:'a'}],cards:[{id:'a',closingDate:'2026-10-20',dueDate:'2026-11-10'}],cardPayments:[{amount:100}],resale:{parties:[{tickets:[{salePrice:65000}]}]}};
  const records=JSON.stringify([state.expenses,state.cards,state.cardPayments,state.resale]);const input={value:'1.5'},scales=[];let saved=true;
  vm.runInNewContext(handler,{state,$:()=>input,normalizeTextScale,displayFeatures:{setTextScale:s=>scales.push(s)},save:()=>saved,showToast:()=>{}});
  input.onchange();assert.equal(state.settings.textScale,1.5);assert.equal(JSON.stringify([state.expenses,state.cards,state.cardPayments,state.resale]),records);
  saved=false;input.value='1.3';input.onchange();assert.equal(state.settings.textScale,1.5);assert.equal(input.value,'1.5');assert.equal(JSON.stringify([state.expenses,state.cards,state.cardPayments,state.resale]),records);
});
test('large text gets vertical layout and offline cache includes the controller',()=>{
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(css,/:root\[data-large-text\][\s\S]*grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/data-view-zoomed[\s\S]*transform-origin:0 0/);assert.match(sw,/'\.\/display-controls\.js'/);
});

test('home reserves its own viewport and compacts overflowing cards before losing access to controls',()=>{
 const frames=[],main={clientHeight:700},home={dataset:{},classList:{contains:()=>true},get scrollHeight(){return this.dataset.density==='comfortable'?750:680;}};
 const doc={querySelector:s=>s==='#home'?home:s==='.app>main'?main:{}};
 const win={requestAnimationFrame:fn=>frames.push(fn),addEventListener:()=>{}};
 const controller=installHomeLayout(doc,win);controller.refresh();assert.equal(frames.length,1);frames.shift()();
 assert.equal(home.dataset.density,'compact');main.clientHeight=480;controller.refresh();frames.shift()();assert.equal(home.dataset.density,'tight');
 assert.equal(homeLayoutDensity(700),'comfortable');assert.equal(homeLayoutDensity(600),'compact');assert.equal(homeLayoutDensity(450),'tight');
});
