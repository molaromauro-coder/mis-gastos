import { parseExpenses } from './parser.js';

const STORAGE_KEY = 'mis-gastos-v1';
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"expenses":[],"cards":[],"categories":[]}');
let selectedDate = new Date();
let reportRange = 'month';
let pending = [];
let discarded = null;
let manualStep = 1;

const $ = (selector) => document.querySelector(selector);
const money = (amount, currency) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency, maximumFractionDigits: 2,
}).format(amount || 0);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function dateWithDay(year, month, day) {
  return new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()), 12);
}

function firstDueDate(card, purchaseDate = new Date()) {
  let due = dateWithDay(purchaseDate.getFullYear(), purchaseDate.getMonth(), card.dueDay);
  if (due < purchaseDate) due = dateWithDay(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, card.dueDay);
  return due;
}

function installmentExpenses(expense) {
  if (expense.method !== 'Crédito' || expense.installments <= 1) return [expense];
  const card = state.cards.find((item) => item.name === expense.card);
  if (!card) return [expense];
  const firstDue = firstDueDate(card, new Date(expense.purchaseDate || expense.date));
  return Array.from({ length: expense.installments }, (_, index) => {
    const dueDate = dateWithDay(firstDue.getFullYear(), firstDue.getMonth() + index, card.dueDay);
    return {
      ...expense,
      id: crypto.randomUUID(),
      parentId: expense.id,
      dueDate: dueDate.toISOString(),
      amount: expense.amount / expense.installments,
      installment: index + 1,
    };
  });
}

function billingDate(expense) {
  return new Date(expense.dueDate || expense.date);
}

function render() {
  $('#todayLabel').textContent = selectedDate.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const day = state.expenses.filter((expense) => sameDay(expense.purchaseDate || expense.date, selectedDate));
  $('#arsTotal').textContent = money(day.filter((expense) => expense.currency === 'ARS').reduce((sum, expense) => sum + expense.amount, 0), 'ARS');
  $('#usdTotal').textContent = money(day.filter((expense) => expense.currency === 'USD').reduce((sum, expense) => sum + expense.amount, 0), 'USD');
  const visibleDay = day.filter((expense) => !expense.purchaseDate || !expense.installment || expense.installment === 1);
  $('#expenseList').innerHTML = visibleDay.length
    ? visibleDay.sort((a, b) => b.date.localeCompare(a.date)).map(expenseHTML).join('')
    : '<div class="empty">Todavía no registraste gastos este día.</div>';
  renderPaymentReminders();
  renderCards();
  renderReport();
  fillCardSelect();
  detectUnusual(day);
}

function expenseHTML(expense) {
  const detail = [
    expense.method,
    expense.card,
    expense.installments > 1 ? `${expense.installment || 1}/${expense.installments} cuotas` : null,
  ].filter(Boolean).join(' · ');
  const purchaseAmount = expense.installments > 1 ? expense.amount * expense.installments : expense.amount;
  return `<article class="expense"><div class="expense-icon">${expense.method === 'Efectivo' ? '◆' : '▰'}</div><div class="expense-info"><strong>${escape(expense.concept || 'Sin detalle')}</strong><span>${detail}</span></div><div class="amount">${money(purchaseAmount, expense.currency)}<small>${expense.currency}</small></div></article>`;
}

function detectUnusual(day) {
  const past = state.expenses.filter((expense) => !sameDay(expense.date, new Date()));
  const average = past.length ? past.reduce((sum, expense) => sum + expense.amount, 0) / past.length : Infinity;
  $('#unusual').classList.toggle('hidden', !day.some((expense) => expense.amount > average * 2 && past.length >= 5));
}

function fillCardSelect() {
  const method = $('#method').value;
  const cards = state.cards.filter((card) => method === 'Crédito' ? card.type === 'Crédito' : card.type === 'Débito');
  $('#expenseCard').innerHTML = '<option value="">Elegí una tarjeta</option>'
    + cards.map((card) => `<option value="${escape(card.name)}">${escape(card.name)}</option>`).join('');
}

function monthlyCardTotal(card, date) {
  return state.expenses.filter((expense) => expense.card === card.name
    && billingDate(expense).getFullYear() === date.getFullYear()
    && billingDate(expense).getMonth() === date.getMonth());
}

