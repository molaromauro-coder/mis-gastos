export function expenseArsEquivalent(expense) {
  const amount = Number(expense?.amount || 0);
  if (expense?.currency !== 'USD') return amount;
  const rate = Number(expense?.fxRate || 0);
  return rate > 0 ? amount * rate : 0;
}

export function boundsForRange(range, now = new Date(), fromValue = '', toValue = '') {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (range === 'today') return [new Date(y,m,d), new Date(y,m,d,23,59,59,999)];
  if (range === 'week') {
    const day = (now.getDay() + 6) % 7;
    const from = new Date(y,m,d-day);
    return [from, new Date(from.getFullYear(),from.getMonth(),from.getDate()+6,23,59,59,999)];
  }
  if (range === 'custom') {
    const from = new Date((fromValue || '2000-01-01') + 'T00:00:00');
    const to = new Date((toValue || '2100-01-01') + 'T23:59:59.999');
    return [from,to];
  }
  return [new Date(y,m,1), new Date(y,m+1,0,23,59,59,999)];
}

export function previousBounds(from, to) {
  const duration = to.getTime() - from.getTime() + 1;
  return [new Date(from.getTime() - duration), new Date(from.getTime() - 1)];
}

export function groupExpenses(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item) || 'Sin definir';
    const row = map.get(key) || { key, ars: 0, usd: 0, arsEquivalent: 0, count: 0 };
    row.count += 1;
    if (item.currency === 'USD') row.usd += Number(item.amount || 0);
    else row.ars += Number(item.amount || 0);
    row.arsEquivalent += expenseArsEquivalent(item);
    map.set(key,row);
  }
  return [...map.values()].sort((a,b) => b.arsEquivalent - a.arsEquivalent);
}
