import { simulateSale } from './simulator.js';
export function installSimulator({getState,money}){
  const dialog=document.createElement('dialog');dialog.id='simulator';
  dialog.innerHTML='<h2>Simular ventas</h2><p>Esta proyección no modifica tus ventas ni el stock.</p><form><label>Fiesta<select name="party"></select></label><label>Tipo y costo de compra<select name="batch"></select></label><label>Cantidad<input name="quantity" type="number" min="1" step="1" value="1" required></label><label>Calcular por<select name="mode"><option value="price">Precio de venta por entrada ($)</option><option value="markup">Ganancia sobre el costo (%)</option><option value="margin">Margen sobre la venta (%)</option></select></label><label>Precio o porcentaje objetivo<input name="value" type="number" min="0" step="0.01" required></label><label>Comisiones sobre la venta (%)<input name="fee" type="number" min="0" max="99.99" step="0.01" value="0" required></label><button>Calcular simulación</button></form><div id="simulationResult" role="status"></div><button type="button" id="closeSimulation">Cerrar simulador</button>';
  document.body.append(dialog);const form=dialog.querySelector('form'),fields=form.elements,result=dialog.querySelector('#simulationResult');
  function options(select,items){select.replaceChildren();for(const [value,text] of items){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}}
  function batches(){
    result.replaceChildren();const p=getState().resale.parties.find(p=>p.id===fields.party.value),groups=new Map();
    for(const t of p?.tickets||[])if(t.status==='Disponible'){const key=JSON.stringify([t.type,t.cost]);groups.set(key,(groups.get(key)||0)+1);}
    options(fields.batch,[...groups].map(([key,count])=>{const [type,cost]=JSON.parse(key);return [key,`${type} · costo ${money(cost)} · ${count} disponibles`];}));fields.quantity.value=1;
  }
  fields.party.onchange=batches;fields.batch.onchange=()=>{result.replaceChildren();fields.quantity.value=1;};
  form.oninput=()=>result.replaceChildren();
  form.onsubmit=event=>{
    event.preventDefault();result.replaceChildren();
    try{
      const state=getState(),party=state.resale.parties.find(p=>p.id===fields.party.value);if(!party||!fields.batch.value)throw Error('No hay entradas disponibles para simular.');
      const [type,cost]=JSON.parse(fields.batch.value),tickets=party.tickets.filter(t=>t.type===type&&t.cost===cost);
      const r=simulateSale({tickets,quantity:Number(fields.quantity.value),mode:fields.mode.value,value:Number(fields.value.value),feePercent:Number(fields.fee.value),ownerPercent:Number(state.resale.ownerPercent)});
      for(const [label,value] of [['Precio por entrada',r.unitPrice],['Costo de las entradas',r.cost],['Ventas brutas',r.gross],['Comisiones',r.commission],['Ganancia neta',r.profit],['Ganancia Mauro',r.ownerGain],['Ganancia vendedor',r.sellerGain],['Total Mauro (costo recuperado + ganancia)',r.totalOwner],['Precio mínimo por entrada para no perder',r.breakEvenUnit]]){const p=document.createElement('p');p.textContent=label+': '+money(value);result.append(p);}
      const p=document.createElement('p');p.textContent=`Ganancia sobre costo: ${r.markupPercent===null?'No aplica':r.markupPercent.toFixed(2)+'%'} · Margen sobre venta: ${r.marginPercent===null?'No aplica':r.marginPercent.toFixed(2)+'%'}`;result.append(p);
    }catch(e){result.textContent=e.message;}
  };
  dialog.querySelector('#closeSimulation').onclick=()=>dialog.close();
  const button=document.createElement('button');button.type='button';button.textContent='Simular ventas';document.querySelector('.resale-tools').append(button);
  button.onclick=()=>{const state=getState();options(fields.party,state.resale.parties.map(p=>[p.id,p.name]));batches();dialog.showModal();};
}
