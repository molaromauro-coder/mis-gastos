import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExpense, parseExpenses } from '../parser.js';
import { budgetOutcome, recoveryAppliedMonthTotal, stockMetrics, installmentDueDates } from '../finance.js';
import { expenseArsEquivalent, groupExpenses } from '../reporting.js';
import { ticketMetrics, partyMetrics } from '../resale.js';
import { parseResaleTable, compareResaleImport } from '../resale-import.js';

if(!globalThis.crypto)globalThis.crypto={randomUUID:()=>String(Math.random())};
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

const cards=[
  {name:'Mercado Pago',type:'Débito'},
  {name:'Brubank',type:'Débito'},
  {name:'Banco Francés',type:'Crédito',closingDay:20,dueDay:10}
];
const categories=['GASTOS VARIOS','SUPERMERCADO','KIOSCO','GASTOS FIJOS'];
const subcategories={
  'GASTOS VARIOS':['Gym'],
  'SUPERMERCADO':['VINOS','LIMPIEZA'],
  'GASTOS FIJOS':['LUZ','GAS','EXPENSAS']
};

test('lanzamiento: voz interpreta importe, concepto, pago y Gym/gimnasio',()=>{
  const a=parseExpense('Gasté 15 mil pesos en el gimnasio, pagué en efectivo',cards,categories,{subcategories,now:new Date('2026-10-01T10:00:00-03:00')});
  assert.equal(a.amount,15000);assert.equal(a.category,'GASTOS VARIOS');assert.equal(a.subcategory,'Gym');assert.equal(a.method,'Efectivo');
  const b=parseExpense('Pagué 28 mil pesos de luz con Brubank',cards,categories,{subcategories,now:new Date('2026-10-01T10:00:00-03:00')});
  assert.equal(b.amount,28000);assert.equal(b.subcategory,'LUZ');assert.equal(b.method,'Débito');assert.equal(b.card,'Brubank');
});

test('lanzamiento: voz separa varios gastos y conserva distintos medios',()=>{
  const rows=parseExpenses('Gasté 10 mil en kiosco en efectivo y 20 mil en supermercado con Mercado Pago',cards,categories,{subcategories,now:new Date('2026-10-01T10:00:00-03:00')});
  assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.amount),[10000,20000]);
  assert.equal(rows[0].method,'Efectivo');assert.equal(rows[1].method,'Débito');assert.equal(rows[1].card,'Mercado Pago');
});

test('lanzamiento: crédito en 12 cuotas produce 12 vencimientos',()=>{
  const e=parseExpense('Gasté un millón de pesos en una heladera con crédito Banco Francés en doce cuotas',cards,categories,{subcategories,now:new Date('2026-10-01T10:00:00-03:00')});
  assert.equal(e.amount,1000000);assert.equal(e.method,'Crédito');assert.equal(e.card,'Banco Francés');assert.equal(e.installments,12);
  const dates=installmentDueDates(cards[2],new Date('2026-10-01T10:00:00-03:00'),12);
  assert.equal(dates.length,12);
});

test('lanzamiento: carga manual tiene todas las decisiones antes de guardar',()=>{
  const form=html.match(/<dialog id="expenseDialog">([\s\S]*?)<\/dialog>/)?.[1]||'';
  for(const id of ['amount','concept','currencyArs','currencyUsd','category','subcategory','method','expenseCard','installments','saveExpense'])assert.ok(form.includes(`id="${id}"`),id);
  for(const label of ['Efectivo','Débito','Crédito'])assert.ok(form.includes(label),label);
});

test('lanzamiento: categorías, subcategorías y gastos fijos se administran y reordenan',()=>{
  for(const marker of ['renameCategoryEverywhere','renameSubcategoryEverywhere','deleteCategoryEverywhere','addSubcategory','syncCategoryConsumers','syncFixedExpenseDefinitionsFromCategories','moveFixedExpenseInList'])assert.ok(app.includes(marker),marker);
  for(const id of ['categoryList','fixedExpenseList','fixedMoveUp','fixedMoveDown'])assert.ok(html.includes(`id="${id}"`),id);
});

