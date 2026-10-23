// All projections are disposable values. No storage, state writes or network calls.
export function simulateSale({tickets,quantity,mode='price',value,feePercent=0,ownerPercent=70}){
  if(!Array.isArray(tickets))throw Error('Seleccioná las entradas.');
  const available=tickets.filter(t=>t.status==='Disponible');
  if(!Number.isInteger(quantity)||quantity<1||quantity>available.length)throw Error('La cantidad debe estar dentro del stock disponible.');
  if(!Number.isFinite(value)||value<0||!Number.isFinite(feePercent)||feePercent<0||feePercent>=100||!Number.isFinite(ownerPercent)||ownerPercent<0||ownerPercent>100)throw Error('Revisá los porcentajes e importes.');
  if(!['price','markup','margin'].includes(mode))throw Error('Elegí un tipo de simulación válido.');
  const chosen=available.slice(0,quantity);
  if(chosen.some(t=>!Number.isFinite(t.cost)||t.cost<0))throw Error('Hay entradas sin costo válido.');
  const cost=chosen.reduce((sum,t)=>sum+t.cost,0),fees=feePercent/100,target=value/100;
  if(mode==='margin'&&target+fees>=1)throw Error('El margen más las comisiones debe ser menor al 100%.');
  const idealRevenue=mode==='price'?value*quantity:mode==='markup'?cost*(1+target)/(1-fees):cost/(1-fees-target);
  // Round target prices up to a cent so quoted unit prices meet the requested target.
  const unitPrice=mode==='price'?Math.round(value*100)/100:Math.ceil(idealRevenue/quantity*100-1e-8)/100;
  const gross=unitPrice*quantity,commission=gross*fees,net=gross-commission,profit=net-cost;
  const sellerGain=chosen.reduce((sum,t)=>{const rate=t.sellerId?Number(t.sellerPercent):100-ownerPercent;if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('Hay una entrada con porcentaje inválido.');return sum+(unitPrice*(1-fees)-t.cost)*rate/100;},0);
  const ownerGain=profit-sellerGain;
  return {quantity,cost,unitPrice,gross,commission,net,profit,markupPercent:cost?profit/cost*100:null,marginPercent:gross?profit/gross*100:null,ownerGain,sellerGain,totalOwner:cost+ownerGain,breakEvenUnit:Math.ceil(cost/quantity/(1-fees)*100-1e-8)/100,ticketIds:chosen.map(t=>t.id)};
}
