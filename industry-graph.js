/* The planner and isolated design samples share graph data, layout and node markup. */
(function(root){
 'use strict';
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function roman(n){if(root.BuildingTiles)return root.BuildingTiles.formatLevel(n);if(!n)return '';if(n>=4000)return [...roman(Math.floor(n/1000))].map(c=>c+'̅').join('')+roman(n%1000);let out='';for(const [v,c]of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]){out+=c.repeat(Math.floor(n/v));n%=v;}return out;}
 // The same purchase state feeds graph nodes, selected details and accessibility labels.
 function status(E,w,id){
  const building=!!E.RECIPES[id],owned=id==='camp'||w.tech[id]>0;
  const key=building&&owned?E.craftOf(id):id,t=E.TECH[key];
  const current=building?(owned?w.tech[key]+1:0):t.repeat?w.tech[key]+1:w.tech[key];
  const max=t.repeat?(t.max==null?null:t.max+1):1;
  const complete=E.techOwned(w,key)||E.techMaxed(w,key),available=E.techAvailable(w,key);
  const cost=complete?0:E.techCost(w,key),isUpgrade=t.repeat&&(owned||!building);
  const pending=E.techProgress(w,key);
  const kind=pending?'researching':complete?'maxed':!available?'locked':w.money<cost?'poor':isUpgrade?'upgrade':'unlock';
  const label={researching:'研究中',maxed:'已满级',locked:'前置未满足',poor:'金币不足',upgrade:'可升级',unlock:'可解锁'}[kind];
  const level=building?(owned?`工艺 ${roman(current)}`:'工艺未开启'):t.repeat?`${roman(current)} / ${roman(max)}`:(current?'已完成':'未研究');
  return {pending,key,current,max,complete,available,cost,kind,label,level,isUpgrade,owned,building,
   next:building&&!owned?'I':t.repeat?`${roman(current+1)}${max?' / '+roman(max):''}`:'已完成',
   reason:E.techDiscoveryReason(w,key),hint:building&&owned?'可持续升级':id==='era'?E.ERAS[w.tech.era]:'一次性解锁'};
 }
 function layout(E,mode,w){
  const all=mode==='production'?E.BUILDINGS:['camp',...Object.keys(E.TECH).filter(k=>!E.TECH[k].building)];
  const ids=all;
  const edges=[];
  for(const id of ids){
   if(mode==='production')for(const r of Object.keys(E.RECIPES[id].in)){const from=E.BUILDINGS.find(b=>E.RECIPES[b].out===r);if(ids.includes(from))edges.push({from,to:id,label:E.GOODS[r]});}
   else for(const dep of E.TECH[id]?.requires||[]){const from=E.TECH[dep].building||dep;if(ids.includes(from))edges.push({from,to:id,label:E.TECH[dep].building?'工艺 II':''});}
  }
  const levels=new Map(),depth=id=>{if(levels.has(id))return levels.get(id);const parents=edges.filter(e=>e.to===id);const n=parents.length?1+Math.max(...parents.map(e=>depth(e.from))):0;levels.set(id,n);return n;};
  const rows=new Map(),nodes=ids.map(id=>{const col=depth(id),row=rows.get(col)||0;rows.set(col,row+1);return {id,discovered:!w||id==='camp'||w.tech[id]>0||E.techAvailable(w,id),x:24+col*294,y:24+row*134};});
  return {nodes,edges,width:Math.max(...nodes.map(n=>n.x))+244,height:Math.max(...nodes.map(n=>n.y))+116,columns:Math.max(...levels.values())+1};
 }
 function markup(E,w,mode,selected,base='assets/icons/v1/'){
  const graph=layout(E,mode,w),at=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
  const ico=(id,size=24)=>root.TradeIcons.icon(id,{base,size,decorative:true});
  const arrows=graph.edges.map((e,i)=>{const a=at[e.from],b=at[e.to],x=a.x+220,y=a.y+46,tx=b.x,ty=b.y+46,active=e.from===selected||e.to===selected;
   // Skip-level dependencies travel above the cards, never through an unrelated node.
   const skip=b.x-a.x>294,lane=14-i%3*3;
   const d=skip?`M${x} ${y} H${x+24} V${lane} H${tx-24} V${ty} H${tx}`:`M${x} ${y} C${x+38} ${y} ${tx-38} ${ty} ${tx} ${ty}`;
   return `<g class="planner-link ${active?'related':''}"><path d="${d}" marker-end="url(#planner-arrow)"/>${e.label&&a.discovered&&b.discovered&&(active||mode==='tech')?`<text x="${(x+tx)/2}" y="${skip?lane-4:(y+ty)/2-6}" text-anchor="middle">${e.label}</text>`:''}</g>`;
  }).join('');
  const nodes=graph.nodes.map(n=>{
   if(!n.discovered)return `<button type="button" class="planner-node undiscovered" style="left:${n.x}px;top:${n.y}px" disabled tabindex="-1" aria-label="${mode==='production'?'未发现产业':'未发现科技'}">${ico("ui-locked",28)}<span>${mode==='production'?'未发现产业':'未发现科技'}</span></button>`;
   const rc=E.RECIPES[n.id],t=E.TECH[n.id],state=status(E,w,n.id);
   return IndustryButtons.tech(E,w,state.key,{name:rc?.name||t.name,inspect:true,selected:n.id===selected,base,className:'planner-node state-'+state.kind,attributes:'data-industry="'+n.id+'" data-x="'+n.x+'" data-y="'+n.y+'"'}).replace('style="','style="left:'+n.x+'px;top:'+n.y+'px;');
  }).join('');
  return {...graph,html:`<svg class="planner-lines ${mode}" width="${graph.width}" height="${graph.height}" aria-hidden="true"><defs><marker id="planner-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8Z"/></marker></defs>${arrows}</svg>${nodes}`};
 }

 // Shared by the planner and isolated design samples; never mutates the world.
 function detail(E,w,id,base='assets/icons/v1/',interactive=true,context={}){
  const ico=(key,size=32)=>root.TradeIcons.icon(key,{base,size,decorative:true});
  const arrow='<span class="tech-flow-arrow" aria-hidden="true">→</span>';
  const tile=(key,label,value='',focus='')=>{const enabled=interactive&&focus&&(focus==='camp'||w.tech[focus]>0||E.techAvailable(w,focus));const tag=enabled?'button':'div';return '<'+tag+' class="tech-flow-item"'+(enabled?' data-planner-focus="'+focus+'"':'')+'>'+ico(key)+'<span>'+escape(label)+'</span>'+(value?'<b>'+escape(value)+'</b>':'')+'</'+tag+'>';};
  const flow=(a,b)=>'<div class="tech-effect-flow">'+a+arrow+b+'</div>';
  const rc=E.RECIPES[id];
  if(rc){
   const ins=Object.keys(rc.in),owned=id==='camp'||w.tech[id]>0,amount=w.tech[E.craftOf(id)]+1;
   const state=context.tile?E.productionState(w,context.tile):null;
   const inputs=ins.map(r=>{const maker=E.BUILDINGS.find(b=>E.RECIPES[b].out===r);return '<div class="tech-input">'+tile(r,E.GOODS[r],'',maker)+(state?'<small class="connection-status '+(state.sources[r]?'':'waiting')+'">'+ico(state.sources[r]?'ui-checkmark':'ui-plus',12)+(state.sources[r]?'已接通':'待连接'+E.RECIPES[maker].name)+'</small>':'')+'</div>';}).join('<span class="tech-flow-plus" aria-hidden="true">+</span>');
   const recipe='<div class="tech-recipe-flow" aria-label="生产流程">'+(ins.length?'<div class="tech-flow-inputs">'+inputs+'</div>'+arrow:'')+(ins.length?'':tile(id,rc.name))+(!ins.length?arrow:'')+tile(rc.out,E.GOODS[rc.out])+'</div>';
   const buildings=context.tile?[context.tile]:Object.values(w.tiles).filter(t=>t.building?.type===id);
   const crew=buildings.reduce((n,t)=>n+t.building.workers.length,0),capacity=buildings.length*E.MAX_WORKERS;
   const rate=buildings.reduce((n,t)=>n+(E.productionState(w,t).active?E.rate(w,t):0),0);
   const scope=context.tile?'当前建筑':'全部同类工坊';
   const run=state?(state.active?'生产中':crew?'待连接':'待雇工'):buildings.length+' 座';
   const metrics='<div class="workshop-status"><span>'+scope+'</span><span class="state-badge '+(state?.active?'running':'')+'">'+run+'</span></div><div class="workshop-metrics"><div class="production-metric"><span class="metric-label">'+'固定产量'+' / 回合</span><strong>'+ico(rc.out,24)+rate+' <small>件'+E.GOODS[rc.out]+'</small></strong></div><div class="crew-metric"><span class="metric-label">工人</span><strong>'+ico('worker',22)+crew+' <small>/ '+capacity+'</small></strong></div></div>';
   const bonuses=context.tile?E.productionBonuses(w,context.tile):[];
   const bonus=bonuses.length?'<div class="tech-bonuses">'+bonuses.map(b=>'<span>'+ico(E.TECH[b.key].icon||'ui-gear',18)+escape(E.TECH[b.key].name)+' <b>+'+b.amount+'</b><small>件／回合</small></span>').join('')+'</div>':'';
   const upgrade='<div class="tech-yield"><span>'+ico('worker',24)+'每人／回合</span><div><b>'+amount+'</b>'+arrow+'<b class="tech-yield-next">'+(amount+1)+'</b>'+ico(rc.out,28)+'</div><small>基础产量 · 手工产量同步 +1</small></div>';
   const section=context.section||(context.tile?'overview':owned?'upgrade':'recipe');
   const blockers=state&&!state.active?'<div class="detail-blocker">'+(crew?ins.filter(r=>!state.sources[r]).map(r=>'待连接'+E.RECIPES[E.BUILDINGS.find(b=>E.RECIPES[b].out===r)].name).join(' · '):'雇用第一名工人开始生产')+'</div>':'';
   return '<section class="tech-visual">'+(section==='recipe'?recipe:section==='overview'?metrics+blockers:section==='bonuses'?bonus:upgrade)+'</section>';
  }
  const effects={
   waterway:()=>flow(tile('waterway','湖泊'),tile('rail','可修路')),
   roadEngineering:()=>flow(tile('rail','新修道路'),tile('coin','费用','−20%')),
   navigation:()=>flow(tile('waterway','湖路系数','×3'),tile('waterway','湖路系数','×2')),
   mountainPass:()=>flow(tile('pickaxe','山地'),tile('rail','可修路','×4')),
   waterPower:()=>flow(tile('waterway','邻湖加工坊'),tile('worker','每人／回合','+1')),
   specialization:()=>flow(tile('worker','加工坊满员','3 / 3'),tile('ui-plus','每坊／回合','+3')),
   deepMining:()=>flow(tile('mine','每名矿工'),tile('ore','铁矿石／回合','+2'))+flow(tile('smelter','每名工人'),tile('iron','铁／回合','+1')),
   era:()=>flow(tile('town','当前基础售价','+'+w.tech.era*25+'%'),tile('coin',E.techMaxed(w,'era')?'已满级':'升级基础售价','+'+(E.techMaxed(w,'era')?w.tech.era:w.tech.era+1)*25+'%'))
  };
  const note={waterPower:'仅自动生产 · 需接通上游',specialization:'仅自动生产 · 需接通上游',deepMining:'仅自动生产',mountainPass:'山地不可建厂',roadEngineering:'已有道路按实付退款',navigation:'可叠加石工筑路',era:'与居民加成相加'}[id];
  return '<section class="tech-visual">'+(effects[id]?.()||'')+(note?'<small class="tech-visual-note">'+note+'</small>':'')+'</section>';
 }
 root.IndustryGraph={layout,markup,status,roman,detail};
 if(typeof module!=='undefined')module.exports={layout,status,roman};
})(typeof globalThis!=='undefined'?globalThis:this);