test('lanzamiento: informes, búsqueda, exportación y USD están conectados',()=>{
  for(const id of ['globalSearchBtn','reportChart','reportPie','consultQuery','usdRateType','refreshUsdRate'])assert.ok(html.includes(`id="${id}"`),id);
  for(const marker of ['renderReportChart','renderReportPie','globalSearchRows','exportConsultExcel','exportConsultPdf','fxRateSource','fxRateUpdatedAt'])assert.ok(app.includes(marker),marker);
  assert.equal(expenseArsEquivalent({currency:'USD',amount:10,fxRate:1500}),15000);
  const grouped=groupExpenses([{currency:'ARS',amount:100,category:'A'},{currency:'ARS',amount:200,category:'A'}],x=>x.category);
  assert.equal(grouped[0].arsEquivalent,300);
});

test('lanzamiento: recuperos, presupuesto, ahorro y stock conservan cálculos básicos',()=>{
  const rec=[
    {amount:300,currency:'ARS',date:'2026-10-01',affectsExpenseMonth:true},
    {amount:200,currency:'ARS',date:'2026-09-30',affectsExpenseMonth:false}
  ];
  assert.equal(recoveryAppliedMonthTotal(rec,'2026-10','2026-10'),300);
  const budget=budgetOutcome(1000,[{amount:400,currency:'ARS',date:'2026-10-01T12:00:00'}],[],'2026-10');
  assert.equal(budget.spent,400);assert.equal(budget.saving,600);
  const stock=stockMetrics({quantity:10,totalAmount:1000,consumptions:[{quantity:3}]});
  assert.equal(stock.remaining,7);
  for(const id of ['recoveries','budget','savings','stock'])assert.ok(html.includes(`id="${id}"`),id);
});

test('lanzamiento: Papelera está anteúltima en el menú y la app mantiene formato móvil en PC',()=>{
  const menu=html.match(/<dialog id="menuDialog"[\s\S]*?<\/dialog>/)?.[0]||'';
  const views=[...menu.matchAll(/data-menu-view="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(views.at(-2),'trash');assert.equal(views.at(-1),'consultations');
  assert.match(css,/@media\(min-width:700px\)[\s\S]*?max-width:430px!important/);
});

test('lanzamiento: Reventa sigue separada y sus cuentas e importación son consistentes',()=>{
  const sold=ticketMetrics({cost:50000,salePrice:80000,status:'Vendida'},{ownerPercent:70,sellerPercent:30});
  assert.equal(sold.netGain,30000);
  const p=partyMetrics({tickets:[{cost:50000,salePrice:80000,status:'Vendida'}]},{ownerPercent:70,sellerPercent:30});
  assert.equal(p.sales,80000);assert.equal(p.recovered,50000);
  const matrix=[['FIESTA','TIPO ENTRADA','N° ENTRADA','COSTO COMPRA','PRECIO VENTA','ESTADO'],['TEST','VIP',1,50000,80000,'VENDIDA']];
  const parsed=parseResaleTable(matrix,[],2026);
  assert.equal(parsed.rows.length,1);
  const cmp=compareResaleImport(parsed.rows,[]);
  assert.equal(cmp.issues.length,1);assert.equal(cmp.issues[0].kind,'new');
  assert.ok(app.includes("const resaleApi = sharedMode ? null : await import"));
});

test('lanzamiento: no hay IDs HTML duplicados ni vistas del menú inexistentes',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids.filter((id,i)=>ids.indexOf(id)!==i),[]);
  const set=new Set(ids);
  const views=[...html.matchAll(/data-menu-view="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(views.filter(v=>!set.has(v)),[]);
});

test('lanzamiento: versión PWA auditada es coherente',()=>{
  assert.equal(html.match(/app\.js\?v=(\d+)/)?.[1],'78');
  assert.equal(html.match(/styles\.css\?v=(\d+)/)?.[1],'78');
  assert.equal(sw.match(/mis-gastos-v(\d+)/)?.[1],'78');
});
