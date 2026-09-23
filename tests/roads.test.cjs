const test=require('node:test');
const assert=require('node:assert/strict');
require('../road-system.js');
const position=t=>[Math.sqrt(3)*51*(t.q+t.r/2),76.5*t.r];
const dirs=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
const close=(a,b)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7);
function fixture(indices,building=false){
 const tiles={c:{q:0,r:0,terrain:'grass',building}};
 const edges=indices.map(i=>{tiles[i]={q:dirs[i][0],r:dirs[i][1],terrain:'grass'};return {id:String(i),a:'c',b:String(i)};});
 return RoadTiles.layout(tiles,edges,position);
}
test('every rotated hex turn has coincident endpoints and a continuous tangent',()=>{
 for(let a=0;a<6;a++)for(let b=a+1;b<6;b++){
  const {roads}=fixture([a,b]),p=roads.get(String(a)),q=roads.get(String(b));
  close(p.at(0),q.at(0));
  const dp=p.at(.00001).map((v,i)=>v-p.at(0)[i]);
  const dq=q.at(.00001).map((v,i)=>v-q.at(0)[i]);
  assert.ok(dp[0]*dq[0]+dp[1]*dq[1]<0);
  assert.ok(Math.abs(dp[0]*dq[1]-dp[1]*dq[0])<1e-7);
  close(p.at(.5),position({q:dirs[a][0]/2,r:dirs[a][1]/2}));
 }
});
test('junctions stay connected and building entries reach the ground-level yard',()=>{
 for(let n=3;n<=6;n++){
  const layout=fixture(Array.from({length:n},(_,i)=>i));
  assert.equal(layout.junctions.length,1);
  for(const r of layout.roads.values())close(r.at(0),[0,0]);
 }
 for(const r of fixture([0,1,2,3,4,5],true).roads.values()){
  close(r.at(0),[0,7]);
  assert.ok(!/NaN|undefined/.test(r.d+r.hit));
  const first=r.hit.match(/^M([\d.-]+) ([\d.-]+)/);
  assert.ok(Math.hypot(+first[1],+first[2])>31.99);
 }
});
