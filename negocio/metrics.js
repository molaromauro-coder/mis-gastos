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
// The balance is one calendar timeline, independent of upcoming/finished groups.
export function orderResaleBalanceParties(parties = []) {
  const now=new Date();
  return (Array.isArray(parties)?[...parties]:[]).sort((a,b)=>{
    const aTime=resalePartyChronology(a,now).time,bTime=resalePartyChronology(b,now).time;
    return aTime===bTime?0:aTime<bTime?-1:1;
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
  const { ownerPercent, sellerPercent } = normalizeSplit(ticket?.sellerId ? 100-Number(ticket.sellerPercent) : split.ownerPercent, ticket?.sellerId ? Number(ticket.sellerPercent) : split.sellerPercent);
  const cost = ticket?.status==='Uso personal'?0:Number(ticket?.cost || 0);
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
  const investment = tickets.filter((t)=>t.status!=='Uso personal').reduce((sum, t) => sum + Number(t.cost || 0), 0);
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
    currentInvestment: metrics.investment - metrics.recovered,
    gainPercent: metrics.recovered ? (metrics.netGain / metrics.recovered) * 100 : 0
  };
}
