from pathlib import Path

app=Path('app.js')
styles=Path('styles.css')
sw=Path('sw.js')

a=app.read_text()
needle="document.querySelectorAll('dialog .close').forEach((button)=>{button.textContent='←';button.setAttribute('aria-label','Volver');button.classList.add('back-button');});"
insert=needle+"""
let previousViewId='home';
document.addEventListener('click',(event)=>{
  const trigger=event.target.closest?.('[data-menu-view],[data-view]');
  if(!trigger)return;
  const destination=trigger.dataset.menuView||trigger.dataset.view;
  const current=document.querySelector('.view.active')?.id||'home';
  if(destination&&destination!==current)previousViewId=current;
  if(destination==='cards'){activeCardType='';setTimeout(renderCards,0);}
},true);
document.querySelectorAll('main > .view:not(#home)').forEach((view)=>{
  if(view.querySelector(':scope > .view-back'))return;
  const button=document.createElement('button');
  button.type='button';button.className='view-back';button.textContent='← Atrás';button.setAttribute('aria-label','Volver a la pantalla anterior');
  button.onclick=()=>goView(previousViewId||'home');
  view.prepend(button);
});"""
assert needle in a,'dialog back marker not found'
a=a.replace(needle,insert,1)
app.write_text(a)

css=styles.read_text()
if '.view-back{' not in css:
  css+='\n.view-back{border:0;background:none;color:#297266;font-weight:800;padding:4px 0 8px;margin:0 0 4px;text-align:left}\n'
styles.write_text(css)

s=sw.read_text().replace("const CACHE = 'mis-gastos-v26';","const CACHE = 'mis-gastos-v27';")
sw.write_text(s)
