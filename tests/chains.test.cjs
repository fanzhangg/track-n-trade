function discoverFor(w,key){for(let i=0;E.techDiscoveryReason(w,key)&&i<20;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../engine');
const unlock=(w,k)=>{for(const d of E.TECH[k].requires)if(!w.tech[d])unlock(w,d);if(!w.tech[k]){discoverFor(w,k);E.command(w,{type:'tech',key:k});}};
function explore(w,n){for(let i=0;i<n;i++){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}}
test('new industries inherit craft, full crew and water power while manual work remains craft-only',()=>{
 for(const b of E.NEW_BUILDINGS){const w=E.newWorld(1);w.money=1e7;unlock(w,b);unlock(w,'waterPower');unlock(w,'specialization');
  E.command(w,{type:'build',tile:'0,0',buildType:b});const t=w.tiles['0,0'];
  w.tiles['1,-1'].terrain='lake';w.flowers['0,0'].design.ring[1]='lake';
  for(let i=0;i<3;i++)E.command(w,{type:'worker',tile:t.id});E.command(w,{type:'tech',key:E.craftOf(b)});
  assert.equal(E.rate(w,t),12);assert.equal(E.clickPower(w,t),2);E.validate(w);
 }
});
test('multistage freight propagates final market value to intermediates with no local buyer',()=>{
 const w=E.newWorld(3);w.money=1e8;explore(w,16);unlock(w,'machineWorks');
 const grass=Object.values(w.tiles).filter(t=>t.terrain==='grass'&&!t.building),kiln=grass[0],factory=grass[1];
 E.command(w,{type:'build',tile:kiln.id,buildType:'kiln'});E.command(w,{type:'build',tile:factory.id,buildType:'machineWorks'});
 const buyer=Object.values(w.tiles).find(t=>t.building?.buys?.machine);
 E.command(w,{type:'connect',from:kiln.id,to:factory.id});E.command(w,{type:'connect',from:factory.id,to:buyer.id});
 assert.ok(E.saleValue(w,kiln.id,'charcoal')>=buyer.building.buys.machine);
 assert.ok(!E.SELLABLE.includes('charcoal'));E.validate(w);
});
test('new markets follow iron and are supplied by existing resource terrain for many seeds',()=>{
 for(let seed=1;seed<=12;seed++){const w=E.newWorld(seed);w.money=1e8;explore(w,16);
  const towns=Object.values(w.flowers).filter(f=>f.design?.buys).sort((a,b)=>a.order-b.order);
  assert.deepEqual(towns.slice(0,8).map(f=>Object.keys(f.design.buys)[0]),['log','stone','board','tool','iron','paper','book','machine']);
  for(const good of E.SELLABLE){assert.deepEqual([...E.rawOf(good)].sort(),[...E.RAW[good]].sort());for(const terrain of E.rawOf(good))assert.ok(E.terrainsOn(w).has(terrain));}
  for(const t of Object.values(w.tiles).filter(t=>t.building?.type==='town'))for(const good of Object.keys(t.building.buys)){
   assert.ok(!E.rawOf(good).includes(t.terrain));for(const u of Object.values(w.tiles).filter(u=>E.adjacent(t,u)))assert.ok(!E.rawOf(good).includes(u.terrain));
  }
  E.validate(w);
 }
});
test('v23 fills only missing new goods and tech, preserves freight and history, and is idempotent',()=>{
 const original=E.newWorld(9);for(let i=0;i<8;i++)E.tick(original);const old=E.copy(original);old.schemaVersion=23;
 for(const b of E.NEW_BUILDINGS){delete old.tech[b];delete old.tech[E.craftOf(b)];}
 const strip=o=>{if(!o||typeof o!=='object')return;for(const r of E.NEW_GOODS)delete o[r];for(const x of Object.values(o))strip(x);};strip(old);
 const loaded=E.load(old);assert.deepEqual(loaded,original);assert.deepEqual(E.load(loaded),loaded);assert.equal(old.schemaVersion,23);
 const bad=E.copy(loaded);delete bad.tiles['0,0'].loose.paper;assert.throws(()=>E.load(bad));
});
