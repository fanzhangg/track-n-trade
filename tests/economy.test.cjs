const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const run=(w,ticks)=>{for(let i=0;i<ticks;i++)E.tick(w);return w;};
// The true start: a town and a forest, 1800 coins, no camp. `fresh` adds the camp so tests have a workshop to drive.
const raw=(seed=1)=>E.newWorld(seed);
const fresh=(seed=1)=>E.apply(raw(seed),{type:'build',tile:E.START_TILE,buildType:'camp'});
const TOWN=E.START_TOWN;
const rich=(w,n=1e7)=>{w.money+=n;return w;};
const CAMP=E.START_TILE;
const click=(w,tile,times=1)=>{for(let i=0;i<times;i++)w=E.apply(w,{type:'click',tile});return w;};
const hire=(w,tile,n=1)=>{for(let i=0;i<n;i++)w=E.apply(w,{type:'worker',tile});return w;};
const tech=(w,...keys)=>{for(const k of keys)w=E.apply(w,{type:'tech',key:k});return w;};
const isInt=n=>Number.isSafeInteger(n);
const fogs=w=>Object.values(w.flowers).filter(f=>f.state==='fog').map(f=>f.id).sort();
const tilesOf=(w,pred)=>Object.values(w.tiles).filter(pred);
const townTiles=w=>tilesOf(w,t=>t.terrain==='town').map(t=>t.id);
// Unlock the next flower in the given fog slot and place it in the first orientation the engine accepts.
function unlock(w,fid=fogs(w)[0]){return E.apply(w,{type:'explore',flower:fid});}
// Drop a building of the given type on the first free tile that fits, buying the tech if needed.
function need(w,k){for(const r of E.TECH[k].requires)w=need(w,r);return w.tech[k]?w:tech(w,k);}
function build(w,type){w=rich(w);if(type!=='camp')w=need(w,type);const t=tilesOf(w,t=>!t.building&&E.RECIPES[type].fits.includes(t.terrain))[0];assert.ok(t,'no tile for '+type);return [E.apply(w,{type:'build',tile:t.id,buildType:type}),t.id];}
// A world with the tutorial flower F1 placed and the camp connected to its log-buying town.
// Unlock until a second town exists, then make it buy exactly `buys`: tests that need a buyer of some good no
// longer depend on what the sandbox generator happens to draw.
function secondTown(w,buys){let k=null;w=rich(w);w.tech.waterway=1;for(let i=0;i<20&&!k;i++){k=townTiles(w).find(t=>t!==TOWN&&E.route(w,E.START_TILE,t));if(!k)w=unlock(w,fogs(w)[0]);}
 if(!k)throw Error('no reachable second town in 20 unlocks');const b=w.tiles[k].building;b.buys=E.copy(buys);w.flowers[w.tiles[k].flower].design.buys=E.copy(buys);return[w,k];}
// The start flower has no rock or ore: turn one of its free grass tiles into the wanted terrain (map and design
// together, so the save stays consistent) for tests that only care about building rules.
function terraform(w,terrain){const onRoad=new Set(Object.values(w.edges).flatMap(e=>[e.a,e.b]));const t=tilesOf(w,x=>x.terrain==='grass'&&!x.building&&x.flower==='0,0'&&!onRoad.has(x.id))[0];assert.ok(t,'a free grass tile on the start flower');
 t.terrain=terrain;const f=w.flowers[t.flower],p=E.flowerTiles(f).find(p=>p.q===t.q&&p.r===t.r);if(p.slot===0)f.design.center=terrain;else f.design.ring[p.slot-1]=terrain;return t.id;}
// The opening done: camp on the start forest, road to the start town.
function started(seed=1){let w=fresh(seed);w=E.apply(w,{type:'connect',from:CAMP,to:TOWN});return{w,town:TOWN};}

