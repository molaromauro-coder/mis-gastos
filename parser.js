const UNITS = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9,
  diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19,
  veinte:20, veintiuno:21, veintiun:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26,
  veintisiete:27, veintiocho:28, veintinueve:29
};
const TENS={treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90};
const HUNDREDS={cien:100,ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900};
const NUMBER_WORDS=new Set([...Object.keys(UNITS),...Object.keys(TENS),...Object.keys(HUNDREDS),'mil','millon','millones','y']);

function normalized(text) {
  return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseNumberWords(tokens){
  let total=0,current=0,found=false;
  for(const token of tokens){
    if(token==='y') continue;
    if(Object.hasOwn(UNITS,token)){current+=UNITS[token];found=true;continue;}
    if(Object.hasOwn(TENS,token)){current+=TENS[token];found=true;continue;}
    if(Object.hasOwn(HUNDREDS,token)){current+=HUNDREDS[token];found=true;continue;}
    if(token==='mil'){total+=(current||1)*1000;current=0;found=true;continue;}
    if(token==='millon'||token==='millones'){total+=(current||1)*1_000_000;current=0;found=true;continue;}
    break;
  }
  return found?total+current:null;
}

function firstWordNumber(text){
  const tokens=normalized(text).match(/[a-z]+/g)||[];
  for(let i=0;i<tokens.length;i++){
    if(!NUMBER_WORDS.has(tokens[i])||tokens[i]==='y') continue;
    const seq=[];
    for(let j=i;j<tokens.length&&NUMBER_WORDS.has(tokens[j]);j++) seq.push(tokens[j]);
    const value=parseNumberWords(seq);
    if(value!=null) return value;
  }
  return null;
}

export function parseAmount(text) {
  const clean = normalized(text).replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const numeric = clean.match(/(?:usd|u\$s|dolares?|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?/i);
  if (numeric) return Number(numeric[1]) * (/millon/.test(numeric[2] || '') ? 1_000_000 : numeric[2] === 'mil' ? 1_000 : 1);
  return firstWordNumber(clean);
}

function parseInstallments(text){
  const clean=normalized(text);
  const digits=clean.match(/(\d+)\s*cuotas?/);
  if(digits) return Math.max(1,Number(digits[1]));
  const before=clean.match(/((?:[a-z]+\s+){1,6})cuotas?/);
  if(!before) return 1;
  const value=firstWordNumber(before[1]);
  return Math.max(1,Number(value||1));
}

function categoryFor(text, categories) {
  const lower = normalized(text);
  for(const category of categories){
    const name=typeof category==='string'?category:category?.name;
    if(name && lower.includes(normalized(name))) return name;
  }
  return '';
}

function stripNumberWords(text){
  return text.split(/\s+/).filter((word)=>{
    const n=normalized(word).replace(/[^a-z]/g,'');
    return !NUMBER_WORDS.has(n);
  }).join(' ');
}

export function parseExpense(text, cards = [], categories = []) {
  const raw = String(text||'').trim();
  const lower = normalized(raw);
  const amount = parseAmount(lower);
  const currency = /(?:usd|u\$s|dolar)/.test(lower) ? 'USD' : 'ARS';
  const installments = parseInstallments(lower);
  const method = /credito|cuotas?/.test(lower) ? 'Crédito' : /debito/.test(lower) ? 'Débito' : /efectivo/.test(lower) ? 'Efectivo' : 'Sin definir';
  const card = cards.find((item) => item?.name && lower.includes(normalized(item.name)))?.name || '';
  const category = categoryFor(raw, categories);
  let concept = raw.replace(/\b(pagu[eé]|gast[eé]|compr[eé]|en|con|del?|la|el|efectivo|d[eé]bito|cr[eé]dito|pesos?|d[oó]lares?|usd|u\$s|cuotas?|mill[oó]n(?:es)?)\b/gi, ' ')
    .replace(/[\d$.,]+/g, ' ');
  concept=stripNumberWords(concept).replace(/\s+/g, ' ').trim();
  return { id: crypto.randomUUID(), amount, currency, concept: concept || category || 'Sin concepto', category, method, card, installments, date: new Date().toISOString(), source: 'voice' };
}

const NUMBER_START='(?:\\d|un(?:a|o)?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\\w+|veinti\\w+|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|millon)';
const SPLIT_RE=new RegExp('\\s*(?:;|\\n|,?\\s+y\\s+)(?=(?:(?:pagu[eé]|gast[eé]|compr[eé])\\s+)?'+NUMBER_START+')','i');

export function parseExpenses(transcript, cards = [], categories = []) {
  return String(transcript||'').split(SPLIT_RE).map((x)=>x.trim()).filter(Boolean).map((part) => parseExpense(part, cards, categories));
}
