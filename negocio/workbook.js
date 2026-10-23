// Excel is an update surface, not a replacement for the complete JSON backup.
import {parseResaleWorkbook,parseResaleUpdate,compareResaleImport,applyResaleImport,verifyResaleImport} from '../resale-import.js';
import {ticketMetrics,partyMetrics,normalizeSplit} from './metrics.js';
const HEADER=['Fiesta','Fecha fiesta','Tipo','N°','Costo compra','Precio venta','Estado','Fecha compra','ID fiesta','ID entrada','ID vendedor','Vendedor','Porcentaje vendedor'];
const norm=v=>String(v).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
const extra=['sellerId','sellerName','sellerPercent'];
const key=r=>[r.partyName.trim().toLocaleLowerCase('es-AR'),r.type.trim().toLocaleLowerCase('es-AR'),r.number].join('|');
const nonblank=r=>r.some(v=>v!==''&&v!==null&&v!==undefined);
function assertUniqueNames(parties){const seen=new Set();for(const p of parties){const n=norm(p.name);if(seen.has(n))throw Error('Hay fiestas con el mismo nombre. Diferencialas antes de importar o exportar: '+p.name);seen.add(n);}}
export function businessSheets(resale){
 assertUniqueNames(resale.parties);
 const split=normalizeSplit(resale.ownerPercent,resale.sellerPercent);
 const sales=[HEADER.concat(['Costo recuperado','Ganancia neta','Ganancia propietario','Ganancia vendedor'])];
 const purchases=[['ID fiesta','ID entrada','Fiesta','Fecha compra','Tipo','N°','Cantidad','Costo compra']];
 const balance=[['Fiesta','Fecha fiesta','Entradas','Disponibles','Vendidas','Uso personal','Inversión sin uso personal','Ventas','Ganancia neta','Ganancia propietario','Ganancia vendedor']];
 for(const p of resale.parties){
  const m=partyMetrics(p,split);balance.push([p.name,p.date||'',m.totalTickets,m.available,m.sold,m.personal,m.investment,m.sales,m.netGain,m.ownerGain,m.sellerGain]);
  for(const t of p.tickets){const tm=ticketMetrics(t,split);sales.push([p.name,p.date||'',t.type,t.number,t.cost,t.salePrice||0,t.status,t.purchaseDate||'',p.id,t.id,t.sellerId||'',t.sellerName||'',t.sellerId?t.sellerPercent:'',tm.recovered,tm.netGain,tm.ownerGain,tm.sellerGain]);purchases.push([p.id,t.id,p.name,t.purchaseDate||'',t.type,t.number,1,t.cost]);}
 }
 const sellers=[['ID vendedor','Nombre','Porcentaje actual','Activo'],...(resale.sellers||[]).map(s=>[s.id,s.name,s.percent,s.active!==false?'Sí':'No'])];
 // Default split is exported separately from individual historical ticket rates.
 sellers.push([],['REPARTO PREDETERMINADO','Propietario %','Vendedor %'],['',split.ownerPercent,split.sellerPercent]);
 return {COMPRAS:purchases,VENTAS:sales,'BALANCE GENERAL':balance,VENDEDORES:sellers};
}
export function createBusinessWorkbook(XLSX,resale){
 const wb=XLSX.utils.book_new();for(const [name,rows] of Object.entries(businessSheets(resale))){const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=rows[0].map(()=>({wch:22}));sheet['!autofilter']={ref:sheet['!ref']};XLSX.utils.book_append_sheet(wb,sheet,name);}return wb;
}
export function parseBusinessWorkbook(sheets,parties=[],year=new Date().getFullYear()){
 assertUniqueNames(parties);
 const sales=sheets.VENTAS;
 if(!sales?.[0]?.some(c=>['ID entrada','ID fiesta','ID vendedor'].includes(c))){
  const parsed=parseResaleWorkbook(sheets,parties,year);
  // Validate original numeric cells before the legacy parser can coerce invalid text to zero.
  const matrix=Object.entries(sheets).find(([n])=>/ventas?/i.test(n))?.[1]||Object.values(sheets)[0]||[];
  const h=matrix.findIndex(r=>r.some(c=>['costocompra','costounitario','preciocompra','costo'].includes(norm(c)))&&r.some(c=>['fiesta','evento'].includes(norm(c))));
  if(h>=0){const header=matrix[h].map(norm),cost=header.findIndex(c=>['costocompra','costounitario','preciocompra','costo'].includes(c)),sale=header.findIndex(c=>['precioventa','importeventa','venta','precio'].includes(c)),status=header.findIndex(c=>['estado','situacion'].includes(c));
   for(const row of parsed.rows){const cells=matrix[row.row-1]||[];for(const col of [cost,sale]){if(col<0)continue;const v=cells[col];if(v===''||v==null){if(col===cost)throw Error('Falta el costo en Ventas fila '+row.row);continue;}if(typeof v!=='number'&&(typeof v!=='string'||!/^\s*\$?\s*[-+]?\d[\d.,\s]*$/.test(v)))throw Error('Importe inválido en Ventas fila '+row.row);}
    const value=norm(cells[status]||'');if(value&&!['disponible','pendiente','vendida','vendido','usopersonal','personal','uso'].includes(value))throw Error('Estado inválido en Ventas fila '+row.row);
   }
  }
  return parsed;
 }
 for(let i=0;i<HEADER.length;i++)if(sales[0][i]!==HEADER[i])throw Error('Falta o cambió una columna de la planilla exportada: '+HEADER[i]);
 const ids=new Set(),partyIds=new Map(),rows=[];
 for(const [index,c] of sales.entries()){
  if(!index||!nonblank(c))continue;
  const [partyName,date,type,number,cost,salePrice,status,purchaseDate,partyId,ticketId,sellerId,sellerName,sellerPercent]=c;
  if(typeof partyId!=='string'||!partyId||typeof ticketId!=='string'||!ticketId||ids.has(ticketId))throw Error(`Ventas fila ${index+1}: identidad ausente o duplicada.`);
  ids.add(ticketId);
  const identity=JSON.stringify([partyName,date]);if(partyIds.has(partyId)&&partyIds.get(partyId)!==identity)throw Error('Una fiesta tiene nombres o fechas contradictorios.');partyIds.set(partyId,identity);
  if(sellerId&&(typeof sellerId!=='string'||typeof sellerName!=='string'||!sellerName.trim()||!Number.isFinite(sellerPercent)||sellerPercent<0||sellerPercent>100))throw Error(`Ventas fila ${index+1}: vendedor o porcentaje inválido.`);
  if(!sellerId&&(sellerName||sellerPercent!==''&&sellerPercent!=null))throw Error(`Ventas fila ${index+1}: falta el ID del vendedor.`);
  rows.push({partyName,date,type,number,cost,salePrice,status,purchaseDate,sourcePartyId:partyId,sourceTicketId:ticketId,sellerId:sellerId||'',sellerName:sellerName||'',sellerPercent:sellerId?sellerPercent:null});
 }
 if(!rows.length)throw Error('La planilla no contiene entradas. No se modificó ningún dato.');
 const parsed=parseResaleUpdate({format:'mis-gastos-resale-import-v1',rows});
 parsed.rows=parsed.rows.map((r,i)=>({...r,...Object.fromEntries(['sourcePartyId','sourceTicketId',...extra].map(k=>[k,rows[i][k]]))}));
 const purchases=sheets.COMPRAS;if(!purchases||purchases[0]?.[1]!=='ID entrada')throw Error('Falta la hoja Compras para verificar las entradas.');
 const bought=new Map();for(const c of purchases.slice(1).filter(nonblank)){if(bought.has(c[1]))throw Error('Compras contiene una entrada duplicada.');bought.set(c[1],c);}
 for(const r of rows){const c=bought.get(r.sourceTicketId);if(!c||c[0]!==r.sourcePartyId||c[2]!==r.partyName||(c[3]||'')!==(r.purchaseDate||'')||c[4]!==r.type||c[5]!==r.number||c[6]!==1||c[7]!==r.cost)throw Error('Compras y Ventas no coinciden para '+r.partyName+' #'+r.number);bought.delete(r.sourceTicketId);}
 if(bought.size)throw Error('Hay entradas de Compras ausentes de Ventas.');
 parsed.warnings=['Balance y Vendedores son hojas informativas. Las comisiones de cada entrada se importan desde Ventas; el reparto predeterminado y el catálogo de vendedores se administran en la app.'];
 return parsed;
}
export function compareBusinessImport(rows,parties){
 assertUniqueNames(parties);
 for(const r of rows){if(!r.sourceTicketId)continue;const p=parties.find(p=>p.id===r.sourcePartyId),t=parties.flatMap(p=>p.tickets).find(t=>t.id===r.sourceTicketId);if(p&&(p.name!==r.partyName)||t&&(!p?.tickets.includes(t)||t.type!==r.type||t.number!==r.number))throw Error('La identidad de una entrada cambió. Revisá Fiesta, Tipo y N° antes de importar.');}
 const result=compareResaleImport(rows,parties);
 rows.forEach((r,i)=>{const p=parties.find(p=>norm(p.name)===norm(r.partyName)),t=p?.tickets.find(t=>key({partyName:p.name,...t})===key(r));if(!t)return;const fields=Object.hasOwn(r,'sellerId')?extra.filter(k=>(t[k]??(k==='sellerPercent'?null:''))!==r[k]):[];if(t.cost!==r.cost||Number(t.salePrice||0)!==r.salePrice)fields.push('importes exactos');if(!fields.length)return;let issue=result.issues.find(x=>x.imported===r);if(!issue){issue={id:`excel-${i}`,kind:'changed',fields:[],imported:r,partyId:p.id,ticketId:t.id,current:{...t,partyDate:p.date}};result.issues.push(issue);result.matched--;}issue.fields.push(...fields.map(k=>extra.includes(k)?'vendedor / comisión':k).filter((v,i,a)=>a.indexOf(v)===i));});return result;
}
export function applyBusinessImport(parties,issues,decisions,makeId){
 const result=applyResaleImport(parties,issues,decisions,makeId);
 for(const issue of issues){if(!['excel','manual'].includes(decisions[issue.id])||!issue.imported)continue;const r=issue.imported;if(!Object.hasOwn(r,'sellerId'))continue;const p=result.find(p=>norm(p.name)===norm(r.partyName)),t=p?.tickets.find(t=>key({partyName:p.name,...t})===key(r));if(!t)throw Error('No se encontró la entrada importada.');for(const k of extra){if(r.sellerId)t[k]=r[k];else delete t[k];}}
 return result;
}
export function verifyBusinessImport(parties,issues,decisions){const result=verifyResaleImport(parties,issues,decisions);for(const i of issues){const r=i.imported;if(!r||!Object.hasOwn(r,'sellerId')||!['excel','manual'].includes(decisions[i.id]))continue;const p=parties.find(p=>norm(p.name)===norm(r.partyName)),t=p?.tickets.find(t=>key({partyName:p.name,...t})===key(r));for(const k of extra)if((t?.[k]??(k==='sellerPercent'?null:''))!==r[k])throw Error('La comisión guardada no coincide con Excel.');}return result;}
