import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {attachExcelRates} from '../negocio/excel-rates.js';
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx-0.20.3.js',import.meta.url),'utf8'),c);const X=c.XLSX;
function fixture(){const w=X.utils.book_new(),s=X.utils.aoa_to_sheet([['Fiesta','70% GANANCIA MAURO','30% GANANCIA ALE'],['Una',0,0],['Otra',0,0]]);s.B2.f='IF(A2="","",100*75%)';s.C2.f='IF(A2="","",100*25%)';s.B3.f='100*60%';s.C3.f='100*40%';X.utils.book_append_sheet(w,s,'VENTAS');return w;}
test('lee fórmulas por entrada, por encima del encabezado general',()=>{const r=attachExcelRates(X,fixture(),{rows:[{row:2},{row:3}]});assert.deepEqual(r.rows.map(r=>r.sellerPercent),[25,40]);assert.equal(r.rows[0].sellerName,'Ale');});
test('no inventa porcentajes de fórmulas no reconocidas ni acepta reparto distinto de 100',()=>{const w=fixture();w.Sheets.VENTAS.C2.f='K2*$Z$1';assert.throws(()=>attachExcelRates(X,w,{rows:[{row:2}]}),/interpretar/);w.Sheets.VENTAS.C2.f='100*40%';assert.throws(()=>attachExcelRates(X,w,{rows:[{row:2}]}),/inválido/);});
