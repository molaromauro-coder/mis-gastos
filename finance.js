import { expenseArsEquivalent } from './reporting.js';

export function dateWithCardDay(year,month,day){
  return new Date(year,month,Math.min(Number(day||1),new Date(year,month+1,0).getDate()),12);
}
function normalizeCardDate(value){
  if(value instanceof Date) return dateWithCardDay(value.getFullYear(),value.getMonth(),value.getDate());
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!match)return null;
  return dateWithCardDay(Number(match[1]),Number(match[2])-1,Number(match[3]));
}
function monthIndex(date){return date.getFullYear()*12+date.getMonth();}
function occurrenceFromAnchor(anchor,reference){
  const target=reference instanceof Date?dateWithCardDay(reference.getFullYear(),reference.getMonth(),reference.getDate()):normalizeCardDate(reference);
  if(!anchor||!target)return null;
  let cycles=monthIndex(target)-monthIndex(anchor);
  let candidate=dateWithCardDay(anchor.getFullYear(),anchor.getMonth()+cycles,anchor.getDate());
  if(candidate.getTime()<target.getTime()){
    cycles+=1;
    candidate=dateWithCardDay(anchor.getFullYear(),anchor.getMonth()+cycles,anchor.getDate());
  }
  return {date:candidate,cycles};
}
export function nextClosingDateForCard(card,now=new Date()){
  const source=now instanceof Date?dateWithCardDay(now.getFullYear(),now.getMonth(),now.getDate()):normalizeCardDate(now);
  const anchor=normalizeCardDate(card?.closingDate);
  if(anchor){
    const next=occurrenceFromAnchor(anchor,source);
    if(next)return next.date;
  }
  let closing=dateWithCardDay(source.getFullYear(),source.getMonth(),card?.closingDay||1);
  if(closing.getTime()<source.getTime())closing=dateWithCardDay(source.getFullYear(),source.getMonth()+1,card?.closingDay||1);
  return closing;
}
export function nextDueDateForCard(card,now=new Date()){
  const source=now instanceof Date?dateWithCardDay(now.getFullYear(),now.getMonth(),now.getDate()):normalizeCardDate(now);
  const anchor=normalizeCardDate(card?.dueDate);
  if(anchor){
    const next=occurrenceFromAnchor(anchor,source);
    if(next)return next.date;
  }
  let due=dateWithCardDay(source.getFullYear(),source.getMonth(),card?.dueDay||1);
  if(due.getTime()<source.getTime())due=dateWithCardDay(source.getFullYear(),source.getMonth()+1,card?.dueDay||1);
  return due;
}
export function firstDueDateForCard(card,purchase=new Date()){
  const source=purchase instanceof Date?purchase:new Date(purchase);
  const bought=dateWithCardDay(source.getFullYear(),source.getMonth(),source.getDate());
  const closingAnchor=normalizeCardDate(card?.closingDate);
  const dueAnchor=normalizeCardDate(card?.dueDate);
  if(closingAnchor&&dueAnchor){
    const closingOccurrence=occurrenceFromAnchor(closingAnchor,bought);
    const closing=closingOccurrence.date;
    let due=dateWithCardDay(dueAnchor.getFullYear(),dueAnchor.getMonth()+closingOccurrence.cycles,dueAnchor.getDate());
    while(due.getTime()<=closing.getTime())due=dateWithCardDay(due.getFullYear(),due.getMonth()+1,dueAnchor.getDate());
    return due;
  }
  const closingDay=Number(card?.closingDay||card?.dueDay||1);
  const dueDay=Number(card?.dueDay||1);
  let closing=dateWithCardDay(bought.getFullYear(),bought.getMonth(),closingDay);
  if(bought.getTime()>closing.getTime()) closing=dateWithCardDay(bought.getFullYear(),bought.getMonth()+1,closingDay);
  let due=dateWithCardDay(closing.getFullYear(),closing.getMonth(),dueDay);
  if(due.getTime()<=closing.getTime()) due=dateWithCardDay(closing.getFullYear(),closing.getMonth()+1,dueDay);
  return due;
}
export function installmentDueDates(card,purchase=new Date(),count=1){
  const total=Math.max(1,Math.floor(Number(count)||1));
  const first=firstDueDateForCard(card,purchase);
  return Array.from({length:total},(_,i)=>dateWithCardDay(first.getFullYear(),first.getMonth()+i,card?.dueDay||first.getDate()||1));
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
  const recovered=recoveries.filter((r)=>{const raw=String(r.date||'');const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00'):new Date(raw);return monthKey(d)===key;}).reduce((s,r)=>s+itemArsEquivalent(r),0);
  const gross=monthExpenseTotal(expenses,key);
  return {gross,recovered,net:Math.max(gross-recovered,0)};
}
