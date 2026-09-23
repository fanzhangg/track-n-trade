const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../engine');
test('casual production has no persistent bottleneck warnings, including disconnected storage',()=>{
 const w=E.newWorld();for(const e of Object.values(w.edges))E.command(w,{type:'removeRoad',edge:e.id});
 for(let i=0;i<50;i++)E.tick(w);
 for(const t of Object.values(w.tiles).filter(t=>t.building)){assert.equal(E.warning(w,t),null);assert.equal(E.buildingBottleneck(w,t),null);}
 assert.equal(w.tiles[E.START_TILE].loose.log,50);assert.equal(E.productionState(w,w.tiles[E.START_TILE]).active,true);E.validate(w);
});