function totalsHTML(expenses) {
  const ars = expenses.filter((item) => item.currency === 'ARS').reduce((sum, item) => sum + item.amount, 0);
  const usd = expenses.filter((item) => item.currency === 'USD').reduce((sum, item) => sum + item.amount, 0);
  return `${money(ars, 'ARS')}${usd ? ` · ${money(usd, 'USD')}` : ''}`;
}

function renderCards() {
  const now = new Date();
  $('#cardList').innerHTML = state.cards.length ? state.cards.map((card) => {
    const current = monthlyCardTotal(card, now);
    return `<article class="card-item"><div class="top"><strong>${escape(card.name)}</strong><span>${card.type}</span></div><p>${card.type === 'Crédito' ? `Vence cada mes el ${card.dueDay} · Cierra el ${card.closingDay}` : 'Tarjeta de débito'}</p><div class="card-total"><small>ACUMULADO DEL MES</small><strong>${totalsHTML(current)}</strong></div></article>`;
  }).join('') : '<div class="empty">No agregaste tarjetas todavía.</div>';

  const creditCards = state.cards.filter((card) => card.type === 'Crédito');
  $('#cardHistory').innerHTML = creditCards.length ? creditCards.map((card) => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      return `<div class="history-row"><span>${date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</span><strong>${totalsHTML(monthlyCardTotal(card, date))}</strong></div>`;
    }).join('');
    return `<details class="history-card"><summary>${escape(card.name)}</summary>${months}</details>`;
  }).join('') : '<div class="empty">El historial aparecerá cuando agregues una tarjeta de crédito.</div>';
}

function renderPaymentReminders() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const reminders = state.cards.filter((card) => card.type === 'Crédito').flatMap((card) => {
    let due = dateWithDay(today.getFullYear(), today.getMonth(), card.dueDay);
    if (due < today) due = dateWithDay(today.getFullYear(), today.getMonth() + 1, card.dueDay);
    const days = Math.round((due - today) / 86400000);
    if (![5, 3, 2, 1, 0].includes(days)) return [];
    const total = monthlyCardTotal(card, due);
    return [{ card, days, total }];
  });
  $('#paymentReminders').innerHTML = reminders.map(({ card, days, total }) => `<article class="payment-alert"><span>▰</span><div><strong>${days === 0 ? 'Vence hoy' : `Vence en ${days} día${days > 1 ? 's' : ''}`} · ${escape(card.name)}</strong><small>Necesitás tener disponible ${totalsHTML(total)}</small></div></article>`).join('');
}

function renderReport() {
  let from;
  let to = new Date();
  if (reportRange === 'month') {
    from = new Date(to.getFullYear(), to.getMonth(), 1);
    $('#reportTitle').textContent = to.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  } else if (reportRange === 'year') {
    from = new Date(to.getFullYear(), 0, 1);
    $('#reportTitle').textContent = `Año ${to.getFullYear()}`;
  } else {
    from = new Date($('#fromDate').value || '2000-01-01');
    to = new Date($('#toDate').value || '2100-01-01');
    $('#reportTitle').textContent = 'Rango personalizado';
  }
  const items = state.expenses.filter((expense) => new Date(expense.purchaseDate || expense.date) >= from
    && new Date(expense.purchaseDate || expense.date) <= new Date(to.getTime() + 86400000));
  $('#reportArs').textContent = money(items.filter((item) => item.currency === 'ARS').reduce((sum, item) => sum + item.amount, 0), 'ARS');
  $('#reportUsd').textContent = money(items.filter((item) => item.currency === 'USD').reduce((sum, item) => sum + item.amount, 0), 'USD');
  const months = Array.from({ length: 12 }, (_, index) => items.filter((item) => new Date(item.purchaseDate || item.date).getMonth() === index && item.currency === 'ARS').reduce((sum, item) => sum + item.amount, 0));
  const max = Math.max(...months, 1);
  $('#monthlyChart').innerHTML = months.map((value, index) => `<div class="bar" style="height:${value / max * 100}%" title="${money(value, 'ARS')}"><span>${'EFMAMJJASOND'[index]}</span></div>`).join('');
}

