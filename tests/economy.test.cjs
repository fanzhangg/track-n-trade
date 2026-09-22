const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const run=(w,ticks)=>{for(let i=0;i<ticks;i++)E.tick(w);return w;};
const fresh=()=>E.newWorld();
const rich=(w,n=1e7)=>{w.money+=n;return w;};
const CAMP=E.START_TILE,WEST='-3,1';
const westLink=w=>E.apply(w,{type:'connect',from:CAMP,to:WEST});
const click=(w,tile,times=1)=>{for(let i=0;i<times;i++)w=E.apply(w,{type:'click',tile});return w;};
const hire=(w,tile,n=1)=>{for(let i=0;i<n;i++)w=E.apply(w,{type:'worker',tile});return w;};
const train=(w,n=1)=>{for(let i=0;i<n;i++)w=E.apply(w,{type:'tech',key:'training'});return w;};
const isInt=n=>Number.isSafeInteger(n);
const edge=(w,a,b)=>w.edges[E.edgeId(a,b)];

test('start: three towns, one camp, no roads, and nothing is produced until the player acts',()=>{
 const w=fresh();assert.equal(w.money,1000);assert.equal(w.clicks,0);
 for(const k of Object.keys(E.TOWNS))assert.equal(w.tiles[E.TOWNS[k].tile].building.type,'town');
 const built=Object.values(w.tiles).filter(t=>t.building&&t.building.type!=='town');
 assert.equal(built.length,1);assert.equal(built[0].id,CAMP);assert.equal(built[0].building.type,'camp');
 assert.equal(built[0].building.workers.length,0,'a new building starts with no workers');
 assert.equal(Object.keys(w.edges).length,0,'no roads to start with');
 run(w,30);assert.equal(w.production.log,0,'a building with no workers makes nothing on its own');
 assert.equal(w.money,1000);E.validate(w);
});
test('a click makes one piece; the tools tech makes it more; a full yard refuses',()=>{
 let w=click(fresh(),CAMP);
 assert.equal(w.tiles[CAMP].loose.log,1);assert.equal(w.production.log,1);assert.equal(w.clicks,1);
 w=rich(w);w=E.apply(w,{type:'tech',key:'tools'});assert.equal(E.clickPower(w),2);
 w=click(w,CAMP);assert.equal(w.tiles[CAMP].loose.log,3,'one click now makes two');
 w.tiles[CAMP].loose.log=E.YARD;w.initial.log+=E.YARD-3;
 assert.throws(()=>E.apply(w,{type:'click',tile:CAMP}),/堆场已满/);
 assert.throws(()=>E.apply(w,{type:'click',tile:WEST}),/点击工坊/);
 E.validate(w);
});
test('clicks land in the same tick sample as worker output, so the rate panel counts both',()=>{
 let w=hire(rich(fresh()),CAMP,1);
 w=click(w,CAMP,3);E.tick(w);
 const s=w.stats[w.stats.length-1];
 assert.equal(s.out.log,4,'three clicks plus one worker');
 assert.equal(s.tiles[CAMP],4);
 assert.equal(w.manual.out.log,0,'the manual buffer is drained by the tick');
 E.validate(w);
});
test('workers are the only automatic production, and training multiplies every one of them',()=>{
 let w=rich(fresh());assert.equal(E.rate(w,w.tiles[CAMP]),0);
 w=hire(w,CAMP,1);assert.equal(E.rate(w,w.tiles[CAMP]),1);
 w=hire(w,CAMP,2);assert.equal(E.rate(w,w.tiles[CAMP]),3);
 run(w,4);assert.equal(w.production.log,12);
 w=E.apply(w,{type:'tech',key:'training'});assert.equal(E.workerPower(w),2);
 assert.equal(E.rate(w,w.tiles[CAMP]),6,'training raises every worker on every building');
 w=E.apply(w,{type:'fireWorker',tile:CAMP});assert.equal(E.rate(w,w.tiles[CAMP]),4);
});
test('a building takes at most MAX_WORKERS; past that, growth comes from new buildings and training',()=>{
 let w=rich(fresh());
 assert.equal(E.MAX_WORKERS,3);
 w=hire(w,CAMP,E.MAX_WORKERS);
 assert.equal(E.rate(w,w.tiles[CAMP]),E.MAX_WORKERS);
 assert.throws(()=>E.apply(w,{type:'worker',tile:CAMP}),/最多 3 名工人/);
 const over=E.copy(w);over.tiles[CAMP].building.workers.push({id:'999999',paid:0});
 assert.throws(()=>E.validate(over),/建筑无效/);
 w=train(w,1);assert.equal(E.rate(w,w.tiles[CAMP]),E.MAX_WORKERS*2,'training is the way past the cap');
 w=E.apply(w,{type:'build',tile:'0,-1',buildType:'camp'});
 assert.equal(E.workerCost(w,w.tiles['0,-1']),E.WORKER.camp,'a new building starts the worker price over');
});
test('a sawmill turns one log into one board, by click or by worker, and a yard holds 20',()=>{
 let w=rich(fresh());
 w=E.apply(w,{type:'build',tile:'0,0',buildType:'sawmill'});
 assert.throws(()=>E.apply(w,{type:'click',tile:'0,0'}),/没有原木/);
 w.tiles['0,0'].loose.log=6;w.initial.log+=6;
 w=click(w,'0,0');
 assert.equal(w.tiles['0,0'].loose.board,1);assert.equal(w.tiles['0,0'].loose.log,5);
 w=hire(w,'0,0',2);run(w,2);
 assert.equal(w.consumption.log,w.production.board,'every board ate exactly one log');
 assert.equal(w.tiles['0,0'].loose.log,1);
 w.tiles['0,0'].loose.log=E.YARD;w.initial.log+=E.YARD-1;run(w,40);
 assert.equal(w.tiles['0,0'].loose.board,E.YARD,'a full yard stops the workers');
 E.validate(w);
});
test('a plain road carries 4 pieces per tick, an upgraded one 12, the cart doubles both; travel takes 1 tick',()=>{
 let w=westLink(rich(fresh()));w=train(hire(w,CAMP,E.MAX_WORKERS),2);
 w.tiles[CAMP].loose.log=E.YARD;w.initial.log+=E.YARD;
 const e=Object.values(w.edges)[0];assert.equal(E.capacity(w,e),4);
 run(w,20);
 const flows=w.stats.reduce((n,s)=>n+Object.values(s.edges[e.id]?.flows||{}).reduce((a,b)=>a+b,0),0);
 assert.ok(flows<=w.stats.length*4,`${flows} pieces over ${w.stats.length} ticks on a 4/tick road`);
 assert.ok(w.sold.west.log>0,'logs reached the town');
 for(const s of w.shipments)if(s.edge)assert.equal(s.remaining,1);
 w=E.apply(w,{type:'upgrade',edge:e.id});assert.equal(E.capacity(w,w.edges[e.id]),12);
 w=E.apply(w,{type:'research',key:'cart'});assert.equal(E.capacity(w,w.edges[e.id]),24);
});
test('two goods sharing a road alternate instead of doubling throughput',()=>{
 let w=rich(fresh());
 w=E.apply(w,{type:'build',tile:'-1,0',buildType:'quarry'});
 w=E.apply(w,{type:'connect',from:CAMP,to:WEST});
 w=E.apply(w,{type:'connect',from:'-1,0',to:WEST});
 w=hire(w,CAMP,E.MAX_WORKERS);w=hire(w,'-1,0',E.MAX_WORKERS);w=train(w,1);
 const shared=Object.values(w.edges).find(e=>e.a===WEST||e.b===WEST);
 const start=E.copy(w.sold.west);run(w,40);
 const flows=w.stats.reduce((n,s)=>n+Object.values(s.edges[shared.id]?.flows||{}).reduce((a,b)=>a+b,0),0);
 assert.ok(flows<=w.stats.length*E.capacity(w,shared),`${flows} pieces over ${w.stats.length} ticks`);
 assert.ok(w.sold.west.stone>start.stone&&w.sold.west.log>start.log,'both goods got through');
});
test('every stored quantity is an integer after long simulation with clicks, sales and upgrades',()=>{
 let w=rich(fresh());
 w=E.apply(w,{type:'build',tile:'0,0',buildType:'sawmill'});
 w=E.apply(w,{type:'connect',from:CAMP,to:'0,0'});
 w=E.apply(w,{type:'connect',from:'0,0',to:'0,3'});
 w=hire(w,CAMP,E.MAX_WORKERS);w=hire(w,'0,0',E.MAX_WORKERS);
 w=E.apply(w,{type:'research',key:'cart'});w=E.apply(w,{type:'tech',key:'training'});w=E.apply(w,{type:'tech',key:'tools'});
 for(const e of Object.values(w.edges))w=E.apply(w,{type:'upgrade',edge:e.id});
 for(let i=0;i<60;i++){E.tick(w);if(i%3===0)w=click(w,CAMP);}
 const walk=(v,p)=>{if(typeof v==='number')assert.ok(isInt(v),`non-integer at ${p}: ${v}`);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,p+'.'+k);};
 walk(w,'w');E.validate(w);
});
test('prices: a new building costs base, each worker on it x1.3, techs double per level, roads per segment',()=>{
 let w=rich(fresh());assert.equal(E.buildingCost(w,'camp'),1200);
 assert.equal(E.workerCost(w,w.tiles[CAMP]),E.WORKER.camp);
 w=hire(w,CAMP,1);assert.equal(E.workerCost(w,w.tiles[CAMP]),Math.round(E.WORKER.camp*1.3));
 w=hire(w,CAMP,1);assert.equal(E.workerCost(w,w.tiles[CAMP]),Math.round(E.WORKER.camp*1.3**2));
 w=E.apply(w,{type:'build',tile:'0,-1',buildType:'camp'});
 assert.equal(E.buildingCost(w,'camp'),1200,'a second building costs the same base');
 assert.equal(E.workerCost(w,w.tiles['0,-1']),E.WORKER.camp,'workers are priced per building');
 const t0=E.techCost(w,'tools');w=E.apply(w,{type:'tech',key:'tools'});assert.equal(E.techCost(w,'tools'),t0*2);
 w=E.apply(w,{type:'build',tile:'0,0',buildType:'sawmill'});
 assert.deepEqual(E.connection(w,'0,0','0,3').segments.map(s=>s.cost),[250,250,250]);
 assert.deepEqual(E.connection(w,CAMP,WEST).segments.map(s=>s.cost),[500]);
 const bridge=E.connection(w,'0,0','3,-1');assert.equal(bridge.bridges,1);assert.ok(bridge.segments.some(s=>s.bridge&&s.cost===750));
 w=E.apply(w,{type:'connect',from:CAMP,to:WEST});
 assert.deepEqual(E.connection(w,'0,-1','0,0').segments.map(s=>s.cost),[500],'later roads do not get dearer');
});
test('road upgrades cost 3x the segment, town levels x1.5 each, research is one-off',()=>{
 let w=westLink(rich(fresh()));const e=Object.values(w.edges)[0];
 assert.equal(E.upgradeCost(w,e),1500);w=E.apply(w,{type:'upgrade',edge:e.id});
 assert.equal(E.townLevelCost(w,'west'),1500);w=E.apply(w,{type:'townLevel',tile:WEST});assert.equal(E.townLevelCost(w,'west'),2250);
 w=E.apply(w,{type:'research',key:'cart'});assert.throws(()=>E.apply(w,{type:'research',key:'cart'}));E.validate(w);
});
test('affordability is a hard gate and a failed command changes nothing',()=>{
 const w=fresh();const before=JSON.stringify(w);
 assert.throws(()=>E.apply(w,{type:'build',tile:'0,0',buildType:'sawmill'}),/金币不足/);
 assert.throws(()=>E.apply(w,{type:'connect',from:CAMP,to:'0,3'}),/不能连接|金币不足|没有货可运/);
 assert.equal(JSON.stringify(w),before);
 assert.equal(westLink(w).money,500,'the first road to the west town costs 500');
});
test('illegal links are refused with a reason',()=>{
 let w=rich(fresh());
 w=E.apply(w,{type:'build',tile:'-1,0',buildType:'quarry'});
 w=E.apply(w,{type:'build',tile:'0,0',buildType:'sawmill'});
 assert.throws(()=>E.connection(w,'-1,0',CAMP),/不需要石头/);
 assert.throws(()=>E.connection(w,'-1,0','0,0'),/不需要石头/);
 assert.throws(()=>E.connection(w,WEST,'0,3'),/城镇之间/);
 assert.throws(()=>E.connection(w,'0,0',WEST),/西镇不收木板/);
 assert.equal(E.linkReason(w,CAMP,'0,0'),null);assert.equal(E.linkReason(w,CAMP,WEST),null);
});
test('town demand is a bounded pool: +2 per tick at level 0, capped at 20 ticks, buying stops when empty',()=>{
 const w=fresh();const town=w.tiles[WEST].building,d=E.buys(w,'west').stone;
 assert.equal(d.rate,E.TOWN_RATE);assert.equal(d.pool,E.TOWN_RATE*E.POOL_TICKS);
 run(w,5);assert.equal(town.demand.stone,10);run(w,60);assert.equal(town.demand.stone,40,'pool capped');
 w.tiles[WEST].loose.stone+=100;w.initial.stone+=100;E.tick(w);
 assert.equal(w.sold.west.stone,40,'exactly the pool');assert.equal(town.demand.stone,0);
 run(w,4);assert.equal(w.sold.west.stone,48,'two more pieces per tick as demand accrues');E.validate(w);
});
test('a paid town level adds TOWN_RATE per tick of every good and a bigger pool; prices stay fixed',()=>{
 let w=rich(fresh());const before=E.buys(w,'east');
 w=E.apply(w,{type:'townLevel',tile:'3,-1'});const after=E.buys(w,'east');
 for(const r of Object.keys(before)){assert.equal(after[r].rate,before[r].rate+E.TOWN_RATE);assert.equal(after[r].pool,2*E.TOWN_RATE*E.POOL_TICKS);assert.equal(after[r].price,before[r].price);}
 assert.equal(w.tiles['3,-1'].building.level,1);assert.equal(E.buys(w,'west').stone.rate,E.TOWN_RATE,'other towns unchanged');
});
test('freight never overshoots: shipments to a town are bounded by its remaining demand',()=>{
 let w=westLink(rich(fresh()));w=train(hire(w,CAMP,E.MAX_WORKERS),2);
 w.tiles[CAMP].loose.log=E.YARD;w.initial.log+=E.YARD;
 for(const e of Object.values(w.edges))e.level=1;
 for(let i=0;i<120;i++){E.tick(w);const t=w.tiles[WEST];assert.ok(t.loose.log+E.allocated(w,`t${t.building.id}:log`)<=t.building.demand.log+E.capacity(w,Object.values(w.edges)[0]),'in flight <= demand');}
});
test('money = start - spending + milestones + pieces x fixed price',()=>{
 let w=westLink(fresh());const spent=w.spent;
 w=click(w,CAMP,8);run(w,60);
 assert.ok(w.sold.west.log>0&&isInt(w.money));
 const bonus=E.MILESTONES.filter(m=>w.milestones[m.id]).reduce((n,m)=>n+m.reward,0);
 assert.equal(w.money,1000-spent+bonus+w.sold.west.log*20+w.sold.west.stone*30);E.validate(w);
});
test('the town rate is a real bottleneck: more workers do not raise income once it is fed',()=>{
 let a=rich(westLink(fresh()));a=hire(a,CAMP,2);
 let b=train(hire(E.copy(a),CAMP,1),2);
 run(a,120);run(b,120);
 assert.ok(E.income(b)<=E.income(a)*1.15,`fed town: ${E.income(b)} vs ${E.income(a)}`);
 assert.ok(b.tiles[CAMP].loose.log>=E.YARD-2,'the extra logs just fill the yard');
});
test('a saturated road is blamed for the demand it blocks, weighted by price at the door',()=>{
 let w=rich(westLink(fresh()));
 w=E.apply(w,{type:'townLevel',tile:WEST});w=E.apply(w,{type:'townLevel',tile:WEST});
 w=train(hire(w,CAMP,E.MAX_WORKERS),1);
 w=E.apply(w,{type:'build',tile:'0,-1',buildType:'camp'});
 w=E.apply(w,{type:'build',tile:'0,0',buildType:'sawmill'});
 w=E.apply(w,{type:'connect',from:'0,-1',to:'0,0'});
 run(w,40);
 const last=w.stats[w.stats.length-1];
 const westRoad=last.edges[E.edgeId(CAMP,WEST)],idle=last.edges[E.edgeId('0,-1','0,0')];
 assert.ok(westRoad.blocked>0,'the road to the west town is saturated and blamed');
 assert.equal(idle.blocked,0,'a road with spare capacity is never blamed');
});
test('refunds return half of the price actually paid, roads refund after draining',()=>{
 let w=rich(fresh(),10000);const m0=w.money;
 w=E.apply(w,{type:'build',tile:'0,-1',buildType:'camp'});const paid=m0-w.money;
 w=hire(w,'0,-1',1);const withWorker=paid+E.WORKER.camp;
 w=E.apply(w,{type:'fireWorker',tile:'0,-1'});assert.equal(w.money,m0-withWorker+Math.round(E.WORKER.camp/2));
 const m1=w.money;w=E.apply(w,{type:'demolish',tile:'0,-1'});assert.equal(w.money,m1+Math.round(paid/2));
 w=westLink(w);const m2=w.money;
 const e=Object.values(w.edges).find(e=>e.paid>0);w=E.apply(w,{type:'removeRoad',edge:e.id});E.tick(w);
 assert.ok(!w.edges[e.id]);assert.equal(w.money,m2+Math.round(e.paid/2));E.validate(w);
});
test('save and reload is exact; invalid saves rejected',()=>{
 let w=rich(fresh(),2000);w=westLink(w);w=hire(w,CAMP,2);w=click(w,CAMP,3);run(w,10);
 const clone=E.load(JSON.parse(JSON.stringify(w)));run(w,30);run(clone,30);assert.deepEqual(w,clone);
 assert.throws(()=>E.load({schemaVersion:10}));const bad=E.copy(w);bad.money=-5;assert.throws(()=>E.load(bad));
 const frac=E.copy(w);frac.money=1.5;assert.throws(()=>E.load(frac));
 const noTech=E.copy(w);delete noTech.tech;assert.throws(()=>E.load(noTech));
});
