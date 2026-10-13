// Missing purchases verified against REVENTA_ENTRADAS 11-10-26.xlsx, Ventas and Compras.
// Additions only: existing costs, sales, statuses and personal expenses are preserved.
import {compareResaleImport,applyResaleImport,mergeResaleParties,verifyResaleImport} from './resale-import.js?v=131';
export const RESALE_EXCEL_OCT11_VERSION=3;
export const missingPurchaseRows=[
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 1,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 121,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 2,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 122,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 3,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 123,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 4,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 124,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 5,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 125,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 6,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 126,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 7,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 127,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 8,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 128,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 9,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 129,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 10,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 130,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 11,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 131,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 12,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 132,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 13,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 133,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 14,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 134,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 15,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 135,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 16,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 136,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 17,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 137,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 18,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 138,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 19,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 139,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 20,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 140,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 21,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 141,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 22,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 142,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 23,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 143,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 24,
    "cost": 63250,
    "salePrice": 0,
    "status": "Disponible",
    "row": 144,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "VIP",
    "number": 1,
    "cost": 80500,
    "salePrice": 0,
    "status": "Disponible",
    "row": 145,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "VIP",
    "number": 2,
    "cost": 80500,
    "salePrice": 0,
    "status": "Disponible",
    "row": 146,
    "purchaseDate": "2026-10-07"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 25,
    "cost": 54550,
    "salePrice": 0,
    "status": "Disponible",
    "row": 148,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 26,
    "cost": 54550,
    "salePrice": 0,
    "status": "Disponible",
    "row": 149,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 27,
    "cost": 54550,
    "salePrice": 0,
    "status": "Disponible",
    "row": 150,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 28,
    "cost": 54550,
    "salePrice": 0,
    "status": "Disponible",
    "row": 151,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 29,
    "cost": 54550,
    "salePrice": 0,
    "status": "Disponible",
    "row": 152,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "EARLY",
    "number": 30,
    "cost": 54550,
    "salePrice": 0,
    "status": "Disponible",
    "row": 153,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "VIP",
    "number": 3,
    "cost": 70500,
    "salePrice": 0,
    "status": "Disponible",
    "row": 154,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "MISS MONIQUE",
    "date": "2026-12-26",
    "dateExplicit": true,
    "type": "VIP",
    "number": 4,
    "cost": 70500,
    "salePrice": 0,
    "status": "Disponible",
    "row": 155,
    "purchaseDate": "2026-10-08"
  },
  {
    "partyName": "SOLOMUN - MUTE - MDQ",
    "date": "2027-01-02",
    "dateExplicit": true,
    "type": "VIP",
    "number": 1,
    "cost": 138000,
    "salePrice": 0,
    "status": "Disponible",
    "row": 157,
    "purchaseDate": "2026-10-05"
  },
  {
    "partyName": "SOLOMUN - MUTE - MDQ",
    "date": "2027-01-02",
    "dateExplicit": true,
    "type": "VIP",
    "number": 2,
    "cost": 138000,
    "salePrice": 0,
    "status": "Disponible",
    "row": 158,
    "purchaseDate": "2026-10-05"
  }
];
export function addMissingExcelPurchases(existingParties,makeId){
 const merged=mergeResaleParties(existingParties);
 for(const party of merged){if(party.name==='MISS MONIQUE')party.date='2026-12-26';if(party.name==='SOLOMUN - MUTE - MDQ')party.date='2027-01-02';}
 const comparison=compareResaleImport(missingPurchaseRows,merged);
 const additions=comparison.issues.filter(issue=>issue.kind==='new');
 const decisions=Object.fromEntries(additions.map(issue=>[issue.id,'excel']));
 const parties=applyResaleImport(merged,comparison.issues,decisions,makeId);
 verifyResaleImport(parties,comparison.issues,decisions);
 return {parties,added:additions.length};
}
