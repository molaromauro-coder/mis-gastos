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
  const recovered = sold ? cost : 0;
  const netGain = sold ? salePrice - cost : 0;
  const gainPercent = sold && cost ? (netGain / cost) * 100 : 0;
  const ownerGain = sold ? netGain * ownerPercent / 100 : 0;
  const sellerGain = sold ? netGain * sellerPercent / 100 : 0;
  return { cost, salePrice: sold ? salePrice : 0, recovered, netGain, gainPercent, ownerGain, sellerGain, status };
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
  // Balance general: rendimiento del total invertido contra ventas cobradas.
  const gainPercent = investment ? ((sales - investment) / investment) * 100 : 0;
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
    gainPercent: metrics.investment ? ((metrics.sales - metrics.investment) / metrics.investment) * 100 : 0
  };
}
