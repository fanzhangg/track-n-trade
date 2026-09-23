function discoverFor(w,key){for(let i=0;E.techDiscoveryReason(w,key)&&i<20;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
function world(seed=7){const w=E.newWorld(seed);w.money=1e8;w.tiles[E.START_TILE].building=null;w.edges={};return w;}
function unlock(w,key){for(const dep of E.TECH[key].requires)if(!w.tech[dep])unlock(w,dep);if(!w.tech[key]){discoverFor(w,key);E.command(w,{type:'tech',key});}}
function terrain(w,t,type){t.terrain=type;const f=w.flowers[t.flower],slot=E.flowerTiles(f).find(p=>`${p.q},${p.r}`===t.id).slot;if(slot===0)f.design.center=type;else f.design.ring[slot-1]=type;}
function build(w,type,land){if(type!=='camp')unlock(w,type);const t=Object.values(w.tiles).find(t=>!t.building&&t.terrain==='grass');terrain(w,t,land);E.command(w,{type:'build',tile:t.id,buildType:type});return t;}
function crew(w,t,n){while(t.building.workers.length<n)E.command(w,{type:'worker',tile:t.id});}
function stock(w,t,r,n){t.loose[r]+=n;w.initial[r]+=n;}
test('all new research is gated, paid once, saveable and rejects invalid prerequisites',()=>{
 for(const key of Object.keys(E.RESEARCH)){
  const w=world();const before=E.copy(w);assert.throws(()=>E.command(w,{type:'tech',key}),/先解锁/);assert.deepEqual(w,before);
  for(const dep of E.TECH[key].requires)unlock(w,dep);
  const poor=E.copy(w);poor.money=0;assert.throws(()=>E.command(poor,{type:'tech',key}));assert.equal(poor.tech[key],0);
  const money=w.money;E.command(w,{type:'tech',key});assert.equal(money-w.money,E.TECH[key].cost);
  assert.throws(()=>E.command(w,{type:'tech',key}),/已经买过/);assert.deepEqual(E.load(w),w);
  w.tech[E.TECH[key].requires[0]]=0;assert.throws(()=>E.validate(w),/研究前置/);
 }
});
test('v22 migration preserves progress, freight and money; v23 missing keys stay invalid',()=>{
 const w=world();E.command(w,{type:'build',tile:E.START_TILE,buildType:'camp'});E.command(w,{type:'connect',from:E.START_TILE,to:E.START_TOWN});crew(w,w.tiles[E.START_TILE],1);E.tick(w);
 const old=E.copy(w);old.schemaVersion=22;for(const key of Object.keys(E.RESEARCH))delete old.tech[key];
 const loaded=E.load(old);assert.deepEqual(loaded,w);assert.deepEqual(E.load(loaded),loaded);assert.equal(old.schemaVersion,22);
 delete loaded.tech.deepMining;assert.throws(()=>E.load(loaded),/科技无效/);
});
test('road research affects quoted and paid prices, existing refunds and mountain access',()=>{
 const w=world();E.command(w,{type:'build',tile:E.START_TILE,buildType:'camp'});E.command(w,{type:'connect',from:E.START_TILE,to:E.START_TOWN});
 const old=Object.values(w.edges).map(e=>({...e}));unlock(w,'roadEngineering');E.tick(w);
 for(const e of old){const money=w.money;E.command(w,{type:'removeRoad',edge:e.id});E.tick(w);assert.equal(w.money-money,e.paid);}
 const quote=E.connection(w,E.START_TILE,E.START_TOWN);assert.equal(quote.cost,600);
 const money=w.money;E.command(w,{type:'connect',from:E.START_TILE,to:E.START_TOWN});assert.equal(money-w.money,quote.cost);
 const m=Object.values(w.tiles).find(t=>t.terrain==='mountain');assert.throws(()=>E.connection(w,E.START_TILE,m.id),/山地工程/);
 unlock(w,'mountainPass');const route=E.connection(w,E.START_TILE,m.id);assert.ok(route.segments.some(s=>s.factor===4&&s.cost===800));
 E.command(w,{type:'connect',from:E.START_TILE,to:m.id});assert.ok(E.path(w,E.START_TILE,m.id));
 assert.throws(()=>E.command(w,{type:'build',tile:m.id,buildType:'mine'}),/不适合/);E.validate(w);
});
test('water road discounts stack, with preview and actual purchase matching',()=>{
 const w=world();E.command(w,{type:'build',tile:E.START_TILE,buildType:'camp'});
 const lake=w.tiles['0,0'];terrain(w,lake,'lake');unlock(w,'waterway');
 assert.equal(E.connection(w,E.START_TILE,lake.id).cost,750);unlock(w,'navigation');assert.equal(E.connection(w,E.START_TILE,lake.id).cost,500);
 unlock(w,'roadEngineering');assert.equal(E.connection(w,E.START_TILE,lake.id).cost,400);
 const money=w.money;E.command(w,{type:'connect',from:E.START_TILE,to:lake.id});assert.equal(money-w.money,400);E.validate(w);
});
test('deep mining only increases employed miners; ore is not saleable and storage never stops production',()=>{
 const w=world(),mine=build(w,'mine','ore');unlock(w,'deepMining');assert.equal(E.rate(w,mine),0);crew(w,mine,2);
 assert.equal(E.rate(w,mine),6);assert.equal(E.clickPower(w,mine),1);
 const ironworks=build(w,'smelter','grass');crew(w,ironworks,2);assert.equal(E.rate(w,ironworks),4);assert.equal(E.clickPower(w,ironworks),1);
 for(let i=0;i<10;i++)E.tick(w);assert.equal(mine.loose.ore,60);assert.equal(w.stats.at(-1).tiles[mine.id]||0,6);assert.equal(w.stats.at(-1).income,0);E.validate(w);
});
test('research bonus feeds reservations and supports actual sustained sales without losing goods',()=>{
 const w=world();E.command(w,{type:'build',tile:E.START_TILE,buildType:'camp'});const camp=w.tiles[E.START_TILE],mill=build(w,'sawmill','grass');
 crew(w,camp,3);crew(w,mill,3);w.tech.campCraft=4;unlock(w,'specialization');
 E.command(w,{type:'connect',from:camp.id,to:mill.id});E.command(w,{type:'connect',from:mill.id,to:E.START_TOWN});
 const town=w.tiles[E.START_TOWN];town.building.buys={board:50};w.flowers[town.flower].design.buys={board:50};town.building.residents=3;w.tech.era=4;
 assert.equal(E.rate(w,mill),9);
 for(let i=0;i<120;i++){E.tick(w);E.validate(w);}
 assert.equal(w.stats.reduce((n,s)=>n+s.sales[town.id].board,0)/E.WINDOW,9);
 assert.equal(E.income(w),1125);assert.deepEqual(E.load(w),w);
});
test('research leaves seeded chapter generation and resource guarantees unchanged',()=>{
 for(let seed=1;seed<=6;seed++){
  const base=world(seed);for(const k of ['smelter','waterway','sawmillCraft'])unlock(base,k);const upgraded=E.copy(base);
  for(const k of Object.keys(E.RESEARCH))unlock(upgraded,k);
  for(let n=0;n<12;n++){
   const f=Object.values(base.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];
   for(const w of [base,upgraded])E.command(w,{type:'explore',flower:f.id});
   assert.deepEqual(upgraded.flowers,base.flowers);E.validate(upgraded);
  }
 }
});
