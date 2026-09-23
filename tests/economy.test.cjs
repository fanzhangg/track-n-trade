function discoverFor(w,key){for(let i=0;E.techDiscoveryReason(w,key)&&i<20;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const run=(w,ticks)=>{for(let i=0;i<ticks;i++)E.tick(w);return w;};
// Isolated empty-map fixture for individual purchase/production tests. Opening is tested separately.
const raw=(seed=1)=>{const w=E.newWorld(seed);w.tiles[E.START_TILE].building=null;w.edges={};return w;};
const fresh=(seed=1)=>E.apply(raw(seed),{type:'build',tile:E.START_TILE,buildType:'camp'});
const TOWN=E.START_TOWN;
const rich=(w,n=1e7)=>{w.money+=n;return w;};
const CAMP=E.START_TILE;
const click=(w,tile,times=1)=>{for(let i=0;i<times;i++)w=E.apply(w,{type:'click',tile});return w;};
const hire=(w,tile,n=1)=>{for(let i=0;i<n;i++)w=E.apply(w,{type:'worker',tile});return w;};
const tech=(w,...keys)=>{for(const k of keys){discoverFor(w,k);w=E.apply(w,{type:'tech',key:k});}return w;};
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

test('opening automatically earns and purchases have no first-road reserve',()=>{
 for(const seed of [1,7,42]){const w=E.newWorld(seed);assert.equal(w.money,2600);assert.equal(w.spent,0);assert.equal(w.tiles[CAMP].building.workers.length,1);assert.equal(Object.keys(w.edges).length,2);assert.equal(E.path(w,CAMP,TOWN).length,2);run(w,30);assert.ok(E.income(w)>0);assert.equal(w.clicks,0);E.validate(w);assert.deepEqual(E.load(E.copy(w)),w);}
 const tight=raw();tight.money=600;E.command(tight,{type:'tech',key:'quarry'});assert.equal(tight.money,0);
 const empty=raw();empty.money=1200;E.command(empty,{type:'build',tile:CAMP,buildType:'camp'});assert.equal(empty.money,0);
 const w=E.newWorld();E.command(w,{type:'demolish',tile:CAMP});for(const e of Object.values(w.edges))E.command(w,{type:'removeRoad',edge:e.id});E.tick(w);assert.equal(w.money,2600);E.validate(w);
});

test('exploration prices grow gradually with map size, never with income',()=>{
 let w=rich(fresh());let previous=0;for(let n=1;n<=16;n++){const cost=E.flowerCost(w);assert.equal(cost,Math.round(E.FLOWER_BASE*(1+.25*(n-1))**1.2));assert.ok(cost>previous);if(previous)assert.ok(cost<previous*1.6);previous=cost;const before=w.money;w=unlock(w);assert.equal(before-w.money,cost);}
 const price=E.flowerCost(w);run(w,10);for(const row of w.stats)row.income=40000;assert.equal(E.flowerCost(w),price);
});

test("the projection's first steps reproduce in the engine: 20 clicks sell for 400, then one worker feeds the town",()=>{
 let {w,town}=started();const after=w.money;w=click(w,CAMP,20);
 run(w,20);const sold=w.sold[town].log;assert.ok(sold>=20,'all twenty logs sold within a few rounds');
 assert.ok(w.money>=after+400,'twenty logs sell for 400');
 w=hire(w,CAMP,1);run(w,30);const net=20;assert.ok(Math.abs(E.income(w)-net)<=2,`one worker feeds a level-0 town at ${net}/round net: `+E.income(w));
});
test('flowers tile the plane: centres on a(3,-1)+b(1,2), seven tiles each, no overlap, fog grows as flowers are placed',()=>{
 let w=rich(fresh());
 for(let i=0;i<8;i++)w=unlock(w);
 const placed=Object.values(w.flowers).filter(f=>f.state==='placed');
 assert.equal(placed.length,9);assert.equal(Object.keys(w.tiles).length,63,'seven tiles per flower, none shared');
 for(const f of placed){assert.equal(f.center.q,3*f.a+f.b);assert.equal(f.center.r,-f.a+2*f.b);for(const[da,db]of E.DIRS)assert.ok(w.flowers[`${f.a+da},${f.b+db}`],'every neighbour of a placed flower exists');}
 assert.ok(fogs(w).length>6,'fog keeps spreading');E.validate(w);
});
test('the sandbox generator obeys its rules over many seeds: valid layouts, ordered towns, progressive goods, distance premiums, no town beside its own raw terrain',()=>{
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
 const lake=tilesOf(w,t=>t.terrain==='lake')[0];assert.ok(!E.passable(w,lake));w=tech(w,'quarry','sawmill','waterway');assert.ok(E.passable(w,lake));
 const [w2,s]=build(w,'sawmill');w=w2;const camp=CAMP;
 const r=E.connection(w,camp,s);for(const seg of r.segments){assert.equal(seg.cost,250*seg.factor);assert.ok(w.tiles[seg.a]&&w.tiles[seg.b],'never into fog');}
 assert.ok(!('stoneroad' in E.TECH)&&!('rail' in E.TECH)&&!('cart' in E.TECH),'roads have no tiers or capacity techs');
});
test('tech tree: buildings need their tech, prerequisites gate purchases, one-off techs cannot be rebought, craft prices follow their level',()=>{
 let w=rich(started().w);
 const rock={id:terraform(w,'rock')};
 assert.throws(()=>E.apply(w,{type:'build',tile:rock.id,buildType:'quarry'}),/先在科技树里解锁采石场/);
 assert.throws(()=>E.apply(w,{type:'tech',key:'mason'}),/先解锁锯木厂和采石场/);
 assert.throws(()=>E.apply(w,{type:'tech',key:'mine'}),/先解锁/);
 w=tech(w,'quarry');w=E.apply(w,{type:'build',tile:rock.id,buildType:'quarry'});
 assert.throws(()=>E.apply(w,{type:'tech',key:'quarry'}),/已经买过/);
 const campWorkers=Math.max(1,E.workersOf(w,'camp'));
 assert.equal(E.techCost(w,'campCraft'),campWorkers*20*30,'a craft costs 30 rounds of what it adds');w=tech(w,'campCraft');assert.equal(E.techCost(w,'campCraft'),Math.round(E.CRAFT_BASE.camp*2**E.CRAFT_GROWTH));assert.equal(E.workerPower(w,'camp'),2);assert.equal(E.workerPower(w,'quarry'),1,'craft is per building type');
 assert.ok(!E.techAvailable(w,'sawmillCraft'),'a craft needs its building');w=tech(w,'sawmill');assert.ok(E.techAvailable(w,'sawmillCraft'));assert.equal(E.techCost(w,'sawmillCraft'),E.CRAFT_BASE.sawmill,'price is based on the type and level');
 assert.equal(E.goodValue('ore'),150,'ore is worth what iron sells for');
 assert.equal(E.techCost(w,'mine'),3000);assert.equal(E.techCost(w,'smelter'),6000);
 assert.ok(!E.techAvailable(w,'mine'));w=tech(w,'mason');assert.ok(!E.techAvailable(w,'mine'));discoverFor(w,'mine');assert.ok(E.techAvailable(w,'mine'));
});
test('a mine only stands on ore, a camp only on forest, a quarry only on rock, workshops on grass',()=>{
 let w=rich(started().w);w=tech(w,'quarry','sawmill','mason','mine','smelter');terraform(w,'rock');terraform(w,'ore');
 const at=terrain=>tilesOf(w,t=>t.terrain===terrain&&!t.building)[0].id;
 assert.throws(()=>E.apply(w,{type:'build',tile:at('rock'),buildType:'mine'}),/不适合/);
 assert.throws(()=>E.apply(w,{type:'build',tile:at('grass'),buildType:'camp'}),/不适合/);
 w=E.apply(w,{type:'build',tile:at('ore'),buildType:'mine'});w=E.apply(w,{type:'build',tile:at('grass'),buildType:'smelter'});E.validate(w);
});
test('two goods sharing a road both get through; a segment has no capacity limit',()=>{
 let {w,town}=started(1);w=rich(w);w=hire(w,CAMP,3);
 w=tech(w,'quarry');terraform(w,'rock');let q;[w,q]=build(w,'quarry');w=hire(w,q,3);
 // a stone town that takes logs too, so both goods share its last segment
 let stoneTown;[w,stoneTown]=secondTown(w,{stone:30,log:25});
 w.tech.mountainPass=1;
 for(let i=0;i<6;i++)w=unlock(w);
 for(const source of [q,CAMP]){
  if(E.path(w,source,stoneTown))continue;
  let pair;
  const sources=Object.values(w.tiles).filter(t=>t.building&&(t.id===source||E.path(w,source,t.id)));
  const targets=Object.values(w.tiles).filter(t=>t.building&&(t.id===stoneTown||E.path(w,stoneTown,t.id)));
  for(const from of sources)for(const to of targets){try{E.connection(w,from.id,to.id);pair={from:from.id,to:to.id};}catch{}}
  assert.ok(pair,'a reachable building can attach the market using an independent road');
  w=E.apply(w,{type:'connect',...pair});
 }
 run(w,40);
 assert.ok(w.sold[stoneTown].stone>0&&w.sold[stoneTown].log>0,'both goods got through');
});
test('full refunds: demolishing, firing and removing roads return exactly what was paid, so the engine can always be rebuilt',()=>{
 let {w}=started(1);w=rich(w,5000);E.tick(w);const m0=w.money;
 const roadPaid=Object.values(w.edges).reduce((n,e)=>n+e.paid,0);
 w=E.apply(w,{type:'worker',tile:CAMP});w=E.apply(w,{type:'fireWorker',tile:CAMP});assert.equal(w.money,m0);
 for(const e of Object.values(w.edges))w=E.apply(w,{type:'removeRoad',edge:e.id});E.tick(w);assert.equal(w.money,m0+roadPaid);
 w=E.apply(w,{type:'demolish',tile:CAMP});assert.equal(w.money,m0+roadPaid+1200,'the start camp refunds its nominal price');
 assert.ok(w.money>=1200+500,'enough to rebuild a camp and a road');E.validate(w);
});
test('money = start - spending + refunds + goal rewards + pieces x price; every stored number stays an integer',()=>{
 let {w,town}=started(2);w=click(w,CAMP,20);run(w,15);w=hire(w,CAMP,1);w=click(w,CAMP,6);run(w,80);
 const bonus=w.money-(E.START_MONEY-w.spent+w.sold[town].log*20);
 assert.ok(bonus>0,'some goal tiers cleared and paid out');
 assert.equal(w.money,E.START_MONEY-w.spent+bonus+w.sold[town].log*20);
 assert.equal(w.earned,w.sold[town].log*20+bonus,'earned is gross sales plus goal rewards');
 const walk=(v,p)=>{if(typeof v==='number')assert.ok(isInt(v),`non-integer at ${p}: ${v}`);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,p+'.'+k);};
 walk(w,'w');E.validate(w);
});
test('save and reload is exact; invalid saves rejected',()=>{
 let {w}=started(1);w=rich(w,3000);w=hire(w,CAMP,2);w=click(w,CAMP,3);run(w,10);w=unlock(w);
 const clone=E.load(JSON.parse(JSON.stringify(w)));run(w,30);run(clone,30);assert.deepEqual(w,clone);
 assert.throws(()=>E.load({schemaVersion:11}));const bad=E.copy(w);bad.money=1.5;assert.throws(()=>E.load(bad));
 const rot=E.copy(w);const rf=rot.flowers['0,0']; // The fixed starting ring is asymmetric; generated rings may be rotationally symmetric.
 rf.rotation=(rf.rotation+1)%6;assert.throws(()=>E.load(rot),/不一致/);
 const noFog=E.copy(w);delete noFog.flowers[fogs(w)[0]];assert.throws(()=>E.load(noFog),/迷雾缺失/);
});

test('manual production follows the workshop craft, independent of crew; no golden finger remains',()=>{
 let w=rich(fresh());assert.equal(E.clickPower(w,w.tiles[CAMP]),1);w=hire(w,CAMP,3);w.tech.campCraft=3;assert.equal(E.clickPower(w,w.tiles[CAMP]),4);w=click(w,CAMP);assert.equal(w.tiles[CAMP].loose.log,4);assert.ok(!E.TECH.tools);assert.equal(E.clickPower(w,w.tiles[TOWN]),0);
});

function explored(seed,n){let w=rich(fresh(seed));for(let i=0;i<n;i++){const fid=fogs(w).sort()[i%fogs(w).length];w=unlock(w,fid);}return w;}
const sandbox=w=>Object.values(w.flowers).filter(f=>f.state==='placed'&&f.order>E.TUTORIAL);
const gap=(a,b)=>Math.max(Math.abs(a.a-b.a),Math.abs(a.b-b.b),Math.abs(a.a+a.b-b.a-b.b));
test('chapter maps leave building space and a passable boundary while keeping required raw off market flowers',()=>{
 for(const seed of [1,2,3,4,5]){const w=explored(seed,14);for(const f of sandbox(w)){const ts=[f.design.center,...f.design.ring];assert.ok(E.validDesign(ts));assert.ok(ts.filter(t=>['mountain','lake'].includes(t)).length<=3);if(f.design.buys)for(const r of Object.keys(f.design.buys))assert.ok(!ts.some(t=>E.RAW[r].includes(t)));}}
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

// ---------- building-to-building roads ----------
test('roads only connect buildings and choose their route automatically',()=>{
 let w=unlock(rich(fresh(1)));const town=TOWN;
 const open=tilesOf(w,t=>!t.building&&t.terrain!=='mountain'&&E.route(w,CAMP,t.id)?.segments.length===2)[0];
 assert.throws(()=>E.apply(w,{type:'connect',from:CAMP,to:open.id}),/两个有建筑/);
 assert.throws(()=>E.apply(w,{type:'connect',from:open.id,to:town}),/两个有建筑/);
 const planned=E.connection(w,CAMP,town);
 w=E.apply(w,{type:'connect',from:CAMP,to:town});
 assert.ok(planned.tiles.every((id,i)=>!i||w.edges[E.edgeId(planned.tiles[i-1],id)]));
 assert.ok(E.path(w,CAMP,town),'camp reaches the town');
 w=hire(w,CAMP,1);run(w,60);assert.ok(w.sold[town].log>0,'logs sold over the planned road');
 const other=townTiles(w)[1];if(other)assert.ok(E.connection(w,town,other));
 const loose=tilesOf(w,t=>!t.building&&!E.anchored(w,t.id))[0];
 assert.throws(()=>E.apply(w,{type:'connect',from:loose.id,to:town}),/两个有建筑/);
 assert.throws(()=>E.apply(w,{type:'connect',from:CAMP,to:tilesOf(w,t=>t.terrain==='mountain')[0].id}),/两个有建筑/);
 E.validate(w);
});
test('removing any segment marks its whole connected road and refunds every segment',()=>{
 const w=E.newWorld(1),ids=Object.keys(w.edges),paid=ids.reduce((sum,id)=>sum+w.edges[id].paid,0);
 assert.ok(ids.length>1);
 E.command(w,{type:'removeRoad',edge:ids[0]});
 assert.ok(ids.every(id=>w.edges[id].removing));
 E.command(w,{type:'restoreRoad',edge:ids.at(-1)});
 assert.ok(ids.every(id=>!w.edges[id].removing));
 E.command(w,{type:'removeRoad',edge:ids.at(-1)});
 const before=w.money;E.tick(w);
 assert.ok(ids.every(id=>!w.edges[id]));
 assert.equal(w.money,before+paid);
});
test('no relays: the building list is workshops only and the old relay type is unknown',()=>{
 assert.ok(!E.BUILDINGS.includes('relay'));assert.equal(E.RECIPES.relay,undefined);assert.equal(E.PRICE.relay,undefined);
 let w=rich(fresh(1));const g=tilesOf(w,t=>!t.building&&t.terrain==='grass')[0];
 assert.throws(()=>E.apply(w,{type:'build',tile:g.id,buildType:'relay'}),/未知建筑/);
});

test('ore is introduced with the iron chapter, not as an early random distraction',()=>{
 for(let seed=1;seed<=20;seed++){let w=rich(fresh(seed));for(let n=1;n<=8;n++){w=unlock(w);if(n<8)assert.ok(!E.terrainsOn(w).has('ore'));}assert.ok(E.terrainsOn(w).has('ore'));}
});

test('production earns full sales revenue; disconnected and full workshops never charge money',()=>{
 let {w}=started(1);w=hire(rich(w),CAMP,2);run(w,60);
 assert.equal(E.income(w),40);assert.ok(w.stats.every(s=>s.income===s.gross));
 for(const edge of Object.values(w.edges))w=E.apply(w,{type:'removeRoad',edge:edge.id});
 run(w,60);const money=w.money;run(w,100);assert.equal(w.money,money);
 assert.equal(w.tiles[CAMP].loose.log,320);E.validate(w);
});
test('the connected opening can idle without debt, and manual production is free',()=>{
 let {w}=started(1);const money=w.money;run(w,200);assert.equal(w.money,money);assert.equal(E.steady(w),0);
 w=click(w,CAMP,20);assert.equal(w.money,money);run(w,30);assert.ok(w.money>=money+400);E.validate(w);
});
test('a zero balance does not stop production or become negative',()=>{
 let {w}=started(1);w=hire(rich(w),CAMP,1);w.money=0;
 assert.throws(()=>E.apply(w,{type:'worker',tile:CAMP}),/金币不足/);run(w,1);assert.ok(w.money>0);w=click(w,CAMP);
 for(let i=0;i<30;i++){E.tick(w);assert.ok(w.money>=0);}assert.ok(w.money>0);E.validate(w);
});
test('legacy saves keep progress and positive balances, clear maintenance debt and reset the income window once',()=>{
 let {w}=started(1);w=hire(rich(w),CAMP,1);run(w,40);
 for(const version of [19,20])for(const money of [-50,250]){
  const old=E.copy(w);old.schemaVersion=version;old.money=money;old.upkeep=100;
  if(version===19){delete old.upkeep;old.wages=60;old.tollPaid=40;old.tech.fleet=1;}
  const loaded=E.load(old);assert.equal(loaded.schemaVersion,25);assert.equal(loaded.money,Math.max(0,money));
  assert.deepEqual(loaded.tiles,w.tiles);assert.equal(loaded.stats.length,0);assert.equal(loaded.upkeep,undefined);
  const original=E.copy(loaded);assert.deepEqual(E.load(loaded),original);run(loaded,60);assert.equal(E.income(loaded),20);
 }
 const bad=E.copy(w);bad.money=-1;assert.throws(()=>E.load(bad));
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

test('discovery follows tech order and supplies the market on the next tile across seeds and directions',()=>{
 for(let seed=1;seed<=1000;seed++){let w=rich(fresh(seed));const expected=['stone',null,'board',null,'tool',null,'iron',null];for(let n=1;n<=8;n++){const slot=fogs(w)[(seed+n*3)%fogs(w).length];w=unlock(w,slot);const f=w.flowers[slot],ts=[f.design.center,...f.design.ring];if(expected[n-1])assert.deepEqual(Object.keys(f.design.buys),[expected[n-1]]);else assert.ok(ts.includes(n===2||n===6?'rock':n===4?'forest':'ore'));E.validate(w);}}
});

test('the goal ladder steps so every tier costs the same effort: rates double, counts step by one',()=>{
 const rates=E.GOALS.filter(g=>g.step===2),counts=E.GOALS.filter(g=>g.step===1);
 assert.equal(rates.length,1);assert.equal(counts.length,1);
 for(const g of rates){
  assert.equal(E.goalTarget(g,1),g.base,'tier 1 is the base');
  for(let t=1;t<12;t++)assert.equal(E.goalTarget(g,t+1),E.goalTarget(g,t)*2,g.id+' doubles');
  assert.equal(E.goalFloor(g,1),0);assert.equal(E.goalFloor(g,5),E.goalTarget(g,4));}
 for(const g of counts)for(let t=1;t<12;t++)assert.equal(E.goalTarget(g,t+1),E.goalTarget(g,t)+1,g.id+' steps by one');
 assert.deepEqual(E.GOALS.map(g=>g.id),['income','map']);
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
 let {w}=started(3);w=hire(rich(w),CAMP,2);run(w,40);w=E.apply(w,{type:'fireWorker',tile:CAMP});w=E.apply(w,{type:'fireWorker',tile:CAMP});
 const peak=E.copy(w.goals);assert.ok(peak.income>1,'sales cleared at least one income tier');
 const money=w.money;
 run(w,E.WINDOW+5); // no clicks, no workers: every rate falls back to zero
 assert.equal(E.GOALS.find(g=>g.id==='income').value(w),0);
 for(const id of Object.keys(peak))assert.ok(w.goals[id]>=peak[id],id+' never steps back');
 assert.ok(w.money>=money,'a collapsed engine still cannot lose a cleared tier');
});
test('exploration rewards can fund a short connection without growing without bound',()=>{
 let {w}=started(4);
 for(const ticks of [0,30,60,120]){
  run(w,ticks);
  assert.ok(E.goalReward(w)>=800&&E.goalReward(w)<=1200);}
 w=rich(w,1e9);w=hire(w,CAMP,3);run(w,60);
 assert.ok(E.goalReward(w)<=1200,'late rewards remain capped');
});
