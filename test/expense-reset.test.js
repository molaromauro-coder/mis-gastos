import test from 'node:test';
import assert from 'node:assert/strict';
import { currentMonthExpenseCount, previousMonthExpenseCount, previousMonthTrashItemCount, previousMonthDeletableCount, moveCurrentMonthExpensesToTrash, permanentlyDeletePreviousMonths, permanentlyDeleteTrashRecords, mirrorResetIntoSnapshot, verifyNoCurrentMonthExpenses, verifyNoPreviousMonthExpenses } from '../expense-reset.js';
import { recentPurchases, groupExpenses } from '../reporting.js';

const now=new Date('2026-09-30T12:00:00-03:00');
const sampleState=()=>({
  expenses:[
    {id:'sep-a',concept:'Super',amount:1000,purchaseDate:'2026-09-05T10:00:00-03:00'},
    {id:'sep-b',concept:'Nafta',amount:2000,purchaseDate:'2026-09-20T10:00:00-03:00'},
    {id:'aug-a',concept:'Luz agosto',amount:3000,purchaseDate:'2026-08-15T10:00:00-03:00'},
    {id:'jul-a',concept:'Alquiler julio',amount:4000,purchaseDate:'2026-07-10T10:00:00-03:00'}
  ],
  trash:[
    {id:'trash-old',deletedAt:'2026-09-01T10:00:00-03:00',items:[
      {id:'old-trash-item',concept:'Viejo',amount:500,purchaseDate:'2026-08-01T10:00:00-03:00'}
    ]},
    {id:'trash-current',deletedAt:'2026-09-22T10:00:00-03:00',items:[
      {id:'current-trash-item',concept:'Actual',amount:600,purchaseDate:'2026-09-21T10:00:00-03:00'}
    ]}
  ],
  cards:[{id:'c1',name:'Mercado Pago'}],
  categories:['Servicios']
});

test('cuenta por separado el mes actual y los meses anteriores',()=>{
  const state=sampleState();
  assert.equal(currentMonthExpenseCount(state,now),2);
  assert.equal(previousMonthExpenseCount(state,now),2);
});

test('borrar mes actual mueve esos gastos a Papelera y conserva históricos',()=>{
  const state=sampleState();
  const result=moveCurrentMonthExpensesToTrash(state,now);
  assert.equal(result.removed,2);
  assert.deepEqual(state.expenses.map((e)=>e.id),['aug-a','jul-a']);
  assert.ok(state.trash.some((r)=>r.items.some((e)=>e.id==='sep-a')));
  assert.ok(state.trash.some((r)=>r.items.some((e)=>e.id==='sep-b')));
  assert.equal(state.cards.length,1);
  assert.deepEqual(state.categories,['Servicios']);
});

test('borrar meses anteriores es permanente también en Papelera',()=>{
  const state=sampleState();
  const result=permanentlyDeletePreviousMonths(state,now);
  assert.equal(result.removedActive,2);
  assert.equal(result.removedTrashItems,1);
  assert.deepEqual(state.expenses.map((e)=>e.id),['sep-a','sep-b']);
  assert.equal(state.trash.some((r)=>r.items.some((e)=>e.id==='old-trash-item')),false);
  assert.equal(state.trash.some((r)=>r.items.some((e)=>e.id==='current-trash-item')),true);
  assert.equal(state.cards.length,1);
  assert.deepEqual(state.categories,['Servicios']);
});

test('el snapshot de Configuración no puede restaurar gastos borrados',()=>{
  const state=sampleState();
  const snapshot=structuredClone(state);
  permanentlyDeletePreviousMonths(state,now);
  mirrorResetIntoSnapshot(snapshot,state);
  assert.deepEqual(snapshot.expenses,state.expenses);
  assert.deepEqual(snapshot.trash,state.trash);
  assert.equal(snapshot.cards.length,1);
});


test('mes actual desaparece de Últimos movimientos e Informes al borrarlo',()=>{
  const state=sampleState();
  moveCurrentMonthExpensesToTrash(state,now);
  const recent=recentPurchases(state.expenses);
  assert.deepEqual(recent.map((e)=>e.id),['aug-a','jul-a']);
  const grouped=groupExpenses(state.expenses,(e)=>e.concept);
  assert.equal(grouped.some((row)=>row.key==='Super'),false);
  assert.equal(grouped.some((row)=>row.key==='Nafta'),false);
});

