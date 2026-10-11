// Importador independiente: nunca modifica los gastos personales.
const norm=(value)=>String(value??'').trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
const decimal=(value)=>{
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  let s=String(value??'').trim().replace(/[^\d.,-]/g,'');
  if(!s)return 0;
  if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.');}
  else if((s.match(/\./g)||[]).length>1){s=s.replace(/\./g,'');}
  else if(/^[-]?\d{1,3}\.\d{3}$/.test(s)){s=s.replace('.','');}
  const n=Number(s);return Number.isFinite(n)?n:0;
};
const isBlank=(value)=>String(value??'').trim()==='';
function dateISO(value,year){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  if(typeof value==='number'&&value>20000&&value<90000){
    const d=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000);
    return d.toISOString().slice(0,10);
  }
  const raw=String(value??'').trim();
  const iso=raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if(iso){const y=Number(iso[1]),m=Number(iso[2]),day=Number(iso[3]),d=new Date(y,m-1,day);return d.getFullYear()===y&&d.getMonth()===m-1&&d.getDate()===day?`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`:'';}
  const match=raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if(!match)return '';
  let y=match[3]?Number(match[3]):Number(year);
  if(y<100)y+=2000;
  const day=Number(match[1]),month=Number(match[2]);
  const d=new Date(y,month-1,day);
  if(d.getFullYear()!==y||d.getMonth()!==month-1||d.getDate()!==day)return '';
  return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function detectHeader(matrix){
  let best=null;
  for(let i=0;i<Math.min(matrix.length,45);i++){
    const row=(matrix[i]||[]).map(norm);
    const at=(pred)=>row.findIndex(pred);
    const cols={
      party:at((v)=>v==='fiesta'||v==='evento'||v==='eventofiesta'),
      type:at((v)=>v==='tipoentrada'||v==='tipo'||v==='sector'||v==='entrada'),
      number:at((v)=>v==='nentrada'||v==='numeroentrada'||v==='nroentrada'||v==='numero'||v==='n'),
      cost:at((v)=>v==='costocompra'||v==='costo'||v==='costounitario'||v==='preciocompra'),
      sale:at((v)=>v==='precioventa'||v==='importeventa'||v==='venta'||v==='precio'),
      status:at((v)=>v==='estado'||v==='situacion'),
      date:at((v)=>v==='fechafiesta'||v==='fechaevento'||v==='fecha'),
      qty:at((v)=>v==='cantidad'||v==='cant'||v==='unidades')
    };
    const score=['party','type','cost','number','sale','status'].filter((k)=>cols[k]>=0).length;
    if(cols.party>=0&&cols.type>=0&&cols.cost>=0&&score>=3&&(!best||score>best.score))best={row:i,cols,score};
  }
  return best;
}
function importedStatus(value,salePrice){
  const s=norm(value);
  if(s.includes('personal')||s==='uso')return 'Uso personal';
  if(s.includes('vend'))return 'Vendida';
  if(s.includes('dispon')||s.includes('pendien'))return 'Disponible';
  return salePrice>0?'Vendida':'Disponible';
}
export function parseResaleTable(matrix,existingParties=[],todayYear=new Date().getFullYear()){
  const header=detectHeader(matrix);
  if(!header)return {rows:[],warnings:['No encontré columnas Fiesta, Tipo de entrada y Costo de compra. Revisá la hoja Ventas.']};
  const {cols}=header,warnings=[],rows=[],seen=new Set(),counts=new Map(),batches=new Map(),dateWarnings=new Set();
  const existingYear=new Map(existingParties.map((p)=>[norm(p.name),Number(String(p.date||'').slice(0,4))||todayYear]));
  let lastParty='',block=0;
  for(let i=header.row+1;i<matrix.length;i++){
    const cells=matrix[i]||[];
    const get=(field)=>cols[field]>=0?cells[cols[field]]:'';
    const name=String(get('party')??'').trim()||lastParty;
    if(/^total(?:\s|\s*-)/i.test(name)||/^subtotal/i.test(name)){lastParty='';block++;continue;}
    if(!name)continue;
    if(!isBlank(get('party')))lastParty=name;
    const type=String(get('type')??'').trim();
    if(!type||/^total/i.test(type)){block++;continue;}
    if(isBlank(get('cost'))){warnings.push(`Fila ${i+1}: ${name} / ${type} sin costo de compra; se omitió.`);continue;}
    const cost=decimal(get('cost')),salePrice=decimal(get('sale'));
    if(cost<0||salePrice<0){warnings.push(`Fila ${i+1}: importe negativo; se omitió.`);continue;}
    const key=`${norm(name)}|${norm(type)}`;
    const current=counts.get(key)||0;
    const rawNumber=Number(get('number'));
    const explicit=cols.number>=0&&Number.isInteger(rawNumber)&&rawNumber>0;
    const qty=explicit?1:(cols.qty>=0?Math.max(1,Math.min(1000,Math.floor(decimal(get('qty'))||1))):1);
    const date=dateISO(get('date'),existingYear.get(norm(name))||todayYear);
    const dateExplicit=/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b/.test(String(get('date')??''))||get('date') instanceof Date||typeof get('date')==='number';
    if(!isBlank(get('date'))&&!date&&!dateWarnings.has(norm(name))){warnings.push(`${name}: fecha de fiesta inválida (${String(get('date'))}); se conserva la fecha de la app o queda sin fecha.`);dateWarnings.add(norm(name));}
    let batch=batches.get(key)||{last:0,offset:0,cost,block};
    if(explicit&&rawNumber<=batch.last&&(cost!==batch.cost||block!==batch.block)){batch={last:0,offset:current,cost,block};}
    if(explicit){batch.last=rawNumber;batch.cost=cost;batch.block=block;batches.set(key,batch);}
    for(let j=0;j<qty;j++){
      const number=explicit?rawNumber+batch.offset:current+j+1;
      const ticketKey=`${key}|${number}`;
      if(seen.has(ticketKey)){warnings.push(`Fila ${i+1}: entrada repetida ${name} / ${type} #${number}; se omitió.`);continue;}
      seen.add(ticketKey);
      rows.push({partyName:name,date,dateExplicit,type,number,cost,salePrice,status:importedStatus(get('status'),salePrice),row:i+1});
    }
    counts.set(key,Math.max(current,explicit?rawNumber+batch.offset:current+qty));
  }
  if(!rows.length&&!warnings.length)warnings.push('La hoja no contiene entradas reconocibles.');
  return {rows,warnings};
}
export function compareResaleImport(importedRows,existingParties=[]){
  const byParty=new Map(existingParties.map((p)=>[norm(p.name),p]));
  const importedKeys=new Set();
  const importedPartyKeys=new Set(importedRows.map((r)=>norm(r.partyName)));
  const issues=[],matched=[];
  const keyFor=(name,type,number)=>`${norm(name)}|${norm(type)}|${Number(number)}`;
  importedRows.forEach((row,index)=>{
    const party=byParty.get(norm(row.partyName));
    const ticket=party?.tickets?.find((t)=>norm(t.type)===norm(row.type)&&Number(t.number)===Number(row.number));
    const key=keyFor(row.partyName,row.type,row.number);importedKeys.add(key);
    const diffs=[];
    if(ticket){
      if(Math.abs(Number(ticket.cost||0)-row.cost)>0.01)diffs.push('costo');
      if(Math.abs(Number(ticket.salePrice||0)-row.salePrice)>0.01)diffs.push('precio de venta');
      if((ticket.status||'Disponible')!==row.status)diffs.push('estado');
      if(row.dateExplicit&&row.date&&party.date&&party.date!==row.date)diffs.push('fecha de fiesta');
    }
    if(!ticket||diffs.length){
      issues.push({id:`excel-${index}`,kind:ticket?'changed':'new',fields:diffs,imported:row,partyId:party?.id||null,ticketId:ticket?.id||null,current:ticket?{...ticket,partyDate:party.date}:null});
    }else matched.push(row);
  });
  for(const party of existingParties)for(const ticket of party.tickets||[]){
    if(importedPartyKeys.has(norm(party.name))&&!importedKeys.has(keyFor(party.name,ticket.type,ticket.number))){
      issues.push({id:`app-${party.id}-${ticket.id}`,kind:'onlyApp',fields:[],imported:null,partyId:party.id,ticketId:ticket.id,current:{...ticket,partyName:party.name,partyDate:party.date}});
    }
  }
  return {issues,matched:matched.length};
}
export function applyResaleImport(existingParties,issues,decisions,makeId){
  const parties=structuredClone(existingParties);
  for(const issue of issues){
    const chosen=decisions[issue.id]||'app';
    if(chosen!=='excel'&&chosen!=='manual'&&chosen!=='remove')continue;
    let party=parties.find((p)=>p.id===issue.partyId);
    if(issue.kind==='onlyApp'){
      if(chosen==='remove'&&party)party.tickets=party.tickets.filter((t)=>t.id!==issue.ticketId);
      continue;
    }
    const row=issue.imported;
    if(!party){
      party=parties.find((p)=>norm(p.name)===norm(row.partyName));
      if(!party){party={id:makeId(),name:row.partyName,date:row.date||'',tickets:[]};parties.push(party);}
    }
    if(row.date&&(!party.date||row.dateExplicit))party.date=row.date;
    const ticket=party.tickets.find((t)=>t.id===issue.ticketId)||
      party.tickets.find((t)=>norm(t.type)===norm(row.type)&&Number(t.number)===Number(row.number));
    if(ticket)Object.assign(ticket,{type:row.type,number:row.number,cost:row.cost,salePrice:row.salePrice,status:row.status});
    else party.tickets.push({id:makeId(),type:row.type,number:row.number,cost:row.cost,salePrice:row.salePrice,status:row.status});
  }
  return parties;
}

