import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResaleTable, compareResaleImport, applyResaleImport } from '../resale-import.js';

// Reproduce la disposición real de la hoja VENTAS (cabeceras comienzan en columna C).
const workbookRows=[
  [null,null,'VENTAS DE ENTRADAS — DETALLE INDIVIDUAL'],
  [],[],
  [null,null,'FIESTA','FECHA FIESTA','TIPO ENTRADA','N° ENTRADA','COSTO COMPRA','PRECIO VENTA','ESTADO'],
  [null,null,'MAX STYLER','VIERNES 11/09','GRAL 3',1,26450,70000,'VENDIDA'],
  [null,null,'MAX STYLER','VIERNES 11/09','GRAL 3',2,26450,55000,'VENDIDA'],
  [null,null,'TOTAL - MAX STYLER',null,'TOTAL',null,52900,125000],
  [null,null,'HOT SINCE 82','VIERNES 18/09','VIP',1,80500,0,'USO PERSONAL']
];

test('el importador reconoce planillas con columnas desplazadas e ignora totales',()=>{
  const parsed=parseResaleTable(workbookRows,[],2026);
  assert.equal(parsed.warnings.length,0);
  assert.equal(parsed.rows.length,3);
  assert.deepEqual(parsed.rows.map(x=>x.partyName),['MAX STYLER','MAX STYLER','HOT SINCE 82']);
  assert.deepEqual(parsed.rows.map(x=>x.number),[1,2,1]);
  assert.deepEqual(parsed.rows.map(x=>x.status),['Vendida','Vendida','Uso personal']);
  assert.equal(parsed.rows[0].date,'2026-09-11');
});

const initial=()=>[
  {id:'max',name:'MAX STYLER',date:'2026-09-11',tickets:[
    {id:'ticket1',type:'GRAL 3',number:1,cost:26450,salePrice:70000,status:'Vendida'},
    {id:'ticket2',type:'GRAL 3',number:2,cost:26450,salePrice:60000,status:'Vendida'}]},
  {id:'unrelated',name:'OTRA FIESTA',date:'2026-09-30',tickets:[
    {id:'other',type:'VIP',number:1,cost:10000,salePrice:0,status:'Disponible'}]}
];

test('enumera diferencias y evita marcar fiestas ausentes del Excel como faltantes',()=>{
  const current=initial();
  const parsed=parseResaleTable(workbookRows,current,2026);
  const result=compareResaleImport(parsed.rows,current);
  assert.equal(result.matched,1);
  assert.equal(result.issues.filter(x=>x.kind==='changed').length,1);
  assert.equal(result.issues.filter(x=>x.kind==='new').length,1);
  assert.equal(result.issues.some(x=>x.kind==='onlyApp'&&x.current.partyName==='OTRA FIESTA'),false);
});

test('si se elige mantener la app, ningún precio existente se modifica',()=>{
  const current=initial();
  const parsed=parseResaleTable(workbookRows,current,2026);
  const compared=compareResaleImport(parsed.rows,current);
  const unchanged=applyResaleImport(current,compared.issues,{},()=>crypto.randomUUID());
  assert.equal(unchanged.find(x=>x.id==='max').tickets[1].salePrice,60000);
  assert.equal(current.find(x=>x.id==='max').tickets[1].salePrice,60000);
});

test('permite una corrección manual antes de importar sin modificar objetos originales',()=>{
  const current=initial();
  const parsed=parseResaleTable(workbookRows,current,2026);
  const compared=compareResaleImport(parsed.rows,current);
  const changed=compared.issues.find(x=>x.kind==='changed');
  const issues=compared.issues.map(issue=>issue===changed?{...issue,imported:{...issue.imported,salePrice:57000}}:issue);
  const imported=applyResaleImport(current,issues,{[changed.id]:'manual'},()=> 'new-id');
  assert.equal(imported.find(x=>x.id==='max').tickets[1].salePrice,57000);
  assert.equal(current.find(x=>x.id==='max').tickets[1].salePrice,60000);
});

test('una entrada vendida sin costo informado no se importa a ciegas',()=>{
  const broken=workbookRows.map(row=>[...row]); broken[4][6]='';
  const parsed=parseResaleTable(broken,[],2026);
  assert.equal(parsed.rows.length,2);
  assert.ok(parsed.warnings.some(w=>w.includes('sin costo')));
});
