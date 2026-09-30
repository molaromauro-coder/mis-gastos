import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalizedNumber, formatLocalizedNumber, formatLocalizedInteger } from '../numeric-format.js';

test('formatea miles con punto argentino',()=>{
  assert.equal(formatLocalizedInteger(1000),'1.000');
  assert.equal(formatLocalizedInteger(10000),'10.000');
  assert.equal(formatLocalizedInteger(165765),'165.765');
  assert.equal(formatLocalizedInteger(9987924),'9.987.924');
  assert.equal(formatLocalizedInteger(16987356),'16.987.356');
});

test('formatea decimales con coma',()=>{
  assert.equal(formatLocalizedNumber(12345.67),'12.345,67');
});

test('interpreta números argentinos escritos con puntos',()=>{
  assert.equal(parseLocalizedNumber('1.000'),1000);
  assert.equal(parseLocalizedNumber('16.987.356'),16987356);
  assert.equal(parseLocalizedNumber('10.000,50'),10000.5);
});

test('interpreta números sin formato',()=>{
  assert.equal(parseLocalizedNumber('10000'),10000);
  assert.equal(parseLocalizedNumber('1234.5'),1234.5);
});
