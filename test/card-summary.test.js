import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPurchasesInMonth, upcomingCardPayments, cardMonthSummary, cardStatementProjection, cardHistoryMonths, createCardPayment } from '../card-summary.js';
const card = { name:'Francés', type:'Crédito', closingDate:'2026-10-20', dueDate:'2026-11-10', closingDay:20, dueDay:10 };
const now = new Date(2026,9,9,12);
const installments = [0,1,2].map((i)=>({id:`part-${i}`,parentId:'purchase',card:card.name,method:'Crédito',purchaseDate:'2026-10-08T12:00:00Z',date:'2026-10-08T12:00:00Z',dueDate:new Date(Date.UTC(2026,10+i,10,12)).toISOString(),amount:10000,currency:'ARS',installment:i+1,installments:3}));
test('full purchases count once this month even when no installment is due yet',()=>{
 const expenses=[...installments,{id:'other',card:'Macro',method:'Crédito',date:'2026-10-08',amount:50}];
 const before=structuredClone(expenses), dates=structuredClone(card);
 const purchases=cardPurchasesInMonth(expenses,card,now);
 assert.equal(purchases.length,1); assert.equal(purchases[0].amount,30000);
 assert.deepEqual(expenses,before); assert.deepEqual(card,dates);
 assert.equal(upcomingCardPayments(expenses,card,now)[0].items.length,0);
});
test('monthly purchases exclude earlier purchases but upcoming bills include their installments',()=>{
 const previous={...installments[0],id:'previous',parentId:'old',purchaseDate:'2026-09-01',dueDate:'2026-10-10',amount:7000};
 const cash={...previous,id:'cash',method:'Efectivo',purchaseDate:'2026-10-08'};
 const expenses=[...installments,previous,cash];
 const payments=upcomingCardPayments(expenses,card,now);
 assert.deepEqual(payments.map((p)=>[p.date.getMonth(),p.items.reduce((s,e)=>s+e.amount,0)]),[[9,7000],[10,10000]]);
 assert.equal(cardPurchasesInMonth(expenses,card,now).reduce((s,e)=>s+e.amount,0),30000);
});
test('single-payment ARS and USD purchases retain separate currencies and full amounts',()=>{
 const expenses=[{...installments[0],id:'single',parentId:undefined,amount:20000,installments:1},{...installments[0],id:'usd',parentId:'usd-purchase',amount:50,currency:'USD',installments:2}];
 assert.deepEqual(cardPurchasesInMonth(expenses,card,now).map((e)=>[e.currency,e.amount]),[['ARS',20000],['USD',100]]);
});
test('a surviving installment still represents the original full purchase once',()=>{
 assert.equal(cardPurchasesInMonth([installments[1],installments[2]],card,now)[0].amount,30000);
});
test('next two payment dates respect anchored day across February and year boundaries',()=>{
 const anchored={...card,dueDate:'2026-01-31',dueDay:10};
 assert.deepEqual(upcomingCardPayments([],anchored,new Date(2026,1,1)).map((p)=>[p.date.getMonth(),p.date.getDate()]),[[1,28],[2,31]]);
 assert.deepEqual(upcomingCardPayments([],card,new Date(2026,11,11)).map((p)=>[p.date.getFullYear(),p.date.getMonth(),p.date.getDate()]),[[2027,0,10],[2027,1,10]]);
});
test('payment due today remains the first payment',()=>{
 assert.equal(upcomingCardPayments([],card,new Date(2026,9,10,23))[0].date.getMonth(),9);
});
test('credit card tile renders purchases and both payments without changing saved records or dates',async()=>{
 const {readFileSync}=await import('node:fs');const {default:vm}=await import('node:vm');
 const {nextClosingDateForCard,firstDueDateForCard,nextDueDateForCard}=await import('../finance.js');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=source.indexOf('function renderCards()'),end=source.indexOf('function renderPaymentReminders',start);
 const nodes={};const get=(selector)=>nodes[selector]??=( {innerHTML:'',classList:{toggle(){}},querySelectorAll:()=>[]} );
 const state={cards:[{...card,id:'card'}],expenses:installments,recurring:[]};const before=structuredClone(state);
 const context={bindLocalizedNumberInputs(){},state,activeCardType:'Crédito',$:get,document:{querySelectorAll:()=>[]},installPointerReorder(){},nextDue:nextDueDateForCard,nextClosingDateForCard,firstDueDateForCard,upcomingCardPayments,cardPurchasesInMonth,cardMonthSummary,cardStatementProjection,cardHistoryMonths,monthKey:(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,dateInputValue:()=> '2026-10-09',monthlyCardTotal:()=>[],effectiveDate:(e)=>new Date(e.dueDate),escape:(s)=>s,integerText:String,money:String,totalsHTML:(items)=>String(items.reduce((sum,e)=>sum+e.amount,0)),Date:class extends Date {constructor(...args){super(...(args.length?args:[now]));}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.renderCards();
 assert.match(nodes['#cardList'].innerHTML,/COMPRAS REALIZADAS ESTE MES<\/small><strong>30000/);
 assert.match(nodes['#cardList'].innerHTML,/SEGUNDO VENCIMIENTO/);
 assert.match(nodes['#cardList'].innerHTML,/PRÓXIMOS 2 VENCIMIENTOS<\/small><strong>10000/);
 assert.deepEqual(state,before);
});
test('history separates purchase month, due month and actual payment month',()=>{
 const identified={...card,id:'card'};
 const paid=createCardPayment({id:'paid',cardId:'card',statementMonth:'2026-11',date:'2026-12-01',amount:10000,currency:'ARS'});
 const expenses=structuredClone(installments),payments=[paid],before=structuredClone({expenses,payments,identified});
 const oct=cardMonthSummary(expenses,payments,identified,new Date(2026,9,1));
 assert.equal(oct.purchases[0].amount,30000);assert.equal(oct.dueItems.length,0);assert.equal(oct.payments.length,0);
 const nov=cardMonthSummary(expenses,payments,identified,new Date(2026,10,1));
 assert.equal(nov.purchases.length,0);assert.equal(nov.dueItems[0].amount,10000);assert.equal(nov.payments.length,0);
 const dec=cardMonthSummary(expenses,payments,identified,new Date(2026,11,1));
 assert.equal(dec.payments[0].amount,10000);assert.equal(dec.dueItems[0].amount,10000);
 assert.deepEqual({expenses,payments,identified},before);
});
test('projection sums installments from multiple purchases on the same card across year boundaries',()=>{
 const other=installments.map((e,i)=>({...e,id:'other'+i,parentId:'other',amount:5000}));
 const unrelated={...installments[0],card:'Macro',amount:999999};
 const forecast=cardStatementProjection([...installments,...other,unrelated],card,now);
 assert.deepEqual(forecast.slice(0,4).map((row)=>[row.date.getFullYear(),row.date.getMonth(),row.items.reduce((s,e)=>s+e.amount,0)]),[[2026,9,0],[2026,10,15000],[2026,11,15000],[2027,0,15000]]);
});
test('projection extends past a year through the last loaded installment',()=>{
 const far={...installments[0],dueDate:'2028-05-10'};
 const forecast=cardStatementProjection([far],card,now);
 assert.equal(forecast.length,20);assert.equal(forecast.at(-1).items[0],far);
 assert.equal(forecast.at(-1).date.getMonth(),4);
});
test('forecast preserves due-date anchors after short months and does not mutate card settings',()=>{
 const fixed={...card,dueDate:'2026-01-31',dueDay:10},before=structuredClone(fixed);
 const forecast=cardStatementProjection([],fixed,new Date(2026,1,1));
 assert.deepEqual(forecast.slice(0,2).map((row)=>row.date.getDate()),[28,31]);assert.deepEqual(fixed,before);
});
test('history reaches every earlier recorded month rather than losing data after six months',()=>{
 const identified={...card,id:'card'};
 const old={...installments[0],purchaseDate:'2024-02-01',dueDate:'2024-03-10'};
 const months=cardHistoryMonths([old],[],identified,now);
 assert.deepEqual([months.at(-1).getFullYear(),months.at(-1).getMonth()],[2024,1]);assert.equal(months[0].getMonth(),9);
 const payments=[{cardId:'card',date:'2023-01-01',amount:10,currency:'ARS'}];
 assert.equal(cardHistoryMonths([],payments,identified,now).at(-1).getFullYear(),2023);
});
test('actual payments do not infer payment from due dates and remain separate by card and currency',()=>{
 const identified={...card,id:'card'};
 const payments=[{id:'a',cardId:'card',date:'2026-10-09',amount:200,currency:'ARS'},{id:'b',cardId:'card',date:'2026-10-10',amount:20,currency:'USD'},{id:'c',cardId:'other',date:'2026-10-09',amount:999,currency:'ARS'}];
 assert.deepEqual(cardMonthSummary(installments,payments,identified,now).payments.map((p)=>p.currency),['ARS','USD']);
 assert.equal(cardMonthSummary(installments,[],identified,new Date(2026,10,15)).payments.length,0);
});
test('payment validation rejects invalid dates and amounts before recording anything',()=>{
 const base={id:'p',cardId:'c',statementMonth:'2026-10',date:'2026-10-09',amount:100,currency:'ARS'};
 assert.deepEqual(createCardPayment(base),base);
 for(const change of [{amount:0},{amount:-1},{amount:NaN},{date:'2026-02-30'},{date:''},{currency:'EUR'},{statementMonth:'2026-13'}])assert.throws(()=>createCardPayment({...base,...change}));
});
test('saving actual card payments survives storage reload and never duplicates expenses',async()=>{
 const {readFileSync}=await import('node:fs');const {default:vm}=await import('node:vm');const {parseLocalizedNumber}=await import('../numeric-format.js');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=source.indexOf('function cardInstallmentLines('),end=source.indexOf('function renderPaymentReminders',start);
 const identified={...card,id:'card'};
 const state={cards:[identified],expenses:structuredClone(installments),resale:{parties:[{id:'party'}]},cardPayments:[]};
 const protectedBefore=structuredClone({cards:state.cards,expenses:state.expenses,resale:state.resale});
 const form={dataset:{cardId:'card',statementMonth:'2026-11'},elements:{date:{value:'2026-12-01'},amount:{value:'10.000,50'},currency:{value:'ARS'}}};
 const nodes={};const $=(selector)=>nodes[selector]??={innerHTML:'',querySelectorAll:(s)=>s==='.card-payment-form'?[form]:[]};
 let persisted,saves=0;const context={state,$,bindLocalizedNumberInputs(){},cardStatementProjection,cardHistoryMonths,cardMonthSummary,createCardPayment,parseLocalizedNumber,monthKey:(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,dateInputValue:()=> '2026-10-09',escape:String,integerText:String,money:String,totalsHTML:(items)=>String(items.reduce((s,e)=>s+e.amount,0)),uid:()=> 'payment',save:()=>{persisted=JSON.stringify(state);saves++;},showToast(){}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.renderCardStatements([identified],now);
 form.onsubmit({preventDefault(){}});
 assert.equal(saves,1);assert.equal(JSON.parse(persisted).cardPayments[0].amount,10000.5);
 assert.deepEqual({cards:state.cards,expenses:state.expenses,resale:state.resale},protectedBefore);
 const reloaded=JSON.parse(persisted);assert.equal(cardMonthSummary(reloaded.expenses,reloaded.cardPayments,identified,new Date(2026,11,1)).payments[0].amount,10000.5);
 form.elements.amount.value='0';form.onsubmit({preventDefault(){}});assert.equal(saves,1);assert.equal(state.cardPayments.length,1);
});
test('fresh and existing saved states load payment history without changing prior expenses or dates',async()=>{
 const {readFileSync}=await import('node:fs');const {default:vm}=await import('node:vm');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('const defaults ='),end=source.indexOf('const state = loadState()',start);
 const old={expenses:installments,cards:[card],cardPayments:[{cardId:'card',date:'2026-10-09',amount:10,currency:'ARS'}],settings:{}};
 const context={bestLocalSnapshot:()=>structuredClone(old),structuredClone};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const loaded=context.loadState();assert.deepEqual(loaded.expenses,old.expenses);assert.deepEqual(loaded.cards,old.cards);assert.deepEqual(loaded.cardPayments,old.cardPayments);
 delete old.cardPayments;assert.equal(context.loadState().cardPayments.length,0);
});
