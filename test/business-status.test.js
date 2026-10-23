import test from 'node:test';import assert from 'node:assert/strict';
import {ticketMetrics,partyMetrics,portfolioMetrics,withPortfolioPercent} from '../negocio/metrics.js';
import {sellerBalances} from '../negocio/sellers.js';import {simulateSale} from '../negocio/simulator.js';
const ticket=status=>({id:'t',cost:100,salePrice:180,status,sellerId:'s',sellerName:'Ale',sellerPercent:25});
test('uso personal excluye cada importe, incluso si conserva un precio de venta previo',()=>{
 const t=ticket('Uso personal'),m=ticketMetrics(t);for(const k of ['cost','salePrice','recovered','netGain','gainPercent','ownerGain','sellerGain'])assert.equal(m[k],0,k);
 const p=withPortfolioPercent(portfolioMetrics([{tickets:[t]}]));for(const k of ['investment','sales','recovered','netGain','ownerGain','sellerGain','totalForOwner','currentInvestment','available','sold'])assert.equal(p[k],0,k);
 assert.equal(p.personal,1);assert.equal(t.cost,100);assert.equal(t.salePrice,180);assert.equal(sellerBalances({parties:[{tickets:[t]}]}).length,0);
 assert.throws(()=>simulateSale({tickets:[t],quantity:1,value:200}),/stock/);
});
test('cambiar entre los tres estados recalcula sin borrar costo, venta ni porcentaje',()=>{
 const t=ticket('Vendida'),p={tickets:[t]},initial=partyMetrics(p);assert.equal(initial.sales,180);assert.equal(initial.sellerGain,20);
 t.status='Uso personal';assert.equal(partyMetrics(p).investment,0);
 t.status='Disponible';assert.equal(partyMetrics(p).investment,100);assert.equal(partyMetrics(p).sales,0);assert.equal(partyMetrics(p).available,1);
 t.status='Vendida';assert.deepEqual(partyMetrics(p),initial);assert.equal(t.sellerPercent,25);
});
test('simulación con vendedores distintos respeta el reparto de cada entrada',()=>{
 const a={...ticket('Disponible'),sellerPercent:20},b={...ticket('Disponible'),id:'b',sellerPercent:40};
 const r=simulateSale({tickets:[a,b,ticket('Uso personal')],quantity:2,value:200,ownerPercent:99});assert.equal(r.sellerGain,60);assert.equal(r.ownerGain,140);assert.equal(r.totalOwner,340);assert.equal(a.status,'Disponible');
});
