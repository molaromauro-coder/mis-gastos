from pathlib import Path

APP=Path('app.js')
SW=Path('sw.js')
text=APP.read_text(encoding='utf-8')

old="const state = loadState();\nfunction purgeExpiredTrash()"
new="""const state = loadState();
function demoCardId(){return crypto.randomUUID?.() || ('demo-' + Date.now() + '-' + Math.random().toString(16).slice(2));}
function seedDemoCardsOnce(){
  if(sharedMode || state.settings?.demoCardsSeeded) return;
  if(!Array.isArray(state.cards)) state.cards=[];
  if(state.cards.length===0){
    state.cards.push(
      {id:demoCardId(),name:'Banco Macro',type:'Débito',closingDay:0,dueDay:0,demo:true},
      {id:demoCardId(),name:'Mercado Pago',type:'Débito',closingDay:0,dueDay:0,demo:true},
      {id:demoCardId(),name:'Banco Francés',type:'Crédito',closingDay:25,dueDay:10,demo:true},
      {id:demoCardId(),name:'Banco Macro',type:'Crédito',closingDay:25,dueDay:10,demo:true}
    );
  }
  state.settings={...state.settings,demoCardsSeeded:true};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
seedDemoCardsOnce();
function purgeExpiredTrash()"""
if old not in text: raise SystemExit('No se encontró punto de inserción de tarjetas demo')
text=text.replace(old,new,1)

repls={
"const card = state.cards.find((c) => c.name === expense.card);":"const card = state.cards.find((c) => c.name === expense.card && c.type === 'Crédito');",
"const all = state.expenses.filter((e) => e.card === card.name);":"const all = state.expenses.filter((e) => e.card === card.name && e.method === card.type);",
"function monthlyCardTotal(card, date) { return state.expenses.filter((e) => e.card === card.name && effectiveDate(e).getFullYear() === date.getFullYear() && effectiveDate(e).getMonth() === date.getMonth()); }":"function monthlyCardTotal(card, date) { return state.expenses.filter((e) => e.card === card.name && e.method === card.type && effectiveDate(e).getFullYear() === date.getFullYear() && effectiveDate(e).getMonth() === date.getMonth()); }",
"const card = state.cards.find((c) => c.name === $('#expenseCard').value), count = Number($('#installments').value || 1), amount = Number($('#amount').value || 0);":"const card = state.cards.find((c) => c.name === $('#expenseCard').value && c.type === $('#method').value), count = Number($('#installments').value || 1), amount = Number($('#amount').value || 0);",
"const card=state.cards.find((c)=>c.name===e.card); if(!card)return '';":"const card=state.cards.find((c)=>c.name===e.card&&c.type==='Crédito'); if(!card)return '';",
"const duplicate = state.cards.some((c) => c.id !== editingCardId && c.name.toLowerCase() === name.toLowerCase());":"const selectedType = $('#cardType').value;\n  const duplicate = state.cards.some((c) => c.id !== editingCardId && c.name.toLowerCase() === name.toLowerCase() && c.type === selectedType);",
"const data = { name, type: $('#cardType').value, closingDay: Number($('#closingDay').value), dueDay: Number($('#dueDay').value) };":"const data = { name, type: selectedType, closingDay: Number($('#closingDay').value), dueDay: Number($('#dueDay').value) };",
"const linked=(state.recurring||[]).filter((r)=>r.card===card?.name);":"const linked=(state.recurring||[]).filter((r)=>r.card===card?.name&&r.method===card?.type);",
"if(card) state.recurring.forEach((r)=>{if(r.card===card.name){r.card='';r.active=false;}});":"if(card) state.recurring.forEach((r)=>{if(r.card===card.name&&r.method===card.type){r.card='';r.active=false;}});"
}
for a,b in repls.items():
    if a not in text: raise SystemExit(f'No se encontró patrón: {a[:90]}')
    text=text.replace(a,b,1)
APP.write_text(text,encoding='utf-8')

sw=SW.read_text(encoding='utf-8')
if "mis-gastos-v19" not in sw: raise SystemExit('Versión de caché inesperada')
sw=sw.replace("mis-gastos-v19","mis-gastos-v20",1)
SW.write_text(sw,encoding='utf-8')
print('Tarjetas demo y distinción por tipo aplicadas')
