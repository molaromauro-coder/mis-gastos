import { dateWithCardDay, nextDueDateForCard } from './finance.js';

// A purchase is stored once per installment. Display its full amount once,
// using its purchase date, independently of when the installments are due.
export function cardPurchasesInMonth(expenses, card, month = new Date()) {
  const seen = new Set();
  return expenses.filter((item) => {
    if (item.card !== card.name || item.method !== card.type) return false;
    const date = new Date(item.purchaseDate || item.date);
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
      const due = new Date(item.dueDate || item.date);
      return due.getFullYear() === date.getFullYear() && due.getMonth() === date.getMonth();
    })
  }));
}