export function parseResaleUpdate(payload){
 if(payload?.format!=='mis-gastos-resale-import-v1'||!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>10000)throw new Error('No es un archivo de actualización de Reventa válido.');
 const seen=new Set();const rows=payload.rows.map((r,i)=>{
  if(!r||typeof r.partyName!=='string'||!r.partyName.trim()||typeof r.type!=='string'||!r.type.trim()||!Number.isInteger(r.number)||r.number<1||!Number.isFinite(r.cost)||r.cost<0||!Number.isFinite(r.salePrice)||r.salePrice<0||!['Disponible','Vendida','Uso personal'].includes(r.status))throw new Error(`Entrada ${i+1}: datos inválidos.`);
  const date=r.date||'';if(date&&(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||dateISO(date,2026)!==date))throw new Error(`Entrada ${i+1}: fecha inválida.`);
  const key=`${norm(r.partyName)}|${norm(r.type)}|${r.number}`;if(seen.has(key))throw new Error(`Entrada ${i+1}: entrada duplicada.`);seen.add(key);
  return {partyName:r.partyName.trim(),type:r.type.trim(),number:r.number,cost:r.cost,salePrice:r.salePrice,status:r.status,date,dateExplicit:!!date,row:i+1};
 });
 return {rows,warnings:Array.isArray(payload.warnings)?payload.warnings.filter(w=>typeof w==='string'):[]};
}
