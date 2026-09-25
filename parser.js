const UNITS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };

function normalized(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parseAmount(text) {
  const clean = normalized(text).replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const numeric = clean.match(/(?:usd|u\$s|dolares?|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?/i);
  if (numeric) return Number(numeric[1]) * (/millon/.test(numeric[2] || '') ? 1_000_000 : numeric[2] === 'mil' ? 1_000 : 1);
  const word = Object.entries(UNITS).find(([key]) => new RegExp(`\\b${key}\\b`).test(clean));
  if (!word) return null;
  return word[1] * (/\bmillon(?:es)?\b/.test(clean) ? 1_000_000 : /\bmil\b/.test(clean) ? 1_000 : 1);
}

function categoryFor(text, categories) {
  const lower = normalized(text);
  return categories.find((category) => lower.includes(normalized(typeof category === 'string' ? category : category.name)))?.name
    || categories.find((category) => lower.includes(normalized(category))) || '';
}

export function parseExpense(text, cards = [], categories = []) {
  const raw = text.trim();
  const lower = normalized(raw);
  const amount = parseAmount(lower);
  const currency = /(?:usd|u\$s|dolar)/.test(lower) ? 'USD' : 'ARS';
  const installmentToken = lower.match(/(\d+|una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s*cuotas?/)?.[1];
  const installments = Number(installmentToken) || UNITS[installmentToken] || 1;
  const method = /credito|cuotas?/.test(lower) ? 'Crédito' : /debito/.test(lower) ? 'Débito' : /efectivo/.test(lower) ? 'Efectivo' : 'Sin definir';
  const methodType = method === 'Crédito' ? 'Crédito' : method === 'Débito' ? 'Débito' : null;
  const card = cards.find((item) => (!methodType || !item.type || item.type === methodType) && lower.includes(normalized(item.name)))?.name || '';
  const category = categoryFor(raw, categories);
  let concept = raw.replace(/\b(pagu[eé]|gast[eé]|compr[eé]|en|con|del?|la|el|efectivo|d[eé]bito|cr[eé]dito|pesos?|d[oó]lares?|usd|u\$s|cuotas?|mil|mill[oó]n(?:es)?)\b/gi, ' ')
    .replace(/[\d$.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { id: crypto.randomUUID(), amount, currency, concept: concept || category || 'Sin concepto', category, method, card, installments, date: new Date().toISOString(), source: 'voice' };
}

export function parseExpenses(transcript, cards = [], categories = []) {
  // A conjunction followed by either another spending verb or another amount starts a new expense.
  const parts = transcript.split(/\s*(?:;|\n|,?\s+y\s+)(?=(?:(?:pagu[eé]|gast[eé]|compr[eé])\s+)?(?:\d|un(?:a|o)?\b|dos\b|tres\b))/i).filter(Boolean);
  return parts.map((part) => parseExpense(part, cards, categories));
}
