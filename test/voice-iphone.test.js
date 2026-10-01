import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('voz principal de iPhone acepta toque corto además de mantener presionado',()=>{
  assert.match(app,/heldMs<450&&activeRecognition/);
  assert.match(app,/voiceTapMode=true/);
  assert.match(app,/8000/);
  assert.match(app,/Hablá ahora · termina solo al detectar silencio/);
});

test('el micrófono principal conserva mensaje de ayuda y espera resultado final',()=>{
  assert.match(app,/No escuché el gasto\. Mantené presionado, hablá y soltá al terminar/);
  assert.match(app,/1800/);
  assert.match(app,/maxAlternatives=3/);
});

test('la PWA fuerza recursos v81',()=>{
  assert.match(html,/styles\.css\?v=81/);
  assert.match(html,/app\.js\?v=81/);
  assert.match(sw,/mis-gastos-v81/);
});
