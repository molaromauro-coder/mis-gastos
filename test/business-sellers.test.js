import test from 'node:test';import assert from 'node:assert/strict';
import {saveSeller,assignSeller,sellerBalances} from '../negocio/sellers.js';
import {ticketMetrics,portfolioMetrics} from '../negocio/metrics.js';
test('different vendors receive their own net-profit rates',()=>{
  const a=assignSeller({id:'a',cost:100,salePrice:200,status:'Vendida'},{id:'a',name:'Uno',percent:20});
  const b=assignSeller({id:'b',cost:100,salePrice:200,status:'Vendida'},{id:'b',name:'Dos',percent:40});
  assert.equal(ticketMetrics(a).sellerGain,20);assert.equal(ticketMetrics(b).sellerGain,40);
  const totals=portfolioMetrics([{tickets:[a,b]}]);assert.equal(totals.sellerGain,60);assert.equal(totals.ownerGain,140);assert.equal(totals.totalForOwner,340);
});
test('changing seller settings preserves prior sale rate and unknown fields',()=>{const t=assignSeller({id:'t',cost:100,salePrice:200,status:'Vendida',note:'keep'},{id:'x',name:'Uno',percent:20});const r={sellers:[{id:'x',name:'Uno',percent:20}],parties:[{tickets:[t]}]};const next=saveSeller(r,{id:'x',name:'Uno',percent:40});assert.equal(next.parties[0].tickets[0].sellerPercent,20);assert.equal(ticketMetrics(next.parties[0].tickets[0]).sellerGain,20);assert.equal(next.parties[0].tickets[0].note,'keep');assert.equal(r.sellers[0].percent,20);});
test('seller balances exclude available and personal tickets',()=>{const tickets=['Vendida','Disponible','Uso personal'].map((status,i)=>assignSeller({id:String(i),cost:100,salePrice:200,status},{id:'x',name:'Uno',percent:20}));assert.equal(sellerBalances({parties:[{tickets}]})[0].commission,20);});
test('invalid percentages, duplicate names, inactive assignment are rejected',()=>{assert.throws(()=>saveSeller({},{name:'Uno',percent:101}));assert.throws(()=>saveSeller({sellers:[{id:'x',name:'Uno'}]},{name:'uno',percent:30}));assert.throws(()=>assignSeller({},{id:'x',name:'Uno',percent:30,active:false}));});
test('cambiar el reparto general congela el anterior sin modificar el origen',async()=>{const {freezeExistingSplit}=await import('../negocio/sellers.js');const old={ownerPercent:75,sellerPercent:25,parties:[{tickets:[{id:'old',cost:100,salePrice:200,status:'Vendida'}]}]};const next=freezeExistingSplit(old);next.ownerPercent=60;next.sellerPercent=40;assert.equal(ticketMetrics(next.parties[0].tickets[0],next).sellerGain,25);assert.equal(old.parties[0].tickets[0].sellerId,undefined);});