test('start: a seven-hex flower with one forest one tile from a town buying logs, 2000 coins, no camp; the only move that goes through is camp + road, and it always does',()=>{
 const w=raw();assert.equal(w.money,E.START_MONEY);assert.equal(Object.keys(w.tiles).length,7);assert.equal(fogs(w).length,6);
 assert.equal(w.tiles[CAMP].terrain,'forest');assert.equal(w.tiles[CAMP].building,null);assert.equal(w.tiles[TOWN].building.type,'town');assert.deepEqual(w.tiles[TOWN].building.buys,{log:20});
 assert.throws(()=>E.apply(w,{type:'explore',flower:fogs(w)[0]}),/修不起路|金币不足/);assert.ok(Math.min(...['quarry','sawmill'].map(k=>E.techCost(w,k)))<=w.money,'a tech would be affordable in coins...');
 assert.throws(()=>E.apply(w,{type:'tech',key:'quarry'}),/修不起路/);assert.throws(()=>E.apply(w,{type:'tech',key:'sawmill'}),/修不起路|金币不足/);
 assert.equal(E.firstRoad(w),E.PRICE.camp+E.route(w,CAMP,TOWN).cost);assert.ok(E.firstRoad(w)<=w.money,'camp plus road fits the start money');
 assert.ok(!E.adjacent(w.tiles[CAMP],w.tiles[TOWN]),'the start town and its forest are one tile apart');assert.equal(E.route(w,CAMP,TOWN).segments.length,2);
 let v=E.apply(w,{type:'build',tile:CAMP,buildType:'camp'});assert.throws(()=>E.apply(v,{type:'worker',tile:CAMP}),/修不起路/);
 v=E.apply(v,{type:'connect',from:CAMP,to:TOWN});assert.equal(E.firstRoad(v),0);assert.ok(v.money>=0);
 v=click(v,CAMP,5);run(v,10);assert.ok(v.sold[TOWN].log>0&&v.money>100,'the loop earns');E.validate(v);
 for(let seed=1;seed<=20;seed++){const u=raw(seed);assert.equal(E.firstRoad(u),E.firstRoad(w),'the start is the same for every seed');}
});
test('unlock prices climb in pairs: flowers 2k-1 and 2k cost 2000 x 2.2^(k-1) whatever the income; any direction works',()=>{
 let w=rich(fresh());for(let n=1;n<=8;n++){const cost=Math.round(E.FLOWER_BASE*E.GEN.flowerGrowth**Math.floor((n-1)/2));assert.equal(E.flowerCost(w),cost);const before=w.money;const slot=fogs(w)[fogs(w).length-1];w=unlock(w,slot);assert.equal(before-w.money,cost);assert.equal(w.flowers[slot].state,'placed');}
 assert.equal(E.flowerCost(w,null,1),E.flowerCost(w,null,2));assert.equal(E.flowerCost(w,null,3),Math.round(2000*2.2));
 run(w,10);for(const s of w.stats)s.income=40000;assert.equal(E.flowerCost(w),Math.round(2000*2.2**Math.floor(w.unlocked/2)),'income never moves the unlock price');
});
test("the projection's first steps reproduce in the engine: 20 clicks sell for 400 less upkeep, then one worker feeds the town",()=>{
 let {w,town}=started();const after=w.money;w=click(w,CAMP,20);
 run(w,20);const sold=w.sold[town].log;assert.ok(sold>=20,'all twenty logs sold within a few rounds');
 assert.ok(w.money>=after+400-w.upkeep,'twenty logs sell for 400, less the camp upkeep');assert.equal(w.upkeep,20*E.upkeep(w.tiles[CAMP].building));
 w=hire(w,CAMP,1);run(w,30);const net=20-E.upkeep(w.tiles[CAMP].building);assert.ok(Math.abs(E.income(w)-net)<=2,`one worker feeds a level-0 town at ${net}/round net: `+E.income(w));
});
test('clicks make pieces up to a full yard; a click on a workshop needs every input',()=>{
 let w=click(fresh(),CAMP,20);assert.equal(w.tiles[CAMP].loose.log,20);
 assert.throws(()=>E.apply(w,{type:'click',tile:CAMP}),/堆场已满/);
 E.tick(w);
 let m;[w,m]=build(w,'mason');
 assert.throws(()=>E.apply(w,{type:'click',tile:m}),/没有原木和石头/);
 w.tiles[m].loose.log=3;w.initial.log+=3;assert.throws(()=>E.apply(w,{type:'click',tile:m}),/没有石头/);
 w.tiles[m].loose.stone=1;w.initial.stone+=1;w=click(w,m);
 assert.deepEqual([w.tiles[m].loose.log,w.tiles[m].loose.stone,w.tiles[m].loose.tool],[2,0,1]);E.validate(w);
});
test('flowers tile the plane: centres on a(3,-1)+b(1,2), seven tiles each, no overlap, fog grows as flowers are placed',()=>{
 let w=rich(fresh());
 for(let i=0;i<8;i++)w=unlock(w);
 const placed=Object.values(w.flowers).filter(f=>f.state==='placed');
 assert.equal(placed.length,9);assert.equal(Object.keys(w.tiles).length,63,'seven tiles per flower, none shared');
 for(const f of placed){assert.equal(f.center.q,3*f.a+f.b);assert.equal(f.center.r,-f.a+2*f.b);for(const[da,db]of E.DIRS)assert.ok(w.flowers[`${f.a+da},${f.b+db}`],'every neighbour of a placed flower exists');}
 assert.ok(fogs(w).length>6,'fog keeps spreading');E.validate(w);
});
test('the sandbox generator obeys its rules over many seeds: valid layouts, towns spaced, goods the player can make, prices rise with distance, no town beside its own raw terrain',()=>{
 for(let seed=1;seed<=150;seed++){let w=rich(fresh(seed));for(let i=0;i<5;i++)w=unlock(w);
  for(let i=0;i<10;i++){const slot=fogs(w)[i%fogs(w).length];w=unlock(w,slot);const f=w.flowers[slot],tiles=[f.design.center,...f.design.ring];
   assert.ok(E.validDesign(tiles),`seed ${seed} unlock ${f.order} invalid`);
   if(f.design.buys){for(const[r,p]of Object.entries(f.design.buys)){assert.ok(E.SELLABLE.includes(r));assert.ok(p>=E.BASE_PRICE[r]*.6-1,'price never below the base');for(const raw of E.RAW[r])assert.ok(!tiles.includes(raw),`seed ${seed}: town buying ${r} shares a flower with ${raw}`);}}
   else{// A flower turns into a town after townEvery townless unlocks, unless a sandbox town is next door.
    const since=f.order-Math.max(0,...Object.values(w.flowers).filter(g=>g.state==='placed'&&g.design.buys&&g.order<f.order).map(g=>g.order));
    const crowded=Object.values(w.flowers).some(g=>g.id!==f.id&&g.state==='placed'&&g.order>E.TUTORIAL&&g.design.buys&&Math.max(Math.abs(f.a-g.a),Math.abs(f.b-g.b),Math.abs(f.a+f.b-g.a-g.b))<=1);
    assert.ok(since<E.GEN.townEvery||crowded,`seed ${seed}: unknown flower ${f.order} with room stayed townless after ${since} unlocks (townEvery ${E.GEN.townEvery})`);}
   for(const o of tiles.map((t,i)=>t==='ore'?i:-1).filter(i=>i>=0))assert.ok(tiles.some((t,i)=>t==='mountain'&&i!==o),'ore only with a mountain');}
  E.validate(w);}
});
test('no rotating: exploring lays the flower at once, joined to the map by passable land; rotate and place are unknown commands',()=>{
 let w=rich(fresh());const slot=fogs(w)[2];w=E.apply(w,{type:'explore',flower:slot});
 assert.equal(w.flowers[slot].state,'placed');assert.equal(w.preview,null);assert.equal(Object.keys(w.tiles).length,14);
 assert.throws(()=>E.apply(w,{type:'rotate',flower:slot,dir:1}),/未知操作/);assert.throws(()=>E.apply(w,{type:'place',flower:slot}),/未知操作/);
 // Every flower ever placed touches the rest of the map through at least one passable pair of tiles.
 for(const seed of [1,2,3]){let v=rich(fresh(seed));for(let i=0;i<12;i++)v=unlock(v);
  for(const f of Object.values(v.flowers).filter(f=>f.state==='placed'&&f.order)){const mine=E.flowerTiles(f).map(p=>v.tiles[`${p.q},${p.r}`]);
   assert.ok(mine.some(t=>E.passable(v,t)&&E.DIRS.some(([dq,dr])=>{const u=v.tiles[`${t.q+dq},${t.r+dr}`];return u&&u.flower!==f.id&&E.passable(v,u);})),`seed ${seed} flower ${f.id} is walled off`);}}
 E.tick(w);assert.equal(w.tick,1);
});
test('roads: no segment through a mountain, none onto a lake before the waterway tech, none into fog; cost is 250 x terrain regardless of road level',()=>{
 let w=rich(started(3).w);for(let i=0;i<4;i++)w=unlock(w);
 // Water where the test needs it: two start-flower grass tiles become lake.
 terraform(w,'lake');terraform(w,'lake');assert.ok(tilesOf(w,t=>t.terrain==='lake').length>=2);
 for(const e of Object.values(w.edges))assert.ok(!['mountain','lake'].includes(w.tiles[e.a].terrain));
 const lake=tilesOf(w,t=>t.terrain==='lake')[0];assert.ok(!E.passable(w,lake));w=tech(w,'sawmill','waterway');assert.ok(E.passable(w,lake));
 const [w2,s]=build(w,'sawmill');w=w2;const camp=CAMP;
 const r=E.connection(w,camp,s);for(const seg of r.segments){assert.equal(seg.cost,250*seg.factor);assert.ok(w.tiles[seg.a]&&w.tiles[seg.b],'never into fog');}
 assert.ok(!('stoneroad' in E.TECH)&&!('rail' in E.TECH)&&!('cart' in E.TECH),'roads have no tiers or capacity techs');
});
test('recipes: a workshop makes min(rate, each input) and consumes one of every input per piece',()=>{
 let w,m;[w,m]=build(fresh(),'mason');w=hire(w,m,3);
 w.tiles[m].loose.log=5;w.tiles[m].loose.stone=2;w.initial.log+=5;w.initial.stone+=2;
 E.tick(w);assert.deepEqual([w.tiles[m].loose.log,w.tiles[m].loose.stone,w.tiles[m].loose.tool],[3,0,2],'limited by stone');
 E.tick(w);assert.equal(w.tiles[m].loose.tool,2,'no stone, no tools');
 let s;[w,s]=build(w,'smelter');w=hire(w,s,1);w.tiles[s].loose.ore=1;w.tiles[s].loose.log=1;w.initial.ore++;w.initial.log++;E.tick(w);
 assert.deepEqual([w.tiles[s].loose.ore,w.tiles[s].loose.log,w.tiles[s].loose.iron],[0,0,1]);E.validate(w);
});
test('tech tree: buildings need their tech, prerequisites gate purchases, one-off techs cannot be rebought, levelled ones double',()=>{
 let w=rich(started().w);
 const rock={id:terraform(w,'rock')};
 assert.throws(()=>E.apply(w,{type:'build',tile:rock.id,buildType:'quarry'}),/先在科技树里解锁采石场/);
 assert.throws(()=>E.apply(w,{type:'tech',key:'mason'}),/先解锁锯木厂和采石场/);
 assert.throws(()=>E.apply(w,{type:'tech',key:'mine'}),/先解锁/);
 w=tech(w,'quarry');w=E.apply(w,{type:'build',tile:rock.id,buildType:'quarry'});
 assert.throws(()=>E.apply(w,{type:'tech',key:'quarry'}),/已经买过/);
 const campWorkers=Math.max(1,E.workersOf(w,'camp'));
 assert.equal(E.techCost(w,'campCraft'),campWorkers*20*30,'a craft costs 30 rounds of what it adds');w=tech(w,'campCraft');assert.equal(E.techCost(w,'campCraft'),Math.round(campWorkers*20*30*1.5));assert.equal(E.workerPower(w,'camp'),2);assert.equal(E.workerPower(w,'quarry'),1,'craft is per building type');
 assert.ok(!E.techAvailable(w,'sawmillCraft'),'a craft needs its building');w=tech(w,'sawmill');assert.ok(E.techAvailable(w,'sawmillCraft'));assert.equal(E.techCost(w,'sawmillCraft'),50*30,'no workers yet: priced as one');
 assert.equal(E.goodValue('ore'),150,'ore is worth what iron sells for');
 assert.equal(E.techCost(w,'mine'),5000);assert.equal(E.techCost(w,'smelter'),40000);
 assert.ok(!E.techAvailable(w,'mine'));w=tech(w,'mason');assert.ok(E.techAvailable(w,'mine'));
});
test('a mine only stands on ore, a camp only on forest, a quarry only on rock, workshops on grass',()=>{
 let w=rich(started().w);w=tech(w,'quarry','sawmill','mason','mine','smelter');terraform(w,'rock');terraform(w,'ore');
 const at=terrain=>tilesOf(w,t=>t.terrain===terrain&&!t.building)[0].id;
 assert.throws(()=>E.apply(w,{type:'build',tile:at('rock'),buildType:'mine'}),/不适合/);
 assert.throws(()=>E.apply(w,{type:'build',tile:at('grass'),buildType:'camp'}),/不适合/);
 w=E.apply(w,{type:'build',tile:at('ore'),buildType:'mine'});w=E.apply(w,{type:'build',tile:at('grass'),buildType:'smelter'});E.validate(w);
});
test('freight goes to the most valuable door: a mason outbids the log-buying town next door',()=>{
 let {w,town}=started(1);w=rich(w);w=hire(w,CAMP,3);
 let m;[w,m]=build(w,'mason');w=E.apply(w,{type:'connect',from:CAMP,to:m});
 // Give the mason a reachable buyer of tools so its logs are worth 120 at the door.
 let toolTown;[w,toolTown]=secondTown(w,{tool:120});
 w=E.apply(w,{type:'connect',from:m,to:toolTown});
 const ds=E.demands(w);const masonLog=ds.find(d=>d.tile===m&&d.r==='log'),townLog=ds.find(d=>d.tile===town&&d.r==='log');
 assert.equal(masonLog.value,120);assert.equal(townLog.value,20);assert.ok(ds.indexOf(masonLog)<ds.indexOf(townLog),'higher value first');
 run(w,12);assert.ok(w.tiles[m].loose.log>0||w.consumption.log>w.sold[town].log,'the mason gets logs before the town');
});
test('two goods sharing a road both get through; a segment has no capacity limit',()=>{
 let {w,town}=started(1);w=rich(w);w=hire(w,CAMP,3);
 w=tech(w,'quarry');terraform(w,'rock');let q;[w,q]=build(w,'quarry');w=hire(w,q,3);
 // a stone town that takes logs too, so both goods share its last segment
 let stoneTown;[w,stoneTown]=secondTown(w,{stone:30,log:25});
 w=E.apply(w,{type:'connect',from:q,to:stoneTown});w=E.apply(w,{type:'connect',from:CAMP,to:stoneTown});
 run(w,40);
 assert.ok(w.sold[stoneTown].stone>0&&w.sold[stoneTown].log>0,'both goods got through');
});
test('residents are priced by what they add: 2 x sum of prices x 30 rounds, x1.5 per resident, at most 3; eras multiply every town',()=>{
 let {w,town}=started(1);w=rich(w);
 assert.equal(E.buys(w,town).log.rate,2,'a town starts with one resident taking 2 per round');
 assert.equal(E.residentCost(w,town),2*20*30);w=E.apply(w,{type:'resident',tile:town});assert.equal(E.residentCost(w,town),Math.round(1200*1.5));
 assert.equal(E.buys(w,town).log.rate,4);
 w=E.apply(w,{type:'resident',tile:town});assert.throws(()=>E.apply(w,{type:'resident',tile:town}),/最多 3 名居民/);
 let toolTown;[w,toolTown]=secondTown(w,{tool:120,board:30});
 assert.equal(E.residentCost(w,toolTown),2*(120+30)*30);
 const extra=townTiles(w).reduce((n,k)=>n+w.tiles[k].building.residents*Object.values(w.tiles[k].building.buys).reduce((a,p)=>a+p,0),0);
 assert.equal(E.techCost(w,'era'),Math.round(extra*2*30),'an era costs 30 rounds of what it adds');
 w=tech(w,'era');assert.equal(E.buys(w,town).log.rate,12,'3 residents x 2 x era 2');assert.equal(E.residentCost(w,toolTown),Math.round(2*2*(120+30)*30));
 assert.equal(E.buys(w,town).log.cap,24,'the warehouse holds two rounds of what the town eats (12 a round)');run(w,60);E.validate(w);
 for(let i=w.tech.era;i<E.ERAS.length-1;i++)w=tech(w,'era');assert.throws(()=>E.apply(w,{type:'tech',key:'era'}),/最高/);
});
test('full refunds: demolishing, firing and removing roads return exactly what was paid, so the engine can always be rebuilt',()=>{
 let {w}=started(1);w=rich(w,5000);E.tick(w);const m0=w.money;
 const roadPaid=Object.values(w.edges).reduce((n,e)=>n+e.paid,0);
 w=E.apply(w,{type:'worker',tile:CAMP});w=E.apply(w,{type:'fireWorker',tile:CAMP});assert.equal(w.money,m0);
 for(const e of Object.values(w.edges))w=E.apply(w,{type:'removeRoad',edge:e.id});E.tick(w);assert.equal(w.money,m0+roadPaid);
 w=E.apply(w,{type:'demolish',tile:CAMP});assert.equal(w.money,m0+roadPaid+1200,'the start camp refunds its nominal price');
 assert.ok(w.money>=1200+500,'enough to rebuild a camp and a road');E.validate(w);
});
test('money = start - spending + refunds + goal rewards + pieces x price - upkeep; every stored number stays an integer',()=>{
 let {w,town}=started(2);w=click(w,CAMP,20);run(w,15);w=hire(w,CAMP,1);w=click(w,CAMP,6);run(w,80);
 const bonus=w.money-(E.START_MONEY-w.spent+w.sold[town].log*20-w.upkeep);
 assert.ok(bonus>0,'some goal tiers cleared and paid out');
 assert.equal(w.money,E.START_MONEY-w.spent+bonus+w.sold[town].log*20-w.upkeep);assert.ok(w.upkeep>0);
 assert.equal(w.earned,w.sold[town].log*20+bonus,'earned is gross sales plus goal rewards');
 const walk=(v,p)=>{if(typeof v==='number')assert.ok(isInt(v),`non-integer at ${p}: ${v}`);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,p+'.'+k);};
 walk(w,'w');E.validate(w);
});
test('save and reload is exact; invalid saves rejected',()=>{
 let {w}=started(1);w=rich(w,3000);w=hire(w,CAMP,2);w=click(w,CAMP,3);run(w,10);w=unlock(w);
 const clone=E.load(JSON.parse(JSON.stringify(w)));run(w,30);run(clone,30);assert.deepEqual(w,clone);
 assert.throws(()=>E.load({schemaVersion:11}));const bad=E.copy(w);bad.money=1.5;assert.throws(()=>E.load(bad));
 const rot=E.copy(w);const rf=Object.values(rot.flowers).find(f=>f.state==='placed'&&f.order);rf.rotation=(rf.rotation+1)%6;assert.throws(()=>E.load(rot),/不一致/);
 const noFog=E.copy(w);delete noFog.flowers[fogs(w)[0]];assert.throws(()=>E.load(noFog),/迷雾缺失/);
});

