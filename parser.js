const UNITS = { un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20, veintiuno:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29 };
const TENS = { treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 };
const HUNDREDS = { cien:100, ciento:100, doscientos:200, trescientos:300, cuatrocientos:400, quinientos:500, seiscientos:600, setecientos:700, ochocientos:800, novecientos:900 };
function wordsValue(text) { const tokens=normalized(text).split(/\s+/); let total=0,current=0,seen=false; for (const t of tokens) { if (UNITS[t]!=null){current+=UNITS[t];seen=true;} else if(TENS[t]!=null){current+=TENS[t];seen=true;} else if(HUNDREDS[t]!=null){current+=HUNDREDS[t];seen=true;} else if(t==='mil'){current=(current||1)*1000;total+=current;current=0;seen=true;} else if(t==='millon'||t==='millones'){current=(current||1)*1000000;total+=current;current=0;seen=true;} } return seen ? total+current : null; }

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
  const installmentMatch = lower.match(/(\d+)\s*cuotas?/) || lower.match(/\b([a-z]+)\s+cuotas?/); const installments = installmentMatch ? (Number(installmentMatch[1]) || wordsValue(installmentMatch[1]) || 1) : 1;
  const method = /credito|cuotas?/.test(lower) ? 'Crédito' : /debito/.test(lower) ? 'Débito' : /efectivo/.test(lower) ? 'Efectivo' : 'Sin definir';
  const card = cards.find((item) => lower.includes(normalized(item.name)))?.name || '';
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
