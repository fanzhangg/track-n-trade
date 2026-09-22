// Fog-hint pricing sandbox: a greedy bot plays the engine for a fixed number of rounds, choosing which fog to open by
// one fixed policy, and we compare policies under different discounts for the `unknown` back.
// 用法：node tools/fog-hint-sim.cjs [seeds=20] [ticks=1500] [discounts=1,.9,.8,.7,.6]
const E=require('../engine.js');
const [,,SEEDS=20,TICKS=1500,DISC='1,.9,.8,.7,.6']=process.argv;
const RESERVE=1500,CLICKS=2;
const tiles=w=>Object.values(w.tiles);
const outOf=b=>E.RECIPES[b.type].out;
const act=(w,c)=>{try{E.command(w,c);return true;}catch(e){return false;}};
const need=(w,k)=>{for(const r of E.TECH[k].requires)if(!w.tech[r]&&!need(w,r))return false;return w.tech[k]>0||(w.money>=E.techCost(w,k)+RESERVE&&act(w,{type:'tech',key:k}));};
// Supply and demand per good, in pieces per round.
function balance(w){const s=E.zero(),d=E.zero();
 for(const t of tiles(w)){const b=t.building;if(!b)continue;
  if(b.type==='town'){for(const r in b.buys)d[r]+=E.townRate(w,b);continue;}
  const rc=E.RECIPES[b.type],rate=E.rate(w,t);s[rc.out]+=rate;for(const r in rc.in)d[r]+=Math.max(1,rate);}
 return{s,d};}
const consumers=(w,r)=>tiles(w).filter(t=>t.building&&(t.building.type==='town'?t.building.buys[r]:E.RECIPES[t.building.type].in[r]));
const producers=(w,r)=>tiles(w).filter(t=>t.building&&t.building.type!=='town'&&outOf(t.building)===r);
const typeFor=r=>E.BUILDINGS.find(b=>E.RECIPES[b].out===r);
function connect(w,from,to){let r;try{r=E.connection(w,from,to);}catch(e){return false;}if(r.cost>w.money)return false;return act(w,{type:'connect',from,to});}
// Give every producer a road to a consumer of its good and every consumer a road from a producer of each input.
function roads(w){let did=false;
 for(const r of E.RES){const ps=producers(w,r),cs=consumers(w,r);
  for(const p of ps)if(!cs.some(c=>E.path(w,p.id,c.id))){const c=cs.map(c=>({c,r:E.route(w,p.id,c.id)})).filter(x=>x.r).sort((a,b)=>a.r.cost-b.r.cost)[0];if(c&&connect(w,p.id,c.c.id))did=true;}
  for(const c of cs)if(!ps.some(p=>E.path(w,p.id,c.id))){const p=ps.map(p=>({p,r:E.route(w,p.id,c.id)})).filter(x=>x.r).sort((a,b)=>a.r.cost-b.r.cost)[0];if(p&&connect(w,p.p.id,c.id))did=true;}}
 return did;}
// Build the chain for a good: the building that makes it (tech first), then whatever its inputs need.
function build(w,r){const b=typeFor(r);if(!b)return false;if(b!=='camp'&&!need(w,b))return false;
 const site=tiles(w).find(t=>!t.building&&E.RECIPES[b].fits.includes(t.terrain));if(!site||w.money<E.PRICE[b]+RESERVE)return false;
 if(!act(w,{type:'build',tile:site.id,buildType:b}))return false;
 for(const i in E.RECIPES[b].in)if(!producers(w,i).length)build(w,i);return true;}
function grow(w){const{s,d}=balance(w);let did=false;
 // Goods a town wants but nobody makes.
 for(const r of E.RES)if(d[r]>0&&!producers(w,r).length&&build(w,r))did=true;
 // Short goods: hire, then craft, then a second building.
 for(const r of E.RES){if(d[r]<=s[r])continue;const ps=producers(w,r);if(!ps.length)continue;
  const open=ps.find(t=>t.building.workers.length<E.MAX_WORKERS);
  if(open){if(w.money>=E.workerCost(w,open)+RESERVE&&act(w,{type:'worker',tile:open.id}))did=true;continue;}
  const b=typeFor(r),craft=E.techCost(w,E.craftOf(b));
  if(craft<=E.PRICE[b]*2&&w.money>=craft+RESERVE){if(act(w,{type:'tech',key:E.craftOf(b)}))did=true;}
  else if(build(w,r))did=true;}
 // Glut: more demand through residents, then eras.
 for(const t of tiles(w)){const b=t.building;if(b?.type!=='town'||b.residents>=E.MAX_RESIDENTS)continue;
  if(Object.keys(b.buys).every(r=>s[r]>=d[r]+1)&&w.money>=E.residentCost(w,t.id)+RESERVE&&act(w,{type:'resident',tile:t.id}))did=true;}
 if(E.SELLABLE.every(r=>s[r]>=d[r])&&E.SELLABLE.some(r=>s[r]>d[r])&&!E.techMaxed(w,'era')&&w.money>=E.techCost(w,'era')+RESERVE&&act(w,{type:'tech',key:'era'}))did=true;
 return did;}
