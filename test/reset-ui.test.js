import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Configuración ofrece borrado del mes actual y meses anteriores por separado',()=>{
  assert.match(html,/id="resetCurrentMonthBtn"/);
  assert.match(html,/id="resetPreviousMonthsBtn"/);
  assert.match(html,/Borrar mes en curso/);
  assert.match(html,/Borrar meses anteriores/);
});

test('el borrado histórico exige segunda confirmación irreversible',()=>{
  assert.match(html,/id="resetPreviousMonthsDialog"/);
  assert.match(html,/id="resetPreviousMonthsFinalDialog"/);
  assert.match(html,/No vas a poder recuperar lo borrado/);
  assert.match(html,/Sí, borrar definitivamente/);
});

test('la interfaz llama a las dos funciones de borrado y vuelve a renderizar todo',()=>{
  assert.ok(app.includes('moveCurrentMonthExpensesToTrash(state,now)'));
  assert.ok(app.includes('permanentlyDeletePreviousMonths(state,now)'));
  assert.ok(app.includes('renderTrash();'));
  assert.ok(app.includes('render();'));
  assert.ok(app.includes('mirrorResetIntoSnapshot(settingsSnapshot,state)'));
});
