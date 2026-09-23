const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),G=require('../industry-graph');
test('planner states distinguish unlock, repeatable craft, affordability and completion',()=>{
 const w=E.newWorld(1);w.money=1e6;
 assert.equal(G.status(E,w,'quarry').kind,'unlock');assert.equal(G.status(E,w,'sawmill').kind,'locked');
 assert.equal(G.status(E,w,'camp').level,'工艺 I');assert.equal(G.status(E,w,'camp').kind,'upgrade');
 E.command(w,{type:'tech',key:'quarry'});assert.equal(G.status(E,w,'quarry').key,'quarryCraft');assert.equal(G.status(E,w,'quarry').kind,'upgrade');
 E.command(w,{type:'tech',key:'campCraft'});assert.equal(G.status(E,w,'camp').current,2);assert.equal(G.status(E,w,'camp').max,null);
 w.money=0;assert.equal(G.status(E,w,'camp').kind,'poor');assert.equal(G.status(E,w,'sawmill').kind,'poor');assert.equal(G.status(E,w,'era').kind,'locked');
 w.tech.era=4;assert.equal(G.status(E,w,'era').kind,'maxed');assert.equal(G.status(E,w,'era').level,'V / V');
 w.tech.waterway=1;assert.equal(G.status(E,w,'waterway').kind,'maxed');assert.equal(G.status(E,w,'waterway').level,'已完成');
 w.tech.campCraft=100;assert.equal(G.status(E,w,'camp').complete,false);
});
test('production graph includes every workshop and every recipe input exactly once',()=>{
 const g=G.layout(E,'production');assert.deepEqual(g.nodes.map(n=>n.id),E.BUILDINGS);
 assert.equal(g.edges.length,E.BUILDINGS.reduce((n,b)=>n+Object.keys(E.RECIPES[b].in).length,0));
 for(const b of E.BUILDINGS)for(const r of Object.keys(E.RECIPES[b].in))assert.ok(g.edges.some(e=>e.to===b&&E.RECIPES[e.from].out===r));
 for(const edge of g.edges)assert.ok(g.nodes.find(n=>n.id===edge.from).x<g.nodes.find(n=>n.id===edge.to).x);
});
test('technology graph includes all research with craft requirements attached to the building node',()=>{
 const g=G.layout(E,'tech');
 for(const [key,t] of Object.entries(E.TECH)){
  assert.ok(g.nodes.some(n=>n.id===(t.building||key)));
  if(t.building)continue;
  for(const dep of t.requires)assert.ok(g.edges.some(e=>e.to===key&&e.from===(E.TECH[dep].building||dep)));
 }
 assert.ok(g.edges.some(e=>e.from==='sawmill'&&e.to==='specialization'&&e.label==='工艺 II'));
 const positions=g.nodes.map(n=>`${n.x},${n.y}`);assert.equal(new Set(positions).size,positions.length);
});
test('a new world reveals only owned and immediately available technology',()=>{
 const w=E.newWorld(1);
 assert.deepEqual(G.layout(E,'production',w).nodes.filter(n=>n.discovered).map(n=>n.id),['camp','quarry']);
 assert.deepEqual(G.layout(E,'tech',w).nodes.filter(n=>n.discovered).map(n=>n.id),['camp','quarry']);
 w.tech.quarry=1;
 assert.ok(G.layout(E,'tech',w).nodes.some(n=>n.id==='sawmill'));
 assert.ok(G.layout(E,'tech',w).nodes.some(n=>n.id==='smelter'&&!n.discovered));
});
