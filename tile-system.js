/* Minimal tabletop composition: miniature, loose goods, exceptional state only. */
(function(root){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function ambient({terrain,preview=false},base='assets/icons/v1/terrain/'){
  if(!['grass','forest','rock','ore','mountain','lake'].includes(terrain))return '';
  const size={grass:44,forest:46,rock:44,ore:44,mountain:46,lake:48}[terrain];
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
 // Two separate pills around the miniature, the same for buildings and towns; elements inside a pill are separated
 // by thin vertical dividers.
 //  Production (selected only): a building's "+[out]n" this round; a town's income per good, "[good] → +[coin]n   [good] → …".
 //   At 0 the pill turns solid red. A red pill only states the number; it never adds a cause.
 //  Stock (only when the product warehouse holds something): "[warehouse] | [out] n/cap"; a town lists its goods.
 //   Inputs are never shown here. A full warehouse turns the pill solid red.
 // Selected (expanded): the same two pills with everything spelled out — 「本回合 | [coin]upkeep [in]n → +[out]n」
 //  (a town: 「本回合 | [good]n → +[coin]n | …」) and every warehouse including empty ones; problems in red text.
 // made:[{id,n}], used:[{id,n}], cost (buildings); offers:[{id,used,income}] (towns); starved:[input ids] (expanded only);
 // store:[{id,count,cap,role:'in'|'out'|'buy'}]
 const WAREHOUSE='<path d="M.5 4.6 5 .8l4.5 3.8V9.5H.5Z" fill="#8c7a62"/><path d="M1.6 4.9 5 2l3.4 2.9" fill="none" stroke="#c9b58f" stroke-width=".8"/><rect x="3.1" y="5.6" width="3.8" height="3.9" fill="#f3ead8"/><path d="M3.1 6.9h3.8M3.1 8.2h3.8" stroke="#8c7a62" stroke-width=".5"/>';
 function pillTile({type,name,made=[],used=[],cost=0,offers=[],starved=[],store=[],status='',expanded=false},base){
  const icon=(id,x,y,size)=>id==='warehouse'?`<g transform="translate(${x} ${y}) scale(${size/10})">${WAREHOUSE}</g>`:root.TradeIcons.svgIcon(id,{base,x,y,size});
  const town=type==='town',w10=t=>labelWidth(t)*10/12,w8=t=>labelWidth(t)*8/12,ICON=10,GAP=1.5,PAD=4,H=expanded?18:14;
  const num=n=>Math.round(n).toLocaleString('zh-CN');
  const SEP={sep:true},ARROW={arrow:true},SPACE={space:true};
  // item: {icon, text, pre, bad} | {sep} | {arrow} | {label}
  const itemW=c=>c.space?3:c.sep?1:c.arrow?w10('→'):c.label?w8(c.label):(c.pre?w10(c.pre):0)+(c.icon?ICON+(c.text?1:0):0)+(c.text?w10(c.text):0)+(c.cap?w8(c.cap):0);
  const rowW=items=>items.reduce((n,c)=>n+itemW(c)+(c.sep?GAP*2:0),0)+GAP*Math.max(0,items.length-1);
  const pill=(items,y,bad,aria)=>{
   const w=rowW(items),width=w+PAD*2,left=-width/2,cy=y+H/2;let x=-w/2;
   let h=`<g class="bt-floating bt-pill ${bad?'is-bad':''}" role="img" aria-label="${aria}"><rect class="bt-float-bg" x="${left}" y="${y}" width="${width}" height="${H}" rx="${H/2}"/>`;
   for(const c of items){
    if(c.space){x+=itemW(c)+GAP;continue;}
    if(c.sep){x+=GAP;h+=`<path class="bt-pill-sep" d="M${x} ${y+4}v${H-8}"/>`;x+=1+GAP*2;continue;}
    if(c.arrow){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="bt-flow-num bt-arrow">→</text>`;x+=itemW(c)+GAP;continue;}
    if(c.label){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="bt-row-label">${c.label}</text>`;x+=itemW(c)+GAP;continue;}
    const cls=`bt-flow-num ${c.bad?'bt-bad':''}`;
    if(c.pre){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="${cls}">${c.pre}</text>`;x+=w10(c.pre);}
    if(c.icon){h+=icon(c.icon,x,cy-ICON/2,ICON);x+=ICON+(c.text?1:0);}
    if(c.text){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="${cls}">${esc(c.text)}</text>`;x+=w10(c.text);}
    if(c.cap){h+=`<text x="${x}" y="${cy+.5}" dominant-baseline="central" class="bt-cap">${esc(c.cap)}</text>`;x+=w8(c.cap);}
    x+=GAP;}
   return h+'</g>';};
  const join=groups=>groups.flatMap((g,i)=>i?[SEP,...g]:g);
  const ins=store.filter(s=>s.role==='in'),outs=store.filter(s=>s.role!=='in');
  const slot=s=>({icon:s.id,text:num(s.count),cap:'/'+num(s.cap),bad:expanded&&(s.role==='in'?s.count<=0:s.count>=s.cap)});
  const idle=town?offers.every(o=>o.income<=0):made.every(m=>m.n<=0);
  let prod,stock,prodBad=false,stockBad=false;
  if(!expanded){
   // A town: each good, an arrow, what it earns; goods sit apart with a wider gap, no divider between them.
   prod=town?offers.flatMap((o,i)=>[...(i?[SPACE]:[]),{icon:o.id},ARROW,{pre:'+',icon:'coin',text:num(o.income)}])
    :made.map(m=>({pre:'+',icon:m.id,text:num(m.n)}));
   prodBad=idle;
   // The map shows only what the tile holds for others: its product, or a town's goods. Inputs stay in the details.
   const ho=outs.filter(s=>s.count>0);
   if(ho.length){
    stock=[{icon:'warehouse'},SEP,...join(ho.map(s=>[slot(s)]))];
    stockBad=ho.some(s=>s.count>=s.cap);
   }
  }else{
   prod=[{label:'本回合'},SEP,...(town?join(offers.map(o=>[{icon:o.id,text:num(o.used),bad:o.used<=0},ARROW,{pre:'+',icon:'coin',text:num(o.income),bad:o.income<=0}]))
    :[{icon:'coin',text:num(cost)},...used.map(u=>({icon:u.id,text:num(u.n),bad:u.n<=0&&starved.includes(u.id)})),ARROW,...made.map(m=>({pre:'+',icon:m.id,text:num(m.n),bad:m.n<=0}))])];
   stock=[{icon:'warehouse'},SEP,...join(ins.map(s=>[slot(s)])),...(ins.length&&outs.length?[ARROW]:[]),...join(outs.map(s=>[slot(s)]))];
  }
  const tip=[status,...(town?offers.map(o=>`每回合 +${num(o.income)}`):made.map(m=>`本回合产出 ${num(m.n)}`)),...store.map(s=>`仓库 ${s.count}/${s.cap}`)].filter(Boolean).join('，');
  let html=`<g class="building-tile-ui ${expanded?'is-expanded':''}" pointer-events="none"><title>${esc(name)}${tip?' · '+esc(tip):''}</title><ellipse class="bt-site" cx="0" cy="8" rx="23" ry="5.5"/><g class="bt-miniature">${icon(type,-27,-39,54)}</g>`;
  if(expanded)html+=pill(prod,15,prodBad,town?'每回合收入':'本回合产出');
  if(stock)html+=pill(stock,expanded?15+H+2:12,stockBad,'仓库');
  return html+'</g>';
 }
 // The upkeep is the one per-round animation: a red "−[coin]n" rises from above the tile and fades. Production has
 // no pop of its own; it is always on screen in the production pill.
 function upkeepPop(cost,x=0,y=0,base='assets/icons/v1/'){
  if(!cost)return '';
  const text=String(Math.round(cost)),w=labelWidth('−')*11/12+12+labelWidth(text)*11/12,x0=-w/2;
  return `<g class="pop tick upkeep-pop" transform="translate(${x},${y})"><g class="upkeep-pop-body" role="img" aria-label="维护费 ${text}"><text x="${x0}" y="0" dominant-baseline="central" class="upkeep-pop-text">−</text>${root.TradeIcons.svgIcon('coin',{base,x:x0+labelWidth('−')*11/12+1,y:-5.5,size:11})}<text x="${x0+labelWidth('−')*11/12+13}" y="0" dominant-baseline="central" class="upkeep-pop-text">${text}</text></g></g>`;
 }
 function render(opts,base='assets/icons/v1/'){
  if(opts.pills)return pillTile(opts,base);
  const {type,name,output,count=0,status='',offers=[],level=null,notice=null}=opts;
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
 function people({kind='worker',count=0,active=true,paused=false,beat=1,clock=0,seed=kind,base='assets/icons/v1/'}){
  if(!count)return '';
  // Stable per-tile scatter: no fresh randomness on render or worker count changes.
  const hash=[...String(seed)].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,7);
  const spots=[[-31,-12],[31,-4],[-27,5]];
  const mirror=hash%2?-1:1;
  return `<g class="bt-people bt-people-${kind} ${!active||paused?'is-idle':''}">${Array.from({length:count},(_,i)=>{const spot=spots[i%spots.length],x=spot[0]*mirror+((hash >>> (i*3))%3-1),y=spot[1]+((hash >>> (i*3+2))%3-1);return `<g class="bt-person"><ellipse class="bt-person-shadow" cx="${x}" cy="${y+6.5}" rx="5.5" ry="2"/><g class="bt-person-beat" style="--beat:${beat}s;animation-delay:-${(clock+i*beat/count)%beat}s">${root.TradeIcons.svgIcon(kind,{base,x:x-8,y:y-8,size:16})}</g></g>`;}).join('')}</g>`;
 }
 function warningPop(notice,x=0,y=0){
  const label={shortage:'缺料',supply:'缺货',capacity:'亏空',backlog:'积压'}[notice.kind];
  return label?`<g class="pop tick warning-pop" transform="translate(${x},${y})" role="img" aria-label="${label}"><text text-anchor="middle" class="pop-text warning-pop-text">${label}</text></g>`:'';
 }
 root.BuildingTiles={render,people,marker,levelBadge,formatLevel,warningPop,upkeepPop};
 root.AmbientTiles={render:ambient};
})(window);
