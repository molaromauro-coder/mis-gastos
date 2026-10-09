import { dateWithCardDay, nextDueDateForCard } from './finance.js';

// A purchase is stored once per installment. Display its full amount once,
// using its purchase date, independently of when the installments are due.
export function cardPurchasesInMonth(expenses, card, month = new Date()) {
  const seen = new Set();
  return expenses.filter((item) => {
    if (item.card !== card.name || item.method !== card.type) return false;
    const date = localDate(item.purchaseDate || item.date);
    if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) return false;
    const key = item.parentId || item.id;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  }).map((item) => ({ ...item, amount: Number(item.amount || 0) * (item.parentId ? Number(item.installments || 1) : 1) }));
}

export function upcomingCardPayments(expenses, card, now = new Date()) {
  const first = nextDueDateForCard(card, now);
  const anchorDay = Number(String(card.dueDate || '').slice(8, 10)) || Number(card.dueDay) || first.getDate();
  return [first, dateWithCardDay(first.getFullYear(), first.getMonth() + 1, anchorDay)].map((date) => ({
    date,
    items: expenses.filter((item) => {
      if (item.card !== card.name || item.method !== card.type) return false;
      const due = localDate(item.dueDate || item.date);
      return due.getFullYear() === date.getFullYear() && due.getMonth() === date.getMonth();
    })
  }));
}

function localDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(value + 'T12:00:00');
  return new Date(value);
}
function sameMonth(value, month) {
  const date = localDate(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}
function belongsToCard(item, card) {
  return item.card === card.name && item.method === card.type;
}
export function cardMonthSummary(expenses, payments, card, month) {
  return {
    date: month,
    purchases: cardPurchasesInMonth(expenses, card, month),
    dueItems: expenses.filter((item) => belongsToCard(item, card) && sameMonth(item.dueDate || item.date, month)),
    payments: payments.filter((payment) => payment.cardId === card.id && sameMonth(payment.date, month))
  };
}
export function cardStatementProjection(expenses, card, now = new Date()) {
  const first = nextDueDateForCard(card, now);
  const index = (date) => date.getFullYear() * 12 + date.getMonth();
  const firstIndex = index(first);
  const lastIndex = expenses.filter((item) => belongsToCard(item, card)).reduce((last, item) => {
    const due = localDate(item.dueDate || item.date);
    return Number.isFinite(due.getTime()) ? Math.max(last, index(due)) : last;
  }, firstIndex + 11);
  const day = Number(String(card.dueDate || '').slice(8, 10)) || Number(card.dueDay) || first.getDate();
  return Array.from({ length: lastIndex - firstIndex + 1 }, (_, i) => {
    const date = dateWithCardDay(first.getFullYear(), first.getMonth() + i, day);
    return { date, items: expenses.filter((item) => belongsToCard(item, card) && sameMonth(item.dueDate || item.date, date)) };
  });
}
export function cardHistoryMonths(expenses, payments, card, now = new Date()) {
  const current = now.getFullYear() * 12 + now.getMonth();
  const dates = expenses.filter((item) => belongsToCard(item, card)).flatMap((item) => [item.purchaseDate || item.date, item.dueDate || item.date]);
  dates.push(...payments.filter((payment) => payment.cardId === card.id).map((payment) => payment.date));
  const earliest = dates.reduce((first, value) => {
    const date = localDate(value);
    return Number.isFinite(date.getTime()) ? Math.min(first, date.getFullYear() * 12 + date.getMonth()) : first;
  }, current - 5);
  return Array.from({ length: current - earliest + 1 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 1, 12));
}
export function createCardPayment({ id, cardId, statementMonth, date, amount, currency }) {
  const paid = localDate(date);
  if (!id || !cardId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(statementMonth || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(paid.getTime()) ||
      `${paid.getFullYear()}-${String(paid.getMonth()+1).padStart(2,'0')}-${String(paid.getDate()).padStart(2,'0')}` !== date || !Number.isFinite(amount) || amount <= 0 || !['ARS','USD'].includes(currency)) {
    throw new Error('Revisá la fecha, la moneda y el importe del pago.');
  }
  return { id, cardId, statementMonth, date, amount, currency };
}
