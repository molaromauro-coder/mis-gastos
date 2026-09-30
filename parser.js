const UNITS = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9,
  diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19,
  veinte:20, veintiuno:21, veintiun:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26,
  veintisiete:27, veintiocho:28, veintinueve:29
};
const TENS={treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90};
const HUNDREDS={cien:100,ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900};
const NUMBER_WORDS=new Set([...Object.keys(UNITS),...Object.keys(TENS),...Object.keys(HUNDREDS),'mil','millon','millones','y']);
const WEEKDAYS={domingo:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6};
const MONTHS={enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,setiembre:8,octubre:9,noviembre:10,diciembre:11};

function normalized(text) {
  return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const PHRASE_STOPWORDS=new Set(['de','del','la','el','las','los','un','una']);
function meaningfulWords(text){
  return (normalized(text).match(/[a-z0-9]+/g)||[]).filter((word)=>!PHRASE_STOPWORDS.has(word));
}
function phraseMentioned(text,phrase){
  const hay=meaningfulWords(text), target=meaningfulWords(phrase);
  if(!target.length)return false;
  if(target.length===1)return hay.includes(target[0]);
  let at=-1;
  for(const word of target){
    const next=hay.indexOf(word,at+1);
    if(next<0||(at>=0&&next-at>4))return false;
    at=next;
  }
  return true;
}
function editDistance(a,b){
  const left=String(a||''),right=String(b||'');
  let prev=Array.from({length:right.length+1},(_,i)=>i);
  for(let i=1;i<=left.length;i++){
    const cur=[i];
    for(let j=1;j<=right.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(left[i-1]===right[j-1]?0:1));
    prev=cur;
  }
  return prev[right.length];
}
function cardSpeechAliases(name){
  const base=normalized(name).replace(/\b(?:cuenta|tarjeta|debito|credito)\b/g,' ').replace(/\s+/g,' ').trim();
  const aliases=[base];
  if(base==='brubank')aliases.push('bru bank','bro bank','pro bank','bruban');
  return [...new Set(aliases.filter(Boolean))];
}
function fuzzyCardMention(lower,name){
  const aliases=cardSpeechAliases(name);
  for(const alias of aliases)if(phraseMentioned(lower,alias)||lower.includes(alias))return {matched:true,index:lower.lastIndexOf(alias)};
  const words=meaningfulWords(lower);
  for(const alias of aliases){
    const compact=alias.replace(/\s+/g,'');
    if(compact.length<5)continue;
    const maxDistance=compact.length>=9?3:2;
    for(let size=1;size<=Math.min(3,words.length);size++){
      for(let i=0;i<=words.length-size;i++){
        const spoken=words.slice(i,i+size).join('');
        if(Math.abs(spoken.length-compact.length)>maxDistance)continue;
        if(editDistance(spoken,compact)<=maxDistance)return {matched:true,index:i};
      }
    }
  }
  return {matched:false,index:-1};
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

function lastWordNumber(text){
  const tokens=normalized(text).match(/[a-z]+/g)||[];
  for(let end=tokens.length-1;end>=0;end--){
    if(!NUMBER_WORDS.has(tokens[end])||tokens[end]==='y') continue;
    let start=end;
    while(start>0&&NUMBER_WORDS.has(tokens[start-1])) start--;
    const value=parseNumberWords(tokens.slice(start,end+1));
    if(value!=null) return value;
    end=start;
  }
  return null;
}

function multiplier(word){
  if(/millon/.test(word||'')) return 1_000_000;
  if(word==='mil') return 1_000;
  return 1;
}

function cleanNumericText(text){
  return normalized(text)
    .replace(/([0-9])[.,](?=\d{3}(?:\D|$))/g,'$1')
    .replace(/(\d)\s+(?=\d{3}(?:\D|$))/g,'$1')
    .replace(',', '.');
}

export function parseAmount(text) {
  const clean=cleanNumericText(text);
  const paloYMedio=clean.match(/\b(?:(\d+(?:\.\d{1,2})?)|(un|uno|una))\s*palos?\s+y\s+medio\b/i);
  if(paloYMedio) return (paloYMedio[1]?Number(paloYMedio[1]):1)*1_000_000+500_000;
  let palos=clean.match(/\b(\d+(?:\.\d{1,2})?)\s*palos?\b/i);
  if(palos) return Number(palos[1])*1_000_000;
  const paloPos=clean.search(/\bpalos?\b/i);
  if(paloPos>=0){
    const value=lastWordNumber(clean.slice(0,paloPos));
    if(value!=null) return value*1_000_000;
  }
  let lucas=clean.match(/\b(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?\s*lucas?\b/i);
  if(lucas) return Number(lucas[1])*multiplier(lucas[2])*1000;
  const lucasPos=clean.search(/\blucas?\b/i);
  if(lucasPos>=0){
    const value=lastWordNumber(clean.slice(0,lucasPos));
    if(value!=null) return value*1000;
  }
  let match=clean.match(/(?:usd|u\$s|\$)\s*(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?/i);
  if(match) return Number(match[1])*multiplier(match[2]);

  match=clean.match(/(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?\s*(?:pesos?|dolares?|usd|u\$s)\b/i);
  if(match) return Number(match[1])*multiplier(match[2]);

  const currencyPos=clean.search(/\b(?:pesos?|dolares?|usd|u\$s)\b/i);
  if(currencyPos>=0){
    const value=lastWordNumber(clean.slice(0,currencyPos));
    if(value!=null) return value;
  }

  match=clean.match(/\b(?:gaste|pague|compre|salio|costo|vale)\b(?:\s+\w+){0,3}?\s+(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?/i);
  if(match) return Number(match[1])*multiplier(match[2]);

  const verb=clean.match(/\b(?:gaste|pague|compre|salio|costo|vale)\b([\s\S]*)/i);
  if(verb){
    const value=firstWordNumber(verb[1]);
    if(value!=null) return value;
  }

  match=clean.match(/\b(\d+(?:\.\d{1,2})?)\s*(millones?|millon|mil)?\b/);
  if(match) return Number(match[1])*multiplier(match[2]);
  return firstWordNumber(clean);
}

function parseInstallments(text){
  const clean=normalized(text);
  const digits=clean.match(/\b(\d+)\s*cuotas?\b/);
  if(digits) return {count:Math.max(1,Number(digits[1])),specified:true};
  const before=clean.match(/((?:[a-z]+\s+){1,6})cuotas?\b/);
  if(before){
    const value=lastWordNumber(before[1]);
    if(value!=null) return {count:Math.max(1,Number(value)),specified:true};
  }
  return {count:1,specified:false};
}

function categoryFor(text, categories) {
  for(const category of categories){
    const name=typeof category==='string'?category:category?.name;
    if(name&&phraseMentioned(text,name)) return name;
  }
  return '';
}

function stripNumberWords(text){
  return text.split(/\s+/).filter((word)=>{
    const n=normalized(word).replace(/[^a-z]/g,'');
    return !NUMBER_WORDS.has(n);
  }).join(' ');
}

function previousWeekday(base,target,count=1){
  const result=new Date(base);
  let delta=(result.getDay()-target+7)%7;
  if(delta===0) delta=7;
  result.setDate(result.getDate()-delta-(Math.max(1,count)-1)*7);
  return result;
}

function nextWeekday(base,target){
  const result=new Date(base);
  let delta=(target-result.getDay()+7)%7;
  if(delta===0) delta=7;
  result.setDate(result.getDate()+delta);
  return result;
}

function withBaseTime(date,base){
  date.setHours(base.getHours(),base.getMinutes(),base.getSeconds(),base.getMilliseconds());
  return date;
}

function parseTime(lower,base){
  let hour=null,minute=0,specified=false;
  let m=lower.match(/\b(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:hs?|horas?)\b/);
  if(!m) m=lower.match(/\b(?:a\s+las?\s+)(\d{1,2})(?::(\d{2}))?\b/);
  if(m){
    hour=Number(m[1]); minute=Number(m[2]||0); specified=true;
  } else {
    const words=lower.match(/\b(?:a\s+las?\s+)((?:[a-z]+\s*){1,4}?)(?:de\s+la\s+|del\s+)?(manana|tarde|noche|mediodia)\b/);
    if(words){
      const n=lastWordNumber(words[1]);
      if(n!=null){hour=n;specified=true;const period=words[2];if(period==='tarde'&&hour<12)hour+=12;else if(period==='noche'&&hour===12)hour=0;else if(period==='noche'&&hour<12)hour+=12;else if(period==='mediodia')hour=12;}
    } else {
      const wordHours=lower.match(/\b(?:a\s+las?\s+)((?:[a-z]+\s*){1,4}?)\s*horas?\b/);
      if(wordHours){const n=lastWordNumber(wordHours[1]);if(n!=null){hour=n;specified=true;}}
    }
  }
  if(!specified) return {hour:base.getHours(),minute:base.getMinutes(),specified:false};
  if(hour<0||hour>23||minute<0||minute>59) return {hour:base.getHours(),minute:base.getMinutes(),specified:false};
  return {hour,minute,specified:true};
}

export function parseTemporal(text,referenceDate=new Date()){
  const lower=normalized(text);
  const base=new Date(referenceDate);
  const time=parseTime(lower,base);
  let date=new Date(base),dateSpecified=false,dateAmbiguous=false,dateChoices=[];

  const exact=lower.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
  if(exact){
    const year=Number(exact[3]||base.getFullYear()),month=MONTHS[exact[2]],day=Number(exact[1]);
    const candidate=new Date(year,month,day,base.getHours(),base.getMinutes(),base.getSeconds(),base.getMilliseconds());
    if(candidate.getFullYear()===year&&candidate.getMonth()===month&&candidate.getDate()===day){date=candidate;dateSpecified=true;}
  } else if(/\banteayer\b/.test(lower)){
    date.setDate(date.getDate()-2); dateSpecified=true;
  } else if(/\bayer\b/.test(lower)){
    date.setDate(date.getDate()-1); dateSpecified=true;
  } else if(/\bhoy\b/.test(lower)){
    dateSpecified=true;
  } else {
    const ago=lower.match(/\bhace\s+((?:\d+|[a-z]+(?:\s+y\s+[a-z]+)?))\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)s?\b/);
    if(ago){
      const count=/^\d+$/.test(ago[1])?Number(ago[1]):firstWordNumber(ago[1]);
      if(count){date=withBaseTime(previousWeekday(base,WEEKDAYS[ago[2]],count),base);dateSpecified=true;}
    } else {
      const previous=lower.match(/\b(?:el\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+(?:anterior|pasado)\b/);
      if(previous){date=withBaseTime(previousWeekday(base,WEEKDAYS[previous[1]]),base);dateSpecified=true;}
      else {
        const ambiguous=lower.match(/\b(?:el\s+)?otro\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
        if(ambiguous){
          const target=WEEKDAYS[ambiguous[1]];
          const prev=withBaseTime(previousWeekday(base,target),base);
          const next=withBaseTime(nextWeekday(base,target),base);
          dateAmbiguous=true;
          dateChoices=[
            {label:`${ambiguous[1]} anterior`,date:prev.toISOString()},
            {label:`proximo ${ambiguous[1]}`,date:next.toISOString()}
          ];
        } else {
          const upcoming=lower.match(/\b(?:el\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
          if(upcoming){date=withBaseTime(nextWeekday(base,WEEKDAYS[upcoming[1]]),base);dateSpecified=true;}
        }
      }
    }
  }

  date.setHours(time.hour,time.minute,time.specified?0:base.getSeconds(),time.specified?0:base.getMilliseconds());
  return {date:date.toISOString(),dateSpecified,timeSpecified:time.specified,dateAmbiguous,dateChoices};
}

function cleanConcept(raw){
  return raw
    .replace(/\b(?:hoy|ayer|anteayer|hace|anterior|pasado|otro|domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|horas?|hs|ma[nñ]ana|tarde|noche|mediod[ií]a)\b/gi,' ')
    .replace(/\b(?:pagu[eé]|gast[eé]|compr[eé]|sali[oó]|cost[oó]|en|con|del?|la|el|a|las?|tarjeta|banco|efectivo|d[eé]bito|cr[eé]dito|pesos?|lucas?|palos?|d[oó]lares?|usd|u\$s|cuotas?|mill[oó]n(?:es)?)\b/gi,' ')
    .replace(/[\d$.,:]+/g,' ');
}

export function parseExpense(text,cards=[],categories=[],options={}){
  const raw=String(text||'').trim();
  const lower=normalized(raw);
  const referenceDate=options?.now?new Date(options.now):new Date();
  const correctionParts=lower.split(/\b(?:no+|perdon|quise decir|mejor)\b/).map((x)=>x.trim()).filter(Boolean);

  let amount=parseAmount(lower);
  for(let i=correctionParts.length-1;i>=1;i--){
    const candidate=parseAmount(correctionParts[i]);
    if(candidate!=null&&candidate>0){amount=candidate;break;}
  }
  const currency=/(?:usd|u\$s|dolar)/.test(lower)?'USD':'ARS';

  let installmentInfo=parseInstallments(lower);
  for(let i=correctionParts.length-1;i>=1;i--){
    const candidate=parseInstallments(correctionParts[i]);
    if(candidate.specified){installmentInfo=candidate;break;}
  }

  const paymentMentions=[...lower.matchAll(/\b(efectivo|debito|credito)\b/g)];
  const explicitMethod=paymentMentions.length
    ? ({efectivo:'Efectivo',debito:'Débito',credito:'Crédito'}[paymentMentions.at(-1)[1]])
    : '';
  const namedCandidates=cards
    .map((item)=>({item,match:item?.name?fuzzyCardMention(lower,item.name):{matched:false,index:-1}}))
    .filter(({match})=>match.matched)
    .map(({item,match})=>({item,index:match.index}))
    .sort((a,b)=>b.index-a.index);

  // Regla de uso: una tarjeta/cuenta nombrada sin decir "crédito" se interpreta como débito.
  // Crédito solo se activa cuando el usuario dice explícitamente "crédito" (o "cuotas").
  let method=explicitMethod || (/\bcuotas?\b/.test(lower)?'Crédito':(namedCandidates.length?'Débito':'Sin definir'));

  let card=namedCandidates.find(({item})=>!item.type||item.type===method)?.item?.name||'';
  if(method==='Efectivo') card='';

  let category=categoryFor(raw,categories),subcategory='';
  const subMap=options?.subcategories||{};
  outer: for(const [parent,values] of Object.entries(subMap)){
    for(const value of Array.isArray(values)?values:[]){
      if(value&&phraseMentioned(lower,value)){category=parent;subcategory=value;break outer;}
    }
  }

  const temporal=parseTemporal(raw,referenceDate);
  const correctionIndex=raw.search(/\b(?:no+|perd[oó]n|quise decir|mejor)\b/i);
  let conceptSource=correctionIndex>0?raw.slice(0,correctionIndex):raw;
  for(const item of cards){
    if(!item?.name) continue;
    const pattern=item.name.split(/\s+/).filter(Boolean).map((part)=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
    if(pattern) conceptSource=conceptSource.replace(new RegExp(pattern,'ig'),' ');
  }
  let concept=cleanConcept(conceptSource);
  concept=stripNumberWords(concept).replace(/\s+/g,' ').trim();
  return {
    id:crypto.randomUUID(),amount,currency,concept:concept||subcategory||category||'Sin concepto',category,subcategory,method,card,
    installments:installmentInfo.count,installmentsSpecified:installmentInfo.specified,
    date:temporal.date,purchaseDate:temporal.date,dateSpecified:temporal.dateSpecified,timeSpecified:temporal.timeSpecified,
    dateAmbiguous:temporal.dateAmbiguous,dateChoices:temporal.dateChoices,source:'voice'
  };
}

const NUMBER_START='(?:\\d|un(?:a|o)?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\\w+|veinti\\w+|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|millon)';
const SPLIT_RE=new RegExp('\\s*(?:;|\\n|,?\\s+y\\s+)(?=(?:(?:pagu[eé]|gast[eé]|compr[eé])\\s+)?'+NUMBER_START+')','i');

function splitRepeatedExpenseVerbs(transcript){
  const raw=String(transcript||'').trim();
  if(!raw)return [];
  const verbMatches=[];
  const verbRe=/(^|[^a-záéíóúñ0-9_])(gast[eé]|compr[eé]|pagu[eé])(?=\s)/gi;
  let verbMatch;
  while((verbMatch=verbRe.exec(raw))){
    verbMatches.push({index:verbMatch.index+verbMatch[1].length,verb:verbMatch[2]});
  }
  if(verbMatches.length<2)return [raw];

  const starts=[];
  for(let i=0;i<verbMatches.length;i++){
    const current=verbMatches[i];
    const next=verbMatches[i+1];
    const chunk=raw.slice(current.index,next?.index??raw.length);
    const verb=normalized(current.verb);
    const pagueStartsWithAmount=verb==='pague'
      ? new RegExp('^\\s*pagu[eé]\\s+(?:\\$\\s*)?'+NUMBER_START,'i').test(chunk)
      : true;
    if(parseAmount(chunk)==null||!pagueStartsWithAmount)continue;

    if(starts.length){
      const previousIndex=starts.at(-1);
      const between=raw.slice(previousIndex,current.index);
      if(/\b(?:no+|perd[oó]n|quise decir|mejor)\b/i.test(between))continue;
    }
    starts.push(current.index);
  }
  if(starts.length<2)return [raw];

  const parts=[];
  for(let i=0;i<starts.length;i++){
    const from=i===0?0:starts[i];
    const to=starts[i+1]??raw.length;
    const part=raw.slice(from,to).trim().replace(/^[,;\s]+|[,;\s]+$/g,'');
    if(part)parts.push(part);
  }
  return parts.length>1?parts:[raw];
}

export function parseExpenses(transcript,cards=[],categories=[],options={}){
  const raw=String(transcript||'');
  const chunks=splitRepeatedExpenseVerbs(raw);
  const items=chunks
    .flatMap((chunk)=>chunk.split(SPLIT_RE))
    .map((x)=>x.trim())
    .filter(Boolean)
    .map((part)=>parseExpense(part,cards,categories,options));

  const lower=normalized(raw);
  const sharedPayment=/\b(?:pague|pago)\s+(?:todo|todos|todas)\b|\b(?:todo|todos|todas)\s+(?:con|en)\b|\b(?:los|las)\s+(?:dos|tres|cuatro)\s+(?:con|en)\b/.test(lower);
  if(items.length>1&&sharedPayment){
    const shared=parseExpense(raw,cards,categories,options);
    items.forEach((item)=>{
      if(item.method==='Sin definir'&&shared.method!=='Sin definir'){
        item.method=shared.method;
        item.card=shared.card;
      }else if(!item.card&&item.method===shared.method&&shared.card){
        item.card=shared.card;
      }
      if(!item.installmentsSpecified&&shared.installmentsSpecified){
        item.installments=shared.installments;
        item.installmentsSpecified=true;
      }
    });
  }
  return items;
}