test('borrado histórico desaparece de Historial/Informes/Papelera y deja mes actual',()=>{
  const state=sampleState();
  permanentlyDeletePreviousMonths(state,now);
  const recent=recentPurchases(state.expenses);
  assert.deepEqual(recent.map((e)=>e.id),['sep-b','sep-a']);
  const grouped=groupExpenses(state.expenses,(e)=>e.concept);
  assert.equal(grouped.some((row)=>row.key==='Luz agosto'),false);
  assert.equal(grouped.some((row)=>row.key==='Alquiler julio'),false);
  assert.equal(state.trash.flatMap((r)=>r.items).some((e)=>e.id==='old-trash-item'),false);
});

test('ambos borrados conservan medios de pago, categorías, subcategorías y configuración',()=>{
  const state={...sampleState(),subcategories:{Servicios:['Luz']},settings:{hideAmounts:true}};
  const cards=structuredClone(state.cards),categories=structuredClone(state.categories),subs=structuredClone(state.subcategories),settings=structuredClone(state.settings);
  moveCurrentMonthExpensesToTrash(state,now);
  permanentlyDeletePreviousMonths(state,now);
  assert.deepEqual(state.cards,cards);
  assert.deepEqual(state.categories,categories);
  assert.deepEqual(state.subcategories,subs);
  assert.deepEqual(state.settings,settings);
});


test('verifica que no queden movimientos activos del mes actual',()=>{
  const state=sampleState();
  moveCurrentMonthExpensesToTrash(state,now);
  assert.equal(verifyNoCurrentMonthExpenses(state,now),true);
});

test('verifica que no queden movimientos activos de meses anteriores',()=>{
  const state=sampleState();
  permanentlyDeletePreviousMonths(state,now);
  assert.equal(verifyNoPreviousMonthExpenses(state,now),true);
});

test('usa dueDate como respaldo para registros antiguos sin fecha de compra',()=>{
  const state={expenses:[{id:'legacy',amount:10,dueDate:'2026-09-15T10:00:00-03:00'}],trash:[]};
  assert.equal(currentMonthExpenseCount(state,now),1);
  moveCurrentMonthExpensesToTrash(state,now);
  assert.equal(state.expenses.length,0);
  assert.equal(verifyNoCurrentMonthExpenses(state,now),true);
});

test('el diálogo puede contar gastos históricos en Papelera aunque sólo tengan dueDate',()=>{
  const state={expenses:[],trash:[{id:'legacy-trash',items:[
    {id:'legacy-old',amount:10,dueDate:'2026-08-15T10:00:00-03:00'},
    {id:'legacy-current',amount:20,dueDate:'2026-09-15T10:00:00-03:00'}
  ]}]};
  assert.equal(previousMonthExpenseCount(state,now),0);
  assert.equal(previousMonthTrashItemCount(state,now),1);
  assert.equal(previousMonthDeletableCount(state,now),1);
  const result=permanentlyDeletePreviousMonths(state,now);
  assert.equal(result.totalRemoved,1);
  assert.equal(state.trash.flatMap(x=>x.items).some(x=>x.id==='legacy-old'),false);
  assert.equal(state.trash.flatMap(x=>x.items).some(x=>x.id==='legacy-current'),true);
});

test('Papelera permite eliminar varios registros seleccionados sin tocar los demás',()=>{
  const state=sampleState();
  const result=permanentlyDeleteTrashRecords(state,['trash-old']);
  assert.equal(result.removedRecords,1);
  assert.equal(result.removedItems,1);
  assert.deepEqual(state.trash.map((r)=>r.id),['trash-current']);
});

test('Papelera permite eliminar todos los registros de una sola vez',()=>{
  const state=sampleState();
  const ids=state.trash.map((r)=>r.id);
  const result=permanentlyDeleteTrashRecords(state,ids);
  assert.equal(result.removedRecords,2);
  assert.equal(result.removedItems,2);
  assert.equal(state.trash.length,0);
});
