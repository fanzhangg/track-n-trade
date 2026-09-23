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
  const middle=position({q:dirs[a][0]/2,r:dirs[a][1]/2}),shift=p.at(.5).map((v,i)=>v-middle[i]);
  assert.ok(Math.hypot(...shift)<=9.000001);
  assert.ok(Math.abs(shift[0]*middle[0]+shift[1]*middle[1])<1e-7,'portal stays on the shared hex border');
  const before=p.at(.5-.00001),at=p.at(.5),after=p.at(.5+.00001);
  const left=at.map((v,i)=>v-before[i]),right=after.map((v,i)=>v-at[i]);
  assert.ok(left[0]*right[0]+left[1]*right[1]>0);
  assert.ok(Math.abs(left[0]*right[1]-left[1]*right[0])<1e-7,'boundary tangent stays continuous');
 }
});

test('natural bends are deterministic, independent of edge ordering, direction and preview IDs',()=>{
 const tiles=Object.fromEntries(Array.from({length:7},(_,q)=>['t'+q,{q,r:0,terrain:'grass',building:q===0||q===6?{}:null}]));
 const edges=Array.from({length:6},(_,i)=>({id:'e'+i,a:'t'+i,b:'t'+(i+1)}));
 const first=RoadTiles.layout(tiles,edges,position),again=RoadTiles.layout(tiles,[...edges].reverse(),position);
 const preview=RoadTiles.layout(tiles,edges.map((e,i)=>({...e,id:'preview-'+i})),position);
 const reverse=RoadTiles.layout(tiles,edges.map(e=>({...e,a:e.b,b:e.a})),position);
 for(const [i,e] of edges.entries()){
  const road=first.roads.get(e.id);assert.equal(road.d,again.roads.get(e.id).d);assert.equal(road.d,preview.roads.get('preview-'+i).d);
  for(let j=0;j<=20;j++)close(road.at(j/20),reverse.roads.get(e.id).at(1-j/20));
 }
 const shifts=edges.map(e=>first.roads.get(e.id).at(.5)[1]);
 assert.ok(Math.max(...shifts)-Math.min(...shifts)>5,'roads have visible spatial variation');
 close(first.roads.get('e0').at(0),[0,7]);close(first.roads.get('e5').at(1),[6*Math.sqrt(3)*51,7]);
});

test('curves stay inside their two tiles for every turn, including the map depth projection',()=>{
 const original=globalThis.MapGeometry;
 try{for(const depth of [1,.65]){
  globalThis.MapGeometry={depth};const project=t=>{const [x,y]=position(t);return [x,y*depth];};
  for(let seed=0;seed<25;seed++)for(let a=0;a<6;a++)for(let b=a+1;b<6;b++){
   const center='c'+seed,tiles={[center]:{q:0,r:0,terrain:'grass'}};
   const edges=[a,b].map(i=>{const id=seed+'-'+i;tiles[id]={q:dirs[i][0],r:dirs[i][1],terrain:'grass'};return{id,a:center,b:id};});
   const layout=RoadTiles.layout(tiles,edges,project);
   for(const e of edges)for(let step=0;step<=80;step++){
    const t=step/80,p=layout.roads.get(e.id).at(t),c=project(tiles[t<=.5?e.a:e.b]);
    const dx=Math.abs(p[0]-c[0]),dy=Math.abs(p[1]-c[1])/depth;
    assert.ok(dx<=Math.sqrt(3)*51/2+1e-6&&dy<=51-dx/Math.sqrt(3)+1e-6,'curve crossed into an unrelated hex');
   }
  }
 }}finally{if(original)globalThis.MapGeometry=original;else delete globalThis.MapGeometry;}
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
