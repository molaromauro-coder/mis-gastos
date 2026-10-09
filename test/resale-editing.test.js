import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseLocalizedNumber} from '../numeric-format.js';
import {partyMetrics} from '../resale.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const bindSource=source.slice(source.indexOf('function currentResaleTicketForRow('),source.indexOf('function renderResale('));
function fixture(){
  const party={id:'party',tickets:Array.from({length:6},(_,i)=>({id:'ticket-'+i,cost:43700,salePrice:0,status:'Vendida'}))};
  const state={resale:{parties:[party]},expenses:[{id:'expense',amount:21000,date:'2026-10-08'}],cards:[{id:'card',closingDate:'2026-10-20',dueDate:'2026-11-10'}]};
  let stored='';const updates=[];
  const api=runInNewContext(bindSource+';({bind:bindResaleTicketEditors,commit:saveAllResaleSales})',{
    state,parseLocalizedNumber,Number,STORAGE_KEY:'test-state',parseStoredState:JSON.parse,localStorage:{getItem:()=>stored},document:{querySelectorAll:()=>rows.map((item)=>item.row)},save:()=>{stored=JSON.stringify(state);},
    renderResale:(options)=>updates.push(options.totalsOnly),showToast:()=>{}
  });
  const rows=party.tickets.map((ticket,index)=>{
    const price=new EventTarget();Object.assign(price,{value:'0',focus(){this.focused=true;},select(){}});
    const status={value:ticket.status};
    const row={dataset:{partyId:party.id,ticketIndex:String(index)},querySelector:(selector)=>selector==='.resale-price'?price:status};
    api.bind(row,party,ticket);return {price,status,row};
  });
  return {state,party,rows,updates,commit:api.commit,reload:()=>JSON.parse(stored)};
}
test('seis ventas consecutivas se guardan antes de salir del campo y sobreviven al recargar',()=>{
  const f=fixture();const protectedData=JSON.stringify({expenses:f.state.expenses,cards:f.state.cards});
  f.rows.forEach(({price},index)=>{
    price.value='65.000';price.dispatchEvent(new Event('input'));
    assert.equal(f.reload().resale.parties[0].tickets[index].salePrice,65000);
    price.dispatchEvent(new Event('change'));price.dispatchEvent(new Event('blur'));
    assert.deepEqual(f.party.tickets.slice(0,index+1).map((item)=>item.salePrice),Array(index+1).fill(65000));
  });
  const loaded=f.reload();assert.equal(partyMetrics(loaded.resale.parties[0],{ownerPercent:70,sellerPercent:30}).sales,390000);
  assert.equal(JSON.stringify({expenses:loaded.expenses,cards:loaded.cards}),protectedData);
  assert.ok(f.updates.every(Boolean),'editar una venta sólo refresca balances, sin reconstruir los campos');
});
test('cambiar el estado de otra entrada mantiene los importes ya cargados',()=>{
  const f=fixture();f.rows[0].price.value='65.000,50';f.rows[0].price.dispatchEvent(new Event('input'));
  f.rows[1].status.value='Disponible';f.rows[1].status.onchange();
  assert.equal(f.reload().resale.parties[0].tickets[0].salePrice,65000.5);
  assert.equal(f.rows[0].price.value,'65.000,50');
});
test('corregir o borrar un importe modifica sólo la entrada seleccionada',()=>{
  const f=fixture();
  for(const {price} of f.rows){price.value='65.000';price.dispatchEvent(new Event('input'));}
  f.rows[2].price.value='70.000';f.rows[2].price.dispatchEvent(new Event('input'));
  f.rows[4].price.value='';f.rows[4].price.dispatchEvent(new Event('input'));
  assert.deepEqual(f.reload().resale.parties[0].tickets.map((item)=>item.salePrice),[65000,65000,70000,65000,0,65000]);
});

test('identificadores repetidos no hacen que seis campos actualicen una sola entrada',()=>{
  const f=fixture();f.party.tickets.forEach((ticket)=>ticket.id='legacy-duplicate');
  f.rows.forEach(({price},index)=>{price.value=String(65000+index*1000);price.dispatchEvent(new Event('input'));});
  assert.deepEqual(f.reload().resale.parties[0].tickets.map((ticket)=>ticket.salePrice),[65000,66000,67000,68000,69000,70000]);
});
test('el guardado usa el estado actual aunque se haya reemplazado el objeto de entradas',()=>{
  const f=fixture();f.state.resale=structuredClone(f.state.resale);
  f.rows[0].price.value='65.000';f.rows[0].price.dispatchEvent(new Event('input'));
  assert.equal(f.reload().resale.parties[0].tickets[0].salePrice,65000);
});

test('Guardar ventas verifica los seis campos juntos incluso sin eventos input o blur',()=>{
  const f=fixture();const original=JSON.stringify({expenses:f.state.expenses,cards:f.state.cards});
  f.rows.forEach(({price})=>price.value='65.000');f.commit();
  const loaded=f.reload();assert.deepEqual(loaded.resale.parties[0].tickets.map((ticket)=>ticket.salePrice),Array(6).fill(65000));
  assert.equal(JSON.stringify({expenses:loaded.expenses,cards:loaded.cards}),original);
});
