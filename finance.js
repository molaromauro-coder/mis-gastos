import { expenseArsEquivalent } from './reporting.js';

export function dateWithCardDay(year,month,day){
  return new Date(year,month,Math.min(Number(day||1),new Date(year,month+1,0).getDate()),12);
}
export function firstDueDateForCard(card,purchase=new Date()){
  const source=purchase instanceof Date?purchase:new Date(purchase);
  const bought=dateWithCardDay(source.getFullYear(),source.getMonth(),source.getDate());
  const closingDay=Number(card?.closingDay||card?.dueDay||1);
  const dueDay=Number(card?.dueDay||1);
  let closing=dateWithCardDay(bought.getFullYear(),bought.getMonth(),closingDay);
  if(bought.getTime()>closing.getTime()) closing=dateWithCardDay(bought.getFullYear(),bought.getMonth()+1,closingDay);
  let due=dateWithCardDay(closing.getFullYear(),closing.getMonth(),dueDay);
  if(due.getTime()<=closing.getTime()) due=dateWithCardDay(closing.getFullYear(),closing.getMonth()+1,dueDay);
  return due;
}

export function accountingDate(item) {
  return new Date(item?.dueDate || item?.paidDate || item?.purchaseDate || item?.date);
}
export function monthKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
export function itemArsEquivalent(item) {
  if (item?.currency === 'USD') {
    const rate = Number(item.fxRate || 0);
    return rate > 0 ? Number(item.amount || item.totalAmount || 0) * rate : 0;
  }
  return Number(item?.amount ?? item?.totalAmount ?? 0);
}
export function monthExpenseTotal(expenses = [], key) {
  return expenses.filter((e)=>monthKey(accountingDate(e))===key).reduce((s,e)=>s+expenseArsEquivalent(e),0);
}
export function monthStockPaidTotal(stock = [], key) {
  return stock.filter((p)=>monthKey(new Date(p.paidDate || p.date))===key).reduce((s,p)=>s+itemArsEquivalent(p),0);
}
export function budgetOutcome(budgetAmount, expenses = [], stock = [], key) {
  const budget = Number(budgetAmount || 0);
  const spent = monthExpenseTotal(expenses,key) + monthStockPaidTotal(stock,key);
  const available = Math.max(budget-spent,0);
  const saving = budget > 0 ? Math.max(budget-spent,0) : 0;
  const excess = budget > 0 ? Math.max(spent-budget,0) : 0;
  const percent = budget > 0 ? (spent/budget)*100 : 0;
  return {budget,spent,available,saving,excess,percent};
}
export function stockMetrics(purchase) {
  const qty=Number(purchase?.quantity||0);
  const consumed=(purchase?.consumptions||[]).reduce((s,c)=>s+Number(c.quantity||0),0);
  const remaining=Math.max(qty-consumed,0);
  const total=Number(purchase?.totalAmount||0);
  const unitCost=qty ? total/qty : 0;
  return {qty,consumed,remaining,total,unitCost,consumedValue:consumed*unitCost,remainingValue:remaining*unitCost};
}
export function recoveryMonthMetrics(recoveries = [], expenses = [], key) {
  const recovered=recoveries.filter((r)=>monthKey(new Date(r.date))===key).reduce((s,r)=>s+itemArsEquivalent(r),0);
  const gross=monthExpenseTotal(expenses,key);
  return {gross,recovered,net:Math.max(gross-recovered,0)};
}
