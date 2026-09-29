from pathlib import Path

parser_path=Path('parser.js')
test_path=Path('test/parser.test.js')
parser=parser_path.read_text(encoding='utf-8')
tests=test_path.read_text(encoding='utf-8')

def rep(text,old,new,label):
    if old not in text:
        raise SystemExit(f'No se encontro: {label}')
    return text.replace(old,new,1)

old="""export function parseAmount(text) {
  const clean=cleanNumericText(text);
  let match=clean.match(/(?:usd|u\\$s|\\$)\\s*(\\d+(?:\\.\\d{1,2})?)\\s*(millones?|millon|mil)?/i);"""
new="""export function parseAmount(text) {
  const clean=cleanNumericText(text);
  let lucas=clean.match(/\\b(\\d+(?:\\.\\d{1,2})?)\\s*(millones?|millon|mil)?\\s*lucas?\\b/i);
  if(lucas) return Number(lucas[1])*multiplier(lucas[2])*1000;
  const lucasPos=clean.search(/\\blucas?\\b/i);
  if(lucasPos>=0){
    const value=lastWordNumber(clean.slice(0,lucasPos));
    if(value!=null) return value*1000;
  }
  let match=clean.match(/(?:usd|u\\$s|\\$)\\s*(\\d+(?:\\.\\d{1,2})?)\\s*(millones?|millon|mil)?/i);"""
parser=rep(parser,old,new,'parseAmount lucas')

old="""    .replace(/\\b(?:pagu[eé]|gast[eé]|compr[eé]|sali[oó]|cost[oó]|en|con|del?|la|el|a|las?|tarjeta|banco|efectivo|d[eé]bito|cr[eé]dito|pesos?|d[oó]lares?|usd|u\\$s|cuotas?|mill[oó]n(?:es)?)\\b/gi,' ')"""
new="""    .replace(/\\b(?:pagu[eé]|gast[eé]|compr[eé]|sali[oó]|cost[oó]|en|con|del?|la|el|a|las?|tarjeta|banco|efectivo|d[eé]bito|cr[eé]dito|pesos?|lucas?|d[oó]lares?|usd|u\\$s|cuotas?|mill[oó]n(?:es)?)\\b/gi,' ')"""
parser=rep(parser,old,new,'cleanConcept lucas')

old="""  const installmentInfo=parseInstallments(lower);
  const method=/credito|cuotas?/.test(lower)?'Crédito':/debito/.test(lower)?'Débito':/efectivo/.test(lower)?'Efectivo':'Sin definir';
  const card=cards.find((item)=>item?.name&&(!item.type||item.type===method)&&lower.includes(normalized(item.name)))?.name||'';"""
new="""  const installmentInfo=parseInstallments(lower);
  let method=/credito|cuotas?/.test(lower)?'Crédito':/debito/.test(lower)?'Débito':/efectivo/.test(lower)?'Efectivo':'Sin definir';
  if(method==='Sin definir'&&/\\bmercado\\s+pago\\b/.test(lower)) method='Débito';
  const card=cards.find((item)=>item?.name&&(!item.type||item.type===method)&&lower.includes(normalized(item.name)))?.name||'';"""
parser=rep(parser,old,new,'Mercado Pago default debit')

extra="""

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
"""
if "luca y lucas equivalen a miles de pesos" not in tests:
    tests += extra

parser_path.write_text(parser,encoding='utf-8')
test_path.write_text(tests,encoding='utf-8')
