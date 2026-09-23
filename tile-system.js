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
 function formatLevel(level){
  if(!Number.isSafeInteger(level)||level<1)return '';
  if(level>=4000)return [...formatLevel(Math.floor(level/1000))].map(c=>c+'̅').join('')+formatLevel(level%1000);
  let text='';
  for(const [value,symbol] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]){
   text+=symbol.repeat(Math.floor(level/value));level%=value;
  }
  return text;
 }
 function levelBadge(level,x,y){
  if(!Number.isSafeInteger(level)||level<1)return '';
  const text=formatLevel(level), width=Math.max(12,labelWidth(text)*2/3+4);
  return `<g class="bt-level" transform="translate(${x} ${y})" role="img" aria-label="当前等级 ${text}"><title>当前等级 ${text}</title><rect class="bt-level-base" x="${-width/2}" y="-6" width="${width}" height="12" rx="6"/><text class="bt-level-number" text-anchor="middle" dominant-baseline="central">${text}</text></g>`;
 }
 const labelWidths=new Map();
 let labelContext;
 function labelWidth(value){
  const text=String(value);
  if(!labelWidths.has(text)){
   labelContext ||= document.createElement('canvas').getContext('2d');
   labelContext.font='700 12px system-ui,"Microsoft YaHei",sans-serif';
   labelWidths.set(text,labelContext.measureText(text).width);
  }
  return labelWidths.get(text);
 }
 function render({type,name,output,count=0,capacity=20,status='',alert=false,residents=1,offers=[],level=null},base='assets/icons/v1/'){
  const icon=(id,x,y,size)=>root.TradeIcons.svgIcon(id,{base,x,y,size});
  const row=(id,value,center,classes)=>{const x=center-(22+labelWidth(value))/2;return `<g class="bt-label-content">${icon(id,x,30,18)}<text x="${x+22}" y="39" dominant-baseline="central" class="${classes}">${esc(value)}</text></g>`;};
  let frameWidth=Math.max(56,34+labelWidth(count));
  let html=`<g class="building-tile-ui" pointer-events="none"><title>${esc(name)}${status?' · '+esc(status):''}</title><ellipse class="bt-site" cx="0" cy="14" rx="28" ry="11"/><g class="bt-miniature">${icon(type,-24,-24,48)}</g>`;
  if(type==='town'){
   // Before a road arrives the price is the decision; once linked, what the town actually pays per round is.
   const label=o=>o.income!=null?'+$'+Math.round(o.income).toLocaleString('zh-CN'):'$'+Math.round(o.price).toLocaleString('zh-CN');
   const widths=offers.map(o=>Math.max(56,34+labelWidth(label(o))));
   const width=frameWidth=Math.max(56,widths.reduce((sum,w)=>sum+w,0));
   html+=`<g class="bt-floating"><rect class="bt-float-bg" x="${-width/2}" y="25" width="${width}" height="28" rx="5"/>`;
   let left=-width/2;
   html+=offers.map((o,i)=>{const x=left;left+=widths[i];return `<g class="bt-offer ${o.full?'is-full':''}" data-good="${esc(o.id)}">${o.full?`<rect class="bt-full-bg" x="${x+2}" y="27" width="${widths[i]-4}" height="24" rx="4"/>`:''}${row(o.id,label(o),x+widths[i]/2,`bt-price ${o.income!=null?'bt-income':''}`)}</g>`;}).join('')+'</g>';
   // Goods the town could buy but its demand pool cannot absorb, piled up at the producers: click the town to take them.
   const backlog=offers.reduce((n,o)=>n+(o.backlog||0),0);
   if(backlog>0)html+=`<g class="bt-floating bt-backlog"><rect class="bt-float-bg bt-full-bg" x="-28" y="57" width="56" height="22" rx="5"/><text x="0" y="68" dominant-baseline="central" text-anchor="middle" class="bt-price bt-backlog-text">积压 ${esc(backlog)}</text></g>`;
  }else{
   html+=`<g class="bt-floating ${count>=capacity||alert?'has-alert':''}"><rect class="bt-float-bg" x="${-frameWidth/2}" y="25" width="${frameWidth}" height="28" rx="5"/>${row(output,count,0,`bt-quantity ${count===0||count>=capacity?'bt-alert':''}`)}</g>`;
  }
  // Level sits on the left corner; the single exceptional-state badge stays on the right.
  html+=levelBadge(level,-frameWidth/2+3,27);
  const full=type==='town'?offers.some(o=>o.full):count>=capacity;
  const kind=full?'full':alert?'warning':null;
  if(kind)html+=marker(kind,frameWidth/2-3,27,kind==='full'?(type==='town'?'高亮货物积压，点城镇收购':'产物满仓，等待运出'):kind==='empty'?'产物库存为空':status||'需要注意');
  return html+'</g>';
 }
 function people({kind='worker',count=0,active=true,paused=false,beat=1,clock=0,base='assets/icons/v1/'}){
  if(!count)return '';
  const start=-(count-1)*6;
  return `<g class="bt-people bt-people-${kind} ${!active||paused?'is-idle':''}">${Array.from({length:count},(_,i)=>{const x=start+i*12;return `<g class="bt-person"><ellipse class="bt-person-shadow" cx="${x}" cy="-23" rx="5.6" ry="2"/><g class="bt-person-beat" style="--beat:${beat}s;animation-delay:-${(clock+i*beat/count)%beat}s">${root.TradeIcons.svgIcon(kind,{base,x:x-8.5,y:-41,size:17})}</g></g>`;}).join('')}</g>`;
 }
 root.BuildingTiles={render,people,marker,levelBadge,formatLevel};
 root.AmbientTiles={render:ambient};
})(window);
