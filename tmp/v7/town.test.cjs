const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const fresh=()=>E.directWorld(E.newWorld()).world;
const run=(w,seconds)=>{for(let i=0;i<seconds/E.DT;i++)E.tick(w);};
function fund(w,r,n){w.tiles['0,0'].loose[r]+=n*4;w.initial[r]+=n*4;}
const connectTown=w=>E.apply(w,{type:'connect',from:'0,0',to:E.TOWN});

test('town exists at a fixed tile, cannot be built on, expanded or demolished',()=>{
 const w=fresh();const t=w.tiles[E.TOWN];
 assert.equal(t.terrain,'town');assert.equal(t.building.type,'town');
 for(const c of [{type:'build',tile:E.TOWN,buildType:'sawmill'},{type:'module',tile:E.TOWN},{type:'equipment',tile:E.TOWN},{type:'demolish',tile:E.TOWN},{type:'productionPause',tile:E.TOWN}])assert.throws(()=>E.apply(w,c));
 run(w,20);assert.deepEqual(t.loose,E.zero());E.validate(w);
});
test('connecting to the town needs a bridge and pays the connect milestone',()=>{
 let w=fresh();const route=E.connection(w,'0,0',E.TOWN);
 assert.equal(route.bridges,1);assert.equal(route.tiles.length,4);
 w=connectTown(w);assert.ok(E.path(w,'0,0',E.TOWN));
 E.tick(w);assert.ok(w.town.milestones.connect);assert.equal(w.town.coins,20);E.validate(w);
});
test('a contract pulls goods over roads, pays coins and advances to the next contract',()=>{
 let w=fresh();w=connectTown(w);w=E.apply(w,{type:'acceptContract'});
 const o=w.orders.find(o=>o.kind==='contract');assert.equal(o.contract,0);assert.deepEqual(o.cost,{log:0,board:40,stone:0});
 assert.throws(()=>E.apply(w,{type:'acceptContract'}),/进行中/);
 const total=E.totals(w);run(w,60);
 assert.equal(w.town.next,1);assert.equal(w.orders.length,0);
 assert.equal(w.town.coins,20+30+30);// connect + contract reward + first-contract milestone
 assert.equal(w.consumption.board,40);assert.deepEqual(w.town.delivered,{log:0,board:40,stone:0});
 const after=E.totals(w);assert.equal(after.board,total.board+w.production.board-40);E.validate(w);
});
test('contract sequence is deterministic and escalates',()=>{
 const a=E.contractSpec(0),b=E.contractSpec(5),c=E.contractSpec(12),d=E.contractSpec(13);
 assert.deepEqual(a,E.contractSpec(0));assert.ok(b.reward>a.reward);assert.ok(c.reward>b.reward);
 assert.ok(E.RES.every(r=>Number.isSafeInteger(c.cost[r])&&c.cost[r]%4===0));
 assert.ok(d.cost.log>0,'log contracts recur in the cycle');
});
test('abandoning a contract keeps delivered goods at the town and reuses the same contract',()=>{
 let w=fresh();w=connectTown(w);w=E.apply(w,{type:'acceptContract'});run(w,20);
 const o=w.orders.find(o=>o.kind==='contract');assert.ok(o.escrow.board>0);const total=E.totals(w);
 w=E.apply(w,{type:'cancel',order:o.id});assert.equal(w.orders.length,0);
 assert.deepEqual(E.totals(w),total);assert.equal(w.tiles[E.TOWN].loose.board,o.escrow.board);
 w=E.apply(w,{type:'acceptContract'});assert.equal(w.orders[0].contract,0);
 E.tick(w);assert.ok(w.orders[0].escrow.board>=o.escrow.board,'local town stock fills the contract directly');E.validate(w);
});
test('market purchases convert coins into goods and stay in the ledger',()=>{
 let w=fresh();assert.throws(()=>E.apply(w,{type:'buy',r:'stone',n:10}),/金币不足/);
 w.town.coins=100;w=E.apply(w,{type:'buy',r:'stone',n:10});
 assert.equal(w.town.coins,50);assert.equal(w.tiles[E.TOWN].loose.stone,40);assert.equal(w.purchased.stone,40);
 assert.throws(()=>E.apply(w,{type:'buy',r:'gold',n:1}));assert.throws(()=>E.apply(w,{type:'buy',r:'log',n:0}));
 w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});// global stock includes the purchase
 E.validate(w);
});
test('cart doubles road capacity, steam saw doubles sawmill output',()=>{
 let w=fresh();w.town.coins=5000;
 assert.throws(()=>E.apply(w,{type:'townUpgrade',key:'nope'}));
 w=E.apply(w,{type:'townUpgrade',key:'cart'});assert.throws(()=>E.apply(w,{type:'townUpgrade',key:'cart'}),/购买过/);
 w=E.apply(w,{type:'townUpgrade',key:'steam'});assert.equal(w.town.coins,5000-400-1500);
 const plain=fresh();for(const x of [w,plain]){x.tiles['0,-1'].loose.log+=4000;x.initial.log+=4000;}
 run(w,60);run(plain,60);
 assert.ok(w.production.board>plain.production.board*1.8&&w.production.board<plain.production.board*2.2,`steam+cart ${w.production.board} vs ${plain.production.board}`);
 E.validate(w);
});
test('v0.6 save without a town migrates: building on the town tile is refunded',()=>{
 const old=E.newWorld();old.interactionVersion=6;
 const before=E.totals(old);
 old.tiles[E.TOWN].building=null;old.tiles[E.TOWN].terrain='grass';delete old.town;delete old.purchased;
 E.command(old,{type:'build',tile:E.TOWN,buildType:'sawmill'});old.orders[0].escrow=E.copy(old.orders[0].cost);
 for(const r of E.RES)old.tiles['0,0'].loose[r]-=old.orders[0].cost[r];
 for(let i=0;i<1;i++)E.tick(old);
 assert.equal(old.tiles[E.TOWN].building.type,'sawmill');
 const loaded=E.directWorld(old);
 assert.equal(loaded.world.tiles[E.TOWN].building.type,'town');assert.equal(loaded.world.town.next,0);
 assert.deepEqual(E.totals(loaded.world),before);assert.equal(loaded.world.interactionVersion,7);
});
test('contract, coins and milestones survive save and reload identically',()=>{
 let w=fresh();w=connectTown(w);w=E.apply(w,{type:'acceptContract'});run(w,10);
 const clone=JSON.parse(JSON.stringify(w));run(w,30);run(clone,30);assert.deepEqual(w,clone);
 assert.ok(w.stats.some(s=>s.coins>0));
});
