import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('voz de iPhone usa ciclos cortos compatibles con Safari',()=>{
  const continuousTrue=(app.match(/continuous\s*=\s*true/g)||[]).length;
  const continuousFalse=(app.match(/continuous\s*=\s*false/g)||[]).length;
  assert.equal(continuousTrue,0);
  assert.ok(continuousFalse>=3);
});

test('el micrófono principal no falla en silencio si no llega transcripción',()=>{
  assert.match(app,/No escuché el gasto\. Mantené presionado, hablá y soltá al terminar/);
  assert.match(app,/1800/);
});

test('la PWA fuerza recursos v79',()=>{
  assert.match(html,/styles\.css\?v=79/);
  assert.match(html,/app\.js\?v=79/);
  assert.match(sw,/mis-gastos-v79/);
});
