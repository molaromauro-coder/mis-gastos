const RESALE_STORAGE_KEY = 'mis-gastos-v1';
const RESALE_WORKBOOK_VERSION = 3;

function seedTicketBatch(partyId, type, cost, count, sales = [], status = 'Disponible') {
  const slug = String(type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return Array.from({ length: count }, (_, i) => ({
    id: `${partyId}-${slug}-${i + 1}`,
    type,
    number: i + 1,
    cost,
    salePrice: Number(sales[i] || 0),
    status: sales[i] ? 'Vendida' : status
  }));
}

export const INITIAL_RESALE_PARTIES = [
  {
    id: 'seed-max-styler', name: 'MAX STYLER', date: '2026-09-11',
    tickets: seedTicketBatch('seed-max-styler', 'GRAL 3', 26450, 4, [70000, 70000, 55000, 55000])
  },
  {
    id: 'seed-hot-since-82', name: 'HOT SINCE 82', date: '2026-09-18',
    tickets: seedTicketBatch('seed-hot-since-82', 'VIP', 80500, 1, [], 'Uso personal')
  },
  {
    id: 'seed-nacho-scoppa', name: 'NACHO SCOPPA', date: '2026-09-26',
    tickets: [
      ...seedTicketBatch('seed-nacho-scoppa', 'GRAL 1', 26450, 4, [40000, 45000, 45000, 45000]),
      ...seedTicketBatch('seed-nacho-scoppa', 'GRAL 2', 28750, 4, [42500, 42500, 45000, 45000])
    ]
  },
  {
    id: 'seed-camelphat', name: 'CAMELPHAT', date: '2026-10-09',
    tickets: [
      ...seedTicketBatch('seed-camelphat', 'EARLY', 43700, 4),
      ...seedTicketBatch('seed-camelphat', 'VIP', 51750, 2)
    ]
  },
  {
    id: 'seed-massano', name: 'MASSANO', date: '2026-11-27',
    tickets: [
      ...seedTicketBatch('seed-massano', 'EARLY', 46000, 8),
      ...seedTicketBatch('seed-massano', 'VIP', 69000, 1)
    ]
  },
  {
    id: 'seed-mathame', name: 'MATHAME', date: '2026-11-06',
    tickets: [
      ...seedTicketBatch('seed-mathame', 'EARLY', 36800, 10),
      ...seedTicketBatch('seed-mathame', 'GRAL 1', 46000, 8),
      ...seedTicketBatch('seed-mathame', 'VIP', 57500, 2)
    ]
  },
  {
    id: 'seed-kevin-di-serna', name: 'KEVIN DI SERNA', date: '2026-10-24',
    tickets: seedTicketBatch('seed-kevin-di-serna', 'GRAL 1', 20700, 12)
  },
  {
    id: 'seed-discip', name: 'DISCIP', date: '2026-10-30',
    tickets: [
      ...seedTicketBatch('seed-discip', 'GRAL 1', 20700, 6),
      ...seedTicketBatch('seed-discip', 'GRAL 2', 23000, 2)
    ]
  }
];

function seedInitialResaleData() {
  if (typeof localStorage === 'undefined') return;
  try {
    const state = JSON.parse(localStorage.getItem(RESALE_STORAGE_KEY) || '{}');
    const resale = state.resale || {};
    if (Number(resale.initialWorkbookVersion || 0) >= RESALE_WORKBOOK_VERSION) return;

    let existing = Array.isArray(resale.parties) ? resale.parties : [];
    const canonicalNacho = INITIAL_RESALE_PARTIES.find((p) => p.name === 'NACHO SCOPPA');
    if (canonicalNacho && Number(resale.initialWorkbookVersion || 0) < RESALE_WORKBOOK_VERSION) {
      const index = existing.findIndex((p) => String(p?.name || '').trim().toLowerCase() === 'nacho scoppa');
      if (index >= 0) {
        const current = existing[index] || {};
        const currentTickets = Array.isArray(current.tickets) ? current.tickets : [];
        const partyId = current.id || canonicalNacho.id;
        const sameShape = currentTickets.length === canonicalNacho.tickets.length &&
          currentTickets.every((ticket, i) => {
            const canonical = canonicalNacho.tickets[i];
            return String(ticket?.type || '').trim().toLowerCase() === String(canonical.type).trim().toLowerCase() &&
              Number(ticket?.cost || 0) === Number(canonical.cost || 0);
          });
        const allMarkedSold = currentTickets.length > 0 &&
          currentTickets.every((ticket) => ticket?.status === 'Vendida');
        const allPricesMissing = currentTickets.length > 0 &&
          currentTickets.every((ticket) => Number(ticket?.salePrice || 0) === 0);

        if (Number(resale.initialWorkbookVersion || 0) < 2 || (sameShape && allMarkedSold && allPricesMissing)) {
          existing = existing.slice();
          existing[index] = {
            ...current,
            id: partyId,
            name: canonicalNacho.name,
            date: canonicalNacho.date,
            tickets: canonicalNacho.tickets.map((canonical, i) => ({
              ...(currentTickets[i] || {}),
              ...canonical,
              id: currentTickets[i]?.id || canonical.id
            }))
          };
        }
      }
    }
    const existingNames = new Set(existing.map((p) => String(p?.name || '').trim().toLowerCase()).filter(Boolean));
    const missing = INITIAL_RESALE_PARTIES.filter((p) => !existingNames.has(p.name.toLowerCase()));

    state.resale = {
      ownerPercent: Number.isFinite(Number(resale.ownerPercent)) ? Number(resale.ownerPercent) : 70,
      sellerPercent: Number.isFinite(Number(resale.sellerPercent)) ? Number(resale.sellerPercent) : 30,
      ...resale,
      parties: [...existing, ...missing],
      initialWorkbookVersion: RESALE_WORKBOOK_VERSION
    };
    localStorage.setItem(RESALE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // La app seguirá funcionando aunque Safari bloquee temporalmente el almacenamiento.
  }
}

seedInitialResaleData();

function resalePartyChronology(party, now) {
  const raw = String(party?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { bucket: 2, time: Infinity };
  const date = new Date(raw + 'T12:00:00');
  const dateKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  if (!Number.isFinite(date.getTime()) || dateKey !== raw) return { bucket: 2, time: Infinity };
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return { bucket: day >= today ? 0 : 1, time: day };
}
export function orderResalePartiesByDate(parties = [], now = new Date()) {
  const list = Array.isArray(parties) ? [...parties] : [];
  return list.sort((a,b)=>{
    const da=resalePartyChronology(a,now), db=resalePartyChronology(b,now);
    if(da.bucket!==db.bucket)return da.bucket-db.bucket;
    if(da.bucket===0)return da.time-db.time || String(a?.name||'').localeCompare(String(b?.name||''),'es');
    if(da.bucket===1)return db.time-da.time || String(a?.name||'').localeCompare(String(b?.name||''),'es');
    return String(a?.name||'').localeCompare(String(b?.name||''),'es');
  });
}
export function groupResalePartiesByDate(parties = [], now = new Date()) {
  const groups = { upcoming: [], finished: [], undated: [] };
  const keys = ['upcoming','finished','undated'];
  orderResalePartiesByDate(parties,now).forEach((party)=>groups[keys[resalePartyChronology(party,now).bucket]].push(party));
  return groups;
}

export function normalizeSplit(ownerPercent = 70, sellerPercent = 30) {
  let owner = Number(ownerPercent);
  let seller = Number(sellerPercent);
  if (!Number.isFinite(owner)) owner = 70;
  if (!Number.isFinite(seller)) seller = 100 - owner;
  owner = Math.max(0, Math.min(100, owner));
  seller = Math.max(0, Math.min(100, seller));
  const total = owner + seller;
  if (Math.abs(total - 100) > 0.001) seller = 100 - owner;
  return { ownerPercent: owner, sellerPercent: seller };
}

export function ticketMetrics(ticket, split = { ownerPercent: 70, sellerPercent: 30 }) {
  const { ownerPercent, sellerPercent } = normalizeSplit(split.ownerPercent, split.sellerPercent);
  const cost = Number(ticket?.cost || 0);
  const salePrice = Number(ticket?.salePrice || 0);
  const status = ticket?.status || 'Disponible';
  const sold = status === 'Vendida';
  const completedSale = sold && salePrice > 0;
  const recovered = completedSale ? cost : 0;
  const netGain = completedSale ? salePrice - cost : 0;
  const gainPercent = completedSale && cost ? (netGain / cost) * 100 : 0;
  const ownerGain = completedSale ? netGain * ownerPercent / 100 : 0;
  const sellerGain = completedSale ? netGain * sellerPercent / 100 : 0;
  return { cost, salePrice: completedSale ? salePrice : 0, recovered, netGain, gainPercent, ownerGain, sellerGain, status };
}

export function partyMetrics(party, split) {
  const tickets = party?.tickets || [];
  const investment = tickets.reduce((sum, t) => sum + Number(t.cost || 0), 0);
  const metrics = tickets.map((t) => ticketMetrics(t, split));
  const sales = metrics.reduce((sum, m) => sum + m.salePrice, 0);
  const recovered = metrics.reduce((sum, m) => sum + m.recovered, 0);
  const netGain = metrics.reduce((sum, m) => sum + m.netGain, 0);
  const ownerGain = metrics.reduce((sum, m) => sum + m.ownerGain, 0);
  const sellerGain = metrics.reduce((sum, m) => sum + m.sellerGain, 0);
  const available = tickets.filter((t) => (t.status || 'Disponible') === 'Disponible').length;
  const sold = tickets.filter((t) => t.status === 'Vendida').length;
  const personal = tickets.filter((t) => t.status === 'Uso personal').length;
  const gainPercent = recovered ? (netGain / recovered) * 100 : 0;
  return {
    investment, sales, recovered, netGain, ownerGain, sellerGain,
    totalForOwner: recovered + ownerGain,
    gainPercent, available, sold, personal, totalTickets: tickets.length
  };
}

export function portfolioMetrics(parties = [], split) {
  const all = parties.map((party) => partyMetrics(party, split));
  return all.reduce((a, m) => ({
    investment: a.investment + m.investment,
    sales: a.sales + m.sales,
    recovered: a.recovered + m.recovered,
    netGain: a.netGain + m.netGain,
    ownerGain: a.ownerGain + m.ownerGain,
    sellerGain: a.sellerGain + m.sellerGain,
    totalForOwner: a.totalForOwner + m.totalForOwner,
    available: a.available + m.available,
    sold: a.sold + m.sold,
    personal: a.personal + m.personal,
    totalTickets: a.totalTickets + m.totalTickets,
    gainPercent: 0
  }), {
    investment: 0, sales: 0, recovered: 0, netGain: 0, ownerGain: 0, sellerGain: 0,
    totalForOwner: 0, available: 0, sold: 0, personal: 0, totalTickets: 0, gainPercent: 0
  });
}

export function withPortfolioPercent(metrics) {
  return {
    ...metrics,
    gainPercent: metrics.recovered ? (metrics.netGain / metrics.recovered) * 100 : 0
  };
}
