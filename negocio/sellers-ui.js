import {saveSeller,assignSeller,sellerBalances} from './sellers.js';
export function installSellers({getState,save,render,money,message}){
  const dialog=document.createElement('dialog');dialog.id='sellersDialog';dialog.innerHTML='<h2>Vendedores</h2><p>Comisión sobre la ganancia neta. Los porcentajes de ventas anteriores se conservan.</p><div id="sellerList"></div><form><input name="id" type="hidden"><label>Nombre<input name="name" maxlength="80" required></label><label>Porcentaje de ganancia<input name="percent" type="number" min="0" max="100" step="0.01" value="30" required></label><label><input name="active" type="checkbox" checked> Activo para nuevas ventas</label><button>Guardar vendedor</button><button id="newSeller" type="button">Nuevo vendedor</button></form><h3>Comisiones por vendedor</h3><div id="sellerBalance"></div><button type="button" id="closeSellers">Cerrar</button>';
  document.body.append(dialog);const form=dialog.querySelector('form'),fields=form.elements;
  function refresh(){
    const state=getState(),list=dialog.querySelector('#sellerList');list.replaceChildren();
    for(const s of state.resale.sellers||[]){const b=document.createElement('button');b.type='button';b.textContent=`${s.name} · ${s.percent}%${s.active===false?' · Inactivo':''}`;b.onclick=()=>{fields.id.value=s.id;fields.name.value=s.name;fields.percent.value=s.percent;fields.active.checked=s.active!==false;};list.append(b);}
    const balances=dialog.querySelector('#sellerBalance');balances.replaceChildren();for(const s of sellerBalances(state.resale)){const p=document.createElement('p');p.textContent=`${s.name}: ${s.sold} entradas vendidas · ventas ${money(s.sales)} · comisión ${money(s.commission)}`;balances.append(p);}
  }
  form.onsubmit=event=>{event.preventDefault();try{const state=getState();state.resale=saveSeller(state.resale,{id:fields.id.value,name:fields.name.value,percent:fields.percent.value,active:fields.active.checked});save();form.reset();refresh();render();}catch(e){message(e.message);}};
  dialog.querySelector('#newSeller').onclick=()=>form.reset();dialog.querySelector('#closeSellers').onclick=()=>dialog.close();
  const b=document.createElement('button');b.type='button';b.textContent='Vendedores';document.querySelector('.resale-tools').append(b);b.onclick=()=>{form.reset();refresh();dialog.showModal();};
  return function bind(){
    const state=getState();if(!state)return;
    for(const row of document.querySelectorAll('.resale-ticket')){
      if(row.querySelector('.ticket-seller'))continue;
      const party=state.resale.parties.find(p=>p.id===row.dataset.partyId),ticket=party?.tickets[Number(row.dataset.ticketIndex)];if(!ticket)continue;
      const label=document.createElement('label'),select=document.createElement('select');select.className='ticket-seller';label.textContent='Vendedor';label.append(select);
      const option=(id,text)=>{const o=document.createElement('option');o.value=id;o.textContent=text;select.append(o);};
      option('',ticket.sellerId?'Elegí vendedor':`Ale · reparto general ${state.resale.sellerPercent??30}%`);
      for(const s of state.resale.sellers||[])if(s.active!==false||s.id===ticket.sellerId)option(s.id,`${s.name} · ${s.id===ticket.sellerId?ticket.sellerPercent:s.percent}%${s.active===false?' · Inactivo':''}`);
      if(ticket.sellerId&&![...select.options].some(o=>o.value===ticket.sellerId))option(ticket.sellerId,`${ticket.sellerName} · ${ticket.sellerPercent}%`);
      select.value=ticket.sellerId||'';
      select.onchange=()=>{
        const selected=select.value,previous=ticket.sellerId||'';
        if(!selected){select.value=previous;return;}
        if(ticket.status==='Vendida'&&!confirm('¿Cambiar el vendedor de esta venta? Se recalculará su comisión con el porcentaje seleccionado.')){select.value=previous;return;}
        try{const seller=getState().resale.sellers.find(s=>s.id===selected);const next=assignSeller(ticket,seller);Object.assign(ticket,next);save();render();}catch(e){select.value=previous;message(e.message);}
      };
      row.querySelector('.resale-ticket-head').append(label);
    }
  };
}
