const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const run=(w,ticks)=>{for(let i=0;i<ticks;i++)E.tick(w);return w;};
const fresh=()=>E.newWorld();
const rich=(w,n=1e7)=>{w.money+=n;return w;};
const westLink=w=>E.apply(w,{type:'connect',from:'-1,0',to:'-3,1'});
const isInt=n=>Number.isSafeInteger(n);
const edge=(w,a,b)=>w.edges[E.edgeId(a,b)];

test('start: three towns, 1000 coins, nothing sells until a town is connected',()=>{
 const w=fresh();assert.equal(w.money,1000);
 for(const k of Object.keys(E.TOWNS))assert.equal(w.tiles[E.TOWNS[k].tile].building.type,'town');
 run(w,30);assert.equal(w.money,1000);assert.ok(w.tiles['0,0'].loose.board>0);E.validate(w);
});
test('per tick: a camp or quarry makes 2, a sawmill turns 1 log into 1 board, a yard holds 20',()=>{
 const w=fresh();run(w,5);
 assert.equal(w.production.log,10);assert.equal(w.production.stone,10);assert.ok(w.production.board>=4&&w.production.board<=5,'one board per tick once logs arrive');
 run(w,40);assert.equal(w.tiles['-1,0'].loose.stone,E.YARD,'quarry stops at a full yard');
 assert.equal(w.production.stone,E.YARD);
 assert.equal(w.tiles['0,0'].loose.board,E.YARD,'sawmill yard full too');
 assert.equal(w.consumption.log,w.production.board);
});
test('modules, terrain, equipment and steam each multiply the per-tick rate',()=>{
 let w=rich(fresh());const t=w.tiles['0,-1'];assert.equal(E.rate(w,t),2);
 w=E.apply(w,{type:'module',tile:'0,-1'});assert.equal(E.rate(w,w.tiles['0,-1']),4);
 w=E.apply(w,{type:'equipment',tile:'0,-1'});assert.equal(E.rate(w,w.tiles['0,-1']),8);
 w=E.apply(w,{type:'build',tile:'2,0',buildType:'camp'});assert.equal(E.rate(w,w.tiles['2,0']),4,'dense forest doubles');
 assert.equal(E.rate(w,w.tiles['0,0']),1);w=E.apply(w,{type:'research',key:'steam'});assert.equal(E.rate(w,w.tiles['0,0']),2);
});
test('a plain road carries 2 pieces per tick, an upgraded one 6, the cart doubles both; travel takes 1 tick',()=>{
 let w=rich(fresh());w=westLink(w);w=E.apply(w,{type:'townLevel',tile:'-3,1'});w=E.apply(w,{type:'townLevel',tile:'-3,1'});w=E.apply(w,{type:'townLevel',tile:'-3,1'});
 w.tiles['-1,0'].loose.stone=E.YARD;w.tiles['0,-1'].building.paused=true;w.tiles['-1,0'].building.paused=true;
 run(w,8);const moved=w.sold.west.stone+w.tiles['-3,1'].loose.stone+w.shipments.filter(s=>s.r==='stone').length;
 assert.ok(moved>=12&&moved<=16,`moved ${moved} stone over a 2/tick road in 8 ticks`);
 const e=Object.values(w.edges)[0];assert.equal(E.capacity(w,e),2);e.level=1;assert.equal(E.capacity(w,e),6);w.research.cart=true;assert.equal(E.capacity(w,e),12);
 for(const s of w.shipments)if(s.edge)assert.equal(s.remaining,1);
});
test('two goods sharing a road alternate instead of doubling throughput',()=>{
 const w=westLink(fresh());w.tiles['-1,0'].loose.stone=E.YARD;w.tiles['0,-1'].loose.log=E.YARD;
 const start=E.copy(w.sold.west);run(w,40);
 const road=edge(w,'-2,0','-3,1');
 const flows=w.stats.reduce((n,s)=>n+Object.values(s.edges[road.id]?.flows||{}).reduce((a,b)=>a+b,0),0);
 assert.ok(flows<=2*w.stats.length,`${flows} pieces over ${w.stats.length} ticks on a 2/tick road`);
 assert.ok(w.sold.west.stone>start.stone&&w.sold.west.log>start.log,'both goods got through');
});
test('every stored quantity is an integer after long simulation with sales and upgrades',()=>{
 let w=rich(fresh());w=westLink(w);w=E.apply(w,{type:'connect',from:'0,0',to:'0,3'});w=E.apply(w,{type:'research',key:'cart'});
 for(const e of Object.values(w.edges))w=E.apply(w,{type:'upgrade',edge:e.id});
 run(w,200);
 const walk=(v,p)=>{if(typeof v==='number')assert.ok(isInt(v),`non-integer at ${p}: ${v}`);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,p+'.'+k);};
 walk(w,'w');E.validate(w);
});
test('prices: a new building costs base, each module on it x1.25; roads are priced per segment by terrain only',()=>{
 let w=rich(fresh());assert.equal(E.buildingCost(w,'camp'),1200);
 w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});assert.equal(E.buildingCost(w,'camp'),1200,'a second building costs the same base');
 assert.equal(E.moduleCost(w,w.tiles['-2,1']),1500);w=E.apply(w,{type:'module',tile:'-2,1'});assert.equal(E.moduleCost(w,w.tiles['-2,1']),Math.round(1200*1.25**2));
 assert.equal(E.moduleCost(w,w.tiles['0,-1']),1500,'other buildings are unaffected');
 assert.deepEqual(E.connection(w,'0,0','0,3').segments.map(s=>s.cost),[250,250,250]);
 assert.deepEqual(E.connection(w,'-1,0','-3,1').segments.map(s=>s.cost),[500,500]);
 const bridge=E.connection(w,'0,0','3,-1');assert.equal(bridge.bridges,1);assert.ok(bridge.segments.some(s=>s.bridge&&s.cost===750));
 w=E.apply(w,{type:'connect',from:'0,0',to:'0,3'});w=E.apply(w,{type:'connect',from:'-1,0',to:'-3,1'});
 assert.deepEqual(E.connection(w,'-2,1','-3,1').segments.map(s=>s.cost),[500],'later roads do not get dearer');
});
test('road upgrades cost 3x the segment, equipment x1.5 each, town levels x1.5 each, research is one-off',()=>{
 let w=rich(fresh());const e=edge(w,'0,-1','0,0');assert.equal(E.upgradeCost(w,e),1500);w=E.apply(w,{type:'upgrade',edge:e.id});
 assert.equal(E.upgradeCost(w,edge(w,'-1,0','0,0')),1500,'unchanged by the first upgrade');
 const e0=E.equipmentCost(w);w=E.apply(w,{type:'equipment',tile:'0,0'});assert.equal(E.equipmentCost(w),e0*1.5);
 assert.equal(E.townLevelCost(w,'west'),1500);w=E.apply(w,{type:'townLevel',tile:'-3,1'});assert.equal(E.townLevelCost(w,'west'),2250);
 w=E.apply(w,{type:'research',key:'cart'});assert.throws(()=>E.apply(w,{type:'research',key:'cart'}));E.validate(w);
});
test('affordability is a hard gate and a failed command changes nothing',()=>{
 const w=fresh();const before=JSON.stringify(w);
 assert.throws(()=>E.apply(w,{type:'equipment',tile:'0,0'}),/金币不足/);
 assert.throws(()=>E.apply(w,{type:'connect',from:'0,0',to:'3,-1'}),/金币不足/);
 assert.equal(JSON.stringify(w),before);
 assert.equal(westLink(w).money,0,'the starting coins buy exactly the quarry-to-west road');
});
test('illegal links are refused with a reason',()=>{
 const w=rich(fresh());
 assert.throws(()=>E.connection(w,'-1,0','0,-1'),/不需要石头/);
 assert.throws(()=>E.connection(w,'-1,0','0,0'),/不需要石头/);
 assert.throws(()=>E.connection(w,'-3,1','0,3'),/城镇之间/);
 assert.throws(()=>E.connection(w,'0,0','-3,1'),/西镇不收木板/);
 assert.equal(E.linkReason(w,'0,-1','0,0'),null);assert.equal(E.linkReason(w,'0,-1','-3,1'),null);
});
test('town demand is a bounded pool: +rate per tick, capped at 20 ticks, buying stops when empty',()=>{
 const w=fresh();const town=w.tiles['-3,1'].building,d=E.buys(w,'west').stone;
 assert.equal(d.rate,1);assert.equal(d.pool,20);run(w,5);assert.equal(town.demand.stone,5);run(w,60);assert.equal(town.demand.stone,20,'pool capped');
 w.tiles['-3,1'].loose.stone+=100;w.initial.stone+=100;E.tick(w);
 assert.equal(w.sold.west.stone,20,'exactly the pool');assert.equal(town.demand.stone,0);
 run(w,4);assert.equal(w.sold.west.stone,24,'one more piece per tick as demand accrues');E.validate(w);
});
test('a paid town level adds one piece per tick of every good and a bigger pool; prices stay fixed',()=>{
 let w=rich(fresh());const before=E.buys(w,'east');
 w=E.apply(w,{type:'townLevel',tile:'3,-1'});const after=E.buys(w,'east');
 for(const r of Object.keys(before)){assert.equal(after[r].rate,before[r].rate+1);assert.equal(after[r].pool,40);assert.equal(after[r].price,before[r].price);}
 assert.equal(w.tiles['3,-1'].building.level,1);assert.equal(E.buys(w,'west').stone.rate,1,'other towns unchanged');
});
test('freight never overshoots: shipments to a town are bounded by its remaining demand',()=>{
 let w=westLink(fresh());w.tiles['-1,0'].loose.stone=E.YARD;for(const e of Object.values(w.edges))e.level=1;
 for(let i=0;i<120;i++){E.tick(w);const t=w.tiles['-3,1'];assert.ok(t.loose.stone+E.allocated(w,`t${t.building.id}:stone`)<=t.building.demand.stone+1,'in flight <= demand');}
});
test('money = start - roads + milestones + pieces x fixed price',()=>{
 let w=westLink(fresh());run(w,90);
 assert.ok(w.sold.west.stone>0&&isInt(w.money));
 const bonus=E.MILESTONES.filter(m=>w.milestones[m.id]).reduce((n,m)=>n+m.reward,0);
 assert.equal(w.money,bonus+w.sold.west.stone*30+w.sold.west.log*20);E.validate(w);
});
test('the starting buildings fill a level-0 town; more modules do not raise income until the town is expanded',()=>{
 let a=westLink(fresh());run(a,60);
 assert.equal(E.recentSales(a,'west','log'),1,'log rate fully used');assert.equal(E.recentSales(a,'west','stone'),1,'stone rate fully used');
 assert.equal(E.income(a),50,'exactly 1 log + 1 stone per tick at list price');
 a=rich(a);for(const e of Object.values(a.edges))e.level=1;
 a=E.apply(a,{type:'module',tile:'0,-1'});
 let b=E.copy(a);for(let i=0;i<4;i++)b=E.apply(b,{type:'module',tile:'0,-1'});
 run(a,120);run(b,120);
 assert.ok(E.income(b)<=E.income(a)*1.1,`saturated ${E.income(b)} vs ${E.income(a)}`);assert.ok(b.tiles['0,-1'].loose.log>=E.YARD-4,'the extra logs just fill the yard');
 let c=E.apply(E.copy(b),{type:'townLevel',tile:'-3,1'});run(c,60);assert.ok(E.income(c)>E.income(b)*1.5,`expanding the town unlocks income ${E.income(c)} vs ${E.income(b)}`);
});
test('a saturated road is blamed for the demand it blocks, weighted by price at the door',()=>{
 let w=rich(fresh());w=westLink(w);w=E.apply(w,{type:'townLevel',tile:'-3,1'});w=E.apply(w,{type:'townLevel',tile:'-3,1'});
 for(let i=0;i<3;i++)w=E.apply(w,{type:'module',tile:'-1,0'});
 run(w,40);
 const last=w.stats[w.stats.length-1],quarryRoad=last.edges[E.edgeId('-1,0','-2,0')],campRoad=last.edges[E.edgeId('0,-1','0,0')];
 assert.ok(quarryRoad.blocked>0,'stone road to the west is saturated and blamed');
 assert.ok(quarryRoad.blocked>=campRoad.blocked,'the pricier flow ranks higher');
 const idle=last.edges[E.edgeId('-1,0','0,0')];assert.equal(idle.blocked,0,'a road with spare capacity is never blamed');
});
test('reaching a second town with a different price list multiplies income',()=>{
 let w=westLink(fresh());run(w,120);const a=E.income(w);
 let b=rich(E.copy(w));b=E.apply(b,{type:'connect',from:'0,0',to:'0,3'});run(b,120);
 assert.ok(E.income(b)>a*1.8,`south boards ${E.income(b)} vs ${a}`);assert.ok(b.milestones.towns2);
});
test('refunds return half of the price actually paid, roads refund after draining',()=>{
 let w=rich(fresh(),10000);const m0=w.money;
 w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});const paid=m0-w.money;
 w=E.apply(w,{type:'demolish',tile:'-2,1'});assert.equal(w.money,m0-paid+Math.round(paid/2));
 w=westLink(w);const m1=w.money;
 const e=Object.values(w.edges).find(e=>e.paid>0);w=E.apply(w,{type:'removeRoad',edge:e.id});E.tick(w);
 assert.ok(!w.edges[e.id]);assert.equal(w.money,m1+Math.round(e.paid/2));E.validate(w);
});
test('save and reload is exact; invalid saves rejected',()=>{
 let w=rich(fresh(),2000);w=E.apply(w,{type:'connect',from:'0,0',to:'0,3'});run(w,10);
 const clone=E.load(JSON.parse(JSON.stringify(w)));run(w,30);run(clone,30);assert.deepEqual(w,clone);
 assert.throws(()=>E.load({schemaVersion:9}));const bad=E.copy(w);bad.money=-5;assert.throws(()=>E.load(bad));
 const frac=E.copy(w);frac.money=1.5;assert.throws(()=>E.load(frac));
});
