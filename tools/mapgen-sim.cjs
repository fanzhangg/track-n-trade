// Map generator sandbox: a greedy bot plays the engine under different generator knob sets
// (E.GEN) and we compare what kind of map comes out: how far raw sits from the town that wants it, how much
// spare grass there is, how many road segments a building needs, and whether the economy still grows.
// 用法：node tools/mapgen-sim.cjs [seeds=20] [ticks=1500]
const E=require('../engine.js');
const [,,SEEDS=20,TICKS=1500,MAXF=20,ONLY='']=process.argv;
// Map-intrinsic measures taken the moment a town flower is placed: how many hex steps of new road the nearest raw
// terrain of each good it buys is away (supplyDist), and how many free grass tiles lie within 3 steps (sites).
const intrinsic={supplyDist:[],sites:[]};
function onPlaced(w,f){if(!f.design.buys||f.order<=E.TUTORIAL)return;const town=tiles(w).find(t=>t.flower===f.id&&t.terrain==='town');
 for(const r in f.design.buys){let best=null;for(const t of tiles(w)){if(!E.RAW[r].includes(t.terrain))continue;const rt=E.route(w,t.id,town.id);if(rt&&(best===null||rt.tiles.length-1<best))best=rt.tiles.length-1;}intrinsic.supplyDist.push(best===null?9:best);}
 let n=0;for(const t of tiles(w)){if(t.terrain!=='grass'||t.building)continue;const rt=E.route(w,t.id,town.id);if(rt&&rt.tiles.length-1<=3)n++;}intrinsic.sites.push(n);}
const RESERVE=200,CLICKS=2;
const tiles=w=>Object.values(w.tiles);
const outOf=b=>E.RECIPES[b.type].out;
const act=(w,c)=>{try{E.command(w,c);return true;}catch(e){return false;}};
const need=(w,k)=>{for(const r of E.TECH[k].requires)if(!w.tech[r]&&!need(w,r))return false;return w.tech[k]>0||(w.money>=E.techCost(w,k)+RESERVE&&act(w,{type:'tech',key:k}));};
function balance(w){const s=E.zero(),d=E.zero();
 for(const t of tiles(w)){const b=t.building;if(!b)continue;
  if(b.type==='town'){for(const r in b.buys)d[r]+=E.townRate(w,b);continue;}
  const rc=E.RECIPES[b.type],rate=E.rate(w,t);s[rc.out]+=rate;for(const r in rc.in)d[r]+=Math.max(1,rate);}
 return{s,d};}
const consumers=(w,r)=>tiles(w).filter(t=>t.building&&(t.building.type==='town'?t.building.buys[r]:E.RECIPES[t.building.type].in[r]));
const producers=(w,r)=>tiles(w).filter(t=>t.building&&t.building.type!=='town'&&outOf(t.building)===r);
const typeFor=r=>E.BUILDINGS.find(b=>E.RECIPES[b].out===r);
function connect(w,from,to){let r;try{r=E.connection(w,from,to);}catch(e){return false;}if(r.cost>w.money)return false;return act(w,{type:'connect',from,to});}
function roads(w){let did=false;
 for(const r of E.RES){const ps=producers(w,r),cs=consumers(w,r);
  for(const p of ps)if(!cs.some(c=>E.path(w,p.id,c.id))){const c=cs.map(c=>({c,r:E.route(w,p.id,c.id)})).filter(x=>x.r).sort((a,b)=>a.r.cost-b.r.cost)[0];if(c&&connect(w,p.id,c.c.id))did=true;}
  for(const c of cs)if(!ps.some(p=>E.path(w,p.id,c.id))){const p=ps.map(p=>({p,r:E.route(w,p.id,c.id)})).filter(x=>x.r).sort((a,b)=>a.r.cost-b.r.cost)[0];if(p&&connect(w,p.p.id,c.id))did=true;}}
 return did;}
// A building goes on the free fitting tile with the cheapest road to a consumer of its output: what a
// thoughtful player would do, so the map, not the bot, decides how long the roads get.
function site(w,b){const rc=E.RECIPES[b],free=tiles(w).filter(t=>!t.building&&rc.fits.includes(t.terrain));if(!free.length)return null;
 const cs=consumers(w,rc.out);if(!cs.length)return free[0];
 // Six nearest by hex distance are routed for real; the rest cannot be cheaper by much and would make the bot crawl.
 const near=free.map(t=>({t,d:Math.min(...cs.map(c=>E.hexDist(t,c)))})).sort((a,b)=>a.d-b.d||a.t.id.localeCompare(b.t.id)).slice(0,6);
 return near.map(({t})=>({t,c:Math.min(...cs.map(c=>{const r=E.route(w,t.id,c.id);return r?r.cost:1e9;}))})).sort((a,b)=>a.c-b.c||a.t.id.localeCompare(b.t.id))[0].t;}
