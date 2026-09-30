import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('la app móvil bloquea el desplazamiento horizontal global',()=>{
  assert.match(css,/html,body\{[\s\S]*overflow-x:hidden!important/);
  assert.match(css,/body,\.app,\.app>main,\.view,\.view\.active\{[\s\S]*overflow-x:hidden!important/);
  assert.match(css,/body,\.app,\.app>main,\.view\.active\{[\s\S]*touch-action:pan-y!important/);
});

test('las pestañas móviles no generan scroll horizontal',()=>{
  assert.match(css,/\.history-tabs,\.report-tabs,\.usd-tabs\{[\s\S]*overflow-x:hidden!important;[\s\S]*flex-wrap:wrap/);
});

test('la tabla de reventa se adapta al ancho del teléfono',()=>{
  assert.match(css,/\.resale-balance-table\{[\s\S]*min-width:0!important;[\s\S]*table-layout:fixed/);
  assert.match(css,/white-space:normal!important/);
});
