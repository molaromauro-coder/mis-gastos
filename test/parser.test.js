import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseExpense, parseExpenses, parseTemporal } from '../parser.js';
if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => String(Math.random()) };

test('interpreta moneda, medio, tarjeta y cuotas numéricas', () => {
  const e = parseExpense('pagué 120 dólares con crédito Mi Visa en 12 cuotas', [{ name: 'Mi Visa' }]);
  assert.equal(e.amount, 120); assert.equal(e.currency, 'USD'); assert.equal(e.method, 'Crédito'); assert.equal(e.card, 'Mi Visa'); assert.equal(e.installments, 12);
});
test('interpreta importes y cuotas escritos con palabras',()=>{
  assert.equal(parseAmount('cincuenta mil pesos'),50000);
  assert.equal(parseAmount('ciento veinte mil pesos'),120000);
  assert.equal(parseAmount('un millón doscientos mil pesos'),1200000);
  assert.equal(parseExpense('gasté un millón en una heladera con crédito Mi Visa en doce cuotas',[{name:'Mi Visa'}]).installments,12);
});
test('interpreta separadores de miles usados por el reconocimiento de voz de iPhone',()=>{
  assert.equal(parseAmount('50.000 pesos'),50000);
  assert.equal(parseAmount('50,000 pesos'),50000);
  assert.equal(parseAmount('1.200.000 pesos'),1200000);
  assert.equal(parseAmount('1,200,000 pesos'),1200000);
  assert.equal(parseAmount('50 000 pesos'),50000);
  assert.equal(parseAmount('1 200 000 pesos'),1200000);
});
test('separa dos gastos cuando iPhone usa espacios para miles',()=>{
  const items=parseExpenses('Gasté 50 000 pesos en supermercado y 70 000 pesos de combustible');
  assert.equal(items.length,2); assert.deepEqual(items.map((x)=>x.amount),[50000,70000]);
});
test('separa múltiples gastos aunque el segundo no repita el verbo', () => {
  const items = parseExpenses('Gasté 10 mil en kiosco y 20 mil en supermercado');
  assert.equal(items.length, 2); assert.deepEqual(items.map((x) => x.amount), [10000, 20000]);
});
test('separa múltiples gastos con importes escritos en palabras',()=>{
  const items=parseExpenses('Gasté cincuenta mil en kiosco y treinta mil en supermercado');
  assert.equal(items.length,2); assert.deepEqual(items.map((x)=>x.amount),[50000,30000]);
});
test('separa dos gastos cuando iPhone transcribe miles con coma',()=>{
  const items=parseExpenses('Gasté 50,000 pesos en kiosco y 50,000 pesos en supermercado');
  assert.equal(items.length,2); assert.deepEqual(items.map((x)=>x.amount),[50000,50000]);
});
test('entiende millones y categorías configuradas', () => {
  assert.equal(parseAmount('un millón de pesos'), 1000000);
  const e = parseExpense('gasté 50 dólares en comida', [], ['Comida']);
  assert.equal(e.category, 'Comida'); assert.equal(e.currency, 'USD');
});
test('no asigna una tarjeta desconocida', () => assert.equal(parseExpense('pagué 200 con débito del Francés', []).card, ''));

test('si no se menciona medio de pago queda pendiente de definición',()=>{
  assert.equal(parseExpense('gasté cincuenta mil pesos en kiosco').method,'Sin definir');
});
test('si se dice efectivo por voz lo conserva',()=>{
  assert.equal(parseExpense('gasté cincuenta mil pesos en kiosco en efectivo').method,'Efectivo');
});
test('la voz no asigna una tarjeta de tipo incorrecto',()=>{
  const e=parseExpense('pagué 200 con débito Visa',[{name:'Visa',type:'Crédito'}]);
  assert.equal(e.method,'Débito'); assert.equal(e.card,'');
});