function build(w,r){const b=typeFor(r);if(!b)return false;if(b!=='camp'&&!need(w,b))return false;
 const t=site(w,b);if(!t||w.money<E.PRICE[b]+RESERVE)return false;
 if(!act(w,{type:'build',tile:t.id,buildType:b}))return false;
 for(const i in E.RECIPES[b].in)if(!producers(w,i).length)build(w,i);return true;}
function grow(w){const{s,d}=balance(w);let did=false;
 for(const r of E.RES)if(d[r]>0&&!producers(w,r).length&&build(w,r))did=true;
 for(const r of E.RES){if(d[r]<=s[r])continue;const ps=producers(w,r);if(!ps.length)continue;
  const open=ps.find(t=>t.building.workers.length<E.MAX_WORKERS);
  if(open){if(w.money>=E.workerCost(w,open)+RESERVE&&act(w,{type:'worker',tile:open.id}))did=true;continue;}
  const b=typeFor(r),craft=E.techCost(w,E.craftOf(b));
  if(craft<=E.PRICE[b]*2&&w.money>=craft+RESERVE){if(act(w,{type:'tech',key:E.craftOf(b)}))did=true;}
  else if(build(w,r))did=true;}
 for(const t of tiles(w)){const b=t.building;if(b?.type!=='town'||b.residents>=E.MAX_RESIDENTS)continue;
  if(Object.keys(b.buys).every(r=>s[r]>=d[r]+1)&&w.money>=E.residentCost(w,t.id)+RESERVE&&act(w,{type:'resident',tile:t.id}))did=true;}
 if(E.SELLABLE.every(r=>s[r]>=d[r])&&E.SELLABLE.some(r=>s[r]>d[r])&&!E.techMaxed(w,'era')&&w.money>=E.techCost(w,'era')+RESERVE&&act(w,{type:'tech',key:'era'}))did=true;
 return did;}
const fogs=w=>Object.values(w.flowers).filter(f=>f.state==='fog');
function want(w){const{s,d}=balance(w);
 const glut=E.SELLABLE.some(r=>s[r]>d[r]&&producers(w,r).length);
 const starved=E.RES.some(r=>d[r]>s[r]&&producers(w,r).every(t=>t.building.workers.length>=E.MAX_WORKERS)&&!tiles(w).some(t=>!t.building&&E.RECIPES[typeFor(r)].fits.includes(t.terrain)));
 return glut?'town':starved?'resource':'unknown';}
function pickFog(w){return fogs(w).sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];}
// Flowers are laid down by the engine the moment they are unlocked; nothing to orient here.
function place(w,f){onPlaced(w,f);}
// What the finished map looks like.
function measure(w){
 const placedAll=Object.values(w.flowers).filter(f=>f.state==='placed'),placed=placedAll.filter(f=>f.order>E.TUTORIAL),towns=placed.filter(f=>f.design.buys);
 const townTiles=tiles(w).filter(t=>t.building?.type==='town');
 // Raw producer to the nearest consumer of its good, in road segments actually built.
 const hops=[];let unlinked=0;
 for(const p of tiles(w).filter(t=>t.building&&t.building.type!=='town'&&!Object.keys(E.RECIPES[t.building.type].in).length)){
  const r=outOf(p.building);const ds=consumers(w,r).map(c=>E.path(w,p.id,c.id)).filter(Boolean).map(p=>p.length);if(!ds.length){unlinked++;continue;}hops.push(Math.min(...ds));}
 // Chain length: raw tile to the town that finally buys, following the recipe, in segments.
 const chain=[];for(const t of townTiles)for(const r in t.building.buys){let best=null;for(const p of tiles(w)){const b=p.building;if(!b||b.type==='town')continue;const raw=E.RAW[r];if(!E.RECIPES[b.type].fits.some(x=>raw.includes(x)))continue;const pth=E.path(w,p.id,t.id);if(pth&&(best===null||pth.length<best))best=pth.length;}if(best!==null)chain.push(best);}
 // Town goods whose raw terrain exists nowhere on the map.
 let starved=0;for(const t of townTiles)for(const r in t.building.buys)if(E.RAW[r].some(x=>!tiles(w).some(u=>u.terrain===x)))starved++;
 const grass=tiles(w).filter(t=>t.terrain==='grass'),freeGrass=grass.filter(t=>!t.building).length;
 const walls=tiles(w).filter(t=>['mountain','lake'].includes(t.terrain)).length;
 const edges=Object.keys(w.edges).length,buildings=tiles(w).filter(t=>t.building&&t.building.type!=='town').length;
 const gaps=[];for(const a of towns)for(const b of towns)if(a.id<b.id)gaps.push(Math.max(Math.abs(a.a-b.a),Math.abs(a.b-b.b),Math.abs(a.a+a.b-b.a-b.b)));
 const roadPaid=Object.values(w.edges).reduce((n,e)=>n+e.paid,0);
 const avg=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
 const sd=intrinsic.supplyDist.splice(0),sites=intrinsic.sites.splice(0);
 return{supplyDist:avg(sd),far:sd.filter(x=>x>=3).length/Math.max(1,sd.length),sites:avg(sites),earned:w.earned,income:E.income(w),flowers:w.unlocked,townShare:placed.length?towns.length/placed.length:0,minGap:gaps.length?Math.min(...gaps):0,
  hops:avg(hops),chain:avg(chain),unlinked,starved,freeGrass:freeGrass/Math.max(1,placedAll.length),wallShare:walls/tiles(w).length,
  edgesPerBld:buildings?edges/buildings:0,roadSpend:roadPaid/Math.max(1,w.earned)};}
