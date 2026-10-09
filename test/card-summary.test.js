import test from 'node:test';
import assert from 'node:assert/strict';
import { cardPurchasesInMonth, upcomingCardPayments } from '../card-summary.js';
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
 const nodes={};const get=(selector)=>nodes[selector]??=( {innerHTML:'',classList:{toggle(){}}} );
 const state={cards:[{...card,id:'card'}],expenses:installments,recurring:[]};const before=structuredClone(state);
 const context={state,activeCardType:'Crédito',$:get,document:{querySelectorAll:()=>[]},installPointerReorder(){},nextDue:nextDueDateForCard,nextClosingDateForCard,firstDueDateForCard,upcomingCardPayments,cardPurchasesInMonth,monthlyCardTotal:()=>[],effectiveDate:(e)=>new Date(e.dueDate),escape:(s)=>s,integerText:String,money:String,totalsHTML:(items)=>String(items.reduce((sum,e)=>sum+e.amount,0)),Date:class extends Date {constructor(...args){super(...(args.length?args:[now]));}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.renderCards();
 assert.match(nodes['#cardList'].innerHTML,/COMPRAS REALIZADAS ESTE MES<\/small><strong>30000/);
 assert.match(nodes['#cardList'].innerHTML,/SEGUNDO VENCIMIENTO/);
 assert.match(nodes['#cardList'].innerHTML,/PRÓXIMOS 2 VENCIMIENTOS<\/small><strong>10000/);
 assert.deepEqual(state,before);
});