test('a click scales with the economy: never below 1 + tools, otherwise half a round of automatic output',()=>{
 let w=fresh();assert.equal(E.clickPower(w,w.tiles[CAMP]),1);
 w=rich(w);w=hire(w,CAMP,3);w.tech.campCraft=3;assert.equal(E.clickPower(w,w.tiles[CAMP]),6,'3 workers x 4 = 12 per round, half is 6');
 w.tech.tools=7;assert.equal(E.clickPower(w,w.tiles[CAMP]),8,'the golden finger is a floor');
 w=click(w,CAMP);assert.equal(w.tiles[CAMP].loose.log,8);});

test('a town is a warehouse: it eats exactly its rate of a good when that many are in stock, else nothing; a click sells half a round more from stock',()=>{
 let {w,town}=started(1);const t=()=>w.tiles[town];const d=E.buys(w,town).log;assert.equal(d.rate,2);assert.equal(d.cap,E.YARD);
 t().loose.log=1;w.initial.log+=1;const sold=w.sold[town].log;E.tick(w);assert.equal(w.sold[town].log,sold,'one log in stock is less than the rate: nothing eaten');
 t().loose.log=5;w.initial.log+=4;E.tick(w);assert.equal(w.sold[town].log,sold+2,'five in stock: exactly the rate is eaten');assert.equal(t().loose.log,3);
 const before=w.money;w=E.apply(w,{type:'click',tile:town});assert.equal(w.money,before+20,'a click sells one log (half a round) at once');assert.equal(w.clicks,1);
 w.initial.log-=w.tiles[town].loose.log;w.tiles[town].loose.log=0;assert.throws(()=>E.apply(w,{type:'click',tile:town}),/没有货/);
 // The warehouse fills to the cap and no further.
 w=rich(w);w=hire(w,CAMP,3);w=tech(w,'campCraft','campCraft');run(w,40);assert.ok(w.tiles[town].loose.log<=E.buys(w,town).log.cap);E.validate(w);});

