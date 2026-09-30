import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedPaymentMethod, needsPaymentMethod, needsPaymentCard, needsPaymentInstallments } from '../pending-validation.js';

test('medio de pago vacío o inválido siempre queda pendiente',()=>{
  for(const method of [undefined,null,'','Otro','Sin definir']){
    assert.equal(needsPaymentMethod({method}),true);
    assert.equal(normalizedPaymentMethod(method),'Sin definir');
  }
});

test('los tres medios válidos no quedan pendientes',()=>{
  for(const method of ['Efectivo','Débito','Crédito']){
    assert.equal(needsPaymentMethod({method}),false);
  }
});

test('débito y crédito exigen tarjeta cuando falta',()=>{
  assert.equal(needsPaymentCard({method:'Débito',card:''}),true);
  assert.equal(needsPaymentCard({method:'Crédito'}),true);
  assert.equal(needsPaymentCard({method:'Efectivo'}),false);
  assert.equal(needsPaymentCard({method:'Débito',card:'Banco Macro'}),false);
});

test('crédito exige cuotas si todavía no fueron especificadas',()=>{
  assert.equal(needsPaymentInstallments({method:'Crédito',installmentsSpecified:false}),true);
  assert.equal(needsPaymentInstallments({method:'Crédito',installmentsSpecified:true}),false);
  assert.equal(needsPaymentInstallments({method:'Débito',installmentsSpecified:false}),false);
});
