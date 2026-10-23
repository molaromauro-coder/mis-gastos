// Adapt the supplied three-sheet layout when purchases or commission rates change.
// Styles and all non-sheet package parts are retained by template-export.js.
import {ticketMetrics,partyMetrics,normalizeSplit} from './metrics.js';
const TYPES=['EARLY','GRAL 1','GRAL 2','GRAL 3','VIP'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const value=(v,f)=>({v,f});
export function purchaseGroups(resale){
 const groups=[];
 for(const party of resale.parties){
  const list=[];
  for(const ticket of party.tickets){
   if(!TYPES.includes(ticket.type))throw Error('La plantilla original no tiene una columna de compras para '+ticket.type+'.');
   if(!Number.isFinite(ticket.cost)||ticket.cost<0||!Number.isFinite(ticket.salePrice)||ticket.salePrice<0||!Number.isInteger(ticket.number)||ticket.number<1)throw Error('Entrada con datos inválidos.');
   let g=list.find(g=>g.date===(ticket.purchaseDate||'')&&(!g.items[ticket.type]?.length||g.items[ticket.type][0].cost===ticket.cost));
   if(!g){g={party,date:ticket.purchaseDate||'',items:{}};list.push(g);} (g.items[ticket.type]??=[]).push(ticket);
  }
  if(!list.length)list.push({party,date:'',items:{}});
  groups.push(...list);
 }
 return groups;
}
function serial(date){if(!date)return '';const d=new Date(date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('Fecha inválida: '+date);return (d.getTime()-Date.UTC(1899,11,30))/86400000;}
function rowXML(template,row,cells){
 const sample=template.match(/<row\b[^>]*>[\s\S]*?<\/row>/)?.[0]||'<row></row>';
 const open=sample.match(/<row\b([^>]*)>/)[1].replace(/\s+r="[^"]*"/g,'').replace(/\s+spans="[^"]*"/g,'');
 let body='';for(const [col,cell] of Object.entries(cells).sort(([a],[b])=>a.length-b.length||a.localeCompare(b))){
  const attrs=sample.match(new RegExp('<c\\b([^>]*\\br="'+col+'\\d+"[^>]*?)(?:/?>)'))?.[1]||'';
  const style=attrs.match(/\bs="(\d+)"/)?.[1];const a=' r="'+col+row+'"'+(style?' s="'+style+'"':'');
  if(cell.f!==undefined){body+='<c'+a+(typeof cell.v==='string'?' t="str"':'')+'><f>'+esc(cell.f)+'</f><v>'+esc(cell.v)+'</v></c>';}
  else if(typeof cell.v==='number')body+='<c'+a+'><v>'+cell.v+'</v></c>';
  else body+='<c'+a+' t="inlineStr"><is><t>'+esc(cell.v)+'</t></is></c>';
 }
 return '<row r="'+row+'"'+open+'>'+body+'</row>';
}
function replaceRows(xml,start,oldLast,newLast,rows,lastColumn){
 const sampleRows=new Map([...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)].map(m=>[Number(m[1]),m[0]]));
 const header=[...sampleRows].filter(([r])=>r<start).map(([,s])=>s).join('');
 const body=rows.map(({r,cells,total})=>rowXML(sampleRows.get(total?oldLast:(r<=oldLast-2?r:start))||sampleRows.get(start)||'',r,cells)).join('');
 xml=xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/,'<sheetData>'+header+body+'</sheetData>');
 xml=xml.replace(/<dimension\b[^>]*\/>/,'<dimension ref="'+(start===7?'B':'C')+'1:'+lastColumn+newLast+'"/>');
 // Extend existing validations and conditional formatting ranges, without changing their rules.
 xml=xml.replace(/(sqref|ref)="([^"]*)"/g,(match,attr,refs)=>attr==='ref'&&refs.startsWith((start===7?'B':'C')+'1:')?match:attr+'="'+refs.replace(new RegExp('(\\$?[A-Z]+\\$?)'+(oldLast-2)+'(?=\\b|$)','g'),'$1'+(newLast-2))+'"');
 return xml;
}
export function renderExtendedLayout(wb,xmls,resale){
 if(!wb.Sheets.COMPRAS||!wb.Sheets.VENTAS||!wb.Sheets['BALANCE GENERAL']||wb.Sheets.COMPRAS.B5?.v!=='FECHA COMPRA')throw Error('Esta plantilla requiere una adaptación de estructura diferente.');
 const groups=purchaseGroups(resale),split=normalizeSplit(resale.ownerPercent,resale.sellerPercent);
 const n=resale.parties.reduce((s,p)=>s+p.tickets.length,0);if(n>10000||groups.length>2000)throw Error('La exportación supera 10.000 entradas o 2.000 lotes.');
 const purchaseEnd=Math.max(31,6+groups.length),saleEnd=Math.max(512,5+n+groups.length),balanceEnd=Math.max(30,5+resale.parties.length);
 const purchases=[],sales=[],balances=[];let saleRow=6,offset=0;
 const totals={};const savedRows=[];
 for(let i=0;i<groups.length;i++){
  const g=groups[i],r=7+i,counts=TYPES.map(t=>g.items[t]?.length||0),costs=TYPES.map(t=>g.items[t]?.[0]?.cost||0),count=counts.reduce((s,v)=>s+v,0);
  const cells={B:value(serial(g.date)),C:value(g.party.name),D:value(g.party.date||'')};
  for(let j=0;j<5;j++){const q=String.fromCharCode(69+j),c=String.fromCharCode(74+j),t=String.fromCharCode(79+j);cells[q]=value(counts[j]);cells[c]=value(costs[j]);const personal=(g.items[TYPES[j]]||[]).filter(t=>t.status==='Uso personal').reduce((sum,t)=>sum+t.cost,0);cells[t]=value(counts[j]*costs[j]-personal,q+r+'*'+c+r+`-SUMIFS(VENTAS!$G$6:$G$${saleEnd},VENTAS!$O$6:$O$${saleEnd},${i+1},VENTAS!$E$6:$E$${saleEnd},"${TYPES[j]}",VENTAS!$I$6:$I$${saleEnd},"USO PERSONAL")`);}
  const invested=Object.entries(cells).filter(([c])=>[...'OPQRS'].includes(c)).reduce((sum,[,c])=>sum+c.v,0);cells.T=value(invested,`SUM(O${r}:S${r})`);cells.U=value(count,`SUM(E${r}:I${r})`);cells.V=value(offset-i,i?`SUM(U$7:U${r-1})`:'0');cells.W=value(offset,i?`SUM(U$7:U${r-1})+COUNTA(C$7:C${r-1})`:'0');
  purchases.push({r,cells});for(const [col,c] of Object.entries(cells))if(typeof c.v==='number')totals[col]=(totals[col]||0)+c.v;
  const start=saleRow,rows=[];
  for(const type of TYPES)for(const t of (g.items[type]||[]).sort((a,b)=>a.number-b.number)){
   const s=saleRow++,m=ticketMetrics(t,split),rate=t.sellerId?t.sellerPercent:split.sellerPercent;if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('Porcentaje inválido.');
   const original=wb.Sheets.VENTAS,translate=formula=>formula.replace(/\$31\b/g,'$'+purchaseEnd).replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g,(ref,col,absolute,row)=>absolute?ref:col+(Number(row)+s-6));
   const cells={};for(const col of ['C','D','E','G','O']){const formula=original[col+'6']?.f;if(!formula)throw Error('Falta una fórmula de la plantilla: '+col+'6');const cached=col==='C'?g.party.name:col==='D'?g.party.date||'':col==='E'?type:col==='G'?t.cost:i+1;cells[col]=value(cached,translate(formula));}
   // Stable visible ticket number: formula stays editable but does not renumber earlier sales.
   cells.F=value(t.number,String(t.number));cells.H=value(t.salePrice);cells.I=value(t.status.toUpperCase());
   cells.J=value(m.recovered,`IF(I${s}="VENDIDA",G${s},0)`);cells.K=value(m.netGain,`IF(I${s}="VENDIDA",H${s}-G${s},0)`);cells.L=value(m.gainPercent/100,`IF(AND(I${s}="VENDIDA",G${s}<>0),K${s}/G${s},0)`);cells.M=value(m.ownerGain,`IF(I${s}="VENDIDA",K${s}*${100-rate}%,0)`);cells.N=value(m.sellerGain,`IF(I${s}="VENDIDA",K${s}*${rate}%,0)`);
   sales.push({r:s,cells});rows.push({t,m});savedRows.push({partyId:g.party.id,ticketId:t.id,row:s});
  }
  if(count){const s=saleRow++,end=s-1,sum=(col,field)=>value(rows.reduce((v,x)=>v+x.m[field],0),`SUM(${col}${start}:${col}${end})`),cells={C:value('TOTAL - '+g.party.name,`"TOTAL - "&COMPRAS!C${r}`),D:value(''),E:value('TOTAL'),F:value(''),G:value(rows.filter(x=>x.t.status!=='Uso personal').reduce((v,x)=>v+x.t.cost,0),`SUMIF(I${start}:I${end},"<>USO PERSONAL",G${start}:G${end})`),H:value(rows.reduce((v,x)=>v+x.m.salePrice,0),`SUMIF(I${start}:I${end},"VENDIDA",H${start}:H${end})`),I:value(''),J:sum('J','recovered'),K:sum('K','netGain'),L:value(0,`IF(J${s}=0,0,K${s}/J${s})`),M:sum('M','ownerGain'),N:sum('N','sellerGain'),O:value(i+1)};sales.push({r:s,cells});}
  if(!count){const rTotal=saleRow++;sales.push({r:rTotal,cells:{C:value('TOTAL - '+g.party.name,`"TOTAL - "&COMPRAS!C${r}`),D:value(''),E:value('TOTAL'),F:value(''),G:value(0),H:value(0),I:value(''),J:value(0),K:value(0),L:value(0),M:value(0),N:value(0),O:value(i+1)}});}
  offset+=count+1;
 }
 // Empty purchases are still linked events, and occupy one formula-generated total line.


 for(let r=7+groups.length;r<=purchaseEnd;r++){const cells={B:value(''),C:value(''),D:value('')};for(const col of 'EFGHIJKLMN')cells[col]=value(0);for(let j=0;j<5;j++)cells[String.fromCharCode(79+j)]=value(0,String.fromCharCode(69+j)+r+'*'+String.fromCharCode(74+j)+r);cells.T=value(0,`SUM(O${r}:S${r})`);cells.U=value(0,`SUM(E${r}:I${r})`);cells.V=value(n,`SUM(U$7:U${r-1})`);cells.W=value(offset,`SUM(U$7:U${r-1})+COUNTA(C$7:C${r-1})`);purchases.push({r,cells});}
 const totalCells={C:value('TOTAL')};for(const col of 'EFGHIJKLMNOPQRST')totalCells[col]=value(totals[col]||0,`SUM(${col}7:${col}${purchaseEnd})`);purchases.push({r:purchaseEnd+1,cells:totalCells,total:true});
 const range=col=>`VENTAS!$${col}$6:$${col}$${saleEnd}`;
 for(let i=0;i<resale.parties.length;i++){
  const p=resale.parties[i],r=i+6,m=partyMetrics(p,split),purchaseRow=groups.findIndex(g=>g.party.id===p.id)+7;
  const sum=(col,field)=>value(m[field],`SUMIFS(${range(col)},${range('C')},C${r},${range('E')},"<>TOTAL",${range('I')},"VENDIDA")`);
  const cells={C:value(p.name,`COMPRAS!C${purchaseRow}`),D:value(m.investment,`SUMIFS(${range('G')},${range('C')},C${r},${range('E')},"<>TOTAL",${range('I')},"<>USO PERSONAL")`),E:sum('H','sales'),F:sum('J','recovered'),G:value(m.totalForOwner,`F${r}+J${r}`),H:sum('K','netGain'),I:value(m.investment&&m.sales?(m.sales-m.investment)/m.investment:0,`IF(OR(D${r}=0,E${r}=0),0,(E${r}-D${r})/D${r})`),J:sum('M','ownerGain'),K:sum('N','sellerGain'),L:value(m.available,`COUNTIFS(${range('C')},C${r},${range('I')},"DISPONIBLE",${range('E')},"<>TOTAL")`)};balances.push({r,cells});
 }
 for(let r=6+resale.parties.length;r<=balanceEnd;r++)balances.push({r,cells:Object.fromEntries([... 'CDEFGHIJKL'].map(c=>[c,value('')]))});
 const balanceTotal={C:value('TOTAL')};for(const col of 'DEFGHJKL')balanceTotal[col]=value(balances.reduce((sum,row)=>sum+(Number(row.cells[col]?.v)||0),0),`SUM(${col}6:${col}${balanceEnd})`);balances.push({r:balanceEnd+2,cells:balanceTotal,total:true});
 // Rows beyond current stock retain the original formula-driven expansion behavior.
 for(let r=saleRow;r<=saleEnd;r++){const cells={};for(const col of 'CDEFGJKLMNO'){const f=wb.Sheets.VENTAS[col+'6']?.f;if(f)cells[col]=value('',f.replace(/\$31\b/g,'$'+purchaseEnd).replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g,(ref,c,a,n)=>a?ref:c+(Number(n)+r-6)));}cells.H=value(0);cells.I=value('');sales.push({r,cells});}
 const salesXML=xmls.VENTAS.replace(/<c\b[^>]*r="M5"[^>]*>[\s\S]*?<\/c>/,cell=>cell.replace(/(?:<v>[\s\S]*?<\/v>|<is>[\s\S]*?<\/is>)/,'<is><t>GANANCIA MAURO (% por entrada)</t></is>').replace(/ t="[^"]*"/,' t="inlineStr"')).replace(/<c\b[^>]*r="N5"[^>]*>[\s\S]*?<\/c>/,cell=>cell.replace(/(?:<v>[\s\S]*?<\/v>|<is>[\s\S]*?<\/is>)/,'<is><t>GANANCIA VENDEDOR (% por entrada)</t></is>').replace(/ t="[^"]*"/,' t="inlineStr"'));
 return {xmls:{COMPRAS:replaceRows(xmls.COMPRAS,7,32,purchaseEnd+1,purchases,'W'),VENTAS:replaceRows(salesXML,6,514,saleEnd+2,sales,'O'),'BALANCE GENERAL':replaceRows(xmls['BALANCE GENERAL'],6,32,balanceEnd+2,balances,'L')},savedRows};
}