test('a long road delays freight but never caps it: the pipeline target adds one round of output per round of travel',()=>{
 let w=rich(fresh());w.tech.sawmill=1;w.tech.campCraft=1;w.tech.sawmillCraft=1;w=hire(w,CAMP,3);
 let town;[w,town]=secondTown(w,{board:50});const f=w.flowers[w.tiles[town].flower];
 const far=E.flowerTiles(f).map(p=>`${p.q},${p.r}`).filter(k=>w.tiles[k].terrain==='grass').map(k=>({k,d:E.hexDist(w.tiles[k],w.tiles[CAMP])})).sort((a,b)=>b.d-a.d)[0].k;
 w=E.apply(w,{type:'build',tile:far,buildType:'sawmill'});w=E.apply(w,{type:'connect',from:CAMP,to:far});w=E.apply(w,{type:'connect',from:far,to:town});w=hire(w,far,3);
 w=E.apply(w,{type:'resident',tile:town});w=E.apply(w,{type:'resident',tile:town});
 const t=w.tiles[far],hops=E.transit(w,t,'log');assert.ok(hops>=2,`far enough: ${hops} segments`);
 assert.equal(E.pipeline(w,t,'log'),E.buffer(w,t)+E.rate(w,t)*hops);
 run(w,90);const S=w.stats,out=S.reduce((n,s)=>n+(s.tiles[far]||0),0)/S.length;
 assert.ok(out>=E.rate(w,t)*.95,`sawmill runs at full rate over a ${hops}-segment road: ${out.toFixed(2)} of ${E.rate(w,t)}`);});

