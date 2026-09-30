import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Informes permite alternar Barras y Torta',()=>{
  assert.match(html,/data-report-chart="bar"/);
  assert.match(html,/data-report-chart="pie"/);
  assert.ok(app.includes("reportChartMode = 'bar'"));
  assert.ok(app.includes("reportChartMode==='pie'"));
});

test('el gráfico de torta usa la misma distribución por categoría',()=>{
  assert.ok(app.includes('reportChartRows(rows)'));
  assert.ok(app.includes('conic-gradient'));
  assert.ok(app.includes('arsEquivalent'));
});

test('la torta muestra leyenda con porcentaje e importe',()=>{
  assert.match(css,/\.report-pie-legend/);
  assert.ok(app.includes("maximumFractionDigits:1"));
  assert.ok(app.includes("money(row.arsEquivalent,'ARS')"));
});
