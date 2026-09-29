from pathlib import Path

parser_path=Path('parser.js')
test_path=Path('test/parser.test.js')
sw_path=Path('sw.js')

parser=parser_path.read_text(encoding='utf-8')
tests=test_path.read_text(encoding='utf-8')
sw=sw_path.read_text(encoding='utf-8')

old="""export function parseAmount(text) {
  const clean=cleanNumericText(text);
  let lucas=clean.match(/\\b(\\d+(?:\\.\\d{1,2})?)\\s*(millones?|millon|mil)?\\s*lucas?\\b/i);
"""
new="""export function parseAmount(text) {
  const clean=cleanNumericText(text);
  const paloYMedio=clean.match(/\\b(?:(\\d+(?:\\.\\d{1,2})?)|(un|uno|una))\\s*palos?\\s+y\\s+medio\\b/i);
  if(paloYMedio) return (paloYMedio[1]?Number(paloYMedio[1]):1)*1_000_000+500_000;
  let palos=clean.match(/\\b(\\d+(?:\\.\\d{1,2})?)\\s*palos?\\b/i);
  if(palos) return Number(palos[1])*1_000_000;
  const paloPos=clean.search(/\\bpalos?\\b/i);
  if(paloPos>=0){
    const value=lastWordNumber(clean.slice(0,paloPos));
    if(value!=null) return value*1_000_000;
  }
  let lucas=clean.match(/\\b(\\d+(?:\\.\\d{1,2})?)\\s*(millones?|millon|mil)?\\s*lucas?\\b/i);
"""
if old not in parser:
    raise SystemExit('No se encontró el inicio esperado de parseAmount')
parser=parser.replace(old,new,1)

old_clean="pesos?|lucas?|d[oó]lares?"
new_clean="pesos?|lucas?|palos?|d[oó]lares?"
if old_clean not in parser:
    raise SystemExit('No se encontró cleanConcept esperado')
parser=parser.replace(old_clean,new_clean,1)

marker="test('Mercado Pago con credito explicito conserva credito y exige cuotas si no se dijeron'"
if marker not in tests:
    raise SystemExit('No se encontró el final esperado de parser.test.js')

addition=r'''

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
'''
if "palo y palos equivalen a millones de pesos" not in tests:
    tests += addition

if "mis-gastos-v22" not in sw:
    raise SystemExit('Versión de caché inesperada')
sw=sw.replace("mis-gastos-v22","mis-gastos-v23",1)

parser_path.write_text(parser,encoding='utf-8')
test_path.write_text(tests,encoding='utf-8')
sw_path.write_text(sw,encoding='utf-8')
print('Palo/palos y batería de 200 importes agregados')
