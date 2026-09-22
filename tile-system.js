/* Minimal tabletop composition: miniature, loose goods, exceptional state only. */
(function(root){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function ambient({terrain,preview=false},base='assets/icons/v1/terrain/'){
  if(!['grass','forest','rock','ore','mountain','lake'].includes(terrain))return '';
  const size={grass:54,forest:62,rock:56,ore:58,mountain:64,lake:68}[terrain];
  return `<g class="ambient-tile ambient-${esc(terrain)}${preview?' is-preview':''}" aria-hidden="true"><image class="env-object ambient-art" href="${base}${esc(terrain)}.png?v=terrain2" x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/></g>`;
 }
 function marker(kind,x,y,label){
  const shape='<circle class="bt-state-base" r="6"/><path class="bt-state-ink" d="M0-3v3.5m0 2v.2"/>';
  return `<g class="bt-state bt-state-${kind}" transform="translate(${x} ${y})" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${shape}</g>`;
 }
 function render({type,name,output,count=0,capacity=20,status='',alert=false,residents=1,offers=[]},base='assets/icons/v1/'){
  const icon=(id,x,y,size)=>root.TradeIcons.svgIcon(id,{base,x,y,size});
  let html=`<g class="building-tile-ui" pointer-events="none"><title>${esc(name)}${status?' · '+esc(status):''}</title><ellipse class="bt-site" cx="0" cy="14" rx="28" ry="11"/><g class="bt-miniature">${icon(type,-24,-24,48)}</g>`;
  if(type==='town'){
   const width=offers.length>1?84:46;
   html+=`<g class="bt-floating"><rect class="bt-float-bg" x="${-width/2}" y="25" width="${width}" height="20" rx="5"/>`;
   html+=offers.map((o,i)=>{const x=offers.length>1?-40+i*41:-21;return `<g class="bt-offer ${o.full?'is-full':''}" data-good="${esc(o.id)}">${o.full?`<rect class="bt-full-bg" x="${x-1}" y="26" width="40" height="18" rx="4"/>`:''}${icon(o.id,x,26,18)}<text x="${x+19}" y="39" class="bt-price" ${String(o.price).length>3?'textLength="21" lengthAdjust="spacingAndGlyphs"':''}>$${esc(o.price)}</text></g>`;}).join('')+'</g>';
  }else{
   html+=`<g class="bt-floating ${count>=capacity||alert?'has-alert':''}"><rect class="bt-float-bg" x="-25" y="25" width="50" height="22" rx="5"/>${icon(output,-23,25,22)}<text x="4" y="41" class="bt-quantity ${count===0||count>=capacity?'bt-alert':''}">${esc(count)}</text></g>`;
  }
  // One badge per tile; a blocking warning takes precedence over empty stock.
  const full=type==='town'?offers.some(o=>o.full):count>=capacity;
  const kind=full?'full':alert?'warning':null;
  if(kind)html+=marker(kind,type==='town'?(offers.length>1?42:23):25,25,kind==='full'?(type==='town'?'高亮货物收购已饱和':'产物满仓，等待运出'):kind==='empty'?'产物库存为空':status||'需要注意');
  return html+'</g>';
 }
 function people({kind='worker',count=0,active=true,paused=false,beat=1,clock=0,base='assets/icons/v1/'}){
  if(!count)return '';
  const start=-(count-1)*6;
  return `<g class="bt-people bt-people-${kind} ${!active||paused?'is-idle':''}">${Array.from({length:count},(_,i)=>{const x=start+i*12;return `<g class="bt-person"><ellipse class="bt-person-shadow" cx="${x}" cy="-23" rx="5.6" ry="2"/><g class="bt-person-beat" style="--beat:${beat}s;animation-delay:-${(clock+i*beat/count)%beat}s">${root.TradeIcons.svgIcon(kind,{base,x:x-8.5,y:-41,size:17})}</g></g>`;}).join('')}</g>`;
 }
 root.BuildingTiles={render,people,marker};
 root.AmbientTiles={render:ambient};
})(window);
