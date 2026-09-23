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
 function render({type,name,output,count=0,status='',offers=[],level=null,notice=null},base='assets/icons/v1/'){
  const icon=(id,x,y,size)=>root.TradeIcons.svgIcon(id,{base,x,y,size});
  const town=type==='town',roman=formatLevel(level);
  const rows=town?offers.map(o=>({id:o.id,value:o.income!=null?'+$'+Math.round(o.income).toLocaleString('zh-CN'):'$'+Math.round(o.price).toLocaleString('zh-CN'),hint:o.income!=null?'每回合实际收入':'每件收购价'})):[{id:output,value:String(count),hint:'当前库存'}];
  const levelWidth=roman?Math.max(12,labelWidth(roman)*2/3+6):0;
  const dataWidth=Math.max(25,...rows.map(r=>14+3+(town?12:0)+labelWidth(r.value)*11/12));
  const width=levelWidth+dataWidth+12,height=22+Math.max(0,rows.length-1)*18,left=-width/2,top=25;
  let html=`<g class="building-tile-ui" pointer-events="none"><title>${esc(name)}${status?' · '+esc(status):''} · ${esc(rows.map(r=>r.hint+' '+r.value).join('，'))}</title><ellipse class="bt-site" cx="0" cy="14" rx="28" ry="11"/><g class="bt-miniature">${icon(type,-24,-24,48)}</g><g class="bt-floating bt-capsule ${notice?'has-alert':''}"><rect class="bt-float-bg" x="${left}" y="${top}" width="${width}" height="${height}" rx="${height/2}"/>`;
  if(roman)html+=`<g class="bt-level bt-level-inline" role="img" aria-label="当前等级 ${roman}"><title>当前等级 ${roman}</title><text x="${left+levelWidth/2+2}" y="${top+height/2}" dominant-baseline="central" text-anchor="middle" class="bt-level-number">${roman}</text><path class="bt-level-divider" d="M${left+levelWidth+2} ${top+6}v${height-12}"/></g>`;
  rows.forEach((r,i)=>{const x=left+levelWidth+5,y=top+11+i*18;html+=`<g class="bt-label-content ${town?'bt-offer':''}" role="img" aria-label="${esc(r.hint+' '+r.value)}"><title>${esc(r.hint)}</title>${icon(r.id,x,y-7,14)}${town?`<text class="bt-conversion-arrow" x="${x+17}" y="${y}" dominant-baseline="central">→</text>`:''}<text x="${x+17+(town?12:0)}" y="${y}" dominant-baseline="central" class="${town?'bt-price':'bt-quantity'}">${esc(r.value)}</text></g>`;});
  return html+'</g></g>';
 }
 function people({kind='worker',count=0,active=true,paused=false,beat=1,clock=0,base='assets/icons/v1/'}){
  if(!count)return '';
  const start=-(count-1)*6;
  return `<g class="bt-people bt-people-${kind} ${!active||paused?'is-idle':''}">${Array.from({length:count},(_,i)=>{const x=start+i*12;return `<g class="bt-person"><ellipse class="bt-person-shadow" cx="${x}" cy="-23" rx="5.6" ry="2"/><g class="bt-person-beat" style="--beat:${beat}s;animation-delay:-${(clock+i*beat/count)%beat}s">${root.TradeIcons.svgIcon(kind,{base,x:x-8.5,y:-41,size:17})}</g></g>`;}).join('')}</g>`;
 }
 function warningPop(notice,x=0,y=0){
  const label={shortage:'缺料',supply:'缺货',capacity:'亏空',backlog:'积压'}[notice.kind];
  return label?`<g class="pop tick warning-pop" transform="translate(${x},${y})" role="img" aria-label="${label}"><text text-anchor="middle" class="pop-text warning-pop-text">${label}</text></g>`:'';
 }
 root.BuildingTiles={render,people,marker,levelBadge,formatLevel,warningPop};
 root.AmbientTiles={render:ambient};
})(window);
