import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResaleTable, compareResaleImport, applyResaleImport, parseResaleUpdate, parseResaleWorkbook } from '../resale-import.js';

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

test('compras sucesivas con numeración reiniciada conservan todas las entradas e importan una sola vez',()=>{
 const matrix=[['Fiesta','Fecha fiesta','Tipo','N° entrada','Costo compra','Precio venta','Estado'],['FIESTA','23/01/27','EARLY',1,50,0,'Disponible'],['FIESTA','23/01/27','EARLY',2,50,0,'Disponible'],[],['FIESTA','23/01/27','EARLY',1,60,90,'Vendida'],['FIESTA','23/01/27','EARLY',2,60,0,'Disponible']];
 const parsed=parseResaleTable(matrix,[],2026);assert.equal(parsed.warnings.length,0);assert.deepEqual(parsed.rows.map(r=>r.number),[1,2,3,4]);assert.equal(parsed.rows[0].date,'2027-01-23');assert.equal(parsed.rows[0].dateExplicit,true);
 const current=[{id:'party',name:'FIESTA',date:'2026-01-23',tickets:[]}];const c=compareResaleImport(parsed.rows,current);let id=0;const parties=applyResaleImport(current,c.issues,Object.fromEntries(c.issues.map(i=>[i.id,'excel'])),()=>String(++id));assert.equal(parties[0].date,'2027-01-23');assert.equal(parties[0].tickets.length,4);assert.equal(compareResaleImport(parsed.rows,parties).issues.length,0);
});
test('filas duplicadas idénticas no crean entradas nuevas y fechas inválidas se advierten',()=>{
 const matrix=[['Fiesta','Fecha fiesta','Tipo','N° entrada','Costo compra','Estado'],['FIESTA','26/26','VIP',1,100,'Disponible'],['FIESTA','26/26','VIP',1,100,'Disponible']];
 const parsed=parseResaleTable(matrix,[],2026);assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].date,'');assert.ok(parsed.warnings.some(w=>w.includes('fecha de fiesta inválida')));assert.ok(parsed.warnings.some(w=>w.includes('entrada repetida')));
});
test('importar mantiene fiestas vacías o ausentes del archivo y sus identificadores',()=>{
 const current=[...initial(),{id:'empty',name:'FIESTA NUEVA',date:'2027-01-01',tickets:[]}];
 assert.deepEqual(applyResaleImport(current,[],{},()=>crypto.randomUUID()),current);
});

test('actualización exclusiva de reventa valida los registros e ignora campos personales',()=>{
 const row={partyName:'FIESTA',type:'VIP',number:1,cost:100,salePrice:150,status:'Vendida',date:'2027-01-23'};
 const input={format:'mis-gastos-resale-import-v1',rows:[row],expenses:[{amount:999999}],cards:[{dueDay:31}]};
 const result=parseResaleUpdate(input);assert.equal(result.rows.length,1);assert.equal(result.expenses,undefined);assert.equal(result.cards,undefined);
 assert.throws(()=>parseResaleUpdate({...input,rows:[row,row]}),/duplicada/);assert.throws(()=>parseResaleUpdate({...input,rows:[{...row,date:'2027-02-31'}]}),/fecha inválida/);assert.throws(()=>parseResaleUpdate({...input,rows:[{...row,cost:-1}]}),/datos inválidos/);
});

test('COMPRAS conserva fechas y permite dos lotes con números reiniciados incluso al mismo precio',()=>{
 const sheets={COMPRAS:[['FECHA COMPRA','FIESTA','FECHA','','CANTIDAD','','PRECIO COMPRA'],['','','','EARLY','G1','VIP','EARLY','GRAL 1','VIP'],['01/10/2026','FIESTA','23/01/27',2,0,0,100,0,0],['02/10/2026','FIESTA','23/01/27',2,0,0,100,0,0]],VENTAS:[['Fiesta','Fecha fiesta','Tipo','N° entrada','Costo compra','Precio venta','Estado'],['FIESTA','23/01/27','EARLY',1,100,0,'Disponible'],['FIESTA','23/01/27','EARLY',2,100,0,'Disponible'],['FIESTA','23/01/27','EARLY',1,100,150,'Vendida'],['FIESTA','23/01/27','EARLY',2,100,0,'Disponible']]};
 const parsed=parseResaleWorkbook(sheets,[],2026);assert.equal(parsed.warnings.length,0);assert.deepEqual(parsed.rows.map(r=>r.number),[1,2,3,4]);assert.deepEqual(parsed.rows.map(r=>r.purchaseDate),['2026-10-01','2026-10-01','2026-10-02','2026-10-02']);
 const compared=compareResaleImport(parsed.rows,[]);let n=0;const merged=applyResaleImport([],compared.issues,Object.fromEntries(compared.issues.map(i=>[i.id,'excel'])),()=>String(++n));assert.equal(merged[0].tickets[2].purchaseDate,'2026-10-02');assert.equal(compareResaleImport(parsed.rows,merged).issues.length,0);
});