// ---------- sparse map generation (GEN) ----------
// Play the generator forward by unlocking fog in a fixed order with plenty of money, so every sandbox flower is
// exercised; the tutorial is skipped by taking the first five as they come.
function explored(seed,n){let w=rich(fresh(seed));for(let i=0;i<n;i++){const fid=fogs(w).sort()[i%fogs(w).length];w=unlock(w,fid);}return w;}
const sandbox=w=>Object.values(w.flowers).filter(f=>f.state==='placed'&&f.order>E.TUTORIAL);
const gap=(a,b)=>Math.max(Math.abs(a.a-b.a),Math.abs(a.b-b.b),Math.abs(a.a+a.b-b.a-b.b));
test('sparse maps: sandbox towns never touch, every sandbox flower has 2-3 walls, a town flower is town + grass + walls only',()=>{
 for(const seed of [1,2,3,4,5]){const w=explored(seed,14);const fs=sandbox(w);assert.ok(fs.length>=9);
  const towns=fs.filter(f=>f.design.buys);
  for(const a of towns)for(const b of towns)if(a!==b)assert.ok(gap(a,b)>=2,`towns ${a.id} and ${b.id} touch (seed ${seed})`);
  for(const f of fs){const tiles=[f.design.center,...f.design.ring],walls=tiles.filter(t=>['mountain','lake'].includes(t)).length;
   assert.ok(walls>=2&&walls<=3,`${f.id} has ${walls} walls (seed ${seed})`);
   assert.ok(tiles.filter(t=>t==='rock').length<=1&&tiles.filter(t=>t==='ore').length<=1,'rock and ore are single tiles');
   if(f.design.buys){assert.ok(!tiles.some(t=>['forest','rock','ore'].includes(t)),`town flower ${f.id} carries raw (seed ${seed})`);assert.ok(tiles.filter(t=>t==='grass').length<=3);}}}
});
test('demand-aware generation: raw the towns buy but the map lacks is drawn more often; same state, same flower',()=>{
 let w=explored(1,6);
 // Strip every rock from the map and make every town buy stone: rock is now in deficit.
 for(const t of Object.values(w.tiles))if(t.terrain==='rock'&&!t.building){t.terrain='grass';const f=w.flowers[t.flower];const tiles=E.flowerTiles(f).find(p=>p.q===t.q&&p.r===t.r);if(tiles.slot===0)f.design.center='grass';else f.design.ring[tiles.slot-1]='grass';}
 for(const t of Object.values(w.tiles))if(t.building?.type==='town'){t.building.buys={stone:30};w.flowers[t.flower].design.buys={stone:30};}
 assert.ok(E.rawDeficit(w).rock>=1);
 const fid=fogs(w)[0];
 const a=E.apply(w,{type:'explore',flower:fid}),b=E.apply(w,{type:'explore',flower:fid});
 assert.deepEqual(a.flowers[fid].design,b.flowers[fid].design,'generation is a pure function of seed, order and world');
 // Over many seeds a resource flower drawn under a rock deficit carries rock far more often than not.
 let withRock=0,total=0;for(let seed=1;seed<=12;seed++){let v=explored(seed,6);for(const t of Object.values(v.tiles))if(t.terrain==='rock'&&!t.building){t.terrain='grass';const f=v.flowers[t.flower];const p=E.flowerTiles(f).find(p=>p.q===t.q&&p.r===t.r);if(p.slot===0)f.design.center='grass';else f.design.ring[p.slot-1]='grass';}
  for(const t of Object.values(v.tiles))if(t.building?.type==='town'){t.building.buys={stone:30};v.flowers[t.flower].design.buys={stone:30};}
  const k=fogs(v)[0];const d=E.apply(v,{type:'explore',flower:k}).flowers[k].design;if(d.buys)continue;total++;if([d.center,...d.ring].includes('rock'))withRock++;}
 assert.ok(withRock/total>=.5,`rock drawn in ${withRock}/${total} deficit flowers`);
});