function showToast(message, undo = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  toast.onclick = undo ? () => {
    if (!discarded) return;
    pending.splice(discarded.index, 0, discarded.item);
    discarded = null;
    showPending();
    showToast('Gasto recuperado');
  } : null;
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function setManualStep(step) {
  manualStep = step;
  document.querySelectorAll('.step').forEach((element) => element.classList.toggle('active', Number(element.dataset.step) === step));
  const titles = ['¿Cuánto gastaste?', 'Elegí una categoría', '¿Cómo pagaste?'];
  $('#stepLabel').textContent = `PASO ${step} DE 3`;
  $('#expenseDialogTitle').textContent = titles[step - 1];
  $('#prevStep').classList.toggle('hidden', step === 1);
  $('#nextStep').classList.toggle('hidden', step === 3);
  $('#saveExpense').classList.toggle('hidden', step !== 3);
}

function openExpense(data = {}) {
  $('#expenseForm').reset();
  $('#amount').value = data.amount || '';
  $('#concept').value = data.concept === 'Sin concepto' ? '' : data.concept || '';
  $('#method').value = data.method === 'Sin definir' ? 'Efectivo' : data.method || 'Efectivo';
  $('#installments').value = data.installments || 1;
  document.querySelector(`input[name=currency][value=${data.currency || 'ARS'}]`).checked = true;
  setManualStep(data.source === 'voice' ? 3 : 1);
  updatePaymentFields();
  fillCardSelect();
  $('#expenseCard').value = data.card || '';
  updateInstallmentPreview();
  $('#expenseDialog').showModal();
}

function updatePaymentFields() {
  const method = $('#method').value;
  $('#cardFields').classList.toggle('hidden', method === 'Efectivo');
  $('#creditFields').classList.toggle('hidden', method !== 'Crédito');
  fillCardSelect();
  updateInstallmentPreview();
}

function updateInstallmentPreview() {
  const card = state.cards.find((item) => item.name === $('#expenseCard').value);
  const installments = Number($('#installments').value || 1);
  const amount = Number($('#amount').value || 0);
  if ($('#method').value !== 'Crédito' || !card || !amount) {
    $('#installmentPreview').innerHTML = '';
    return;
  }
  const due = firstDueDate(card);
  $('#installmentPreview').innerHTML = `<strong>${installments} × ${money(amount / installments, document.querySelector('[name=currency]:checked').value)}</strong><span>Primera cuota: ${due.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}. Las siguientes vencen el día ${card.dueDay} de cada mes.</span>`;
}

function showPending() {
  if (!pending.length) {
    if ($('#confirmDialog').open) $('#confirmDialog').close();
    return;
  }
  $('#pendingList').innerHTML = pending.map((expense, index) => `<article class="pending" data-index="${index}"><div class="pending-head"><div><strong>${escape(expense.concept)}</strong><p class="muted">${expense.method}${expense.card ? ` · ${escape(expense.card)}` : ''}</p></div><strong>${expense.amount ? money(expense.amount, expense.currency) : 'Sin importe'}</strong></div><div class="actions"><button class="edit">Corregir</button><button class="confirm" ${!expense.amount ? 'disabled' : ''}>✓ Confirmar</button></div></article>`).join('');
  if (!$('#confirmDialog').open) $('#confirmDialog').showModal();
  document.querySelectorAll('.pending').forEach((card) => {
    const index = Number(card.dataset.index);
    card.querySelector('.confirm').onclick = () => confirmPending(index);
    card.querySelector('.edit').onclick = () => {
      const item = pending.splice(index, 1)[0];
      if ($('#confirmDialog').open) $('#confirmDialog').close();
      openExpense(item);
    };
    let start = 0;
    card.ontouchstart = (event) => { start = event.touches[0].clientX; };
    card.ontouchend = (event) => {
      if (Math.abs(event.changedTouches[0].clientX - start) <= 80) return;
      discarded = { item: pending.splice(index, 1)[0], index };
      showPending();
      showToast('Descartado · Tocá para deshacer', true);
    };
  });
}

function confirmPending(index) {
  const item = pending.splice(index, 1)[0];
  item.purchaseDate = item.purchaseDate || item.date;
  state.expenses.push(...installmentExpenses(item));
  save();
  navigator.vibrate?.(80);
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 660;
    oscillator.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
  } catch {}
  showToast('✓ Gasto confirmado');
  showPending();
  render();
}

