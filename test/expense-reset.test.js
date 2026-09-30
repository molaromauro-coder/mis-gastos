import test from 'node:test';
import assert from 'node:assert/strict';
import { currentMonthExpenseCount, previousMonthExpenseCount, moveCurrentMonthExpensesToTrash, permanentlyDeletePreviousMonths, mirrorResetIntoSnapshot } from '../expense-reset.js';

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
