import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const code=readFileSync(new URL('../app.js',import.meta.url),'utf8').split('function installPointerReorder(')[1].split('function installMainMenuReorder(')[0];
function fixture(horizontal=false){
  class Element extends EventTarget{
    constructor(index=0){super();this.dataset={reorderIndex:String(index)};this.style={};this.children=[];this.parentElement=null;this.scrollHeight=0;this.clientHeight=0;this.classes=new Set();this.classList={add:(...names)=>names.forEach((n)=>this.classes.add(n)),remove:(...names)=>names.forEach((n)=>this.classes.delete(n)),contains:(n)=>this.classes.has(n)};}
    getBoundingClientRect(){const i=Number(this.dataset.reorderIndex);return horizontal?{left:i*110,right:i*110+100,top:100,bottom:160,width:100,height:60}:{left:0,right:200,top:100+i*70,bottom:160+i*70,width:200,height:60};}
    querySelectorAll(selector){return selector==='[id]'||selector==='input,select,textarea'?[]:this.children;}
    closest(selector){return selector==='button.delete'?this.deleteButton?this:null:null;}
    cloneNode(){const clone=new Element(Number(this.dataset.reorderIndex));clone.classes=new Set(this.classes);return clone;}
    removeAttribute(){}
    setAttribute(){}
    appendChild(el){this.children.push(el);el.parentElement=this;}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter((el)=>el!==this);}
  }
  const document=new Element(),container=new Element(),moves=[],timers=new Map();let nextTimer=1;
  for(let i=0;i<3;i++)container.appendChild(new Element(i));
  const window={ontouchstart:null,getSelection:()=>({removeAllRanges(){}})};
  const context={document,window,AbortController,Date,Math,Number,Infinity,navigator:{},innerHeight:800,getComputedStyle:()=>({overflowY:'visible'}),requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:(fn)=>{const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:(id)=>timers.delete(id)};
  const install=runInNewContext('function installPointerReorder('+code+'; installPointerReorder',context);
  install(container,'.row',(from,to)=>moves.push([from,to]),'button.delete');
  function event(target,type,x=50,y=130,id=7){
    const ev=new Event(type,{cancelable:true});
    const touch={identifier:id,clientX:x,clientY:y};
    Object.defineProperties(ev,{touches:{value:type==='touchend'?[]:[touch]},changedTouches:{value:[touch]}});
    target.dispatchEvent(ev);return ev;
  }
  const hold=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach((fn)=>fn());};
  return {document,container,moves,event,hold,install};
}

test('mantener y arrastrar desde una fila guarda destino y bloquea el click posterior',()=>{
  const f=fixture();f.event(f.container.children[0],'touchstart');f.hold();
  assert.equal(f.container.children.length,4,'la fila tiene vista flotante');
  assert.equal(f.event(f.document,'touchmove',60,275).defaultPrevented,true);
  assert.equal(f.event(f.document,'touchend',60,275).defaultPrevented,true);
  assert.deepEqual(f.moves,[[0,2]]);
  assert.equal(f.container.children.length,3,'se retira la vista flotante');
  const click=new Event('click',{cancelable:true});f.container.dispatchEvent(click);
  assert.equal(click.defaultPrevented,true);
});
test('un desplazamiento normal antes de mantener no mueve opciones ni bloquea scroll',()=>{
  const f=fixture();f.event(f.container.children[0],'touchstart');
  assert.equal(f.event(f.document,'touchmove',50,170).defaultPrevented,false);
  f.hold();f.event(f.document,'touchend',50,170);assert.deepEqual(f.moves,[]);
  assert.equal(f.container.children.length,3);
});
test('cancelar el gesto o levantar otro dedo no guarda un cambio',()=>{
  const f=fixture();f.event(f.container.children[0],'touchstart');f.hold();
  f.event(f.document,'touchend',50,270,8);assert.equal(f.container.children.length,4);
  f.event(f.document,'touchcancel');assert.equal(f.container.children.length,3);assert.deepEqual(f.moves,[]);
});
test('las opciones horizontales se pueden mover de izquierda a derecha',()=>{
  const f=fixture(true);f.event(f.container.children[0],'touchstart',50,130);f.hold();
  f.event(f.document,'touchmove',270,130);f.event(f.document,'touchend',270,130);
  assert.deepEqual(f.moves,[[0,2]]);
});
test('reinstalar los controles cancela un arrastre activo sin perder ni duplicar filas',()=>{
  const f=fixture();f.event(f.container.children[0],'touchstart');f.hold();
  f.install(f.container,'.row',()=>{});assert.equal(f.container.children.length,3);
  assert.deepEqual(f.moves,[]);
});