function play(seed,ticks){const w=E.newWorld(seed);
 for(let i=0;i<ticks;i++){
  let n=0;for(const t of tiles(w)){if(n>=CLICKS)break;if(t.building&&t.building.type!=='town'&&act(w,{type:'click',tile:t.id}))n++;}
  for(let k=0;k<4&&(roads(w)||grow(w));k++);
  const f=w.unlocked<+MAXF?pickFog(w):null;
  if(f){const cost=E.flowerCost(w,f);const first=!E.earning(w)&&w.unlocked===0;
   if(w.money>=cost+(first?0:RESERVE)){if(act(w,{type:'explore',flower:f.id}))place(w,w.flowers[f.id]);}}
  E.tick(w);}
 return measure(w);}
const STRATEGIES={
 S0_dense:{townGap:0,townEvery:2,townChance:.4,walls:[0,3],grass:3,townGrass:6,demandAware:false},
 S4_default:{},
 G2:{flowerGrowth:2},
 G25:{flowerGrowth:2.5},
 S1_townGap:{townGap:1,townEvery:3,townChance:.25},
 S2_walls:{townGap:1,townEvery:3,townChance:.25,walls:[2,3],grass:1.5},
 S3_townGrass:{townGap:1,townEvery:3,townChance:.25,walls:[2,3],grass:1.5,townGrass:3},
 S5_gap2:{townGap:2,townEvery:3,townChance:.25,walls:[2,3],grass:1.5,townGrass:3,demandAware:true},
 S6_soft:{townGap:1,townEvery:3,townChance:.25,walls:[1,3],grass:2,townGrass:4,demandAware:true},
 S7_nextDoor:{townGap:1,townEvery:3,townChance:.25,walls:[2,3],grass:1.5,townGrass:3,demandAware:true,nextDoor:false},
 S8_nextDoorOnly:{townGap:1,townEvery:3,townChance:.25,demandAware:true,nextDoor:false},
 S9_gap0_nextDoor:{townEvery:2,townChance:.4,walls:[2,3],grass:1.5,townGrass:3,demandAware:true,nextDoor:false}};
const DEFAULT={...E.GEN};
const seeds=+SEEDS,ticks=+TICKS;
console.log(`seeds ${seeds}, ${ticks} rounds, up to ${MAXF} flowers`);
const rows={};
for(const[name,knobs]of Object.entries(STRATEGIES)){if(ONLY&&!ONLY.split(',').includes(name))continue;Object.assign(E.GEN,DEFAULT,knobs);const acc={};let fails=0;
 for(let s=1;s<=seeds;s++){let m;try{m=play(s,ticks);}catch(e){fails++;continue;}for(const k in m)acc[k]=(acc[k]||0)+m[k];}
 const n=Math.max(1,seeds-fails),row={};for(const k in acc)row[k]=+(acc[k]/n).toFixed(k==='earned'||k==='income'?0:2);row.fails=fails;rows[name]=row;}
console.table(rows);
if(process.env.DEBUG){Object.assign(E.GEN,DEFAULT,STRATEGIES[process.env.DEBUG]);const w=E.newWorld(1);const save=play;/* replay one seed and list town flowers */
 const w2=(()=>{const w=E.newWorld(1);for(let i=0;i<+TICKS;i++){let n=0;for(const t of tiles(w)){if(n>=CLICKS)break;if(t.building&&t.building.type!=='town'&&act(w,{type:'click',tile:t.id}))n++;}for(let k=0;k<4&&(roads(w)||grow(w));k++);const f=w.unlocked<+MAXF?pickFog(w):null;if(f){const cost=E.flowerCost(w,f);if(w.money>=cost+(w.unlocked?RESERVE:0)&&act(w,{type:'explore',flower:f.id}))place(w,w.flowers[f.id]);}E.tick(w);}return w;})();
 for(const f of Object.values(w2.flowers).filter(f=>f.state==='placed').sort((a,b)=>a.order-b.order))console.log(f.order,f.id,f.design.buys?JSON.stringify(f.design.buys):'-',[f.design.center,...f.design.ring].join(','));}
