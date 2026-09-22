const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');
const fresh=()=>E.directWorld(E.newWorld()).world;
const run=(w,seconds)=>{for(let i=0;i<seconds/E.DT;i++)E.tick(w);};
function fund(w,r,n){w.tiles['0,0'].loose[r]+=n*4;w.initial[r]+=n*4;}
test('drop an unconnected camp: built immediately, produces without roads',()=>{
 let w=fresh();w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});
 assert.equal(w.tiles['-2,1'].building.type,'camp');assert.equal(w.orders.length,0);
 assert.equal(E.path(w,'-2,1','0,0'),null);run(w,4);
 assert.equal(w.tiles['-2,1'].loose.log,4);E.validate(w);
});
test('construction uses stock from disconnected tiles and refunds exactly',()=>{
 let w=fresh();w.tiles['2,1'].loose.board=w.tiles['0,0'].loose.board;w.tiles['0,0'].loose.board=0;
 const total=E.totals(w);w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});
 assert.deepEqual(E.totals(w),total);w=E.apply(w,{type:'demolish',tile:'-2,1'});
 assert.deepEqual(E.totals(w),total);assert.equal(E.quote(w,'camp').tier,1);E.validate(w);
});
test('connect nonadjacent buildings: all route segments exist immediately',()=>{
 let w=fresh();w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});
 const route=E.connection(w,'-2,1','0,0');assert.equal(route.tiles.length,3);
 w=E.apply(w,{type:'connect',from:'-2,1',to:'0,0'});
 assert.ok(E.path(w,'-2,1','0,0'));assert.equal(w.orders.length,0);
 for(const c of route.commands)assert.equal(w.edges[E.edgeId(c.a,c.b)].readyAt,w.time);
 run(w,30);assert.ok(w.production.board>0);E.validate(w);
});
test('reverse gestures cost the same and repeating a connection does not double charge',()=>{
 let w=fresh();w=E.apply(w,{type:'build',tile:'-2,1',buildType:'camp'});
 const a=E.apply(w,{type:'connect',from:'0,0',to:'-2,1'}),b=E.apply(w,{type:'connect',from:'-2,1',to:'0,0'});
 assert.deepEqual(E.totals(a,true).loose,E.totals(b,true).loose);
 const again=E.apply(a,{type:'connect',from:'-2,1',to:'0,0'});
 assert.deepEqual(E.totals(again),E.totals(a));assert.deepEqual(E.totals(again,true).loose,E.totals(a,true).loose);
});
test('route automatically builds a river bridge and avoids mountains',()=>{
 let w=fresh();fund(w,'board',100);fund(w,'stone',100);
 w=E.apply(w,{type:'build',tile:'2,-1',buildType:'quarry'});
 const route=E.connection(w,'0,0','2,-1');assert.equal(route.bridges,1);
 assert.ok(route.tiles.every(k=>w.tiles[k].terrain!=='mountain'));
 w=E.apply(w,{type:'connect',from:'0,0',to:'2,-1'});assert.ok(E.path(w,'0,0','2,-1'));E.validate(w);
});
test('insufficient build or multi-edge route is atomic, no partial purchases',()=>{
 const w=fresh(),before=JSON.stringify(w);
 assert.throws(()=>E.apply(w,{type:'equipment',tile:'0,0'}),/材料不足/);assert.equal(JSON.stringify(w),before);
 let next=E.apply(w,{type:'build',tile:'2,1',buildType:'camp'});const snap=JSON.stringify(next);
 assert.throws(()=>E.apply(next,{type:'connect',from:'0,0',to:'2,1'}),/材料不足/);
 assert.equal(JSON.stringify(next),snap);assert.equal(next.orders.length,0);
});
test('invalid terrain or non-building endpoints do not modify the map',()=>{
 const w=fresh(),before=JSON.stringify(w);
 assert.throws(()=>E.apply(w,{type:'build',tile:'-1,1',buildType:'camp'}));
 assert.throws(()=>E.apply(w,{type:'connect',from:'0,0',to:'-1,1'}));assert.equal(JSON.stringify(w),before);
});
test('upgrades apply immediately without construction transport',()=>{
 let w=fresh();fund(w,'board',100);fund(w,'stone',100);
 w=E.apply(w,{type:'module',tile:'0,0'});assert.equal(w.tiles['0,0'].building.modules.length,2);
 w=E.apply(w,{type:'equipment',tile:'0,0'});assert.ok(w.tiles['0,0'].building.equipment);
 const edge=Object.keys(w.edges)[0];w=E.apply(w,{type:'upgrade',edge});assert.equal(w.edges[edge].level,1);
 assert.equal(w.orders.length,0);E.validate(w);
});
test('legacy pending projects migrate without loss, backup is unmodified',()=>{
 const old=E.newWorld();fund(old,'board',100);fund(old,'stone',100);
 E.command(old,{type:'build',tile:'-2,1',buildType:'camp'});
 E.command(old,{type:'road',a:'-2,1',b:'-1,0'});
 const original=JSON.stringify(old),total=E.totals(old),loaded=E.directWorld(old);
 assert.equal(JSON.stringify(old),original);assert.equal(loaded.completed,2);
 assert.equal(loaded.world.orders.length,0);assert.ok(loaded.world.tiles['-2,1'].building);
 assert.deepEqual(E.totals(loaded.world),total);assert.deepEqual(E.directWorld(loaded.world).world,loaded.world);
});
test('unaffordable legacy projects refund escrow and release freight safely',()=>{
 const old=E.newWorld();E.command(old,{type:'equipment',tile:'0,-1'});run(old,10);
 const total=E.totals(old),loaded=E.directWorld(old);assert.equal(loaded.canceled,1);
 assert.equal(loaded.world.orders.length,0);assert.deepEqual(E.totals(loaded.world),total);
 run(loaded.world,5);E.validate(loaded.world);
});
