// Read explicit percentages from the original workbook, never infer them from profit values.
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function rate(cell,header){
 const formula=String(cell?.f||'');
 if(formula){const values=[...formula.matchAll(/\*\s*(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1]));const unique=[...new Set(values)];if(unique.length===1)return unique[0];throw Error('No pude interpretar el porcentaje de una fórmula. No se importó ningún reparto supuesto.');}
 const match=String(header).match(/(\d+(?:[.,]\d+)?)\s*%/);if(match)return Number(match[1].replace(',','.'));
 throw Error('Falta un porcentaje explícito para importar el reparto.');
}
export function attachExcelRates(XLSX,workbook,parsed){
 let identities={};if(workbook.Custprops?.ReventaIdentidades){try{identities=JSON.parse(workbook.Custprops.ReventaIdentidades);}catch{throw Error('Identidades del Excel inválidas.');}}
 const name=workbook.SheetNames.find(n=>/ventas?/i.test(n));if(!name)return parsed;
 const sheet=workbook.Sheets[name],range=XLSX.utils.decode_range(sheet['!ref']);
 let headerRow=-1,ownerCol=-1,sellerCol=-1;
 for(let r=range.s.r;r<=Math.min(range.e.r,range.s.r+44);r++){
  for(let c=range.s.c;c<=range.e.c;c++){const label=normalize(sheet[XLSX.utils.encode_cell({r,c})]?.v);if(label.includes('ganancia')&&label.includes('mauro')&&label.includes('%')){headerRow=r;ownerCol=c;}if(label.includes('ganancia')&&(label.includes('ale')||label.includes('vendedor'))&&label.includes('%'))sellerCol=c;}
  if(ownerCol>=0&&sellerCol>=0)break;
 }
 if(headerRow<0||sellerCol<0){if(parsed.rows.some(r=>Object.hasOwn(r,'sellerPercent')))return parsed;throw Error('No se encontró el reparto de ganancias del Excel. Revisá los encabezados de porcentajes.');}
 const header=c=>sheet[XLSX.utils.encode_cell({r:headerRow,c})]?.v;
 return {...parsed,rows:parsed.rows.map(row=>{
  const r=range.s.r+row.row-1,owner=rate(sheet[XLSX.utils.encode_cell({r,c:ownerCol})],header(ownerCol)),seller=rate(sheet[XLSX.utils.encode_cell({r,c:sellerCol})],header(sellerCol));
  if(owner<0||seller<0||owner>100||seller>100||Math.abs(owner+seller-100)>1e-8)throw Error(`Reparto inválido en Ventas fila ${r+1}.`);
  const sellerName=normalize(header(sellerCol)).includes('ale')?'Ale':'Vendedor Excel';
  const identity=identities[r+1];if(identity?.sellerId&&typeof identity.sellerId==='string'&&typeof identity.sellerName==='string')return {...row,sourcePartyId:identity.partyId,sourceTicketId:identity.ticketId,sellerId:identity.sellerId,sellerName:identity.sellerName,sellerPercent:seller};
  return {...row,sellerId:'excel-'+normalize(sellerName).replace(/\s+/g,'-'),sellerName,sellerPercent:seller};
 })};
}
