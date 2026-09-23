/* Minimal tabletop composition: miniature, loose goods, exceptional state only. */
(function(root){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function attentionStyle(seed=''){
  return 'animation-delay:-'+([...String(seed)].reduce((n,c)=>n+c.charCodeAt(0),0)%50/10)+'s';
 }
 function productionPop(good,n,base='assets/icons/v1/'){
  return `<g class="production-pop" role="img" aria-label="本回合 +${n}"><g class="production-pop-motion">${root.TradeIcons.svgIcon(good,{base,x:-23,y:-52,size:13})}<text x="-6" y="-42">+${esc(n)}</text></g></g>`;
 }
 function ambient({terrain,preview=false,id="lake",attention=false},base='assets/icons/v1/terrain/'){
  if(!['grass','forest','rock','ore','mountain','lake'].includes(terrain))return '';
  if(terrain==='lake'){
   const seed=[...String(id)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17);
   const patches=[[-17,-15,18], [9,-10,15], [-5,-2,26], [-22,8,14], [16,10,20], [-3,20,16]];
   return '<g class="ambient-tile ambient-lake" aria-hidden="true">'+patches.map(([x,y,w],i)=>{
    const offset=(seed>>>(i*3))%5-2,duration=7+(i*7+seed)%31/10,phase=(i*1.7+seed%29/5)%duration;
    return `<g transform="translate(${x+offset} ${y})"><g class="water-wave" style="animation-duration:${duration}s;animation-delay:-${phase}s"><path class="water-trough" d="M${-w/2} 2 Q0 5 ${w/2} 2 Q0 3.5 ${-w/2} 2Z"/><path class="water-crest" d="M${-w/2} 0 Q${-w*.1} -3 ${w/2} -.5 Q${w*.05} -1.3 ${-w/2} 0Z"/></g></g>`;
   }).join('')+'</g>';
  }
  const size={grass:62,forest:68,rock:62,ore:64,mountain:72,lake:66}[terrain];
  const foot=terrain==='lake'?22:16;
  // Low scenery has transparent vertical padding; align its visible base with the ground.
  const inset={grass:13,forest:0,rock:12,ore:0,mountain:0,lake:17}[terrain];
  return `<g class="ambient-tile ambient-${esc(terrain)}${preview?' is-preview':''}" aria-hidden="true"><g class="${attention?'needs-attention':''}" style="${attentionStyle(id)}"><image class="env-object ambient-art" href="${base}${esc(terrain)}.png?v=terrain2" x="${-size/2}" y="${foot-size+inset}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/></g></g>`;
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
 //  Production (towns always, buildings selected only): a building's "+[out]n" this round; a town's income per good, "[good] → +[coin]n   [good] → …".
 //   At 0 the pill turns solid red. A red pill only states the number; it never adds a cause.
 //  Stock (only when a product or town warehouse is full, including selected tiles): "[warehouse] | [out] n/cap"; a town lists its goods.
 //   Inputs are never shown here. A full warehouse turns the pill solid red.
 // Selected (expanded): the same two pills with everything spelled out — 「本回合 | [in]n → +[out]n」
 //  (a town: 「本回合 | [good]n → +[coin]n | …」) and full-warehouse alerts; other inventory stays in the detail panel.
 // made:[{id,n}], used:[{id,n}] (buildings); offers:[{id,used,income}] (towns); starved:[input ids] (expanded only);
 // store:[{id,count,cap,role:'in'|'out'|'buy'}]
 const WAREHOUSE='<path d="M.5 4.6 5 .8l4.5 3.8V9.5H.5Z" fill="#8c7a62"/><path d="M1.6 4.9 5 2l3.4 2.9" fill="none" stroke="#c9b58f" stroke-width=".8"/><rect x="3.1" y="5.6" width="3.8" height="3.9" fill="#f3ead8"/><path d="M3.1 6.9h3.8M3.1 8.2h3.8" stroke="#8c7a62" stroke-width=".5"/>';
 function pillTile({type,name,made=[],used=[],offers=[],starved=[],store=[],status='',expanded=false,undeveloped=false,attention=false,attentionLabel='待连接产业',attentionSeed=''},base){
  expanded=false; // Selection highlights relationships; numerical detail lives in the side panel.
  const icon=(id,x,y,size)=>id==='warehouse'?`<g transform="translate(${x} ${y}) scale(${size/10})">${WAREHOUSE}</g>`:root.TradeIcons.svgIcon(id,{base,x,y,size});
  const town=type==='town',w10=t=>labelWidth(t)*10/12,w8=t=>labelWidth(t)*8/12,ICON=10,GAP=2,PAD=5,H=expanded?20:16;
  const num=n=>Math.round(n).toLocaleString('zh-CN');
  const SEP={sep:true},ARROW={arrow:true},SPACE={space:true};
  // item: {icon, text, pre, bad} | {sep} | {arrow} | {label}
  const itemW=c=>c.space?3:c.sep?1:c.arrow?7:c.label?w8(c.label):(c.pre?w10(c.pre):0)+(c.icon?ICON+(c.text?1:0):0)+(c.text?w10(c.text):0)+(c.cap?1.5+w8(c.cap):0);
  const rowW=items=>items.reduce((n,c)=>n+itemW(c)+(c.sep?GAP*2:0),0)+GAP*Math.max(0,items.length-1);
  const pill=(items,y,bad,aria,price=false,rows=[items])=>{
   const width=Math.max(...rows.map(row=>rowW(row)))+PAD*2,left=-width/2,height=rows.length*H+(rows.length-1)*2;
   let h=`<g class="bt-floating bt-pill ${bad?'is-bad':''}${price?' is-undeveloped':''}" role="img" aria-label="${aria}"><rect class="bt-float-bg" x="${left}" y="${y}" width="${width}" height="${height}" rx="${H/2}"/>`;
   for(const [i,row] of rows.entries()){
   const cy=y+i*(H+2)+H/2;let x=-rowW(row)/2;
   for(const c of row){
    if(c.space){x+=itemW(c)+GAP;continue;}
    if(c.sep){x+=GAP;h+=`<path class="bt-pill-sep" d="M${x} ${cy-3}v6"/>`;x+=1+GAP*2;continue;}
    if(c.arrow){h+=`<path class="bt-arrow" transform="translate(${x+.5} ${cy})" d="M0 0h6m-2-2 2 2-2 2" aria-hidden="true"/>`;x+=itemW(c)+GAP;continue;}
    if(c.label){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="bt-row-label">${c.label}</text>`;x+=itemW(c)+GAP;continue;}
    const cls=`bt-flow-num ${c.bad?'bt-bad':''}`;
    if(c.pre){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="${cls}">${c.pre}</text>`;x+=w10(c.pre);}
    if(c.icon){h+=icon(c.icon,x,cy-ICON/2,ICON);x+=ICON+(c.text?1:0);}
    if(c.text){h+=`<text x="${x}" y="${cy}" dominant-baseline="central" class="${cls}">${esc(c.text)}</text>`;x+=w10(c.text);}
    if(c.cap){x+=1.5;h+=`<text x="${x}" y="${cy+.5}" dominant-baseline="central" class="bt-cap">${esc(c.cap)}</text>`;x+=w8(c.cap);}
    x+=GAP;}
   }
   return h+'</g>';};
  const join=groups=>groups.flatMap((g,i)=>i?[SEP,...g]:g);
  const ins=store.filter(s=>s.role==='in'),outs=store.filter(s=>s.role!=='in');
  const slot=s=>({icon:s.id,text:num(s.count),cap:'/'+num(s.cap),bad:expanded&&(s.role==='in'?s.count<=0:s.count>=s.cap)});
  const idle=town?offers.every(o=>o.income<=0):made.every(m=>m.n<=0);
  let prod,stock,prodBad=false,stockBad=outs.some(s=>s.count>0&&s.count>=s.cap);
  if(!expanded){
   // A town: each good, an arrow, what it earns; goods sit apart with a wider gap, no divider between them.
   prod=town?offers.flatMap((o,i)=>[...(i?[SPACE]:[]),{icon:o.id},ARROW,{pre:'+',icon:'coin',text:num(o.income)}])
    :made.map(m=>({pre:'+',icon:m.id,text:num(m.n)}));
   prodBad=idle;
   // The map shows only what the tile holds for others: its product, or a town's goods. Inputs stay in the details.
   const ho=outs.filter(s=>s.count>0);
   if(stockBad){
    stock=[{icon:'warehouse'},SEP,...join(ho.map(s=>[slot(s)]))];
    stockBad=ho.some(s=>s.count>=s.cap);
   }
  }else{
   prod=[{label:'本回合'},SEP,...(town?join(offers.map(o=>[{icon:o.id,text:num(o.used),bad:o.used<=0},ARROW,{pre:'+',icon:'coin',text:num(o.income),bad:o.income<=0}]))
    :[...used.map(u=>({icon:u.id,text:num(u.n),bad:u.n<=0&&starved.includes(u.id)})),...(used.length?[ARROW]:[]),...made.map(m=>({pre:'+',icon:m.id,text:num(m.n),bad:m.n<=0}))])];
   stock=[{icon:'warehouse'},SEP,...join(ins.map(s=>[slot(s)])),...(ins.length&&outs.length?[ARROW]:[]),...join(outs.map(s=>[slot(s)]))];
  }
  if(town&&undeveloped){
   prod=join(offers.map(o=>[{icon:o.id},ARROW,{icon:'coin',text:num(o.price),cap:'/件'}]));
   prodBad=false;
  }
  const tip=[status,...(town?offers.map(o=>undeveloped?`收购单价 ${num(o.price)}/件`:`每回合 +${num(o.income)}`):made.map(m=>`本回合产出 ${num(m.n)}`)),...store.map(s=>`仓库 ${s.count}/${s.cap}`)].filter(Boolean).join('，');
  let html=`<g class="building-tile-ui ${expanded?'is-expanded':''}" pointer-events="none"><title>${esc(name)}${tip?' · '+esc(tip):''}</title><ellipse class="bt-site" cx="0" cy="7" rx="24" ry="9"/><g class="bt-miniature ${attention?'needs-attention':''}" style="${attentionStyle(attentionSeed)}"><title>${attention?esc(attentionLabel):''}</title>${icon(type,-27,-39,54)}</g>`;
  if(town){
   const rows=offers.map(o=>[{icon:o.id},ARROW,undeveloped?{icon:'coin',text:num(o.price),cap:'/件'}:{pre:'+',icon:'coin',text:num(o.income)}]);
   if(rows.length)html+=pill([],12,!undeveloped&&prodBad,undeveloped?'收购资源与单价':'每回合收入',undeveloped,rows);
   const stockRows=outs.filter(s=>s.count>0&&s.count>=s.cap).map(s=>[{icon:'warehouse'},SEP,slot(s)]);
   if(stockRows.length)html+=pill([],12+rows.length*(H+2),true,'仓库',false,stockRows);
  }else{
   if(expanded)html+=pill(prod,15,prodBad,'本回合产出');
   if(stock&&stockBad)html+=pill(stock,expanded?15+H+2:12,true,'仓库');
  }
  return html+'</g>';
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
 let constructionSequence=0;
 function constructionMeter(p){const percent=Math.floor(p.done/p.duration*100),clip='construction-clip-'+(++constructionSequence);return '<g class="construction-meter bt-floating bt-pill" transform="translate(-35,12)" role="img" aria-label="建造 '+percent+'%"><rect class="bt-float-bg" width="70" height="16" rx="8"/><defs><clipPath id="'+clip+'"><rect width="70" height="16" rx="8"/></clipPath></defs><rect class="construction-fill" width="'+70*percent/100+'" height="16" clip-path="url(#'+clip+')"/><text x="35" y="8" dominant-baseline="central" text-anchor="middle" class="construction-label">建造 · '+percent+'%</text></g>';}
 root.BuildingTiles={productionPop,constructionMeter,render,people,marker,levelBadge,formatLevel,warningPop};
 root.AmbientTiles={render:ambient};
})(window);
