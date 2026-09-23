(function(root){
'use strict';
const E=typeof module!=='undefined'?require('./engine.js'):root.TradeEngine;
const tiles=w=>Object.values(w.tiles), producers=(w,r)=>tiles(w).filter(t=>E.workshop(t.building)&&E.RECIPES[t.building.type].out===r);
const maker=r=>E.BUILDINGS.find(b=>E.RECIPES[b].out===r);
function option(w,command,label,cost){return {command,label,cost};}
function explore(w){const fog=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];return option(w,{type:'explore',flower:fog.id},'探索新板块',E.flowerCost(w));}
function unlock(w,key){if(E.techDiscoveryReason(w,key))return explore(w);const t=E.TECH[key];for(const dep of t.requires)if(!w.tech[dep])return unlock(w,dep);return option(w,{type:'tech',key},'解锁'+t.name,E.techCost(w,key));}
// A transparent, bounded policy, not an optimal player: complete known chains, buy useful capacity, then explore.
function supply(w,r,to,seen=new Set()){
 const b=maker(r);if(seen.has(b))return null;seen=new Set(seen).add(b);
 let candidates=producers(w,r).map(t=>{const p=E.path(w,t.id,to.id);return {t,route:p?{cost:0,tiles:{length:p.length+1}}:E.route(w,t.id,to.id)};}).filter(x=>x.route).sort((a,b)=>a.route.cost-b.route.cost||a.route.tiles.length-b.route.tiles.length);
 if(!candidates.length){
  const sites=tiles(w).filter(t=>!t.building&&E.RECIPES[b].fits.includes(t.terrain)).map(t=>({t,route:E.route(w,t.id,to.id)})).filter(x=>x.route).sort((a,b)=>a.route.cost-b.route.cost);
  if(!sites.length)return explore(w);
  if(b!=='camp'&&!w.tech[b])return unlock(w,b);
  return option(w,{type:'build',tile:sites[0].t.id,buildType:b},'建造'+E.RECIPES[b].name,E.buildingCost(w,b));
 }
 const t=candidates[0].t;
 for(const input of Object.keys(E.RECIPES[b].in)){const next=supply(w,input,t,seen);if(next)return next;}
 if(!E.path(w,t.id,to.id))return option(w,{type:'connect',from:t.id,to:to.id},'连接'+E.GOODS[r]+'产线',E.connection(w,t.id,to.id).cost);
 if(!t.building.workers.length)return option(w,{type:'worker',tile:t.id},'雇用'+E.RECIPES[b].name+'工人',E.workerCost(w,t));
 return null;
}
// Buy upgrades only for active outputs with a paying market, never to balance inputs.
function growth(w){
 const choices=[];
 for(const t of tiles(w)){if(!E.workshop(t.building)||!E.productionState(w,t).active)continue;
  const r=E.RECIPES[t.building.type].out,markets=tiles(w).filter(u=>u.building?.type==='town'&&u.building.buys[r]&&E.path(w,t.id,u.id));if(!markets.length)continue;
  const price=Math.max(...markets.map(u=>E.buys(w,u.id)[r].price)),workers=t.building.workers.length;
  if(workers<E.MAX_WORKERS){const c=option(w,{type:'worker',tile:t.id},'增加产量：'+E.RECIPES[t.building.type].name,E.workerCost(w,t));c.gain=(E.rate(w,t,workers+1)-E.rate(w,t))*price;choices.push(c);}
  const key=E.craftOf(t.building.type),c=option(w,{type:'tech',key},'升级工艺：'+E.GOODS[r],E.techCost(w,key));c.gain=workers*price;choices.push(c);
 }
 for(const t of tiles(w).filter(t=>t.building?.type==='town'&&t.building.residents<E.MAX_RESIDENTS)){
  const sold=Object.values(w.sold[t.id]).reduce((n,v)=>n+v,0);if(!sold)continue;
  const c=option(w,{type:'resident',tile:t.id},'提高城镇售价',E.residentCost(w,t.id));c.gain=E.income(w)*.15;choices.push(c);
 }
 if(!E.techMaxed(w,'era')&&E.techAvailable(w,'era')&&E.income(w)>0){const c=option(w,{type:'tech',key:'era'},'提升时代售价',E.eraCost(w));c.gain=E.income(w)*.15;choices.push(c);}
 return choices.sort((a,b)=>a.cost/a.gain-b.cost/b.gain);
}
function candidates(w,maxFlowers){
 let main=null;const towns=tiles(w).filter(t=>t.building?.type==='town').sort((a,b)=>w.flowers[a.flower].order-w.flowers[b.flower].order);
 outer:for(const town of towns)for(const r in town.building.buys){const next=supply(w,r,town);if(next){main=next;break outer;}}
 const grows=growth(w);if(!main&&w.unlocked<maxFlowers)main=explore(w);
 // Save for the next discovery; buy a quick-return improvement only if the wait is long.
 const saving=main&&main.cost>w.money;
 const alternatives=grows.filter(c=>!main||(saving&&c.cost/Math.max(c.gain,1)<=40&&main.cost/Math.max(E.income(w),1)>30));
 return [main,...alternatives].filter(v=>v&&(v.command.type!=='explore'||w.unlocked<maxFlowers));
}
function* simulation({seed=1,rounds=900,clicks=0,maxFlowers=12}={}){
 const w=E.newWorld(seed),events=[],series=[],waits=[],firstSales={},purchases={};let lastPurchase=0,choicesTotal=0,choiceRounds=0;
 for(let tick=0;tick<rounds;tick++){
  if(tick%20===0)yield tick;
  for(let step=0;step<4;step++){
   const options=candidates(w,maxFlowers);if(!step){choicesTotal+=options.length;choiceRounds++;}
   const buy=options.find(c=>c.cost<=w.money);if(!buy)break;
   const before=w.money;try{E.command(w,buy.command);}catch{break;}
   waits.push(tick-lastPurchase);lastPurchase=tick;const category=buy.command.type==='tech'?(E.TECH[buy.command.key].building?'craft':buy.command.key==='era'?'era':'unlock'):buy.command.type;
   purchases[category]=(purchases[category]||0)+1;
   events.push({tick,label:buy.label,cost:before-w.money,income:E.income(w),balance:w.money,kind:category,flower:w.unlocked});
  }
  if(clicks){const active=tiles(w).filter(t=>E.workshop(t.building)&&!E.productionState(w,t).missing.length);for(let i=0;i<clicks&&active.length;i++){const t=active[(tick+i)%active.length];try{E.command(w,{type:'click',tile:t.id});}catch{}}}
  E.tick(w);
  for(const sales of Object.values(w.stats.at(-1).sales))for(const r of E.SELLABLE)if(sales[r]&&!firstSales[r])firstSales[r]=tick+1;
  if(tick%10===0)series.push({tick:tick+1,income:E.income(w)});
 }
 E.validate(w);const sorted=waits.filter(n=>n>0).sort((a,b)=>a-b);
 return {seed,rounds,events,series,firstSales,purchases,income:E.income(w),flowers:w.unlocked,balance:w.money,maxWait:Math.max(0,...waits),unfinishedWait:rounds-lastPurchase,medianWait:sorted[Math.floor(sorted.length/2)]||0,averageChoices:choicesTotal/Math.max(1,choiceRounds)};
}
function simulate(options){const it=simulation(options);let next;do{next=it.next();if(!next.done)options?.onProgress?.(next.value);}while(!next.done);return next.value;}
async function simulateAsync(options){const it=simulation(options);let next;do{next=it.next();if(!next.done)options?.onProgress?.(next.value);if(!next.done)await new Promise(resolve=>setTimeout(resolve,0));}while(!next.done);return next.value;}
const api={simulate,simulateAsync,candidates,growth};if(typeof module!=='undefined')module.exports=api;root.EconomyModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