test('interpreta correctamente importes numéricos grandes y poco redondos',()=>{
  const cases=[
    ['17500 pesos',17500],
    ['17.500 pesos',17500],
    ['diecisiete mil quinientos pesos',17500],
    ['58000 pesos',58000],
    ['58.000 pesos',58000],
    ['cincuenta y ocho mil pesos',58000],
    ['1500000 pesos',1500000],
    ['0584562 pesos',584562],
    ['856340 pesos',856340],
    ['854266 pesos',854266],
    ['679684321 pesos',679684321],
    ['1.500.000 pesos',1500000],
    ['1 500 000 pesos',1500000],
    ['584.562 pesos',584562],
    ['856 340 pesos',856340],
    ['679.684.321 pesos',679684321],
    ['679 684 321 pesos',679684321]
  ];
  for(const [spoken,expected] of cases) assert.equal(parseAmount(spoken),expected,spoken);
});
test('mantiene importes difíciles al separar varios gastos dictados juntos',()=>{
  const items=parseExpenses('Gasté 856340 pesos en supermercado y 854266 pesos de combustible');
  assert.equal(items.length,2);
  assert.deepEqual(items.map((x)=>x.amount),[856340,854266]);
});

test('no confunde la hora con el importe del gasto',()=>{
  assert.equal(parseAmount('ayer lunes a las 20 horas gasté veinte mil pesos en el kiosco'),20000);
  assert.equal(parseAmount('hace tres domingos gasté 50.000 pesos en el kiosco'),50000);
});

test('interpreta ayer con hora explícita y deja medio de pago pendiente',()=>{
  const now=new Date(2026,8,29,0,43,0,0);
  const e=parseExpense('Ayer lunes a las 20 horas gasté veinte mil pesos en el kiosco',[],[],{now});
  const when=new Date(e.date);
  assert.equal(e.amount,20000);
  assert.equal(e.method,'Sin definir');
  assert.equal(when.getFullYear(),2026);
  assert.equal(when.getMonth(),8);
  assert.equal(when.getDate(),28);
  assert.equal(when.getHours(),20);
  assert.equal(e.dateSpecified,true);
  assert.equal(e.timeSpecified,true);
});

test('ayer sin hora conserva la fecha de ayer y no exige hora explícita',()=>{
  const now=new Date(2026,8,29,0,43,0,0);
  const e=parseExpense('Ayer gasté 50.000 pesos en el kiosco',[],[],{now});
  const when=new Date(e.date);
  assert.equal(when.getFullYear(),2026);
  assert.equal(when.getMonth(),8);
  assert.equal(when.getDate(),28);
  assert.equal(e.dateSpecified,true);
  assert.equal(e.timeSpecified,false);
});

test('interpreta próximo día, día anterior y hace N días de semana',()=>{
  const now=new Date(2026,8,29,0,43,0,0);
  const next=parseExpense('El domingo gasté 100.000 pesos con débito',[],[],{now});
  const prev=parseExpense('El domingo anterior gasté 100.000 pesos con débito',[],[],{now});
  const ago=parseExpense('Hace tres domingos gasté 100.000 pesos',[],[],{now});
  assert.equal(new Date(next.date).toDateString(),new Date(2026,9,4,0,43).toDateString());
  assert.equal(new Date(prev.date).toDateString(),new Date(2026,8,27,0,43).toDateString());
  assert.equal(new Date(ago.date).toDateString(),new Date(2026,8,13,0,43).toDateString());
});

test('interpreta una fecha exacta en español',()=>{
  const now=new Date(2026,8,29,0,43,0,0);
  const e=parseExpense('El 12 de septiembre gasté 100.000 pesos',[],[],{now});
  assert.equal(new Date(e.date).toDateString(),new Date(2026,8,12,0,43).toDateString());
});

test('marca como ambigua la expresión el otro martes y ofrece opciones',()=>{
  const now=new Date(2026,8,29,0,43,0,0);
  const e=parseExpense('El otro martes gasté 10.000 pesos',[],[],{now});
  assert.equal(e.dateAmbiguous,true);
  assert.equal(e.dateChoices.length,2);
});

test('crédito sin cuotas explícitas queda pendiente de cuotas',()=>{
  const card={name:'Banco Macro',type:'Crédito'};
  const e=parseExpense('Compré una heladera por 7.000 pesos con tarjeta de crédito del Banco Macro',[card]);
  assert.equal(e.method,'Crédito');
  assert.equal(e.card,'Banco Macro');
  assert.equal(e.installments,1);
  assert.equal(e.installmentsSpecified,false);
});

test('crédito con cuotas explícitas conserva cantidad y marca que fueron dichas',()=>{
  const card={name:'Banco Macro',type:'Crédito'};
  const e=parseExpense('Compré una heladera por 7.000 pesos con tarjeta de crédito del Banco Macro en ocho cuotas',[card]);
  assert.equal(e.installments,8);
  assert.equal(e.installmentsSpecified,true);
});