document.querySelectorAll('nav button').forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll('.view, nav button').forEach((element) => element.classList.remove('active'));
    $(`#${button.dataset.view}`).classList.add('active');
    button.classList.add('active');
    render();
  };
});
document.querySelectorAll('dialog .close').forEach((button) => { button.onclick = () => button.closest('dialog').close(); });
$('#manualBtn').onclick = () => openExpense();
$('#prevDay').onclick = () => { selectedDate.setDate(selectedDate.getDate() - 1); render(); };
$('#nextDay').onclick = () => { selectedDate.setDate(selectedDate.getDate() + 1); render(); };
$('#nextStep').onclick = () => {
  if (manualStep === 1 && !$('#amount').value) return $('#amount').reportValidity();
  setManualStep(manualStep + 1);
};
$('#prevStep').onclick = () => setManualStep(manualStep - 1);
$('#method').onchange = updatePaymentFields;
$('#expenseCard').onchange = updateInstallmentPreview;
$('#installments').oninput = updateInstallmentPreview;
$('#amount').oninput = updateInstallmentPreview;
document.querySelectorAll('[name=currency]').forEach((input) => { input.onchange = updateInstallmentPreview; });

$('#expenseForm').onsubmit = (event) => {
  event.preventDefault();
  const method = $('#method').value;
  if (method !== 'Efectivo' && !$('#expenseCard').value) {
    showToast('Elegí una tarjeta para continuar');
    $('#expenseCard').focus();
    return;
  }
  const now = new Date().toISOString();
  const expense = {
    id: crypto.randomUUID(),
    amount: Number($('#amount').value),
    currency: document.querySelector('[name=currency]:checked').value,
    concept: $('#concept').value || $('#category').value || 'Sin detalle',
    category: $('#category').value,
    method,
    card: $('#expenseCard').value,
    installments: method === 'Crédito' ? Number($('#installments').value) : 1,
    date: now,
    purchaseDate: now,
    source: 'manual',
  };
  state.expenses.push(...installmentExpenses(expense));
  save();
  $('#expenseDialog').close();
  showToast('Gasto guardado');
  render();
};

$('#addCard').onclick = () => $('#cardDialog').showModal();
$('#cardForm').onsubmit = (event) => {
  event.preventDefault();
  state.cards.push({
    id: crypto.randomUUID(), name: $('#cardName').value, type: $('#cardType').value,
    closingDay: Number($('#closingDay').value), dueDay: Number($('#dueDay').value),
  });
  save();
  event.target.reset();
  $('#cardDialog').close();
  showToast('Tarjeta agregada');
  render();
};

document.querySelectorAll('.range-tabs button').forEach((button) => {
  button.onclick = () => {
    reportRange = button.dataset.range;
    document.querySelectorAll('.range-tabs button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    $('#customRange').classList.toggle('hidden', reportRange !== 'custom');
    renderReport();
  };
});
$('#fromDate').onchange = renderReport;
$('#toDate').onchange = renderReport;
$('#settingsBtn').onclick = () => $('#settingsDialog').showModal();
$('#biometricBtn').onclick = () => showToast(window.PublicKeyCredential
  ? 'Base biométrica lista; requiere un servidor seguro para activarse'
  : 'Biometría no disponible en este dispositivo');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
$('#micBtn').onclick = () => {
  if (!SpeechRecognition) {
    const phrase = prompt('Tu navegador no ofrece dictado. Escribí solamente el gasto:');
    if (phrase) { pending = parseExpenses(phrase, state.cards); showPending(); }
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  let finalPhrase = '';
  recognition.onstart = () => {
    $('#micBtn').classList.add('listening');
    $('#voiceTitle').textContent = 'Escuchando un gasto…';
    $('#voiceHint').textContent = 'La captura se detiene al terminar la frase';
  };
  recognition.onresult = (event) => {
    const result = event.results[event.resultIndex];
    if (result.isFinal) finalPhrase = result[0].transcript.trim();
  };
  recognition.onend = () => {
    $('#micBtn').classList.remove('listening');
    $('#voiceTitle').textContent = 'Tocá para hablar';
    $('#voiceHint').textContent = 'Decí solamente el gasto que querés cargar';
    if (finalPhrase) {
      pending = parseExpenses(finalPhrase, state.cards);
      showPending();
    }
  };
  recognition.start();
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
