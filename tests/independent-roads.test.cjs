const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js');

test('roads sharing a building retain separate selection, removal, refunds and save identity',()=>{
 let w=E.newWorld(1);w.money=100000;w.tech.sawmill=1;
 const old=Object.keys(w.edges);
 E.command(w,{type:'build',tile:'0,1',buildType:'sawmill'});
 E.command(w,{type:'connect',from:E.START_TILE,to:'0,1'});
 const fresh=Object.keys(w.edges).filter(id=>!old.includes(id));assert.ok(fresh.length);
 w=E.load(w);
 assert.deepEqual(E.roadComponent(w,fresh[0]).map(e=>e.id),fresh);
 const money=w.money;E.command(w,{type:'connect',from:'0,1',to:E.START_TILE});assert.equal(w.money,money);
 E.command(w,{type:'removeRoad',edge:old[0]});
 assert.ok(old.every(id=>w.edges[id].removing));assert.ok(fresh.every(id=>!w.edges[id].removing));
 E.command(w,{type:'restoreRoad',edge:old.at(-1)});assert.ok(old.every(id=>!w.edges[id].removing));
 const paid=fresh.reduce((sum,id)=>sum+w.edges[id].paid,0);
 E.command(w,{type:'removeRoad',edge:fresh[0]});
 // Remove workers so settlement tests only the road refund.
 w.tiles[E.START_TILE].building.workers=[];
 E.tick(w);assert.equal(w.money,money+paid);
 assert.ok(old.every(id=>w.edges[id]));assert.ok(fresh.every(id=>!w.edges[id]));
});

test('legacy road removal stops at buildings and forks instead of swallowing the network',()=>{
 const w=E.newWorld(1);for(const e of Object.values(w.edges))delete e.road;
 w.tiles['0,0'].building={type:'sawmill'};
 assert.equal(E.roadComponent(w,Object.keys(w.edges)[0]).length,1);
 w.tiles['0,0'].building=null;
 const id=E.edgeId('0,0','0,1');w.edges[id]={id,a:'0,0',b:'0,1',paid:250};
 assert.equal(E.roadComponent(w,Object.keys(w.edges)[0]).length,1);
 E.command(w,{type:'removeRoad',edge:id});
 assert.equal(Object.values(w.edges).filter(e=>e.removing).length,1);
});

test('automatic routing detours around other roads and intermediate buildings',()=>{
 const w=E.newWorld(1);w.tiles={};w.edges={};w.money=100000;
 for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++){const id=`${q},${r}`;w.tiles[id]={id,q,r,terrain:'grass'};}
 for(const id of ['-2,0','2,0','0,-2','0,2'])w.tiles[id].building={type:'camp'};
 E.command(w,{type:'connect',from:'-2,0',to:'2,0'});
 const occupied=new Set(Object.values(w.edges).flatMap(e=>[e.a,e.b]));
 const plan=E.connection(w,'0,-2','0,2');
 assert.ok(plan.tiles.slice(1,-1).every(id=>!occupied.has(id)&&!w.tiles[id].building));
 E.command(w,{type:'connect',from:'0,-2',to:'0,2'});
 const group=E.roadComponent(w,Object.keys(w.edges)[0]);
 assert.ok(group.length<Object.keys(w.edges).length);
});

test('a blocked independent route gives feedback and spends nothing',()=>{
 const w=E.newWorld(1);w.money=10000;
 w.tiles={};w.edges={};
 for(let q=0;q<3;q++)w.tiles[`${q},0`]={id:`${q},0`,q,r:0,terrain:'grass',building:{type:'camp'}};
 const before=E.copy(w);
 assert.throws(()=>E.command(w,{type:'connect',from:'0,0',to:'2,0'}),/没有独立路线/);
 assert.deepEqual(w,before);
});
