const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../engine'),G=require('../industry-graph');
function explore(w){const f=Object.values(w.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];E.command(w,{type:'explore',flower:f.id});}
test('even unlimited starting money cannot reveal or purchase late industries',()=>{
 const w=E.newWorld();w.money=1e9;
 assert.deepEqual(G.layout(E,'tech',w).nodes.filter(n=>n.discovered).map(n=>n.id),['camp','quarry']);
 for(const key of ['quarry','sawmill'])E.command(w,{type:'tech',key});
 for(const key of ['mason','paperMill']){assert.equal(E.techAvailable(w,key),false);assert.throws(()=>E.command(w,{type:'tech',key}),/探索发现/);assert.ok(G.layout(E,'production',w).nodes.some(n=>n.id===key&&!n.discovered));}
 assert.throws(()=>E.command(w,{type:'tech',key:'era'}),/探索 2/);
 while(!E.boughtGoods(w).has('tool'))explore(w);
 assert.equal(E.techAvailable(w,'mason'),true);assert.ok(G.layout(E,'production',w).nodes.some(n=>n.id==='mason'));E.command(w,{type:'tech',key:'mason'});
 assert.equal(E.techAvailable(w,'mine'),false);assert.equal(E.techAvailable(w,'kiln'),false);E.validate(w);
});
test('each era is gated by exploration and old unlocked technology survives loading',()=>{
 const w=E.newWorld();w.money=1e9;
 for(const target of [2,4,8,12]){while(w.unlocked<target-1)explore(w);assert.equal(E.techAvailable(w,'era'),false);explore(w);assert.equal(E.techAvailable(w,'era'),true);E.command(w,{type:'tech',key:'era'});}
 assert.equal(E.techMaxed(w,'era'),true);E.validate(w);
 const old=E.newWorld();old.schemaVersion=24;for(const k of ['quarry','sawmill','mason','roadEngineering'])old.tech[k]=1;
 const migrated=E.load(old);assert.equal(migrated.unlocked,0);assert.equal(migrated.tech.mason,1);assert.equal(E.techAvailable(migrated,'masonCraft'),true);assert.ok(G.layout(E,'tech',migrated).nodes.some(n=>n.id==='mason'));E.validate(migrated);
});
test('every advanced recipe becomes discoverable through generated markets without prerequisite deadlocks',()=>{
 for(const seed of [1,7,42]){const w=E.newWorld(seed);w.money=1e9;for(let i=0;i<16;i++)explore(w);
  for(const b of E.BUILDINGS.filter(b=>b!=='camp')){assert.equal(E.techAvailable(w,b),true,`${seed}: ${b}`);E.command(w,{type:'tech',key:b});}
  E.validate(w);
 }
});
