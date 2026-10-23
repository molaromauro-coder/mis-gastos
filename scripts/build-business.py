"""Extract the established Reventa screens without personal-expense boot, recovery or seeds."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
app=(root/'app.js').read_text()
html=(root/'index.html').read_text()
out=root/'negocio'
out.mkdir(exist_ok=True)
core=(root/'resale.js').read_text().split('function resalePartyChronology',1)[1]
core=core.replace('normalizeSplit(split.ownerPercent, split.sellerPercent)','normalizeSplit(ticket?.sellerId ? 100-Number(ticket.sellerPercent) : split.ownerPercent, ticket?.sellerId ? Number(ticket.sellerPercent) : split.sellerPercent)')
core=core.replace("const cost = Number(ticket?.cost || 0);", "const cost = ticket?.status==='Uso personal'?0:Number(ticket?.cost || 0);")
(out/'metrics.js').write_text('function resalePartyChronology'+core)
section=re.search(r'<section id="resale".*?</section>',html,re.S).group()
section=section.replace('Exportar CSV','Exportar Excel')
section=section.replace('view owner-only','view active').replace('REVENTA · VERSIÓN 145','REVENTA · APP INDEPENDIENTE')
dialogs='\n'.join(re.search(r'<dialog id="'+name+r'".*?</dialog>',html,re.S).group() for name in ['resaleImportReview','resalePartyDialog','resaleEventDialog','resaleSplitDialog'])
dialogs=dialogs.replace('Al cambiar estos porcentajes se recalculan automáticamente todas las ventas, fiestas y el balance general.', 'Este reparto se aplicará a las próximas compras. Las entradas existentes conservarán su porcentaje.').replace('CONFIGURACIÓN ÚNICA','PRÓXIMAS COMPRAS')
dialogs=dialogs.replace('<label>Fecha de la fiesta<input id="resalePartyDate" type="date"></label>', '<label>Fecha de la fiesta<input id="resalePartyDate" type="date" required></label><label>Fecha de compra<input id="resalePurchaseDate" type="date" required></label>')
head='''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17665a"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://iksqhsbesqjdtkjjqpvt.supabase.co; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'"><title>Reventa de Entradas</title><link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" href="../styles.css?v=156"><link rel="stylesheet" href="./business.css"></head><body>
<main id="login" class="recovery-screen"><h1>Reventa de Entradas</h1><p>Compras, ventas y balances de entradas.</p><form id="loginForm"><label>Correo<input id="email" type="email" autocomplete="username" required></label><label>Contraseña<input id="password" type="password" autocomplete="current-password" required></label><button id="eye" type="button" aria-pressed="false">Mostrar contraseña</button><button type="submit">Ingresar</button></form><button id="forgot" type="button">Olvidé mi contraseña</button><p id="loginStatus" role="status"></p></main>
<div class="app" id="businessApp" hidden><header><h1>Reventa de Entradas</h1><p id="account"></p><p id="syncStatus" role="status"></p><div class="resale-tools"><button id="syncNow">Sincronizar</button><button id="backup">Guardar respaldo</button><button id="logout">Cerrar sesión</button></div></header><main>'''
(out/'index.html').write_text(head+section+'</main></div>'+dialogs+'<p id="businessMessage" role="alert"></p><script src="../vendor/supabase-2.57.4.js"></script><script type="module" src="./app.js"></script></body></html>')
helpers=app[app.index('const uid ='):app.index('let expenseEditContext=')]
helpers=helpers.replace("new URL('./vendor/", "new URL('../vendor/")
helpers=helpers.replace("{type:'array',cellDates:true}","{type:'array'}")
helpers=helpers.replace("const sameType = party.tickets.filter((t) => t.type.toLowerCase() === type.toLowerCase()).length;", "const sameType = Math.max(0,...party.tickets.filter(t=>t.type.toLowerCase()===type.toLowerCase()).map(t=>Number(t.number)||0));")
# Use the exact selected party when adding a batch, even if two events share a name.
helpers=helpers.replace("$('#resalePartyName').value=party.name;", "$('#resalePartyForm').dataset.partyId=party.id;$('#resalePartyName').value=party.name;")
helpers=helpers.replace("let party = state.resale.parties.find((p) => p.name.toLowerCase() === name.toLowerCase());", "const selectedId=$('#resalePartyForm').dataset.partyId;let party = selectedId?state.resale.parties.find(p=>p.id===selectedId):state.resale.parties.find(p=>p.name.toLowerCase()===name.toLowerCase()&&p.date===date);")
helpers=helpers.replace("cost, salePrice: 0, status: 'Disponible'", "cost, salePrice: 0, status: 'Disponible',sellerId:'purchase-default',sellerName:'Reparto de compra',sellerPercent:resaleSplit().sellerPercent")
helpers=helpers.replace("function addResaleBatch({ name, date, type, qty, cost }) {", "function addResaleBatch({ name, date, type, qty, cost }) {if(!name||!type||!date||!Number.isInteger(qty)||qty<1||qty>200||!Number.isFinite(cost)||cost<0)throw Error('Revisá los datos de la compra.');")
helpers=helpers.replace("sellerId:'purchase-default'", "purchaseDate:$('#resalePurchaseDate').value,sellerId:'purchase-default'")
helpers=helpers.replace("$('#resaleQty').value=1;", "$('#resaleQty').value=1;$('#resalePurchaseDate').value=new Date().toLocaleDateString('en-CA');")
helpers=helpers.replace("bindLocalizedNumberInputs($('#resaleList'));","bindLocalizedNumberInputs($('#resaleList'));bindSellers();")
helpers=helpers.replace('Ganancia Mauro (${numberText(resaleSplit().ownerPercent,1)}%)','Ganancia Mauro').replace('Ganancia para Mauro (${numberText(split.ownerPercent,1)}%)','Ganancia para Mauro').replace('Ganancia Mauro (${numberText(split.ownerPercent,1)}%)','Ganancia Mauro').replace('Total vendedor (${numberText(split.sellerPercent,1)}%)','Total vendedores')
handlers=app.split('if(!sharedMode && resaleApi){',1)[1].split("\n\n\nwindow.addEventListener('pagehide'",1)[0].rstrip()
assert handlers.endswith('}')
handlers=handlers[:-1]
handlers=handlers.replace("$('#addResaleParty').onclick = () => {", "$('#addResaleParty').onclick = () => {delete $('#resalePartyForm').dataset.partyId;")
# All saves fail closed; an error never becomes a successful sales confirmation.
handlers=handlers.replace('restoreState(previous);save();renderResale();','restoreState(previous);renderResale();')
helpers=helpers.replace('if(!file)return;', "if(!file)return;if(file.size>15*1024*1024)return showToast('El archivo supera los 15 MB. Dividilo en planillas más pequeñas.');")
helpers=helpers.replace('const wb=XLSX.read(await file.arrayBuffer(),', 'const templateBytes=await file.arrayBuffer();const wb=XLSX.read(templateBytes,')
helpers=helpers.replace('showResaleImportReview(file.name,parsed,comparison);', 'if(/\\.xlsx$/i.test(file.name))parsed.excelTemplate=captureTemplate(await file.arrayBuffer(),file.name);showResaleImportReview(file.name,parsed,comparison);')
helpers=helpers.replace('parseResaleWorkbook(sheets,state.resale.parties)', 'attachExcelRates(XLSX,wb,parseBusinessWorkbook(sheets,state.resale.parties))')
helpers=helpers.replace('compareResaleImport(', 'compareBusinessImport(')
start=helpers.index('function exportResaleCsv()')
helpers=helpers[:start]+'''async function exportResaleCsv(){
 try{const XLSX=await ensureExcelReader();const bytes=exportOriginalTemplate(XLSX,state.resale),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download='reventa-entradas.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Excel exportado con sus fórmulas originales. Abrilo en Excel para recalcular los resultados.');}catch(error){showToast('No se pudo exportar: '+error.message);}
}
'''+helpers[helpers.index('\n}',start)+2:]
handlers=handlers.replace('state.resale.ownerPercent = split.ownerPercent; state.resale.sellerPercent = split.sellerPercent;', 'state.resale=freezeExistingSplit(state.resale);state.resale.ownerPercent = split.ownerPercent; state.resale.sellerPercent = split.sellerPercent;').replace('Reparto actualizado en toda Reventa','Reparto actualizado para próximas compras. Las anteriores conservan sus porcentajes.')
handlers=handlers.replace("$('#resaleQty').value=1;", "$('#resaleQty').value=1;$('#resalePurchaseDate').value=new Date().toLocaleDateString('en-CA');")
handlers=handlers.replace('applyResaleImport(', 'applyBusinessImport(').replace('verifyResaleImport(', 'verifyBusinessImport(')
handlers=handlers.replace('state.resale.importHistory=', 'if(pendingResaleImport.parsed.excelTemplate)state.resale.excelTemplate=pendingResaleImport.parsed.excelTemplate;state.resale.importHistory=')
prefix='''import {captureTemplate,exportOriginalTemplate} from './template-export.js';
import {freezeExistingSplit} from './sellers.js';
import {attachExcelRates} from './excel-rates.js';
import {createBusinessWorkbook,parseBusinessWorkbook,compareBusinessImport,applyBusinessImport,verifyBusinessImport} from './workbook.js';
import { installSellers } from './sellers-ui.js';
import { installSimulator } from './simulator-ui.js';
import { createBusinessSession } from './session.js';
import { normalizeSplit,ticketMetrics,partyMetrics,portfolioMetrics,withPortfolioPercent,groupResalePartiesByDate,orderResaleBalanceParties } from './metrics.js';
import { parseLocalizedNumber,formatLocalizedNumber,formatLocalizedInteger,formatNumericInputValue } from '../numeric-format.js';
import { compareResaleImport,applyResaleImport,parseResaleUpdate,parseResaleWorkbook,mergeResaleParties,verifyResaleImport,verifyResalePreservation,saveVerifiedResaleBackup } from '../resale-import.js';
const $=s=>document.querySelector(s),sharedMode=false,resaleApi=true;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(n,c='ARS')=>new Intl.NumberFormat('es-AR',{style:'currency',currency:c,maximumFractionDigits:2}).format(n||0);
const numberText=(n,maximumFractionDigits=2)=>formatLocalizedNumber(n,{maximumFractionDigits});
const integerText=n=>formatLocalizedInteger(n);
const localizedInputNumber=s=>parseLocalizedNumber($(s)?.value||0);
function bindLocalizedNumberInputs(root=document){root.querySelectorAll('[data-local-number]').forEach(el=>{if(el.dataset.bound)return;el.dataset.bound='1';el.addEventListener('blur',()=>{const n=parseLocalizedNumber(el.value);if(Number.isFinite(n))el.value=formatNumericInputValue(n,{maximumFractionDigits:2});});});}
function showToast(message){$('#businessMessage').textContent=message;}
let state,STORAGE_KEY,session;
let bindSellers=()=>{};
const cloneState=()=>structuredClone(state),restoreState=value=>{state=value;};
const parseStoredState=raw=>raw?JSON.parse(raw):null,safeStoredValue=k=>localStorage.getItem(k);
function save(){try{session.save(state);return true;}catch(error){const old=localStorage.getItem(STORAGE_KEY);if(old)state=JSON.parse(old);showToast(error.message);throw error;}}
session=createBusinessSession({getState:()=>state,onState:(next,key)=>{state=next;STORAGE_KEY=key;renderResale();},canApply:()=>!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,select,textarea'),message:showToast});
'''
suffix='''
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
window.addEventListener('error',e=>{showToast(e.error?.message||'No se completó la operación.');});
window.addEventListener('unhandledrejection',e=>{showToast(e.reason?.message||'No se completó la operación.');});
bindLocalizedNumberInputs();
bindSellers=installSellers({getState:()=>state,save,render:()=>renderResale(),money,message:showToast});
installSimulator({getState:()=>state,money});
await session.start();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
'''
(out/'app.js').write_text(prefix+helpers+handlers+suffix)
