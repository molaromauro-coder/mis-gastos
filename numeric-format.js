export function parseLocalizedNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  let raw=String(value??'').trim();
  if(!raw)return 0;
  raw=raw.replace(/\s/g,'').replace(/[^0-9.,-]/g,'');
  const negative=raw.startsWith('-');
  raw=raw.replace(/-/g,'');
  if(!raw)return 0;

  let normalized='';
  const comma=raw.lastIndexOf(',');
  const dot=raw.lastIndexOf('.');

  if(comma>=0&&dot>=0){
    const decimalSep=comma>dot?',':'.';
    const thousandsSep=decimalSep===','?'.':',';
    normalized=raw.split(thousandsSep).join('').replace(decimalSep,'.');
  }else if(comma>=0){
    const parts=raw.split(',');
    if(parts.length>2){
      const last=parts.pop();
      normalized=parts.join('')+'.'+last;
    }else{
      const [a,b='']=parts;
      normalized=b.length===3&&a.length>0?a+b:a+'.'+b;
    }
  }else if(dot>=0){
    const parts=raw.split('.');
    if(parts.length>2){
      const groups=parts.slice(1);
      const looksThousands=groups.every((g)=>g.length===3);
      if(looksThousands)normalized=parts.join('');
      else{
        const last=parts.pop();
        normalized=parts.join('')+'.'+last;
      }
    }else{
      const [a,b='']=parts;
      normalized=b.length===3&&a.length>0?a+b:a+'.'+b;
    }
  }else normalized=raw;

  const n=Number((negative?'-':'')+normalized);
  return Number.isFinite(n)?n:0;
}

export function formatLocalizedNumber(value,{maximumFractionDigits=2,minimumFractionDigits=0}={}){
  const n=typeof value==='number'?value:parseLocalizedNumber(value);
  if(!Number.isFinite(n))return '';
  return new Intl.NumberFormat('es-AR',{
    useGrouping:true,
    maximumFractionDigits,
    minimumFractionDigits
  }).format(n);
}

export function formatLocalizedInteger(value){
  return formatLocalizedNumber(value,{maximumFractionDigits:0});
}

export function formatNumericInputValue(value,{maximumFractionDigits=2}={}){
  if(value===null||value===undefined||value==='')return '';
  return formatLocalizedNumber(value,{maximumFractionDigits});
}
