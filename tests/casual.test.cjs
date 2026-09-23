function discoverFor(w,key){for(let i=0;E.techDiscoveryReason(w,key)&&i<20;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../engine');
function fresh(){const w=E.newWorld(7);w.money=1e8;return w;}
function unlock(w,k){for(const dep of E.TECH[k].requires)if(!w.tech[dep])unlock(w,dep);if(!w.tech[k]){discoverFor(w,k);E.command(w,{type:'tech',key:k});}}
function terrain(w,t,type){t.terrain=type;const f=w.flowers[t.flower],slot=E.flowerTiles(f).find(p=>`${p.q},${p.r}`===t.id).slot;if(slot===0)f.design.center=type;else f.design.ring[slot-1]=type;}
function build(w,type){if(type!=='camp')unlock(w,type);let t=Object.values(w.tiles).find(t=>!t.building&&E.RECIPES[type].fits.includes(t.terrain));if(!t){t=Object.values(w.tiles).find(t=>!t.building);terrain(w,t,E.RECIPES[type].fits[0]);}E.command(w,{type:'build',tile:t.id,buildType:type});E.command(w,{type:'worker',tile:t.id});return t;}
// Production fixtures need connectivity; attach through a reachable building when
// the new independent-road rule prevents a direct route through an existing road.
function connect(w,a,b){
 if(E.path(w,a.id,b.id))return;
 const candidates=Object.values(w.tiles).filter(t=>t.building&&(t.id===a.id||E.path(w,a.id,t.id)));
 for(const from of candidates){try{E.connection(w,from.id,b.id);}catch{continue;}E.command(w,{type:'connect',from:from.id,to:b.id});return;}
 throw Error(`No independent fixture connection from ${a.id} to ${b.id}`);
}
function run(w,n){for(let i=0;i<n;i++){E.tick(w);E.validate(w);}}
function explore(w,n){for(let i=0;i<n;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
test('one low-rate source supports multiple high-rate factories while its own output sells',()=>{
 const w=fresh(),camp=w.tiles[E.START_TILE],mill=build(w,'sawmill'),paper=build(w,'paperMill');
 connect(w,camp,mill);connect(w,camp,paper);w.tech.sawmillCraft=40;w.tech.paperMillCraft=20;
 run(w,50);assert.equal(w.stats.at(-1).tiles[mill.id],41);assert.equal(w.stats.at(-1).tiles[paper.id],21);
 assert.equal(w.sold[E.START_TOWN].log,50);assert.equal(mill.loose.board,2050);assert.equal(paper.loose.paper,1050);
 assert.equal(w.consumption.log,50);assert.equal(w.shipments.length,0);
});
test('inventory never substitutes for a connected working upstream; fire and rehire propagate immediately',()=>{
 const w=fresh(),camp=w.tiles[E.START_TILE],mill=build(w,'sawmill');w.edges={};mill.loose.log=100;w.initial.log=100;
 run(w,1);assert.equal(mill.loose.board,0);assert.deepEqual(E.productionState(w,mill).missing,['log']);
 connect(w,camp,mill);run(w,1);assert.equal(mill.loose.board,1);
 E.command(w,{type:'fireWorker',tile:camp.id});assert.equal(E.productionState(w,mill).active,false);run(w,1);assert.equal(mill.loose.board,1);
 E.command(w,{type:'worker',tile:camp.id});run(w,1);assert.equal(mill.loose.board,2);
});
test('all extended recipes work recursively, require every upstream, and preserve refunds',()=>{
 for(const type of E.NEW_BUILDINGS){const w=fresh();explore(w,16);unlock(w,'waterway');unlock(w,'mountainPass');
  const provision=type=>{let t=Object.values(w.tiles).find(t=>t.building?.type===type);if(!t)t=build(w,type);
   for(const r of Object.keys(E.RECIPES[type].in)){const u=provision(E.BUILDINGS.find(b=>E.RECIPES[b].out===r));connect(w,u,t);}return t;};
  const t=provision(type);w.tech[E.craftOf(type)]=8;run(w,2);assert.equal(w.stats.at(-1).tiles[t.id],9);
  const input=Object.keys(E.RECIPES[type].in)[0],source=w.tiles[E.productionState(w,t).sources[input]];
  E.command(w,{type:'fireWorker',tile:source.id});run(w,1);assert.equal(w.stats.at(-1).tiles[t.id]||0,0);
  assert.throws(()=>E.command(w,{type:'click',tile:t.id}),/运行中上游/);
  const before=w.money,refund=t.building.paid+t.building.workers.reduce((n,m)=>n+m.paid,0);E.command(w,{type:'demolish',tile:t.id});assert.equal(w.money-before,refund);E.validate(w);
 }
});
test('disconnection stores unlimited output and reconnect sells it once, with no transport delay',()=>{
 const w=fresh(),camp=w.tiles[E.START_TILE];for(const e of Object.values(w.edges))E.command(w,{type:'removeRoad',edge:e.id});
 run(w,100);assert.equal(camp.loose.log,100);assert.equal(w.stats.at(-1).tiles[camp.id],1);
 connect(w,camp,w.tiles[E.START_TOWN]);run(w,1);assert.equal(w.stats.at(-1).sales[E.START_TOWN].log,101);assert.equal(camp.loose.log,0);
 run(w,1);assert.equal(w.stats.at(-1).sales[E.START_TOWN].log,1);assert.equal(w.sold[E.START_TOWN].log,102);
});
test('road removal immediately deactivates dependent factories and restore works before settlement',()=>{
 const w=fresh(),mill=build(w,'sawmill'),camp=w.tiles[E.START_TILE];connect(w,camp,mill);
 const roads=Object.keys(w.edges);for(const edge of roads)E.command(w,{type:'removeRoad',edge});assert.equal(E.productionState(w,mill).active,false);
 for(const edge of roads)E.command(w,{type:'restoreRoad',edge});assert.equal(E.productionState(w,mill).active,true);run(w,1);
});
test('unlimited buyers choose best effective price without duplicating a product',()=>{
 const w=fresh();explore(w,2);const town=Object.values(w.tiles).find(t=>t.building?.type==='town'&&t.id!==E.START_TOWN);
 town.building.buys={log:30};w.flowers[town.flower].design.buys={log:30};connect(w,w.tiles[E.START_TILE],town);
 w.tech.campCraft=49;run(w,1);assert.equal(w.stats.at(-1).sales[town.id].log,50);assert.equal(w.stats.at(-1).sales[E.START_TOWN].log,0);assert.equal(w.stats.at(-1).income,1500);
 E.command(w,{type:'resident',tile:E.START_TOWN});E.command(w,{type:'resident',tile:E.START_TOWN});E.command(w,{type:'resident',tile:town.id});
 assert.equal(E.buys(w,town.id).log.price,38);E.command(w,{type:'tech',key:'era'});assert.equal(E.buys(w,town.id).log.price,45);
 run(w,1);assert.equal(w.stats.at(-1).income,2250);assert.equal(w.stats[0].revenue[town.id].log,1500);
});
test('manual production remains optional, unlimited and free but respects upstream connections',()=>{
 const w=fresh(),camp=w.tiles[E.START_TILE];E.command(w,{type:'fireWorker',tile:camp.id});const money=w.money;
 for(let i=0;i<40;i++)E.command(w,{type:'click',tile:camp.id});assert.equal(camp.loose.log,40);assert.equal(w.money,money);
 run(w,1);assert.equal(w.stats.at(-1).income,800);assert.equal(w.stats.at(-1).manualTiles[camp.id],40);
});
test('v24 in-flight stock migrates exactly once without altering cash, map, upgrades or ledger',()=>{
 const old=fresh();old.schemaVersion=24;const edge=Object.values(old.edges)[0],r='log';old.production[r]=1;
 old.shipments=[{id:String(++old.serial).padStart(6,'0'),key:'legacy',r,node:edge.a,from:edge.a,to:edge.b,edge:edge.id,remaining:1,destination:E.START_TOWN}];
 old.tiles[E.START_TILE].building.warning={kind:'backlog',rounds:10};old.flags.yardFull=true;
 const w=E.load(old);assert.equal(w.schemaVersion,25);assert.equal(w.money,old.money);assert.deepEqual(w.flowers,old.flowers);assert.deepEqual(w.tech,old.tech);assert.deepEqual(E.totals(w),E.totals(old));
 assert.equal(w.shipments.length,0);assert.equal(w.tiles[E.START_TILE].building.warning,undefined);assert.deepEqual(E.load(w),w);run(w,3);
});
test('fixed research production does not depend on sales or warehouse space',()=>{
 const w=fresh(),camp=w.tiles[E.START_TILE],mill=build(w,'sawmill');connect(w,camp,mill);unlock(w,'waterPower');unlock(w,'specialization');
 const lake=Object.values(w.tiles).find(t=>!t.building&&E.adjacent(t,mill));terrain(w,lake,'lake');
 for(let i=0;i<2;i++)E.command(w,{type:'worker',tile:mill.id});const rate=E.rate(w,mill);run(w,100);assert.equal(mill.loose.board,rate*100);assert.equal(w.stats.at(-1).tiles[mill.id],rate);
});
