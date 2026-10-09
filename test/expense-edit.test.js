import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expenseEditModel,expenseDateInput,buildExpenseEdit,expenseTrashPositions,restoreExpenseTrash} from '../expense-edit.js';
import {installmentDueDates,monthKey} from '../finance.js';
import {cardMonthSummary,cardStatementProjection} from '../card-summary.js';
import {groupExpenses,recentPurchases} from '../reporting.js';
import {moveCurrentMonthExpensesToTrash} from '../expense-reset.js';
import {protectExpenseRecords,isValidSnapshot} from '../data-safety.js';
import {parseLocalizedNumber,formatNumericInputValue} from '../numeric-format.js';

const card={id:'bank',name:'Banco Francés',type:'Crédito',closingDay:20,dueDay:10,closingDate:'2026-10-20',dueDate:'2026-11-10'};
const bought='2026-10-09T12:33:00.123Z';
function records(){return [
  {id:'before',amount:6000,currency:'ARS',concept:'Otros',category:'HOGAR',subcategory:'OTROS',method:'Efectivo',date:bought,purchaseDate:bought},
  ...installmentDueDates(card,new Date(bought),3).map((date,i)=>({id:'part-'+i,parentId:'purchase',amount:10000,installment:i+1,installments:3,currency:'ARS',concept:'Heladera',category:'HOGAR',subcategory:'ELECTRODOMESTICOS',method:'Crédito',card:card.name,date:bought,purchaseDate:bought,dueDate:date.toISOString(),source:'voice',customNote:'preserve'})),
  {id:'after',amount:233000,currency:'ARS',concept:'Obra social',category:'GASTOS FIJOS',subcategory:'OBRA SOCIAL',method:'Débito',card:'Cuenta Macro',date:'2026-10-02T12:00:00Z',purchaseDate:'2026-10-02T12:00:00Z',source:'fixed',fixedExpenseId:'fixed',fixedExpenseMonth:'2026-10'}
];}
function patchFor(expenses,id='part-1',changes={}){
  const m=expenseEditModel(expenses,id);
  return {amount:m.amount,concept:m.first.concept,currency:m.first.currency,category:m.first.category,subcategory:m.first.subcategory,method:m.first.method,card:m.first.card,installments:m.installments,purchaseDate:m.purchaseDate,firstDueDate:m.firstDueDate,...changes};
}
let sequence=0;const uid=()=> 'new-'+(++sequence);
test('editar una cuota corrige toda la compra y conserva sus fechas, IDs, datos originales y gastos ajenos',()=>{
  const original=records(),before=structuredClone(original),cards=structuredClone([card]);
  const edited=buildExpenseEdit(original,'part-1',patchFor(original,'part-1',{concept:'Heladera corregida',category:'SUPERMERCADO',subcategory:'OTROS'}),cards,uid);
  assert.deepEqual(original,before);assert.deepEqual(cards,[card]);
  assert.equal(edited.expenses[0],original[0]);assert.equal(edited.expenses.at(-1),original.at(-1));
  assert.deepEqual(edited.removedIds,[]);
  for(let i=1;i<=3;i++){
    assert.equal(edited.expenses[i].concept,'Heladera corregida');assert.equal(edited.expenses[i].category,'SUPERMERCADO');assert.equal(edited.expenses[i].subcategory,'OTROS');
    for(const field of ['id','amount','date','purchaseDate','dueDate','source','customNote'])assert.equal(edited.expenses[i][field],original[i][field]);
  }
});
test('corregir el importe actualiza todas las cuotas, compras del mes y resúmenes futuros sin duplicar',()=>{
  const original=records(),result=buildExpenseEdit(original,'part-2',patchFor(original,'part-2',{amount:60000}),[card],uid).expenses;
  assert.equal(result.length,original.length);assert.deepEqual(result.slice(1,4).map((r)=>r.amount),[20000,20000,20000]);
  const october=cardMonthSummary(result,[],card,new Date(2026,9,1));assert.equal(october.purchases[0].amount,60000);
  const projection=cardStatementProjection(result,card,new Date(2026,9,9));assert.equal(projection.filter((m)=>m.items.length).length,3);
  assert.equal(projection.flatMap((m)=>m.items).reduce((n,r)=>n+r.amount,0),60000);
  const groups=groupExpenses(result,(e)=>e.category);assert.equal(groups.find((g)=>g.key==='HOGAR').arsEquivalent,66000);
});
test('cambiar cantidad de cuotas conserva la identidad de las que siguen y quita únicamente las reemplazadas',()=>{
  const original=records();const reduced=buildExpenseEdit(original,'part-1',patchFor(original,'part-1',{installments:2,amount:30000}),[card],uid);
  assert.deepEqual(reduced.removedIds,['part-2']);assert.deepEqual(reduced.expenses.map((e)=>e.id),['before','part-0','part-1','after']);
  assert.equal(reduced.expenses[1].amount,15000);assert.equal(reduced.expenses[2].amount,15000);
  const expanded=buildExpenseEdit(original,'part-1',patchFor(original,'part-1',{installments:5}),[card],uid);
  assert.equal(expanded.expenses.length,7);assert.equal(new Set(expanded.expenses.map((e)=>e.id)).size,7);assert.deepEqual(expanded.removedIds,[]);
});
test('cambiar tarjeta o fecha recalcula cuotas con el cierre correspondiente sin tocar las tarjetas',()=>{
  const other={...card,id:'other',name:'Banco Macro',closingDate:'2026-10-25',dueDate:'2026-11-12',closingDay:25,dueDay:12};
  const original=records(),cards=[card,other],before=structuredClone(cards),date='2026-10-26T12:00:00Z';
  const result=buildExpenseEdit(original,'part-0',patchFor(original,'part-0',{card:other.name,purchaseDate:date,firstDueDate:''}),cards,uid).expenses;
  assert.deepEqual(result.slice(1,4).map((e)=>e.dueDate),installmentDueDates(other,new Date(date),3).map((d)=>d.toISOString()));
  assert.ok(result.slice(1,4).every((e)=>e.card===other.name&&e.purchaseDate===date));assert.deepEqual(cards,before);
});
test('pasar de crédito a efectivo retira cuotas futuras y conserva sólo la compra corregida',()=>{
  const original=records(),result=buildExpenseEdit(original,'part-2',patchFor(original,'part-2',{method:'Efectivo'}),[card],uid);
  assert.deepEqual(result.removedIds,['part-1','part-2']);assert.equal(result.expenses.length,3);
  const expense=result.expenses[1];assert.equal(expense.id,'part-0');assert.equal(expense.amount,30000);assert.equal(expense.card,'');
  for(const field of ['parentId','dueDate','installment'])assert.equal(field in expense,false);
  assert.equal(cardStatementProjection(result.expenses,card,new Date(2026,9,9)).flatMap((m)=>m.items).length,0);
});
test('fecha corregida de un pago fijo se aplica al mes indicado y conserva su vínculo y categoría',()=>{
  const original=records(),result=buildExpenseEdit(original,'after',patchFor(original,'after',{purchaseDate:'2026-09-02T12:00:00Z',amount:220000}),[card,{name:'Cuenta Macro',type:'Débito'}],uid).expenses.at(-1);
  assert.equal(result.fixedExpenseMonth,'2026-09');assert.equal(result.fixedExpenseId,'fixed');assert.equal(result.category,'GASTOS FIJOS');assert.equal(result.subcategory,'OBRA SOCIAL');assert.equal(result.amount,220000);
});
test('corregir un concepto no completa automáticamente un grupo incompleto ni cambia la cotización histórica',()=>{
  const original=records().filter((e)=>e.id!=='part-2');
  original[1].currency='USD';original[2].currency='USD';original[1].fxRate=1250.1234;original[2].fxRate=1250.1234;
  const result=buildExpenseEdit(original,'part-1',patchFor(original,'part-1',{concept:'Detalle corregido'}),[card],uid);
  assert.equal(result.expenses.length,original.length);assert.equal(result.expenses[1].fxRate,1250.1234);assert.equal(result.expenses[2].fxRate,1250.1234);
});
test('validación rechaza importes, fechas, medios, tarjetas, cuotas y cotizaciones inválidos sin modificar datos',()=>{
  const original=records(),before=structuredClone(original);
  for(const change of [{amount:0},{amount:NaN},{currency:'EUR'},{method:''},{card:'Desconocida'},{installments:0},{installments:1.5},{installments:49},{purchaseDate:'2026-02-30'},{firstDueDate:'2026-02-30'},{currency:'USD',fxRate:-1}]){
    assert.throws(()=>buildExpenseEdit(original,'part-1',patchFor(original,'part-1',change),[card],uid));assert.deepEqual(original,before);
  }
});
test('gasto legado de crédito sin desglose ni tarjeta vigente conserva su importe total al corregir el concepto',()=>{
  const original=[{id:'legacy',amount:30000,currency:'ARS',method:'Crédito',card:'Tarjeta antigua',installments:3,date:bought,purchaseDate:bought,concept:'Compra'}];
  const result=buildExpenseEdit(original,'legacy',patchFor(original,'legacy',{concept:'Compra corregida',amount:40000}),[],uid).expenses;
  assert.equal(result.length,1);assert.equal(result[0].amount,40000);assert.equal(result[0].parentId,undefined);assert.equal(result[0].dueDate,undefined);
});
test('restaurar una compra devuelve todas sus cuotas en su posición, con fechas, importes y categorías idénticos',()=>{
  const original=records(),items=original.slice(1,4),record={items,positions:expenseTrashPositions(original,items)},kept=[original[0],original.at(-1)],before=structuredClone(record);
  const result=restoreExpenseTrash(kept,record);
  assert.deepEqual(result,original);assert.deepEqual(record,before);assert.deepEqual(restoreExpenseTrash(result,record),original);
  assert.equal(recentPurchases(result).length,recentPurchases(original).length);
  assert.equal(cardMonthSummary(result,[],card,new Date(2026,9,1)).purchases[0].amount,30000);
});
test('papelera antigua sin posiciones restaura los campos exactos y se ve en su fecha original',()=>{
  const original=records(),items=original.slice(1,4),restored=restoreExpenseTrash([original[0],original.at(-1)],{items});
  assert.deepEqual(restored.slice(2),items);assert.deepEqual(recentPurchases(restored).map((e)=>e.id),recentPurchases(original).map((e)=>e.id));
});
test('borrado del mes guarda las posiciones para restaurar los registros completos',()=>{
  const original=records(),state={expenses:structuredClone(original),trash:[]};
  moveCurrentMonthExpensesToTrash(state,new Date(2026,9,9));
  for(const record of state.trash)state.expenses=restoreExpenseTrash(state.expenses,record);
  assert.deepEqual(state.expenses,original);
});

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function editorFixture(options={}){
  const state={expenses:records(),cards:[card,{name:'Cuenta Macro',type:'Débito'}],trash:[],settings:{},resale:{parties:[{id:'party',tickets:[{salePrice:65000}]}]},cardPayments:[{id:'payment',amount:20}]};
  const nodes=new Map(),events={};
  function element(selector){
    if(!nodes.has(selector))nodes.set(selector,{value:'',options:[],disabled:false,open:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){},contains(){return false;}},add(option){this.options.push(option);},reset(){},addEventListener(name,fn){this[name]=fn;},showModal(){this.open=true;},close(){this.open=false;this['close']?.();}});
    return nodes.get(selector);
  }
  // Dialog close dispatch and close() are separate, as in the DOM.
  element('#editExpenseDialog').addEventListener=function(name,fn){events[name]=fn;};
  element('#editExpenseDialog').close=function(){this.open=false;events.close?.();};
  const $=element,stored=new Map([['main',JSON.stringify(state)]]);let saves=0;
  const context={state,$,expenseEditModel,expenseDateInput,buildExpenseEdit,structuredClone,Date,JSON,Number,Math,Option:class{constructor(label,value){this.text=label;this.value=value;}},
    document:{addEventListener(){}},fillCategorySelect:(selector,value)=>{$(selector).value=value;},fillScopedSubcategories:(c,s,w,value='')=>{$(s).value=value;},
    setLocalizedInput:(selector,n)=>{$(selector).value=n===''?'':formatNumericInputValue(n,{maximumFractionDigits:2});},localizedInputNumber:(selector)=>parseLocalizedNumber($(selector).value),
    escape:String,displayCategory:String,displaySubcategory:String,uid,settingsSnapshot:null,mirrorResetIntoSnapshot(){},render(){},feedback(){},runConsultation(){},showToast(){},
    stampUsdExpense:options.stamp|| (async(patch)=>({...patch,fxRate:1200})),firstDueDateForCard(){},dateInputValue(){},createCategoryFromPrompt(){},createSubcategoryFromPrompt(){},
    STORAGE_KEY:'main',BACKUP_KEY:'backup',HISTORY_KEY:'history',safeStoredValue:(key)=>stored.get(key)||null,parseStoredState:(s)=>s?JSON.parse(s):null,localHistorySnapshots:()=>[],localStorage:{setItem:(key,raw)=>{if(options.fail&&key==='main')throw Error('quota');stored.set(key,raw);}},
    retainedExpenseCount:(s)=>s.expenses.length+(s.trash||[]).flatMap((r)=>r.items||[]).length,isValidSnapshot,protectExpenseRecords,destructiveWriteAllowed:false,window:{},renderDataSafetyStatus(){},persistIndexedSnapshot:async()=>true,
    permitDestructiveWriteOnce(){context.destructiveWriteAllowed=true;}
  };
  vm.createContext(context);
  const saveSource=source.slice(source.indexOf('const save = () =>'),source.indexOf('function normalizedRecoveryText'));
  vm.runInContext(saveSource+source.slice(source.indexOf('let expenseEditContext='),source.indexOf('function moveExpenseToTrash(')),context);
  return {state,$,open:()=>context.openExpenseEditor('part-1'),submit:()=>{saves++;return context.submitExpenseEdit({preventDefault(){}});},stored:()=>JSON.parse(stored.get('main')),context};
}
test('editor real: abrir y cancelar no cambia datos; guardar modifica sólo el grupo y sobrevive a recargar',async()=>{
  const f=editorFixture(),before=structuredClone(f.state);f.open();
  assert.deepEqual(f.state,before);f.$('#editExpenseConcept').value='No guardar';f.$('#editExpenseDialog').close();await f.submit();assert.deepEqual(f.state,before);assert.deepEqual(f.stored(),before);
  f.open();f.$('#editExpenseConcept').value='Compra corregida';f.$('#editExpenseAmount').value='45.000';await f.submit();
  const loaded=f.stored();assert.deepEqual(loaded.expenses.slice(1,4).map((e)=>e.amount),[15000,15000,15000]);assert.ok(loaded.expenses.slice(1,4).every((e)=>e.concept==='Compra corregida'));
  assert.deepEqual(loaded.cards,before.cards);assert.deepEqual(loaded.resale,before.resale);assert.deepEqual(loaded.cardPayments,before.cardPayments);assert.deepEqual(loaded.expenses[0],before.expenses[0]);assert.deepEqual(loaded.expenses.at(-1),before.expenses.at(-1));assert.equal(f.$('#editExpenseDialog').open,false);
});
test('editor real: reducir cuotas no las resucita al pasar por la protección de guardado',async()=>{
  const f=editorFixture();f.open();f.$('#editExpenseInstallments').value='1';await f.submit();
  assert.equal(f.stored().expenses.length,3);assert.equal(f.stored().expenses[1].amount,30000);assert.equal(f.stored().expenses[1].parentId,undefined);
});
test('editor real: el concepto no redondea ni reemplaza la cotización histórica guardada',async()=>{
  const f=editorFixture();f.state.expenses.slice(1,4).forEach((e)=>{e.currency='USD';e.fxRate=1250.1234;e.fxCapturedAt='2026-10-01';});
  f.open();f.$('#editExpenseConcept').value='Corregido';await f.submit();
  assert.ok(f.stored().expenses.slice(1,4).every((e)=>e.fxRate===1250.1234&&e.fxCapturedAt==='2026-10-01'));
});
test('editor real: fallo de guardado conserva el gasto anterior y permite corregir o reintentar',async()=>{
  const f=editorFixture({fail:true}),before=structuredClone(f.state.expenses);f.open();f.$('#editExpenseAmount').value='40.000';await f.submit();
  assert.deepEqual(f.state.expenses,before);assert.deepEqual(f.stored().expenses,before);assert.equal(f.$('#editExpenseDialog').open,true);assert.match(f.$('#editExpenseValidation').textContent,/gasto anterior se conserva/);assert.equal(f.$('#editExpenseSave').disabled,false);
});
test('editor real: cancelar durante una consulta de cotización no guarda ni altera gastos',async()=>{
  let release;const gate=new Promise((resolve)=>release=resolve);const f=editorFixture({stamp:async(patch)=>{await gate;return {...patch,fxRate:1200};}}),before=structuredClone(f.state);
  f.open();f.$('#editExpenseCurrency').value='USD';const saving=f.submit();f.$('#editExpenseDialog').close();release();await saving;assert.deepEqual(f.state,before);assert.deepEqual(f.stored(),before);
});
function bindTrashFixture(f){
  const rows=new Map();Object.assign(f.context,{expenseTrashPositions,restoreExpenseTrash,purgeExpiredTrash(){},integerText:String,money:String});
  f.context.document.querySelectorAll=(selector)=>selector==='[data-trash-id]'?f.state.trash.map((record)=>{
    if(!rows.has(record.id)){
      const children=new Map();rows.set(record.id,{dataset:{trashId:record.id},querySelector:(s)=>{if(!children.has(s))children.set(s,{});return children.get(s);}});
    }
    return rows.get(record.id);
  }):[];
  const start=source.indexOf('function moveExpenseToTrash('),end=source.indexOf("document.addEventListener('click',(e)=>",start);
  vm.runInContext(source.slice(start,end),f.context);return rows;
}
test('papelera real: borrar y restaurar guarda el gasto en la misma posición y reaplica sus categorías y cuotas',()=>{
  const f=editorFixture(),before=structuredClone(f.state),rows=bindTrashFixture(f);
  f.context.moveExpenseToTrash('part-1');assert.equal(f.stored().expenses.length,2);assert.equal(f.stored().trash[0].items.length,3);
  const id=f.state.trash[0].id;rows.get(id).querySelector('.restore-trash').onclick();
  const restored=f.stored();assert.deepEqual(restored.expenses,before.expenses);assert.equal(restored.trash.length,0);assert.deepEqual(restored.cards,before.cards);assert.deepEqual(restored.resale,before.resale);
  assert.equal(groupExpenses(restored.expenses,(e)=>e.category).find((g)=>g.key==='HOGAR').arsEquivalent,36000);
  assert.equal(cardMonthSummary(restored.expenses,[],card,new Date(2026,9,1)).purchases[0].amount,30000);
});
test('papelera real: una restauración que no pudo guardarse conserva intacto el registro en papelera',()=>{
  const options={},f=editorFixture(options),rows=bindTrashFixture(f);f.context.moveExpenseToTrash('part-1');const before=structuredClone(f.state),id=f.state.trash[0].id;
  options.fail=true;rows.get(id).querySelector('.restore-trash').onclick();assert.deepEqual(JSON.parse(JSON.stringify(f.state.expenses)),before.expenses);assert.deepEqual(JSON.parse(JSON.stringify(f.state.trash)),before.trash);assert.deepEqual(f.stored().expenses,before.expenses);assert.deepEqual(f.stored().trash,before.trash);
});
test('botones comunes renderizados mantienen editar junto a eliminar y apuntan al gasto correcto',()=>{
  const context={escape:(s)=>String(s).replaceAll('"','&quot;')};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function expenseActionsHTML('),source.indexOf('function chronologicalPurchases(')),context);
  for(const recent of [false,true]){
    const html=context.expenseActionsHTML({id:'expense"id'},recent);
    assert.ok(html.indexOf('data-edit-expense')<html.indexOf('data-delete-expense'));assert.equal((html.match(/data-(?:edit|delete)-expense="expense&quot;id"/g)||[]).length,2);
  }
});