// ---------- free-form roads ----------
test('roads are free-form: they start at any building or any tile the network touches, end on any passable tile, and a bend costs extra',()=>{
 let w=unlock(rich(fresh(1)));const town=TOWN;
 // A stub into open country: legal, and its far end becomes an anchor for the next road.
 const open=tilesOf(w,t=>!t.building&&t.terrain!=='mountain'&&E.route(w,CAMP,t.id)?.segments.length===2)[0];
 assert.ok(!E.anchored(w,open.id),'open country is no anchor yet');
 w=E.apply(w,{type:'connect',from:CAMP,to:open.id});
 assert.ok(E.anchored(w,open.id),'the stub end is an anchor now');
 assert.ok(E.path(w,CAMP,open.id),'the stub is on the network');
 // From that stub on to the town: the road grows from the road, not from a building.
 w=E.apply(w,{type:'connect',from:open.id,to:town});
 assert.ok(E.path(w,CAMP,town),'camp reaches the town over the stub');
 w=hire(w,CAMP,1);run(w,60);assert.ok(w.sold[town].log>0,'logs sold over a road built in two drags');
 // No demand check any more: two towns may be joined, and open country may not anchor a road.
 const other=townTiles(w)[1];if(other)assert.ok(E.connection(w,town,other));
 const loose=tilesOf(w,t=>!t.building&&!E.anchored(w,t.id))[0];
 assert.throws(()=>E.apply(w,{type:'connect',from:loose.id,to:town}),/建筑或已有的路/);
 assert.throws(()=>E.apply(w,{type:'connect',from:CAMP,to:tilesOf(w,t=>t.terrain==='mountain')[0].id}),/山上修不了路/);
 E.validate(w);
});
test('no relays: the building list is workshops only and the old relay type is unknown',()=>{
 assert.ok(!E.BUILDINGS.includes('relay'));assert.equal(E.RECIPES.relay,undefined);assert.equal(E.PRICE.relay,undefined);
 let w=rich(fresh(1));const g=tilesOf(w,t=>!t.building&&t.terrain==='grass')[0];
 assert.throws(()=>E.apply(w,{type:'build',tile:g.id,buildType:'relay'}),/未知建筑/);
});

test('rarity follows price: over many sandbox flowers forest outnumbers rock, rock outnumbers ore; rock and ore never touch another raw tile; a town never has its raw next door',()=>{
 const cnt={forest:0,rock:0,ore:0};let touching=0;
 for(const seed of [1,2,3,4,5,6,7,8,9,10]){let w=rich(fresh(seed));w=tech(w,'quarry','sawmill','mason','mine');for(let i=0;i<14;i++)w=unlock(w,fogs(w).sort()[i%fogs(w).length]);
  const tiles=Object.values(w.tiles).filter(t=>w.flowers[t.flower].order>E.TUTORIAL);
  for(const t of tiles){if(cnt[t.terrain]!=null)cnt[t.terrain]++;
   if(['rock','ore'].includes(t.terrain))for(const[dq,dr]of E.DIRS){const u=w.tiles[`${t.q+dq},${t.r+dr}`];if(u&&['forest','rock','ore'].includes(u.terrain)&&w.flowers[u.flower].order>E.TUTORIAL&&u.flower!==t.flower)touching++;}}
  }
 assert.ok(cnt.forest>3*cnt.rock&&cnt.rock>=cnt.ore,JSON.stringify(cnt));
 assert.ok(touching<=8,`rock/ore touching other raw across flowers: ${touching}`);
});

