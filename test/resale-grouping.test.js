import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {groupResalePartiesByDate,partyMetrics} from '../resale.js';
import {formatNumericInputValue} from '../numeric-format.js';
const now=new Date(2026,9,9,23,30);
const parties=[
 {id:'past-old',name:'MAX STYLER',date:'2026-09-11',tickets:[{id:'t1',type:'GRAL',number:1,cost:26450,salePrice:55000,status:'Vendida'}]},
 {id:'future-far',name:'JOHN DIGWEED',date:'2027-01-23',tickets:[]},
 {id:'past-new',name:'NACHO SCOPPA',date:'2026-09-26',tickets:[]},
 {id:'today',name:'HOY',date:'2026-10-09',tickets:[]},
 {id:'future-close',name:'KEVIN DI SERNA',date:'2026-10-24',tickets:[]}
];
test('upcoming and finished events preserve the established chronological ordering and today remains upcoming',()=>{
 const before=structuredClone(parties);const groups=groupResalePartiesByDate(parties,now);
 assert.deepEqual(groups.upcoming.map((p)=>p.id),['today','future-close','future-far']);
 assert.deepEqual(groups.finished.map((p)=>p.id),['past-new','past-old']);assert.equal(groups.undated.length,0);
 assert.deepEqual(parties,before);
});
test('events move to finished after their calendar day without changing dates, tickets or sale amounts',()=>{
 const party=parties[3];assert.equal(groupResalePartiesByDate([party],now).upcoming[0],party);
 const tomorrow=new Date(2026,9,10,0,1);assert.equal(groupResalePartiesByDate([party],tomorrow).finished[0],party);
 const yearEnd={id:'year-end',date:'2026-12-31',tickets:[]};assert.equal(groupResalePartiesByDate([yearEnd],new Date(2027,0,1)).finished[0],yearEnd);
});
test('undated or invalid events remain accessible without being marked finished or modifying their dates',()=>{
 const unknown=[{id:'missing',name:'SIN FECHA',date:'',tickets:[]},{id:'invalid',name:'FECHA INVÁLIDA',date:'2026-02-30',tickets:[]}];
 const before=structuredClone(unknown),groups=groupResalePartiesByDate(unknown,now);
 assert.equal(groups.undated.length,2);assert.equal(groups.finished.length,0);assert.equal(groups.upcoming.length,0);assert.deepEqual(unknown,before);
});
function renderer(){
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=app.indexOf('function resalePartyCardHTML('),end=app.indexOf('function renderResale(',start);
 const context={groupResalePartiesByDate,partyMetrics,formatNumericInputValue,escape:(s)=>String(s||'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),integerText:String,money:(n)=>String(n),resaleTicketResultHTML:()=>'',resalePartyMetricsHTML:()=>''};
 vm.createContext(context);vm.runInContext(app.slice(start,end),context);return context.resaleGroupedCardsHTML;
}
test('two expandable cards preserve each event detail, saved sale price and open states after rendering',()=>{
 const split={ownerPercent:70,sellerPercent:30},before=structuredClone(parties);
 const list={querySelectorAll:(selector)=>selector.includes('data-resale-group')?[{dataset:{resaleGroup:'finished'}}]:[{dataset:{partyId:'past-old'}}]};
 const html=renderer()(parties,split,list,now);
 assert.equal((html.match(/class="resale-group"/g)||[]).length,2);assert.match(html,/Próximas fiestas/);assert.match(html,/Fiestas terminadas/);
 assert.ok(html.indexOf('data-resale-group="upcoming"')<html.indexOf('data-resale-group="finished"'));
 assert.match(html,/data-resale-group="finished" open/);assert.match(html,/data-party-id="past-old" open/);
 for(const party of parties) assert.equal((html.match(new RegExp(`<details class="resale-party" data-party-id="${party.id}"`,'g'))||[]).length,1);
 assert.match(html,/class="resale-price"[^>]*value="55\.000"/);assert.match(html,/data-ticket-index="0"/);assert.deepEqual(parties,before);
});
test('empty groups and events without dates remain reachable in the requested two-card layout',()=>{
 const list={querySelectorAll:()=>[]},split={ownerPercent:70,sellerPercent:30};
 const empty=renderer()([],split,list,now);assert.equal((empty.match(/class="resale-group"/g)||[]).length,2);assert.match(empty,/No hay próximas fiestas/);assert.match(empty,/Todavía no hay fiestas terminadas/);
 const undated=renderer()([{id:'undated',name:'SIN FECHA',date:'',tickets:[]}],split,list,now);assert.match(undated,/Sin fecha definida/);assert.match(undated,/data-party-id="undated"/);
 assert.ok(undated.indexOf('data-party-id="undated"')<undated.indexOf('data-resale-group="finished"'));
});
