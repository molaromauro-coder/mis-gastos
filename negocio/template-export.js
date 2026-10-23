// Preserve the original OOXML package; adapt sheet formulas only when inventory changes.
import {renderExtendedLayout} from './template-layout.js';
import {parseBusinessWorkbook} from './workbook.js';
import {attachExcelRates} from './excel-rates.js';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const key=(name,t)=>[norm(name),norm(t.type),t.number].join('|');
const encode=new TextEncoder(),decode=new TextDecoder();
export function captureTemplate(bytes,name){
 if(!/\.xlsx$/i.test(name))throw Error('Para conservar formato y fórmulas, importá el archivo original en formato .xlsx.');
 const a=new Uint8Array(bytes);if(a.length>2*1024*1024)throw Error('La plantilla supera el límite de 2 MB para su respaldo sincronizado.');
 let binary='';for(let i=0;i<a.length;i+=8192)binary+=String.fromCharCode(...a.subarray(i,i+8192));
 return {name,base64:btoa(binary),version:1};
}
function bytesOf(template){if(template?.version!==1||typeof template.base64!=='string')throw Error('Importá el Excel original para conservar su formato y fórmulas al exportar.');return Uint8Array.from(atob(template.base64),c=>c.charCodeAt(0));}
function setValue(xml,address,value){
 const re=new RegExp('<c\\b([^>]*\\br="'+address+'"[^>]*?)(?:\\s*/>|>([\\s\\S]*?)</c>)');
 if(!re.test(xml)){
  const row=address.match(/\d+$/)[0],column=address.match(/^[A-Z]+/)[0],rank=c=>[...c].reduce((v,ch)=>v*26+ch.charCodeAt(0)-64,0);
  const rowRE=new RegExp('(<row\\b[^>]*\\br="'+row+'"[^>]*>)([\\s\\S]*?)(</row>)');
  if(!rowRE.test(xml))throw Error('Falta la fila de la plantilla '+row+'.');
  xml=xml.replace(rowRE,(_,open,body,close)=>{const cells=[...body.matchAll(/<c\b[^>]*r="([A-Z]+)\d+"/g)],next=cells.find(c=>rank(c[1])>rank(column)),at=next?next.index:body.length;return open+body.slice(0,at)+'<c r="'+address+'"/>'+body.slice(at)+close;});
 }
 return xml.replace(re,(_,attributes,body='')=>{
  if(/<f\b/.test(body))throw Error('Protección: no se puede sustituir la fórmula de '+address+'.');
  const attrs=attributes.replace(/\s+t="[^"]*"/g,'').replace(/\/$/,'');
  if(typeof value==='number'){if(!Number.isFinite(value)||value<0)throw Error('Importe inválido.');return '<c'+attrs+'><v>'+value+'</v></c>';}
  const escaped=String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));return '<c'+attrs+' t="inlineStr"><is><t>'+escaped+'</t></is></c>';
 });
}
export function exportOriginalTemplate(XLSX,resale){
 const bytes=bytesOf(resale.excelTemplate),wb=XLSX.read(bytes,{type:'array'});
 const sheets=Object.fromEntries(wb.SheetNames.map(n=>[n,XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:true})]));
 const parsed=attachExcelRates(XLSX,wb,parseBusinessWorkbook(sheets,resale.parties));
 if(parsed.blockers?.length||parsed.warnings?.some(w=>/omiti/i.test(w)))throw Error('La plantilla original tiene diferencias que requieren revisión.');
 const tickets=new Map();for(const p of resale.parties)for(const t of p.tickets){if(t.status==='Vendida'&&!(t.salePrice>0))throw Error('Completá el precio de las entradas vendidas antes de exportar.');const k=key(p.name,t);if(tickets.has(k))throw Error('Hay entradas con identidad duplicada.');tickets.set(k,{p,t});}
 const changes=[];let structural=false;let identities={};const purchaseNames=new Set();for(let r=7;r<=31;r++){const name=wb.Sheets.COMPRAS?.['C'+r]?.v;if(name){if(purchaseNames.has(norm(name)))structural=true;purchaseNames.add(norm(name));}}
 const sheetName=wb.SheetNames.find(n=>/ventas?/i.test(n)),sheet=wb.Sheets[sheetName],range=XLSX.utils.decode_range(sheet['!ref']);
 // Only the verified original layout is supported until structural extension is validated.
 if(sheet.C5?.v!=='FIESTA'||sheet.H5?.v!=='PRECIO VENTA'||sheet.I5?.v!=='ESTADO')throw Error('El formato de esta plantilla todavía requiere adaptar la exportación. Se conservó el original.');
 for(const r of parsed.rows){const k=key(r.partyName,r),found=tickets.get(k);if(!found){structural=true;continue;}const {p,t}=found;
  if(t.cost!==r.cost||(r.date&&p.date!==r.date)||(r.purchaseDate&&t.purchaseDate!==r.purchaseDate))structural=true;
  const rate=t.sellerId?t.sellerPercent:(resale.sellerPercent??100-resale.ownerPercent);if(rate!==r.sellerPercent)structural=true;
  if(!['Disponible','Vendida','Uso personal'].includes(t.status))throw Error('Estado de entrada inválido.');
  identities[range.s.r+r.row]={partyId:p.id,ticketId:t.id,sellerId:t.sellerId||'',sellerName:t.sellerName||'',sellerPercent:t.sellerId?t.sellerPercent:null};changes.push({row:range.s.r+r.row,sale:t.salePrice,status:t.status.toUpperCase()});tickets.delete(k);
 }
 if(tickets.size)structural=true;
 const zip=XLSX.CFB.read(bytes,{type:'array'}),entry=path=>zip.FileIndex[zip.FullPaths.findIndex(n=>n.endsWith('/'+path))];
 const workbookEntry=entry('xl/workbook.xml'),rels=entry('xl/_rels/workbook.xml.rels');if(!workbookEntry||!rels)throw Error('Estructura de Excel no reconocida.');
 let bookXML=decode.decode(workbookEntry.content);const escaped=sheetName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const sheetTag=bookXML.match(new RegExp('<sheet\\b[^>]*name="'+escaped+'"[^>]*/>'))?.[0];const id=sheetTag?.match(/r:id="([^"]+)"/)?.[1];
 const relTag=decode.decode(rels.content).match(new RegExp('<Relationship\\b[^>]*Id="'+id+'"[^>]*/>'))?.[0];const target=relTag?.match(/Target="([^"]+)"/)?.[1];if(!target)throw Error('No se encontró la hoja de ventas original.');
 const salesEntry=entry(target.startsWith('/')?target.slice(1):'xl/'+target);if(!salesEntry)throw Error('Falta la hoja de ventas.');
 if(structural){
  const xmls={},entries={};for(const name of ['COMPRAS','VENTAS','BALANCE GENERAL']){
   const tag=bookXML.match(new RegExp('<sheet\\b[^>]*name="'+name+'"[^>]*/>'))?.[0],rid=tag?.match(/r:id="([^"]+)"/)?.[1];
   const relation=decode.decode(rels.content).match(new RegExp('<Relationship\\b[^>]*Id="'+rid+'"[^>]*/>'))?.[0],path=relation?.match(/Target="([^"]+)"/)?.[1];
   if(!path)throw Error('Falta la hoja '+name+' de la plantilla original.');entries[name]=entry(path.startsWith('/')?path.slice(1):'xl/'+path);xmls[name]=decode.decode(entries[name].content);
  }
  const result=renderExtendedLayout(wb,xmls,resale);identities={};for(const row of result.savedRows){const p=resale.parties.find(p=>p.id===row.partyId),t=p.tickets.find(t=>t.id===row.ticketId);identities[row.row]={partyId:p.id,ticketId:t.id,sellerId:t.sellerId||'',sellerName:t.sellerName||'',sellerPercent:t.sellerId?t.sellerPercent:null};}for(const [name,xml] of Object.entries(result.xmls)){entries[name].content=encode.encode(xml);entries[name].size=entries[name].content.length;}
 }else{
 let salesXML=decode.decode(salesEntry.content);for(const c of changes){salesXML=setValue(salesXML,'H'+c.row,c.sale);salesXML=setValue(salesXML,'I'+c.row,c.status);}
 salesEntry.content=encode.encode(salesXML);salesEntry.size=salesEntry.content.length;
 }
 // Invalidate cached formula results throughout the workbook; Excel must recalculate after input changes.
 if(!structural)for(let i=0;i<zip.FullPaths.length;i++)if(/\/xl\/worksheets\/sheet\d+\.xml$/.test(zip.FullPaths[i])){const e=zip.FileIndex[i];let xml=decode.decode(e.content);xml=xml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g,cell=>/<f\b/.test(cell)?cell.replace(/<v(?:\s[^>]*)?>[\s\S]*?<\/v>/g,''):cell);e.content=encode.encode(xml);e.size=e.content.length;}
 const calc='<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';bookXML=/<calcPr\b/.test(bookXML)?bookXML.replace(/<calcPr\b[^>]*\/>/,calc):bookXML.replace('</workbook>',calc+'</workbook>');workbookEntry.content=encode.encode(bookXML);workbookEntry.size=workbookEntry.content.length;
 const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const customEntry=entry('docProps/custom.xml');let custom=customEntry?decode.decode(customEntry.content):'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>';
 custom=custom.replace(/<property\b[^>]*name="ReventaIdentidades"[^>]*>[\s\S]*?<\/property>/g,'');const pid=1+Math.max(1,...[...custom.matchAll(/pid="(\d+)"/g)].map(m=>Number(m[1])));
 custom=custom.replace('</Properties>','<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="'+pid+'" name="ReventaIdentidades"><vt:lpwstr>'+escape(JSON.stringify(identities))+'</vt:lpwstr></property></Properties>');
 if(customEntry){customEntry.content=encode.encode(custom);customEntry.size=customEntry.content.length;}else{
  XLSX.CFB.utils.cfb_add(zip,'docProps/custom.xml',encode.encode(custom));
  const types=entry('[Content_Types].xml');let xml=decode.decode(types.content);xml=xml.replace('</Types>','<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>');types.content=encode.encode(xml);types.size=types.content.length;
  const relationships=entry('_rels/.rels');xml=decode.decode(relationships.content);const rid='reventaCustomProperties';if(xml.includes('Id="'+rid+'"'))throw Error('Identidad XML repetida.');xml=xml.replace('</Relationships>','<Relationship Id="'+rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>');relationships.content=encode.encode(xml);relationships.size=relationships.content.length;
 }
 return XLSX.CFB.write(zip,{type:'array',fileType:'zip',compression:true});
}