// Which fog to open. Policies rank the three backs; `smart` reads the economy.
const fogs=w=>Object.values(w.flowers).filter(f=>f.state==='fog');
function want(w){const{s,d}=balance(w);
 const glut=E.SELLABLE.some(r=>s[r]>d[r]&&producers(w,r).length);
 const starved=E.RES.some(r=>d[r]>s[r]&&producers(w,r).every(t=>t.building.workers.length>=E.MAX_WORKERS)&&!tiles(w).some(t=>!t.building&&E.RECIPES[typeFor(r)].fits.includes(t.terrain)));
 return glut?'town':starved?'resource':'unknown';}
const POLICIES={
 town:()=>['town','unknown','resource'],
 resource:()=>['resource','unknown','town'],
 unknown:()=>['unknown','town','resource'],
 informed:w=>{const h=want(w);return h==='unknown'?(w.unlocked%2?['town','resource','unknown']:['resource','town','unknown']):[h,...['town','resource','unknown'].filter(x=>x!==h)];},
 smart:w=>{const h=want(w);return [h,...['unknown','town','resource'].filter(x=>x!==h)];},
 random:(w,rand)=>{const h=E.HINTS[Math.floor(rand()*3)];return [h,...E.HINTS.filter(x=>x!==h)];}};
function pickFog(w,policy,rand){const order=POLICIES[policy](w,rand);const near=f=>E.flowerDistance(f);
 for(const h of order){const fs=fogs(w).filter(f=>E.fogHint(w,f)===h).sort((a,b)=>near(a)-near(b)||a.id.localeCompare(b.id));if(fs.length)return fs[0];}
 return fogs(w)[0];}
// Flowers are laid down by the engine the moment they are unlocked; nothing to orient here.
function place(w,f){}
function play(seed,policy,ticks){const w=E.newWorld(seed),rand=E.rng(seed*31+7),log=[];
 for(let i=0;i<ticks;i++){
  let n=0;for(const t of tiles(w)){if(n>=CLICKS)break;if(t.building&&t.building.type!=='town'&&act(w,{type:'click',tile:t.id}))n++;}
  for(let k=0;k<4&&(roads(w)||grow(w));k++);
  const f=pickFog(w,policy,rand);
  if(f){const cost=E.flowerCost(w,f);const first=!E.earning(w)&&w.unlocked===0;
   if(w.money>=cost+(first?0:RESERVE)){if(act(w,{type:'explore',flower:f.id})){log.push(E.fogHint(w,f));place(w,w.flowers[f.id]);}}}
  E.tick(w);}
 return{earned:w.earned,income:E.income(w),unlocked:w.unlocked,opened:log};}
const seeds=+SEEDS,ticks=+TICKS,discounts=DISC.split(',').map(Number),policies=Object.keys(POLICIES);
console.log(`seeds ${seeds}, ${ticks} rounds, policies ${policies.join(' ')}`);
for(const disc of discounts){E.FOG_DISCOUNT.unknown=disc;const row={};
 for(const p of policies){let earned=0,income=0,unlocked=0,opened={town:0,resource:0,unknown:0};
  for(let s=1;s<=seeds;s++){const r=play(s,p,ticks);earned+=r.earned;income+=r.income;unlocked+=r.unlocked;for(const h of r.opened)opened[h]++;}
  row[p]={earned:Math.round(earned/seeds),income:Math.round(income/seeds),flowers:(unlocked/seeds).toFixed(1),mix:`${opened.town}/${opened.resource}/${opened.unknown}`};}
 const best=Math.max(...policies.map(p=>row[p].earned));
 console.log(`\nunknown discount ${disc}`);console.log('policy    earned    vs best  income/rd  flowers  opened t/r/u');
 for(const p of policies)console.log(`${p.padEnd(9)} ${String(row[p].earned).padStart(8)}  ${(100*row[p].earned/best).toFixed(0).padStart(5)}%  ${String(row[p].income).padStart(8)}  ${row[p].flowers.padStart(7)}  ${row[p].mix}`);}
