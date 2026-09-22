const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const run=(w,ticks)=>{for(let i=0;i<ticks;i++)E.tick(w);return w;};
const fresh=(seed=1)=>E.newWorld(seed);
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
function started(seed=1){let w=fresh(seed);w=unlock(w);const town=townTiles(w)[0];w=E.apply(w,{type:'connect',from:CAMP,to:town});return{w,town};}

test('start: one seven-hex flower, one camp on its forest, no town, six fog flowers, 2000 coins',()=>{
 const w=fresh();assert.equal(w.money,2000);assert.equal(Object.keys(w.tiles).length,7);
 assert.equal(w.tiles[CAMP].building.type,'camp');assert.equal(w.tiles[CAMP].terrain,'forest');assert.equal(w.tiles[CAMP].building.paid,1200);
 assert.equal(townTiles(w).length,0);assert.equal(fogs(w).length,6);
 const terrains=Object.values(w.tiles).map(t=>t.terrain).sort();assert.deepEqual(terrains,['forest','grass','grass','mountain','ore','rock','rock']);
 const ore=tilesOf(w,t=>t.terrain==='ore')[0],mt=tilesOf(w,t=>t.terrain==='mountain')[0];assert.ok(E.adjacent(ore,mt),'the start ore sits next to the mountain');
 run(w,30);assert.equal(w.production.log,0,'no workers, no output');E.validate(w);
});
test('clicks make pieces up to a full yard; the yard milestone fires; a click on a workshop needs every input',()=>{
 let w=click(fresh(),CAMP,20);assert.equal(w.tiles[CAMP].loose.log,20);
 assert.throws(()=>E.apply(w,{type:'click',tile:CAMP}),/堆场已满/);
 E.tick(w);assert.ok(w.milestones.click&&w.milestones.yard);
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
test('any fog flower can be unlocked in any direction; the n-th unlock is always tutorial flower n; prices follow the unlock order',()=>{
 const slots=fogs(fresh());
 for(const slot of slots){let w=fresh();assert.equal(E.flowerCost(w),500);w=unlock(w,slot);const f=w.flowers[slot];assert.equal(f.order,1);assert.deepEqual(f.design.buys,{log:20});assert.ok(!f.design.ring.concat(f.design.center).includes('forest'),'F1 never has forest');}
 let w=rich(fresh());const expect=[[{log:20},500],[{stone:30},2000],[{board:50},5000],[{tool:120,board:30},15000],[{iron:150},40000]];
 for(const[buys,cost]of expect){assert.equal(E.flowerCost(w),cost);const before=w.money;const slot=fogs(w)[fogs(w).length-1];w=unlock(w,slot);assert.deepEqual(w.flowers[slot].design.buys,buys);assert.equal(before-w.money,cost);}
 // Sandbox flowers cost 30 rounds of the current income, never below the floor: with no sales yet it is the floor.
 assert.equal(E.flowerCost(w),E.FLOWER_MIN);
 run(w,10);for(const s of w.stats)s.income=400;
 assert.equal(E.flowerCost(w),400*E.PAYBACK);const slot=fogs(w).find(k=>w.flowers[k].hint==='town');assert.equal(E.flowerCost(w,w.flowers[slot]),400*E.PAYBACK);const money=w.money;w=unlock(w,slot);assert.equal(money-w.money,400*E.PAYBACK);
});
test('the tutorial generator satisfies its constraints over a thousand seeds',()=>{
 const forbid=[['forest','lake','ore'],['rock','lake','ore'],['forest','lake','ore'],['forest','rock','ore'],['forest','lake','ore']];
 for(let seed=1;seed<=1000;seed++){const w=fresh(seed),f=w.flowers['1,0'];for(let n=1;n<=5;n++){const d=E.generateFlower(w,n,f).design;const tiles=[d.center,...d.ring];
  assert.ok(E.validDesign(tiles),`seed ${seed} F${n} invalid`);
  for(const t of forbid[n-1])assert.ok(!tiles.includes(t),`seed ${seed} F${n} has ${t}`);
  assert.equal(tiles.filter(t=>t==='town').length,1);
  for(const[t,k]of Object.entries(E.TUTORIAL_SPEC[n-1].must))assert.ok(tiles.filter(x=>x===t).length>=k,`seed ${seed} F${n} lacks ${t}`);
  assert.ok(Object.keys(d.buys).length<=2);
  const same=E.generateFlower(w,n,f);assert.deepEqual(same.design,d,'generation is deterministic');}}
});
test('the sandbox generator obeys its rules over many seeds: valid layouts, towns spaced, goods the player can make, prices rise with distance, no town beside its own raw terrain',()=>{
 for(let seed=1;seed<=150;seed++){let w=rich(fresh(seed));for(let i=0;i<5;i++)w=unlock(w);
  for(let i=0;i<10;i++){const slot=fogs(w)[i%fogs(w).length];w=unlock(w,slot);const f=w.flowers[slot],tiles=[f.design.center,...f.design.ring];
   assert.ok(E.validDesign(tiles),`seed ${seed} unlock ${f.order} invalid`);
   if(f.hint==='town')assert.ok(f.design.buys,`seed ${seed}: town fog without a town`);if(f.hint==='resource')assert.ok(!f.design.buys,`seed ${seed}: resource fog with a town`);
   if(f.design.buys){for(const[r,p]of Object.entries(f.design.buys)){assert.ok(E.SELLABLE.includes(r));assert.ok(p>=E.BASE_PRICE[r]*.6-1,'price never below the distance-scaled base');for(const raw of E.RAW[r])assert.ok(!tiles.includes(raw),`seed ${seed}: town buying ${r} shares a flower with ${raw}`);}}
   else if(f.hint==='unknown'){// An unknown back turns into a town after three townless unlocks, unless a sandbox town or a town-hinted fog is next door.
    const since=f.order-Math.max(0,...Object.values(w.flowers).filter(g=>g.state==='placed'&&g.design.buys&&g.order<f.order).map(g=>g.order));
    const crowded=Object.values(w.flowers).some(g=>g.id!==f.id&&((g.state==='placed'&&g.order>E.TUTORIAL&&g.design.buys)||(g.state==='fog'&&g.hint==='town'))&&Math.max(Math.abs(f.a-g.a),Math.abs(f.b-g.b),Math.abs(f.a+f.b-g.a-g.b))<=1);
    assert.ok(since<3||crowded,`seed ${seed}: unknown flower ${f.order} with room stayed townless after ${since} unlocks`);}
   assert.ok(fogs(w).some(k=>w.flowers[k].hint==='town'),'a town is always on offer');
   for(const o of tiles.map((t,i)=>t==='ore'?i:-1).filter(i=>i>=0))assert.ok(tiles.some((t,i)=>t==='mountain'&&i!==o),'ore only with a mountain');}
  E.validate(w);}
});
test('the start budget always covers the first road: for every direction and a hundred seeds the engine lays the first flower so a road from the camp to its town is affordable',()=>{
 for(let seed=1;seed<=100;seed++)for(const slot of fogs(fresh())){let w=fresh(seed);w=E.apply(w,{type:'explore',flower:slot});const f=w.flowers[slot];
  assert.equal(f.state,'placed');const town=townTiles(w)[0];const r=E.route(w,CAMP,town);assert.ok(r&&r.cost<=w.money,`seed ${seed} slot ${slot}: first road costs ${r?.cost} with ${w.money}`);}
});
test('no rotating: exploring lays the flower at once, joined to the map by passable land; rotate and place are unknown commands',()=>{
 let w=fresh();const slot=fogs(w)[2];w=E.apply(w,{type:'explore',flower:slot});
 assert.equal(w.flowers[slot].state,'placed');assert.equal(w.preview,null);assert.equal(Object.keys(w.tiles).length,14);
 assert.throws(()=>E.apply(w,{type:'rotate',flower:slot,dir:1}),/未知操作/);assert.throws(()=>E.apply(w,{type:'place',flower:slot}),/未知操作/);
 // Every flower ever placed touches the rest of the map through at least one passable pair of tiles.
 for(const seed of [1,2,3]){let v=rich(fresh(seed));for(let i=0;i<12;i++)v=unlock(v);
  for(const f of Object.values(v.flowers).filter(f=>f.state==='placed'&&f.order)){const mine=E.flowerTiles(f).map(p=>v.tiles[`${p.q},${p.r}`]);
   assert.ok(mine.some(t=>E.passable(v,t)&&E.DIRS.some(([dq,dr])=>{const u=v.tiles[`${t.q+dq},${t.r+dr}`];return u&&u.flower!==f.id&&E.passable(v,u);})),`seed ${seed} flower ${f.id} is walled off`);}}
 E.tick(w);assert.equal(w.tick,1);
});
test('roads: no segment through a mountain, none onto a lake before the waterway tech, none into fog; cost is 250 x terrain regardless of road level',()=>{
 let w=rich(fresh(3));for(let i=0;i<4;i++)w=unlock(w);
 assert.ok(tilesOf(w,t=>t.terrain==='lake').length>=2,'F4 brought lakes');
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
 let w=rich(fresh());
 const rock=tilesOf(w,t=>t.terrain==='rock')[0];
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
 let w=rich(fresh());w=tech(w,'quarry','sawmill','mason','mine','smelter');
 const at=terrain=>tilesOf(w,t=>t.terrain===terrain&&!t.building)[0].id;
 assert.throws(()=>E.apply(w,{type:'build',tile:at('rock'),buildType:'mine'}),/不适合/);
 assert.throws(()=>E.apply(w,{type:'build',tile:at('grass'),buildType:'camp'}),/不适合/);
 w=E.apply(w,{type:'build',tile:at('ore'),buildType:'mine'});w=E.apply(w,{type:'build',tile:at('grass'),buildType:'smelter'});E.validate(w);
});
test('freight goes to the most valuable door: a mason outbids the log-buying town next door',()=>{
 let {w,town}=started(1);w=rich(w);w=hire(w,CAMP,3);
 let m;[w,m]=build(w,'mason');w=E.apply(w,{type:'connect',from:CAMP,to:m});
 // Give the mason a reachable buyer of tools so its logs are worth 120 at the door.
 let slot=fogs(w).find(k=>true);for(let i=0;i<3;i++){w=unlock(w,fogs(w)[0]);}
 const toolTown=townTiles(w).find(k=>w.tiles[k].building.buys.tool);assert.ok(toolTown,'F4 brings a tool buyer');
 w=tech(w,'waterway');w=E.apply(w,{type:'connect',from:m,to:toolTown});
 const ds=E.demands(w);const masonLog=ds.find(d=>d.tile===m&&d.r==='log'),townLog=ds.find(d=>d.tile===town&&d.r==='log');
 assert.equal(masonLog.value,120);assert.equal(townLog.value,20);assert.ok(ds.indexOf(masonLog)<ds.indexOf(townLog),'higher value first');
 run(w,12);assert.ok(w.tiles[m].loose.log>0||w.consumption.log>w.sold[town].log,'the mason gets logs before the town');
});
test('two goods sharing a road both get through; a segment has no capacity limit',()=>{
 let {w,town}=started(1);w=rich(w);w=hire(w,CAMP,3);
 w=tech(w,'quarry');let q;[w,q]=build(w,'quarry');w=hire(w,q,3);
 w=unlock(w);const stoneTown=townTiles(w).find(k=>w.tiles[k].building.buys.stone);
 // let the stone town take logs too so both goods share its last segment
 w.tiles[stoneTown].building.buys.log=25;
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
 for(let i=0;i<3;i++)w=unlock(w);const toolTown=townTiles(w).find(k=>w.tiles[k].building.buys.tool);
 assert.equal(E.residentCost(w,toolTown),2*(120+30)*30);
 const extra=townTiles(w).reduce((n,k)=>n+w.tiles[k].building.residents*Object.values(w.tiles[k].building.buys).reduce((a,p)=>a+p,0),0);
 assert.equal(E.techCost(w,'era'),Math.round(extra*2*30),'an era costs 30 rounds of what it adds');
 w=tech(w,'era');assert.equal(E.buys(w,town).log.rate,12,'3 residents x 2 x era 2');assert.equal(E.residentCost(w,toolTown),Math.round(2*2*(120+30)*30));
 const b=w.tiles[toolTown].building;run(w,60);assert.equal(b.demand.tool,E.buys(w,toolTown).tool.pool,'pool capped');E.validate(w);
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
test('money = start - spending + refunds + milestones + pieces x price; every stored number stays an integer',()=>{
 let {w,town}=started(2);w=click(w,CAMP,20);run(w,15);w=hire(w,CAMP,1);w=click(w,CAMP,6);run(w,80);
 const bonus=E.MILESTONES.filter(m=>w.milestones[m.id]).reduce((n,m)=>n+m.reward,0);
 assert.equal(w.money,2000-w.spent+bonus+w.sold[town].log*20);
 const walk=(v,p)=>{if(typeof v==='number')assert.ok(isInt(v),`non-integer at ${p}: ${v}`);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,p+'.'+k);};
 walk(w,'w');E.validate(w);
});
test('the projection\'s first steps reproduce in the engine: 20 clicks sell for 400, the first worker is affordable at once',()=>{
 let w=click(fresh(),CAMP,20);w=unlock(w);const town=townTiles(w)[0];
 w=E.apply(w,{type:'connect',from:CAMP,to:town});const after=w.money;
 run(w,15);const sold=w.sold[town].log;assert.ok(sold>=20,'all twenty logs sold within a few rounds');
 assert.ok(w.money>=after+400,'twenty logs are one worker');
 w=hire(w,CAMP,1);run(w,30);assert.ok(E.income(w)>=18&&E.income(w)<=22,'one worker feeds a level-0 town at 20/round: '+E.income(w));
});
test('save and reload is exact; invalid saves rejected',()=>{
 let {w}=started(1);w=rich(w,3000);w=hire(w,CAMP,2);w=click(w,CAMP,3);run(w,10);w=unlock(w);
 const clone=E.load(JSON.parse(JSON.stringify(w)));run(w,30);run(clone,30);assert.deepEqual(w,clone);
 assert.throws(()=>E.load({schemaVersion:11}));const bad=E.copy(w);bad.money=-5;assert.throws(()=>E.load(bad));
 const rot=E.copy(w);Object.values(rot.flowers).find(f=>f.state==='placed'&&f.order).rotation++;assert.throws(()=>E.load(rot),/不一致/);
 const noFog=E.copy(w);delete noFog.flowers[fogs(w)[0]];assert.throws(()=>E.load(noFog),/迷雾缺失/);
});

test('a click scales with the economy: never below 1 + tools, otherwise half a round of automatic output',()=>{
 let w=fresh();assert.equal(E.clickPower(w,w.tiles[CAMP]),1);
 w=rich(w);w=hire(w,CAMP,3);w.tech.campCraft=3;assert.equal(E.clickPower(w,w.tiles[CAMP]),6,'3 workers x 4 = 12 per round, half is 6');
 w.tech.tools=7;assert.equal(E.clickPower(w,w.tiles[CAMP]),8,'the golden finger is a floor');
 w=click(w,CAMP);assert.equal(w.tiles[CAMP].loose.log,8);});

test('a click on a town adds half a round of demand for every good it buys, capped by the pool',()=>{
 let {w,town}=started(1);const b=()=>w.tiles[town].building;const pool=E.buys(w,town).log.pool;
 w.tiles[town].building.demand.log=0;assert.equal(E.clickPower(w,w.tiles[town]),1,'one resident takes 2 a round, half is 1');
 w=E.apply(w,{type:'click',tile:town});assert.equal(b().demand.log,1);assert.equal(w.clicks,1);
 w=rich(w);w=E.apply(w,{type:'resident',tile:town});w=E.apply(w,{type:'resident',tile:town});assert.equal(E.clickPower(w,w.tiles[town]),3);
 w.tiles[town].building.demand.log=E.buys(w,town).log.pool;assert.throws(()=>E.apply(w,{type:'click',tile:town}),/需求还没用完/);
 w.tiles[town].building.demand.log=E.buys(w,town).log.pool-1;w=E.apply(w,{type:'click',tile:town});assert.equal(b().demand.log,E.buys(w,town).log.pool,'clipped at the pool');
 // Clicking the town drains a full yard that the residents alone could not: the goods are dispatched at once.
 w.tiles[town].building.demand.log=0;w=click(w,CAMP,20);const before=w.money;for(let i=0;i<10;i++)w=E.apply(w,{type:'click',tile:town});run(w,20);assert.ok(w.money>before,'the clicked-for logs sold');});

test('a long road delays freight but never caps it: the pipeline target adds one round of output per round of travel',()=>{
 let w=rich(fresh());w.tech.sawmill=1;w.tech.campCraft=1;w.tech.sawmillCraft=1;w=hire(w,CAMP,3);
 for(let i=0;i<3;i++)w=unlock(w);
 const town=townTiles(w).find(k=>w.tiles[k].building.buys.board);const f=w.flowers[w.tiles[town].flower];
 const far=E.flowerTiles(f).map(p=>`${p.q},${p.r}`).filter(k=>w.tiles[k].terrain==='grass').map(k=>({k,d:E.hexDist(w.tiles[k],w.tiles[CAMP])})).sort((a,b)=>b.d-a.d)[0].k;
 w=E.apply(w,{type:'build',tile:far,buildType:'sawmill'});w=E.apply(w,{type:'connect',from:CAMP,to:far});w=E.apply(w,{type:'connect',from:far,to:town});w=hire(w,far,3);
 w=E.apply(w,{type:'resident',tile:town});w=E.apply(w,{type:'resident',tile:town});
 const t=w.tiles[far],hops=E.transit(w,t,'log');assert.ok(hops>=3,`far enough: ${hops} segments`);
 assert.equal(E.pipeline(w,t,'log'),E.buffer(w,t)+E.rate(w,t)*hops);
 run(w,90);const S=w.stats,out=S.reduce((n,s)=>n+(s.tiles[far]||0),0)/S.length;
 assert.ok(out>=E.rate(w,t)*.95,`sawmill runs at capacity over a ${hops}-segment road: ${out.toFixed(2)} of ${E.rate(w,t)}`);});

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
   if(f.design.buys){assert.ok(!tiles.some(t=>['forest','rock','ore'].includes(t)),`town flower ${f.id} carries raw (seed ${seed})`);assert.ok(tiles.filter(t=>t==='grass').length<=3);}}}
});
test('sparse maps: a town back is honoured, and an unknown back next to a town-hinted fog stays townless',()=>{
 for(const seed of [1,2,3]){const w=explored(seed,12);
  for(const f of sandbox(w))if(f.hint==='town')assert.ok(f.design.buys,`${f.id} promised a town (seed ${seed})`);
  for(const f of Object.values(w.flowers))if(f.state==='fog'&&f.hint==='town')for(const g of sandbox(w))if(g.design.buys)assert.ok(gap(f,g)>=2,'a town hint never sits next to a sandbox town');}
});
test('demand-aware generation: raw the towns buy but the map lacks is drawn more often; same state, same flower',()=>{
 let w=explored(1,6);
 // Strip every rock from the map and make every town buy stone: rock is now in deficit.
 for(const t of Object.values(w.tiles))if(t.terrain==='rock'&&!t.building){t.terrain='grass';const f=w.flowers[t.flower];const tiles=E.flowerTiles(f).find(p=>p.q===t.q&&p.r===t.r);if(tiles.slot===0)f.design.center='grass';else f.design.ring[tiles.slot-1]='grass';}
 for(const t of Object.values(w.tiles))if(t.building?.type==='town'){t.building.buys={stone:30};w.flowers[t.flower].design.buys={stone:30};}
 assert.ok(E.rawDeficit(w).rock>=1);
 const fid=fogs(w).find(k=>w.flowers[k].hint==='resource')||fogs(w)[0];
 const a=E.apply(w,{type:'explore',flower:fid}),b=E.apply(w,{type:'explore',flower:fid});
 assert.deepEqual(a.flowers[fid].design,b.flowers[fid].design,'generation is a pure function of seed, order and world');
 // Over many seeds a resource flower drawn under a rock deficit carries rock far more often than not.
 let withRock=0,total=0;for(let seed=1;seed<=12;seed++){let v=explored(seed,6);for(const t of Object.values(v.tiles))if(t.terrain==='rock'&&!t.building){t.terrain='grass';const f=v.flowers[t.flower];const p=E.flowerTiles(f).find(p=>p.q===t.q&&p.r===t.r);if(p.slot===0)f.design.center='grass';else f.design.ring[p.slot-1]='grass';}
  for(const t of Object.values(v.tiles))if(t.building?.type==='town'){t.building.buys={stone:30};v.flowers[t.flower].design.buys={stone:30};}
  const k=fogs(v).find(k=>v.flowers[k].hint==='resource');if(!k)continue;const d=E.apply(v,{type:'explore',flower:k}).flowers[k].design;total++;if([d.center,...d.ring].includes('rock'))withRock++;}
 assert.ok(withRock/total>=.75,`rock drawn in ${withRock}/${total} deficit flowers`);
});

