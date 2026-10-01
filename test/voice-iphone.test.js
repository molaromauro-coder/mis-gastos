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
  assert.match(app,/Hablá ahora · priorizo tu voz y descarto ruido/);
});

test('el micrófono principal conserva mensaje de ayuda y espera resultado final',()=>{
  assert.match(app,/No escuché el gasto\. Mantené presionado, hablá y soltá al terminar/);
  assert.match(app,/1800/);
  assert.match(app,/maxAlternatives=3/);
});

test('la PWA fuerza recursos v82',()=>{
  assert.match(html,/styles\.css\?v=82/);
  assert.match(html,/app\.js\?v=82/);
  assert.match(sw,/mis-gastos-v82/);
});

test('voz principal prioriza frases de gasto, descarta ruido y en toque corto admite varios segmentos',()=>{
  assert.match(app,/function voiceExpenseSignalScore/);
  assert.match(app,/function selectBestExpenseTranscript/);
  assert.match(app,/function looksLikeExpenseVoice/);
  assert.match(app,/function armTapVoiceSilence/);
  assert.match(app,/voiceCycleText=looksLikeExpenseVoice\(candidate\)\?candidate:''/);
  assert.match(app,/\(voiceHoldActive\|\|voiceTapMode\)&&!voiceStopRequested/);
  assert.match(app,/priorizo tu voz y descarto ruido/);
});
