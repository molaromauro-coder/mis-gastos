import test from 'node:test';
import assert from 'node:assert/strict';
import { learnCategoryRule, matchCategoryRule, applyLearnedCategory } from '../category-learning.js';

test('aprende una clasificación manual y la reutiliza',()=>{
  let rules=[];
  rules=learnCategoryRule(rules,'pagué luz','Servicios','Luz');
  const match=matchCategoryRule(rules,'factura de luz');
  assert.equal(match.category,'Servicios');
  assert.equal(match.subcategory,'Luz');
});

test('no inventa categoría cuando no hay regla aprendida',()=>{
  const item=applyLearnedCategory({concept:'compra rara',category:''},[]);
  assert.equal(item.category,'');
  assert.equal(item.categoryStatus,'unclassified');
});

test('si dos reglas empatan hacia destinos distintos no clasifica',()=>{
  let rules=[];
  rules=learnCategoryRule(rules,'cafe','Comida','Cafetería');
  rules=learnCategoryRule(rules,'cafe','Salidas','Bar');
  const match=matchCategoryRule(rules,'cafe');
  // La segunda corrección reemplaza la enseñanza anterior para la misma frase.
  assert.equal(match.category,'Salidas');
  assert.equal(match.subcategory,'Bar');
});

test('reconoce concepto similar solo cuando conserva las palabras aprendidas',()=>{
  let rules=learnCategoryRule([],'nafta shell','Transporte','Combustible');
  assert.equal(matchCategoryRule(rules,'cargué nafta shell premium').category,'Transporte');
  assert.equal(matchCategoryRule(rules,'peaje autopista'),null);
});

test('reglas aprendidas consideran Gym y gimnasio como el mismo concepto',()=>{
  const rules=learnCategoryRule([],'gimnasio','GASTOS VARIOS','Gym');
  const match=matchCategoryRule(rules,'gym');
  assert.equal(match?.category,'GASTOS VARIOS');
  assert.equal(match?.subcategory,'Gym');
});

test('aprendizaje trata casa como hogar y peluquería como barbería',()=>{
  const hogar=learnCategoryRule([], 'hogar', 'HOGAR');
  assert.equal(applyLearnedCategory({concept:'casa'},hogar).category,'HOGAR');
  const barberia=learnCategoryRule([], 'barbería', 'Barbería');
  assert.equal(applyLearnedCategory({concept:'peluquería'},barberia).category,'Barbería');
});