// ---------- relays ----------
test('relay: a road node on any passable tile, no tech; roads may end at it, freight passes through it, it neither produces nor hires, demolish refunds',()=>{
 let w=unlock(fresh(1));const town=townTiles(w)[0];w=rich(w);
 const g=tilesOf(w,t=>!t.building&&t.terrain==='grass'&&t.flower!=='0,0')[0];
 w=E.apply(w,{type:'build',tile:g.id,buildType:'relay'});assert.equal(w.tiles[g.id].building.type,'relay');assert.equal(w.tiles[g.id].building.paid,E.PRICE.relay);
 assert.throws(()=>E.apply(w,{type:'click',tile:g.id}),/驿站/);assert.throws(()=>E.apply(w,{type:'worker',tile:g.id}),/工坊/);
 assert.throws(()=>E.apply(w,{type:'build',tile:tilesOf(w,t=>t.terrain==='mountain')[0].id,buildType:'relay'}),/不适合/);
 // Camp to relay, relay to town: the freight path runs through the relay.
 w=E.apply(w,{type:'connect',from:CAMP,to:g.id});w=E.apply(w,{type:'connect',from:g.id,to:town});
 assert.ok(E.path(w,CAMP,town),'camp reaches the town over the relay');
 w=hire(w,CAMP,1);run(w,60);assert.ok(w.sold[town].log>0,'logs sold through the relay');
 assert.ok(!E.demands(w).some(d=>d.tile===g.id),'a relay asks for nothing');
 const m=w.money;w=E.apply(w,{type:'demolish',tile:g.id});assert.equal(w.money,m+E.PRICE.relay);assert.equal(w.tiles[g.id].building,null);
 E.validate(w);
});