// ---------- upkeep, pricing ----------
test('upkeep is fixed per round: a base per building plus more per worker, paid whether it produces or not; income is sales less upkeep',()=>{
 let {w,town}=started(1);w=rich(w);const b=()=>w.tiles[CAMP].building;
 assert.equal(E.upkeep(b()),E.UPKEEP.camp[0]);w=hire(w,CAMP,2);assert.equal(E.upkeep(b()),E.UPKEEP.camp[0]+2*E.UPKEEP.camp[1]);
 run(w,40);const S=w.stats.at(-1);assert.equal(S.upkeep,E.upkeep(b()));assert.equal(S.income,S.gross-S.upkeep);
 // Cut the road to the town: nothing sells, the upkeep still runs.
 const k=E.copy(w);for(const e of Object.values(k.tiles))if(e.building?.type==='town')e.building.buys={stone:30};
 const m=k.money;run(k,5);assert.ok(k.stats.at(-1).gross===0&&k.money<=m,'no sales, upkeep keeps charging');E.validate(w);
});
test('nothing is charged before the first building can reach a buyer, so the start cannot bleed into a dead end',()=>{
 let w=fresh();const m=w.money;run(w,50);assert.equal(w.money,m);assert.equal(w.upkeep,0);
});
test('the balance may go negative and then nothing can be bought; the engine keeps running and earns it back',()=>{
 let {w}=started(1);w=rich(w);w=hire(w,CAMP,1);w.money=0;run(w,1);assert.ok(w.money<0,'the first upkeep went below zero');
 assert.throws(()=>E.apply(w,{type:'worker',tile:CAMP}),/余额为负/);assert.doesNotThrow(()=>E.apply(w,{type:'click',tile:CAMP}),'clicking still works');
 run(w,30);assert.ok(w.money>0,'sales brought the balance back');E.validate(w);
});
test('prices never look at income: a road segment is 250 x terrain and a building its base x 1.3 per one already built, however rich the engine',()=>{
 let {w,town}=started(1);assert.equal(E.buildingCost(w,'camp'),Math.round(E.PRICE.camp*1.3),'second camp costs 1.3x');
 assert.equal(E.buildingCost(w,'sawmill'),E.PRICE.sawmill);
 run(w,10);for(const s of w.stats)s.income=4000;
 assert.equal(E.segmentCost(w,1),250);assert.equal(E.segmentCost(w,3),750);assert.equal(E.buildingCost(w,'sawmill'),E.PRICE.sawmill);
 const r=E.route(w,CAMP,Object.values(w.tiles).find(t=>t.terrain==='grass'&&!t.building&&E.route(w,CAMP,t.id)).id);for(const seg of r.segments)assert.equal(seg.cost,250*seg.factor);
 w=E.apply(w,{type:'demolish',tile:CAMP});assert.equal(E.buildingCost(w,'camp'),E.PRICE.camp,'a rebuild costs what the demolition refunded');
});
test('steady income is what a shadow run earns with nobody clicking; it matches the engine itself and ignores click bursts',()=>{
 let {w}=started(1);w=rich(w);w=hire(w,CAMP,1);run(w,60);const c=E.steady(w);
 const v=E.copy(w);run(v,150);assert.ok(Math.abs(E.income(v)-c)<=1.5,`steady ${c} vs engine ${E.income(v)}`);
 const before=E.copy(w);w=click(w,CAMP,15);assert.equal(E.steady(w),c,'clicks change the balance, not the steady state');assert.ok(w.tick===before.tick);
});
test('a sandbox town pays more the farther its raw terrain lies: price = base x (1 + 0.15 x steps to the nearest such tile)',()=>{
 for(const seed of [1,2,3]){let w=rich(fresh(seed));for(let i=0;i<12;i++)w=unlock(w,fogs(w).sort()[i%fogs(w).length]);
  for(const f of Object.values(w.flowers).filter(f=>f.state==='placed'&&f.order>E.TUTORIAL&&f.design.buys))for(const[r,p]of Object.entries(f.design.buys)){
   assert.ok(p>=Math.round(E.BASE_PRICE[r]*(1+E.FAR_BONUS)*.6)-1,`${r} at ${p} priced below one step away`);assert.ok(p<=Math.round(E.BASE_PRICE[r]*(1+E.FAR_BONUS*20)),`${r} at ${p} is absurdly high`);}}
});


test('novelty: with no tech at all, ten unlocks show at least three goods bought and a raw terrain the start lacks; while something new is still possible, never more than novelEvery stale unlocks in a row',()=>{
 for(const seed of [1,2,3,4,5,6,7,8]){let w=rich(started(seed).w);let stale=0,worst=0;
  for(let i=0;i<10;i++){const goods=E.boughtGoods(w),terrains=E.terrainsOn(w);
   const fid=fogs(w).sort()[i%fogs(w).length],fog=w.flowers[fid];
   // A new buyer is only possible where a town may stand: not next to another sandbox town.
   const room=!Object.values(w.flowers).some(g=>g.state==='placed'&&g.order>0&&g.design.buys&&gap(g,fog)===1);
   const possible=['rock','ore','forest'].some(t=>!terrains.has(t))||(room&&['stone','board','tool','iron'].some(r=>!goods.has(r)));
   w=unlock(w,fid);
   if(E.boughtGoods(w).size>goods.size||E.terrainsOn(w).size>terrains.size)stale=0;else if(possible){stale++;worst=Math.max(worst,stale);}}
  assert.ok(E.boughtGoods(w).size>=3,`seed ${seed}: goods bought ${[...E.boughtGoods(w)]}`);
  assert.ok(E.terrainsOn(w).has('rock')||E.terrainsOn(w).has('ore'),`seed ${seed}: terrains ${[...E.terrainsOn(w)]}`);
  assert.ok(worst<=E.GEN.novelEvery,`seed ${seed}: ${worst} stale unlocks in a row while novelty was possible`);}
});

test('hard rule: a town never touches the raw terrain of a good it buys, on any flower, across flower borders, from the start on',()=>{
 for(const seed of [1,2,3,4,5,6]){let w=rich(started(seed).w);w=tech(w,'quarry','sawmill','mason','mine');for(let i=0;i<14;i++)w=unlock(w,fogs(w).sort()[i%fogs(w).length]);
  for(const t of Object.values(w.tiles)){if(t.building?.type!=='town')continue;const needs=new Set(Object.keys(t.building.buys).flatMap(r=>E.RAW[r]));
   for(const[dq,dr]of E.DIRS){const u=w.tiles[`${t.q+dq},${t.r+dr}`];if(u)assert.ok(!needs.has(u.terrain),`seed ${seed}: town ${t.id} buying ${Object.keys(t.building.buys)} touches ${u.terrain} at ${u.id}`);}}}
});

test('a needed raw the map lacks arrives on the very next resource flower, even one next to the town that buys it, on tiles that do not touch the town',()=>{
 for(const seed of [1,2,3,4,5,6,7,8]){let w=rich(started(seed).w);
  // The start town buys stone; there is no rock anywhere.
  w.tiles[TOWN].building.buys={stone:30};w.flowers['0,0'].design.buys={stone:30};
  assert.ok(E.rawDeficit(w).rock>=1);
  let found=null;for(let i=0;i<4&&!found;i++){const fid=fogs(w).sort()[0];w=unlock(w,fid);const f=w.flowers[fid];if(f.design.buys)continue;found=f;
   assert.ok([f.design.center,...f.design.ring].includes('rock'),`seed ${seed}: first resource flower ${fid} (next to the buyer) carries no rock`);}
  assert.ok(found,'a resource flower within four unlocks');
  const town=w.tiles[TOWN];for(const[dq,dr]of E.DIRS){const u=w.tiles[`${town.q+dq},${town.r+dr}`];if(u)assert.notEqual(u.terrain,'rock','rock never touches the stone town');}}
});

