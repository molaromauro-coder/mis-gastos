import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSplit, ticketMetrics, partyMetrics, portfolioMetrics, withPortfolioPercent, INITIAL_RESALE_PARTIES } from '../resale.js';

test('reparto editable siempre suma 100', () => {
  assert.deepEqual(normalizeSplit(80, 20), { ownerPercent: 80, sellerPercent: 20 });
  assert.deepEqual(normalizeSplit(65, 20), { ownerPercent: 65, sellerPercent: 35 });
});

test('entrada vendida recupera costo, calcula ganancia y reparto', () => {
  const m = ticketMetrics({ cost: 26450, salePrice: 70000, status: 'Vendida' }, { ownerPercent: 70, sellerPercent: 30 });
  assert.equal(m.recovered, 26450);
  assert.equal(m.netGain, 43550);
  assert.equal(Math.round(m.ownerGain), 30485);
  assert.equal(Math.round(m.sellerGain), 13065);
  assert.ok(Math.abs(m.gainPercent - 164.65028355387523) < 1e-9);
});

test('disponible y uso personal no generan recupero ni ganancia', () => {
  for (const status of ['Disponible', 'Uso personal']) {
    const m = ticketMetrics({ cost: 80500, salePrice: 100000, status }, { ownerPercent: 70, sellerPercent: 30 });
    assert.equal(m.recovered, 0);
    assert.equal(m.netGain, 0);
    assert.equal(m.ownerGain, 0);
    assert.equal(m.sellerGain, 0);
  }
});

test('total de fiesta replica la lógica de la planilla', () => {
  const party = {
    tickets: [
      { cost: 26450, salePrice: 70000, status: 'Vendida' },
      { cost: 26450, salePrice: 70000, status: 'Vendida' },
      { cost: 26450, salePrice: 55000, status: 'Vendida' },
      { cost: 26450, salePrice: 55000, status: 'Vendida' }
    ]
  };
  const m = partyMetrics(party, { ownerPercent: 70, sellerPercent: 30 });
  assert.equal(m.investment, 105800);
  assert.equal(m.sales, 250000);
  assert.equal(m.recovered, 105800);
  assert.equal(m.netGain, 144200);
  assert.equal(Math.round(m.ownerGain), 100940);
  assert.equal(Math.round(m.sellerGain), 43260);
  assert.ok(Math.abs(m.gainPercent - ((250000 - 105800) / 105800 * 100)) < 1e-9);
});

test('cambiar 70/30 a 60/40 se replica sin tocar la ganancia neta', () => {
  const party = { tickets: [{ cost: 50000, salePrice: 80000, status: 'Vendida' }] };
  const a = partyMetrics(party, { ownerPercent: 70, sellerPercent: 30 });
  const b = partyMetrics(party, { ownerPercent: 60, sellerPercent: 40 });
  assert.equal(a.netGain, b.netGain);
  assert.equal(b.ownerGain, 18000);
  assert.equal(b.sellerGain, 12000);
});

test('balance total suma todas las fiestas', () => {
  const parties = [
    { tickets: [{ cost: 100, salePrice: 160, status: 'Vendida' }] },
    { tickets: [{ cost: 200, salePrice: 0, status: 'Disponible' }] }
  ];
  const raw = portfolioMetrics(parties, { ownerPercent: 70, sellerPercent: 30 });
  const m = withPortfolioPercent(raw);
  assert.equal(m.investment, 300);
  assert.equal(m.sales, 160);
  assert.equal(m.netGain, 60);
  assert.equal(m.available, 1);
  assert.ok(Math.abs(m.gainPercent - ((160 - 300) / 300 * 100)) < 1e-9);
});


test('Nacho Scoppa coincide con las 8 ventas de la planilla final',()=>{
  const party=INITIAL_RESALE_PARTIES.find((p)=>p.name==='NACHO SCOPPA');
  const m=partyMetrics(party,{ownerPercent:70,sellerPercent:30});
  assert.ok(party);
  assert.equal(party.tickets.length,8);
  assert.deepEqual(party.tickets.map((t)=>t.status),Array(8).fill('Vendida'));
  assert.deepEqual(party.tickets.map((t)=>t.salePrice),[40000,45000,45000,45000,42500,42500,45000,45000]);
  assert.equal(m.investment,220800);
  assert.equal(m.sales,350000);
  assert.equal(m.recovered,220800);
  assert.equal(m.netGain,129200);
  assert.equal(Math.round(m.ownerGain),90440);
  assert.equal(Math.round(m.sellerGain),38760);
  assert.equal(m.available,0);
  assert.equal(m.sold,8);
});

test('datos iniciales coinciden con la planilla final corregida',()=>{
  const m=withPortfolioPercent(portfolioMetrics(INITIAL_RESALE_PARTIES,{ownerPercent:70,sellerPercent:30}));
  assert.equal(m.investment,2392000);
  assert.equal(m.sales,600000);
  assert.equal(m.recovered,326600);
  assert.equal(m.netGain,273400);
  assert.equal(Math.round(m.totalForOwner),517980);
  assert.equal(m.available,55);
  assert.equal(m.sold,12);
  assert.equal(m.personal,1);
});