test('parseTemporal admite la hora en palabras',()=>{
  const now=new Date(2026,8,29,0,43,0,0);
  const temporal=parseTemporal('ayer a las dos de la tarde',now);
  const when=new Date(temporal.date);
  assert.equal(when.getDate(),28);
  assert.equal(when.getHours(),14);
  assert.equal(temporal.timeSpecified,true);
});


test('luca y lucas equivalen a miles de pesos',()=>{
  assert.equal(parseAmount('10 lucas'),10000);
  assert.equal(parseAmount('17,5 lucas'),17500);
  assert.equal(parseAmount('50 lucas'),50000);
  assert.equal(parseAmount('diez lucas'),10000);
  assert.equal(parseAmount('diez mil lucas'),10000000);
});

test('Mercado Pago sin aclarar medio se toma como debito sin preguntar',()=>{
  const cards=[{name:'Mercado Pago',type:'Débito'}];
  const e=parseExpense('Gasté 50.000 pesos en supermercado, pagué con Mercado Pago',cards);
  assert.equal(e.method,'Débito');
  assert.equal(e.card,'Mercado Pago');
  assert.equal(e.amount,50000);
});

test('Mercado Pago con credito explicito conserva credito y exige cuotas si no se dijeron',()=>{
  const cards=[{name:'Mercado Pago',type:'Débito'},{name:'Mercado Pago',type:'Crédito'}];
  const e=parseExpense('Gasté 50.000 pesos en supermercado con crédito Mercado Pago',cards);
  assert.equal(e.method,'Crédito');
  assert.equal(e.card,'Mercado Pago');
  assert.equal(e.installmentsSpecified,false);
});


test('palo y palos equivalen a millones de pesos',()=>{
  assert.equal(parseAmount('un palo'),1000000);
  assert.equal(parseAmount('un palo y medio'),1500000);
  assert.equal(parseAmount('1,5 palos'),1500000);
  assert.equal(parseAmount('10 palos'),10000000);
  assert.equal(parseAmount('diez palos'),10000000);
});

test('formato argentino con punto reconoce 5.000 y 100.000 pesos',()=>{
  assert.equal(parseAmount('5.000 pesos'),5000);
  assert.equal(parseAmount('100.000 pesos'),100000);
});

test('barre 100 importes de 6 cifras con puntos de miles',()=>{
  const dotted=(n)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  for(let i=0;i<100;i++){
    const value=100000+((i*7919+12345)%900000);
    assert.equal(parseAmount(`${dotted(value)} pesos`),value,`${dotted(value)} pesos`);
  }
});

test('barre 100 importes de 8 cifras con puntos de miles',()=>{
  const dotted=(n)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  for(let i=0;i<100;i++){
    const value=10000000+((i*104729+7654321)%90000000);
    assert.equal(parseAmount(`${dotted(value)} pesos`),value,`${dotted(value)} pesos`);
  }
});


test('infere el tipo por una tarjeta configurada univoca y limpia el concepto',()=>{
  const cards=[{name:'Mercado Pago',type:'Débito'},{name:'Banco Macro',type:'Crédito'}];
  const e=parseExpense('Gasté 10 lucas de vianda, pagué con Banco Macro',cards);
  assert.equal(e.amount,10000);
  assert.equal(e.method,'Crédito');
  assert.equal(e.card,'Banco Macro');
  assert.equal(e.installmentsSpecified,false);
  assert.match(e.concept,/vianda/i);
  assert.doesNotMatch(e.concept,/macro/i);
});

test('la ultima correccion verbal reemplaza importe y medio de pago',()=>{
  const cards=[{name:'Mercado Pago',type:'Débito'}];
  const e=parseExpense('Gasté 60 mil en kiosco en efectivo, no perdón, 50 mil con débito Mercado Pago',cards);
  assert.equal(e.amount,50000);
  assert.equal(e.method,'Débito');
  assert.equal(e.card,'Mercado Pago');
  assert.match(e.concept,/kiosco/i);
});

test('reconoce subcategoria por voz y asigna su categoria madre',()=>{
  const e=parseExpense('Gasté 25.000 pesos de luz',[],['Gastos fijos'],{subcategories:{'Gastos fijos':['Luz','Gas']}});
  assert.equal(e.category,'Gastos fijos');
  assert.equal(e.subcategory,'Luz');
});