test('chain gaps close themselves: raw with no buyer makes the next town buy what it becomes; a buyer with no raw makes the next resource flower carry it; both derived from the recipes',()=>{
 assert.deepEqual(E.rawOf('tool').sort(),['forest','rock']);assert.deepEqual(E.goodsFrom('ore'),['iron']);assert.ok(E.goodsFrom('forest').includes('board'));
 for(const seed of [1,2,3,4,5,6]){let w=rich(started(seed).w);
  // Ore shows up while nobody buys iron: an upstream gap.
  terraform(w,'ore');assert.deepEqual(E.chainGaps(w).buyerNeeded,['iron']);
  // The first new town closes an open upstream gap (iron, or a cheaper good if fresh rock opened a stone gap first).
  let town=null,open=null;for(let i=0;i<6&&!town;i++){open=E.chainGaps(w).buyerNeeded;const fid=fogs(w).sort()[0];w=unlock(w,fid);const f=w.flowers[fid];if(f.design.buys)town=f;}
  assert.ok(town,'a town within six unlocks');assert.ok(Object.keys(town.design.buys).some(r=>open.includes(r)),`seed ${seed}: the first new town buys ${Object.keys(town.design.buys)} while ${open} had no buyer`);
  for(let i=0;i<6&&E.chainGaps(w).buyerNeeded.length;i++)w=unlock(w,fogs(w).sort()[0]);assert.deepEqual(E.chainGaps(w).buyerNeeded,[],'every upstream gap closes within a few unlocks');
  // Now that iron is bought and ore is the only ore tile, forest is on the map too: no downstream gap left...
  // ...until the ore tile is built on: then the map lacks free ore for the iron buyer, and the next resource flower brings ore.
  const ore=tilesOf(w,t=>t.terrain==='ore')[0];w=tech(w,'quarry','sawmill','mason','mine');w=E.apply(w,{type:'build',tile:ore.id,buildType:'mine'});
  assert.ok(E.chainGaps(w).rawNeeded.includes('ore'));
  let res=null;for(let i=0;i<6&&!res;i++){const fid=fogs(w).sort()[0];w=unlock(w,fid);const f=w.flowers[fid];if(!f.design.buys)res=f;}
  assert.ok(res&&[res.design.center,...res.design.ring].includes('ore'),`seed ${seed}: the next resource flower does not bring ore`);}
});

// ---------- goals ----------
// Five tracks, no script: nothing here asks what the map drew or what order things were done in.
test('the goal ladder steps so every tier costs the same effort: rates double, counts step by one',()=>{
 const rates=E.GOALS.filter(g=>g.step===2),counts=E.GOALS.filter(g=>g.step===1);
 assert.equal(rates.length,4);assert.equal(counts.length,1);
 for(const g of rates){
  assert.equal(E.goalTarget(g,1),g.base,'tier 1 is the base');
  for(let t=1;t<12;t++)assert.equal(E.goalTarget(g,t+1),E.goalTarget(g,t)*2,g.id+' doubles');
  assert.equal(E.goalFloor(g,1),0);assert.equal(E.goalFloor(g,5),E.goalTarget(g,4));}
 for(const g of counts)for(let t=1;t<12;t++)assert.equal(E.goalTarget(g,t+1),E.goalTarget(g,t)+1,g.id+' steps by one');
 // Produce, freight and sell are one pipeline: sharing a base is what keeps their tiers comparable.
 const pipeline=['produce','freight','sell'].map(id=>E.GOALS.find(g=>g.id===id));
 assert.equal(new Set(pipeline.map(g=>g.base)).size,1);
});
test('progress is measured inside the current tier, so every tier sweeps a full bar',()=>{
 const g=E.GOALS.find(g=>g.id==='map');let w=fresh();w=rich(w);
 assert.equal(E.goalProgress(w,g).ratio,0,'nothing unlocked yet');
 w=unlock(w);E.tick(w);
 const p=E.goalProgress(w,g);
 assert.equal(p.tier,2);assert.equal(p.target,2);assert.equal(p.floor,1);
 assert.equal(p.ratio,0,'a cleared tier restarts the bar at zero, not at half');
});
test('goals complete the moment they are reached, in any order, and a met tier catches up in one round',()=>{
 let w=rich(fresh());const g=E.GOALS.find(g=>g.id==='map');
 for(let i=0;i<3;i++)w=unlock(w);
 assert.equal(w.goals.map,1,'unlocking does not settle goals by itself');
 const before=w.money;E.tick(w);
 assert.equal(w.goals.map,4,'three tiers clear in the single round after the burst');
 const d=w.stats.at(-1).goals.map;
 assert.equal(d.levels,3);assert.equal(d.reward,3*E.goalReward(w));
 assert.equal(w.money,before+d.reward);
 E.tick(w);assert.equal(w.goals.map,4,'nothing clears twice');E.validate(w);
});
test('cleared tiers never come back, so a dip in the moving average cannot farm a reward twice',()=>{
 let {w}=started(3);w=click(w,CAMP,20);run(w,40);
 const peak=E.copy(w.goals);assert.ok(peak.produce>1,'clicking cleared at least one produce tier');
 const money=w.money;
 run(w,E.WINDOW+5); // no clicks, no workers: every rate falls back to zero
 assert.equal(E.GOALS.find(g=>g.id==='produce').value(w),0);
 for(const id of Object.keys(peak))assert.ok(w.goals[id]>=peak[id],id+' never steps back');
 assert.ok(w.money>=money-w.upkeep,'a collapsed engine still cannot lose a cleared tier');
});
test('a goal reward is always smaller than the cheapest road segment, so it can never decide a build',()=>{
 let {w}=started(4);
 for(const ticks of [0,30,60,120]){
  run(w,ticks);
  const cheapest=E.segmentCost(w,Math.min(...Object.values(E.TERRAIN_FACTOR)));
  assert.ok(E.goalReward(w)<cheapest,`reward ${E.goalReward(w)} < cheapest segment ${cheapest} at round ${w.tick}`);}
 w=rich(w,1e9);w=hire(w,CAMP,3);run(w,60);
 assert.ok(E.goalReward(w)<E.segmentCost(w,1),'still true once income dominates the floors');
});
