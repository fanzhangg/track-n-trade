const test=require('node:test');
const assert=require('node:assert/strict');
require('../map-geometry.js');
const G=globalThis.MapGeometry;
test('projected neighbours share both edge endpoints',()=>{
 const directions=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
 const corners=Array.from({length:6},(_,i)=>G.vertex(0,0,G.radius,i));
 for(const [q,r] of directions){
  const [x,y]=G.position({q,r});
  const other=Array.from({length:6},(_,i)=>G.vertex(x,y,G.radius,i));
  assert.equal(corners.filter(a=>other.some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8)).length,2);
 }
});
test('hit area includes projected corners and rejects points beyond every edge',()=>{
 assert.ok(G.contains(0,0));
 for(let i=0;i<6;i++){
  const a=G.vertex(0,0,G.radius,i),b=G.vertex(0,0,G.radius,i+1);
  assert.ok(G.contains(...a));
  const midpoint=a.map((v,j)=>(v+b[j])/2);
  assert.ok(G.contains(...midpoint.map(v=>v*.99)));
  assert.ok(!G.contains(...midpoint.map(v=>v*1.01)));
 }
 assert.ok(!G.contains(0,G.radius*.9),'old upright corner is outside the projected tile');
});
