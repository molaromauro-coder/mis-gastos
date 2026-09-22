const NUMBER_WORDS = {un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12};

export function parseAmount(text) {
  const cleaned = text.toLowerCase().replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const match = cleaned.match(/(?:usd|u\$s|d[oó]lares?|\$)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (match) return Number(match[1]);
  for (const [word, number] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`).test(cleaned)) return number;
  return null;
}

export function parseExpense(text, cards = []) {
  const raw = text.trim(); const lower = raw.toLowerCase();
  const amount = parseAmount(lower);
  const currency = /(?:usd|u\$s|d[oó]lar)/.test(lower) ? 'USD' : 'ARS';
  const installments = Number(lower.match(/(\d+)\s*cuotas?/)?.[1] || 1);
  const method = /cr[eé]dito|cuotas?/.test(lower) ? 'Crédito' : /d[eé]bito/.test(lower) ? 'Débito' : /efectivo/.test(lower) ? 'Efectivo' : 'Sin definir';
  const card = cards.find(c => lower.includes(c.name.toLowerCase()))?.name || '';
  let concept = raw.replace(/\b(pagu[eé]|gast[eé]|compr[eé]|en|con|del?|la|el|efectivo|d[eé]bito|cr[eé]dito|pesos?|d[oó]lares?|usd|u\$s|\d+\s*cuotas?)\b/gi, ' ').replace(/[\d$.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { id: crypto.randomUUID(), amount, currency, concept: concept || 'Sin concepto', method, card, installments, date: new Date().toISOString(), source: 'voice' };
}

export function parseExpenses(transcript, cards = []) {
  return transcript.split(/\s*(?:,?\s+y\s+|;|\n)\s*(?=(?:pagu[eé]|gast[eé]|compr[eé]))/i).filter(Boolean).map(part => parseExpense(part, cards));
}
