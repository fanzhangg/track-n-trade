const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine');
const dry=t=>t&&!['mountain','lake'].includes(t.terrain);
function component(w,start,accept){const seen=new Set([start.id]),stack=[start];while(stack.length){const t=stack.pop();for(const [q,r] of E.DIRS){const next=w.tiles[`${t.q+q},${t.r+r}`];if(next&&accept(next)&&!seen.has(next.id)){seen.add(next.id);stack.push(next);}}}return seen;}
function largest(w,terrain){let seen=new Set(),size=0;for(const t of Object.values(w.tiles)){if(t.terrain!==terrain||seen.has(t.id))continue;const part=component(w,t,u=>u.terrain===terrain);for(const id of part)seen.add(id);size=Math.max(size,part.size);}return size;}
test('continuous terrain survives compact, scattered and linear exploration without stranding land or future fog',()=>{
 const sums={forest:0,mountain:0,lake:0};let count=0,wallCount=0,tileCount=0,rivers=0;
 for(const policy of ['near','random','line'])for(let seed=1;seed<=20;seed++){
  const w=E.newWorld(seed),rand=E.rng(seed+99);w.money=1e9;
  for(let n=0;n<24;n++){
   const fog=Object.values(w.flowers).filter(f=>f.state==='fog');
   fog.sort(policy==='line'?(a,b)=>b.a-a.a||a.b-b.b:(a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id));
   E.command(w,{type:'explore',flower:fog[policy==='random'?Math.floor(rand()*fog.length):0].id});
   const reachable=component(w,w.tiles[E.START_TILE],dry);
   assert.equal(reachable.size,Object.values(w.tiles).filter(dry).length,`${policy}/${seed}/${n}: disconnected land`);
   for(const f of Object.values(w.flowers).filter(f=>f.state==='fog'))assert.ok(E.flowerTiles(f).some(p=>E.DIRS.some(([q,r])=>dry(w.tiles[`${p.q+q},${p.r+r}`]))),`${policy}/${seed}/${n}: sealed frontier ${f.id}`);
  }
  for(const t of Object.values(w.tiles)){tileCount++;if(!dry(t))wallCount++;}
  rivers+=Object.values(w.flowers).filter(f=>f.design?.water==='river').length;
  if(policy==='near'){count++;for(const t of Object.keys(sums))sums[t]+=largest(w,t);}
  E.validate(w);
 }
 assert.ok(wallCount/tileCount>.28&&wallCount/tileCount<.44,'terrain remains substantial without consuming most land');
 for(const t of Object.keys(sums))assert.ok(sums[t]/count>=5,`${t} should form cross-flower masses, got ${sums[t]/count}`);
 assert.ok(rivers>30,'rivers are a recurring landform');
 console.log({compactMeanLargest:Object.fromEntries(Object.entries(sums).map(([k,n])=>[k,n/count])),wallShare:wallCount/tileCount,rivers});
});
