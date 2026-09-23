function discoverFor(w,key){for(let i=0;E.techDiscoveryReason(w,key)&&i<20;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const run=(w,n)=>{for(let i=0;i<n;i++){E.tick(w);E.validate(w);}};
function world(){const w=E.newWorld(7);w.money=1e8;w.tiles[E.START_TILE].building.workers=[];return w;}
function crew(w,tile,n){for(let i=0;i<n;i++)E.command(w,{type:'worker',tile});}
test('output has no warehouse cap and every piece sells when connected',()=>{
 const w=world();crew(w,E.START_TILE,3);w.tech.campCraft=10;w.tech.era=4;w.tiles[E.START_TOWN].building.residents=3;
 run(w,180);assert.equal(E.rate(w,w.tiles[E.START_TILE]),33);
 assert.equal(w.stats.reduce((n,s)=>n+s.sales[E.START_TOWN].log,0)/E.WINDOW,33);
 assert.ok(w.tiles[E.START_TILE].loose.log<=E.YARD);
 for(const e of Object.values(w.edges))E.command(w,{type:'removeRoad',edge:e.id});run(w,40);
 assert.equal(w.tiles[E.START_TILE].loose.log,1320);assert.equal(w.stats.at(-1).tiles[E.START_TILE],33);
});
test('connected processing sells every output without consuming upstream stock',()=>{
 const w=world();for(const key of ['quarry','sawmill'])E.command(w,{type:'tech',key});
 const t=Object.values(w.tiles).find(t=>t.terrain==='grass'&&!t.building);E.command(w,{type:'build',tile:t.id,buildType:'sawmill'});
 E.command(w,{type:'connect',from:E.START_TILE,to:t.id});E.command(w,{type:'connect',from:t.id,to:E.START_TOWN});
 w.tiles[E.START_TOWN].building.buys={board:50};w.flowers['0,0'].design.buys={board:50};
 crew(w,E.START_TILE,3);crew(w,t.id,3);w.tech.campCraft=10;w.tech.sawmillCraft=10;w.tech.era=4;w.tiles[E.START_TOWN].building.residents=3;
 run(w,240);assert.equal(w.stats.reduce((n,s)=>n+s.sales[E.START_TOWN].board,0)/E.WINDOW,33);
 assert.equal(t.loose.board,0);assert.equal(w.tiles[E.START_TILE].loose.log,33*240);
});
test('craft prices cannot be discounted by firing workers and era prices do not rise on exploration',()=>{
 const w=world();crew(w,E.START_TILE,3);const cost=E.craftCost(w,'camp'),era=E.eraCost(w);
 for(let i=0;i<3;i++)E.command(w,{type:'fireWorker',tile:E.START_TILE});assert.equal(E.craftCost(w,'camp'),cost);
 E.command(w,{type:'explore',flower:'1,0'});assert.equal(E.eraCost(w),era);
});
test('v21 migration removes retired systems and refunds the golden finger exactly once',()=>{
 const w=world();w.schemaVersion=21;w.tech.tools=3;w.goals.produce=8;w.goals.sell=7;w.goals.freight=9;
 const money=w.money;const migrated=E.load(w);assert.equal(migrated.money,money+14000);assert.equal(migrated.tech.tools,undefined);
 assert.deepEqual(Object.keys(migrated.goals),['income','map']);assert.deepEqual(E.load(migrated),migrated);
});
test('after introducing all goods, new markets combine two goods rather than reverting to repeated log towns',()=>{
 const w=world();let paired=0;
 for(let n=1;n<=20;n++){
  const fog=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];
  E.command(w,{type:'explore',flower:fog.id});
  if(n>14&&fog.design.buys){assert.equal(Object.keys(fog.design.buys).length,2);paired++;}
 }
 assert.ok(paired>=3);E.validate(w);
});
test('a two-input factory can deliver 33 per round without material loss or a 20-piece throughput cap',()=>{
 const w=world();for(const key of ['quarry','sawmill','mason']){discoverFor(w,key);E.command(w,{type:'tech',key});}
 const grass=Object.values(w.tiles).filter(t=>t.terrain==='grass'&&!t.building),rock=grass[0],factory=grass[1];
 rock.terrain='rock';const slot=E.flowerTiles(w.flowers['0,0']).find(p=>`${p.q},${p.r}`===rock.id).slot;
 if(slot===0)w.flowers['0,0'].design.center='rock';else w.flowers['0,0'].design.ring[slot-1]='rock';
 E.command(w,{type:'build',tile:rock.id,buildType:'quarry'});E.command(w,{type:'build',tile:factory.id,buildType:'mason'});
 for(const from of [E.START_TILE,rock.id])E.command(w,{type:'connect',from,to:factory.id});
 E.command(w,{type:'connect',from:factory.id,to:E.START_TOWN});
 w.tiles[E.START_TOWN].building.buys={tool:120};w.flowers['0,0'].design.buys={tool:120};
 for(const tile of [E.START_TILE,rock.id,factory.id]){crew(w,tile,3);w.tech[E.craftOf(w.tiles[tile].building.type)]=10;}
 w.tech.era=4;w.tiles[E.START_TOWN].building.residents=3;run(w,240);
 assert.equal(w.stats.reduce((n,s)=>n+s.sales[E.START_TOWN].tool,0)/E.WINDOW,33);
 assert.ok(factory.loose.tool<=20);
});
test('an idle nearby producer does not cap shipments from a distant working producer',()=>{
 const w=world();
 for(let n=0;n<8;n++){
  const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>b.a-a.a||a.b-b.b)[0];
  E.command(w,{type:'explore',flower:f.id});
 }
 for(const t of Object.values(w.tiles))if(t.building?.type==='town'&&t.id!==E.START_TOWN){t.building.buys={stone:30};w.flowers[t.flower].design.buys={stone:30};}
 const town=w.tiles[E.START_TOWN],far=Object.values(w.tiles).filter(t=>t.terrain==='forest'&&!t.building).sort((a,b)=>E.hexDist(b,town)-E.hexDist(a,town))[0];
 E.command(w,{type:'build',tile:far.id,buildType:'camp'});crew(w,far.id,3);
 E.command(w,{type:'connect',from:far.id,to:town.id});
 w.tech.campCraft=10;w.tech.era=4;town.building.residents=3;
 assert.ok(E.path(w,far.id,town.id).length>E.path(w,E.START_TILE,town.id).length+3);
 run(w,240);
 assert.equal(w.stats.reduce((sum,s)=>sum+s.sales[town.id].log,0)/E.WINDOW,33);
 // Both routes must contribute when neither workshop alone meets demand.
 E.command(w,{type:'fireWorker',tile:far.id});crew(w,E.START_TILE,1);
 run(w,240);
 assert.equal(w.stats.reduce((sum,s)=>sum+s.sales[town.id].log,0)/E.WINDOW,33);
 // A distant idle workshop must not inflate stock when only the nearby camp supplies.
 crew(w,E.START_TILE,2);for(let i=0;i<2;i++)E.command(w,{type:'fireWorker',tile:far.id});
 run(w,240);
 assert.equal(w.stats.reduce((sum,s)=>sum+s.sales[town.id].log,0)/E.WINDOW,33);
 assert.ok(town.loose.log<=E.townCap(w,town.building));
});
