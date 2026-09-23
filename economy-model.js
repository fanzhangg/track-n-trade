(function(root){
'use strict';
const E=typeof module!=='undefined'?require('./engine.js'):root.TradeEngine;
const tiles=w=>Object.values(w.tiles), producers=(w,r)=>tiles(w).filter(t=>E.workshop(t.building)&&E.RECIPES[t.building.type].out===r);
const maker=r=>E.BUILDINGS.find(b=>E.RECIPES[b].out===r);
function option(w,command,label,cost){return {command,label,cost};}
function explore(w){const fog=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];return option(w,{type:'explore',flower:fog.id},'探索新板块',E.flowerCost(w));}
function unlock(w,key){const t=E.TECH[key];for(const dep of t.requires)if(!w.tech[dep])return unlock(w,dep);return option(w,{type:'tech',key},'解锁'+t.name,E.techCost(w,key));}
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
function growth(w){
 const need=E.zero(),have=E.zero(),choices=[];
 for(const t of tiles(w)){const b=t.building;if(!b)continue;if(b.type==='town'){for(const r in b.buys)need[r]+=E.townRate(w,b);}else{const rc=E.RECIPES[b.type];have[rc.out]+=E.rate(w,t);for(const r in rc.in)need[r]+=E.rate(w,t);}}
 for(const r of E.RES){if(have[r]>=need[r])continue;const ps=producers(w,r).filter(t=>t.building.workers.length);if(!ps.length)continue;
  for(const t of ps)if(t.building.workers.length<E.MAX_WORKERS){const c=option(w,{type:'worker',tile:t.id},'扩产：'+E.RECIPES[t.building.type].name,E.workerCost(w,t));c.gain=Math.min(need[r]-have[r],E.workerPower(w,t.building.type));choices.push(c);}
  const key=E.craftOf(maker(r)),c=option(w,{type:'tech',key},'工艺：'+E.GOODS[r],E.techCost(w,key));c.gain=Math.min(need[r]-have[r],ps.reduce((n,t)=>n+t.building.workers.length,0));choices.push(c);
 }
 return choices.sort((a,b)=>a.cost/a.gain-b.cost/b.gain);
}
function candidates(w,maxFlowers){
 let main=null;const towns=tiles(w).filter(t=>t.building?.type==='town').sort((a,b)=>w.flowers[a.flower].order-w.flowers[b.flower].order);
 outer:for(const town of towns)for(const r in town.building.buys){const next=supply(w,r,town);if(next){main=next;break outer;}}
 const grows=growth(w);
 if(!main)main=grows[0]||(w.unlocked<maxFlowers?explore(w):null);
 // With a complete map, local demand and a global era form the next progression loop.
 if(!main){const town=towns.find(t=>t.building.residents<E.MAX_RESIDENTS);if(town)main=option(w,{type:'resident',tile:town.id},'增加居民',E.residentCost(w,town.id));else if(!E.techMaxed(w,'era'))main=option(w,{type:'tech',key:'era'},'提升时代',E.eraCost(w));}
 // Long mountain detours are a reason to strengthen a working market while saving.
 // Only add demand backed by current production; the next pass can then expand supply.
 const alternatives=[];
 if(main&&main.cost>w.money&&main.cost/Math.max(1,E.income(w))>30){
  const need=E.zero(),have=E.zero();for(const t of tiles(w)){const b=t.building;if(!b)continue;if(b.type==='town'){for(const r in b.buys)need[r]+=E.townRate(w,b);}else{const rc=E.RECIPES[b.type];have[rc.out]+=E.rate(w,t);for(const r in rc.in)need[r]+=E.rate(w,t);}}
  for(const town of towns)if(town.building.residents<E.MAX_RESIDENTS&&Object.keys(town.building.buys).every(r=>have[r]>=need[r]&&producers(w,r).some(t=>E.path(w,t.id,town.id))))alternatives.push(option(w,{type:'resident',tile:town.id},'扩展已接通市场',E.residentCost(w,town.id)));
 }
 return [main,...grows,...alternatives].filter((v,i,a)=>v&&(v.command.type!=='explore'||w.unlocked<maxFlowers)&&a.findIndex(x=>x&&JSON.stringify(x.command)===JSON.stringify(v.command))===i);
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
  if(clicks){const active=tiles(w).filter(t=>E.workshop(t.building)&&t.loose[E.RECIPES[t.building.type].out]<E.YARD);for(let i=0;i<clicks&&active.length;i++){const t=active[(tick+i)%active.length];try{E.command(w,{type:'click',tile:t.id});}catch{}}}
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
