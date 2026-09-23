/* v0.14 deterministic simulation. One tick is one round (DT seconds of real time at 1x). Every stored quantity is an
   integer. The map is an unbounded field of seven-hex "flowers": only the start flower is preset, every other one is
   generated the moment the player unlocks it, from the unlock order, the current state of the world and the save's seed.
   Buildings follow recipes (one of each input -> one output), techs are one global tree bought with coins, roads have
   unlimited capacity, and freight is routed by what a piece is worth at its destination. */
(function(root){
'use strict';
const RES=['log','stone','board','tool','ore','iron'],SELLABLE=['log','stone','board','tool','iron'];
const GOODS={log:'原木',stone:'石头',board:'木板',tool:'石头工具',ore:'铁矿石',iron:'铁'};
const BASE_PRICE={log:20,stone:30,board:50,tool:120,iron:150};
const TPS=1,DT=2,WINDOW=30,YARD=20;
const PRICE={camp:1200,quarry:1000,sawmill:1400,mason:2000,mine:1800,smelter:2600};
const WORKER={camp:300,quarry:400,mine:500,sawmill:600,mason:700,smelter:900},WORKER_GROWTH=1.3,MAX_WORKERS=3;
// Recipes: every listed input is consumed one piece per piece made. `fits` is the terrain the building stands on.
const RECIPES={
 camp:{name:'伐木营',in:{},out:'log',fits:['forest']},
 quarry:{name:'采石场',in:{},out:'stone',fits:['rock']},
 sawmill:{name:'锯木厂',in:{log:1},out:'board',fits:['grass']},
 mason:{name:'石匠铺',in:{log:1,stone:1},out:'tool',fits:['grass']},
 mine:{name:'矿山',in:{},out:'ore',fits:['ore']},
 smelter:{name:'铁厂',in:{ore:1,log:1},out:'iron',fits:['grass']}};
const BUILDINGS=Object.keys(RECIPES);
const workshop=b=>!!b&&b.type!=='town';
// The raw terrain a good ultimately comes from: a town never shares a flower with the terrain that feeds it.
const RAW={log:['forest'],stone:['rock'],board:['forest'],tool:['forest','rock'],iron:['ore','forest']};
// One global tech tree, all coins. `kind` building unlocks a building type, `waterway` opens lakes,
// `economy` is a global multiplier; `repeat` techs are levelled with type-specific prices.
// Every building type has a repeatable `craft` tech: each level gives every worker of that type one more
// piece per round, so the player raises the link of the chain that is short instead of the whole map.
// `era` is the demand-side twin: each era every resident of every town takes TOWN_RATE more of each good.
const ERAS=['农业时代','封建时代','工业时代','电气时代','信息时代'];
const TECH={
 era:{name:'时代',requires:[],kind:'economy',tier:1,repeat:true,max:ERAS.length-1,desc:'全图所有居民每种货每回合多收 2 件'},
 quarry:{name:'采石场',cost:600,requires:[],kind:'building',tier:1,desc:'可以在岩地建采石场'},
 sawmill:{name:'锯木厂',cost:1200,requires:['quarry'],kind:'building',tier:1,desc:'可以在草地建锯木厂，原木 → 木板'},
 mason:{name:'石匠铺',cost:2400,requires:['sawmill','quarry'],kind:'building',tier:2,desc:'原木 + 石头 → 石头工具'},
 waterway:{name:'航道',cost:1600,requires:['sawmill'],kind:'waterway',tier:2,desc:'湖上可以铺路'},
 mine:{name:'矿山',cost:3000,requires:['mason'],kind:'building',tier:3,desc:'可以在铁矿建矿山'},
 smelter:{name:'铁厂',cost:6000,requires:['mine'],kind:'building',tier:4,desc:'铁矿石 + 原木 → 铁'}};
for(const b of BUILDINGS)TECH[b+'Craft']={name:RECIPES[b].name+'工艺',requires:b==='camp'?[]:[b],kind:'economy',tier:b==='camp'?1:TECH[b].tier,repeat:true,building:b,desc:`每座${RECIPES[b].name}的每名工人每回合多 1 件`};
const craftOf=b=>b+'Craft';
const TERRAINS=['grass','town','forest','rock','ore','mountain','lake'];
const TERRAIN_NAME={grass:'草地',town:'城镇',forest:'森林',rock:'岩地',ore:'铁矿',mountain:'山',lake:'湖'};
const TERRAIN_FACTOR={grass:1,town:1,forest:2,rock:2,ore:2,lake:3};
// Roads only connect: a piece moves one segment per round and a segment carries any number of pieces.
const ROAD_BASE=250;
// Roads cost nothing to run and never clog: every piece moves one segment per round, however many share it.
// Production and idling are free. Buildings are paid for once, at a price based on their existing count.
const FAR_BONUS=.15,BUILDING_GROWTH=1.3;
// Towns mirror workshops: up to MAX_RESIDENTS residents, each taking TOWN_RATE of every good per round times the
// global era. Residents use nominal demand value; craft and era prices depend only on type and level.
const TOWN_RATE=2,MAX_RESIDENTS=3,PAYBACK=12,GROWTH=1.5,REFUND=1,START_MONEY=2600;
// The start budget carries the first flower plus the road to its town, bends included: tight, never a dead end.
// Exploration grows more slowly than exponentially, leaving budget for the complete new production chain.
const FLOWER_BASE=600,FLOWER_PAIR=2,TUTORIAL=0;
const CRAFT_BASE={camp:600,quarry:750,sawmill:1100,mason:1800,mine:1300,smelter:2200},CRAFT_GROWTH=1.6,ERA_BASE=2400;
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const zero=()=>Object.fromEntries(RES.map(r=>[r,0])),copy=x=>JSON.parse(JSON.stringify(x));
const add=(a,b)=>{for(const r of RES)a[r]=(a[r]||0)+(b[r]||0);};
const id=w=>String(++w.serial).padStart(6,'0'),edgeId=(a,b)=>[a,b].sort().join('|');
const hexDist=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
const adjacent=(a,b)=>hexDist(a,b)===1;
const key=(q,r)=>`${q},${r}`;

/* ---------- flowers ---------- */
// Flower centres sit on the lattice a·(3,−1) + b·(1,2); the lattice is itself a hex grid, so flower adjacency and
// flower distance use the same six directions as tiles.
const flowerCenter=(a,b)=>({q:3*a+b,r:-a+2*b});
const fidOf=(a,b)=>`${a},${b}`;
const flowerDistance=f=>Math.max(Math.abs(f.a),Math.abs(f.b),Math.abs(f.a+f.b));
function flowerCost(w,f=null,n=w.unlocked+1){return Math.round(FLOWER_BASE*(1+.35*(n-1))**1.35);}
// Tile i of a flower: 0 is the centre, 1..6 the neighbours in DIRS order. Rotation shifts the ring.
function flowerTiles(f){const c=f.center,out=[{q:c.q,r:c.r,slot:0}];for(let i=0;i<6;i++)out.push({q:c.q+DIRS[i][0],r:c.r+DIRS[i][1],slot:1+((i-f.rotation+6)%6)});return out;}
const slotTerrain=(design,slot)=>slot===0?design.center:design.ring[slot-1];
function addFog(w,a,b){const k=fidOf(a,b);if(w.flowers[k])return null;return w.flowers[k]={id:k,a,b,center:flowerCenter(a,b),state:'fog',design:null,rotation:0,order:0};}
// New fog around a placed flower: every empty neighbour slot. Fog says nothing about what it hides.
function spawnFog(w,f){for(const[da,db]of DIRS)addFog(w,f.a+da,f.b+db);}
function materialize(w,f){for(const p of flowerTiles(f)){const terrain=slotTerrain(f.design,p.slot),k=key(p.q,p.r);
 w.tiles[k]={id:k,q:p.q,r:p.r,terrain,flower:f.id,loose:zero(),building:null};
 if(terrain==='town'){w.tiles[k].building={id:id(w),type:'town',residents:1,paid:0,buys:copy(f.design.buys)};w.sold[k]=zero();}}}

/* ---------- random ---------- */
function rng(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296;};}
const mix=(a,b)=>((a*2654435761)^(b*40503)^0x9e3779b9)>>>0;
const pick=(rand,list)=>list[Math.floor(rand()*list.length)];
function shuffle(rand,list){for(let i=list.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}

/* ---------- flower generation ---------- */
const LOCAL=[[0,0],...DIRS];
const localAdj=(a,b)=>Math.max(Math.abs(LOCAL[a][0]-LOCAL[b][0]),Math.abs(LOCAL[a][1]-LOCAL[b][1]),Math.abs(LOCAL[a][0]+LOCAL[a][1]-LOCAL[b][0]-LOCAL[b][1]))===1;
function connectedSlots(idx){if(!idx.length)return true;const seen=new Set([idx[0]]),st=[idx[0]];while(st.length){const a=st.pop();for(const b of idx)if(!seen.has(b)&&localAdj(a,b)){seen.add(b);st.push(b);}}return seen.size===idx.length;}
// Every flower must pass this: no pocket walled off by mountains or lakes (a lake is a wall
// until the waterway tech), a town with at most two mountains around it, mountains and lakes each in one piece, ore
// next to a mountain, and at least three walkable ring tiles so the flower can be joined to its neighbours whatever
// the rotation. `ringTown` additionally keeps the town off the centre so rotating always moves it.
const WALL=['mountain','lake'];
function validDesign(tiles,ringTown=false){const idx=t=>tiles.map((x,i)=>x===t?i:-1).filter(i=>i>=0);
 const town=idx('town'),mts=idx('mountain'),lakes=idx('lake'),ores=idx('ore');
 if(tiles.length!==7)return false;
 if(town.length>1||(ringTown&&town[0]===0))return false;
 if(town.length&&mts.filter(m=>localAdj(town[0],m)).length>2)return false;
 if(!connectedSlots(tiles.map((x,i)=>WALL.includes(x)?-1:i).filter(i=>i>=0)))return false;
 if(lakes.length>1&&!connectedSlots(lakes))return false;
 if(mts.length>1&&!connectedSlots(mts))return false;
 if(ores.length&&!ores.every(o=>mts.some(m=>localAdj(o,m))))return false;
 // Forest grows in one clump; a rock or ore tile stands alone, never touching another raw tile.
 const forests=idx('forest'),lone=[...idx('rock'),...ores],raw=[...forests,...lone];
 if(forests.length>1&&!connectedSlots(forests))return false;
 if(lone.some(a=>raw.some(b=>b!==a&&localAdj(a,b))))return false;
 if(tiles.slice(1).filter(t=>!WALL.includes(t)).length<3)return false;
 return true;}
// Up to `want` distinct valid layouts drawn from the same pool: the orientation step picks among them.
function drawDesigns(rand,must,pool,cap,ringTown=false,want=CANDIDATES){const out=[],seen=new Set();for(let tries=0;tries<500&&out.length<want;tries++){const tiles=[];for(const t in must)for(let k=0;k<must[t];k++)tiles.push(t);
 const count=t=>tiles.filter(x=>x===t).length;let guard=0;
 while(tiles.length<7&&guard++<200){const t=pick(rand,pool);if(cap[t]!=null&&count(t)>=cap[t])continue;tiles.push(t);}
 if(tiles.length<7)continue;shuffle(rand,tiles);const k=tiles.join();if(!seen.has(k)&&validDesign(tiles,ringTown)){seen.add(k);out.push(tiles);}}
 return out;}
// Sandbox flowers answer the current economy: a town every third flower at most two apart, buying what the player
// makes but cannot sell twice over (or the next good the tree unlocks), priced up with distance; terrain the player
// has run out of gets a heavier weight; ore only appears once the tree has reached mines.
function producible(w){return BUILDINGS.filter(b=>b==='camp'||w.tech[b]).map(b=>RECIPES[b].out);}
function nextGoods(w){return BUILDINGS.filter(b=>!w.tech[b]&&b!=='camp'&&TECH[b].requires.every(r=>w.tech[r])).map(b=>RECIPES[b].out);}
function buyersOf(w,r){return Object.values(w.tiles).filter(t=>t.building?.type==='town'&&t.building.buys[r]).length;}
function freeTiles(w,terrain){return Object.values(w.tiles).filter(t=>t.terrain===terrain&&!t.building).length;}
// Hard discovery cadence: a market is followed by its supply, independent of map direction.
const GEN={demandAware:true,novelEvery:2,townEvery:2};
const flowerGap=(f,g)=>Math.max(Math.abs(f.a-g.a),Math.abs(f.b-g.b),Math.abs(f.a+f.b-g.a-g.b));
// Placed flowers touching f, and what their towns buy / which raw terrain they carry.
const neighbours=(w,f)=>Object.values(w.flowers).filter(g=>g.state==='placed'&&flowerGap(f,g)===1);
// Raw terrain the economy is short of: every good a town buys, followed down its recipe to the terrain it grows on,
// counts once per town that buys it and has no free tile of that terrain anywhere on the map.
function rawDeficit(w){const d={forest:0,rock:0,ore:0};if(!GEN.demandAware)return d;
 const has=terrain=>Object.values(w.tiles).some(t=>t.terrain===terrain&&!t.building);
 for(const t of Object.values(w.tiles)){const b=t.building;if(b?.type!=='town')continue;
  for(const r in b.buys)for(const terrain of RAW[r])if(!has(terrain)&&(terrain!=='ore'||w.tech.mine||w.tech.mason))d[terrain]++;}
 return d;}
// What the map already offers, for the novelty rule.
const boughtGoods=w=>new Set(Object.values(w.tiles).filter(t=>t.building?.type==='town').flatMap(t=>Object.keys(t.building.buys)));
const terrainsOn=w=>new Set(Object.values(w.tiles).map(t=>t.terrain));
// The supply chain as the generator sees it, derived from the recipes, never listed by hand. rawOf(good): the raw
// terrains a good ultimately grows on. goodsFrom(terrain): every good that terrain can end up as. A gap is an open
// end of the chain on the map: a buyer with no raw for its good (downstream gap), or raw with no buyer for anything
// it can become (upstream gap). The next flower closes a gap before it does anything else.
const makerOf=r=>BUILDINGS.find(b=>RECIPES[b].out===r);
// Terrains that grow something: where a building with no inputs stands. Grass only hosts workshops and is no supply.
const RAW_TERRAINS=[...new Set(BUILDINGS.filter(b=>!Object.keys(RECIPES[b].in).length).flatMap(b=>RECIPES[b].fits))];
function rawOf(r){const b=makerOf(r);if(!b)return [];const ins=Object.keys(RECIPES[b].in);return ins.length?[...new Set(ins.flatMap(rawOf))]:RECIPES[b].fits;}
function goodsFrom(terrain){const out=new Set();for(const b of BUILDINGS)if(RECIPES[b].fits.includes(terrain))out.add(RECIPES[b].out);
 let grew=true;while(grew){grew=false;for(const b of BUILDINGS)if(Object.keys(RECIPES[b].in).some(i=>out.has(i))&&!out.has(RECIPES[b].out)){out.add(RECIPES[b].out);grew=true;}}
 return [...out].filter(r=>SELLABLE.includes(r));}
// Sellable goods from cheapest up: the natural ladder, and the order gaps are closed in.
const LADDER=SELLABLE.slice().sort((a,b)=>BASE_PRICE[a]-BASE_PRICE[b]);
function chainGaps(w){const bought=boughtGoods(w),free=t=>Object.values(w.tiles).some(x=>x.terrain===t&&!x.building);
 const rawNeeded=[...new Set([...bought].flatMap(rawOf).filter(t=>!Object.values(w.tiles).some(x=>x.terrain===t)))];
 const present=[...new Set(Object.values(w.tiles).map(t=>t.terrain))].filter(t=>RAW_TERRAINS.includes(t));
 const buyerNeeded=[...new Set(present.filter(t=>!goodsFrom(t).some(r=>bought.has(r))).flatMap(goodsFrom))].sort((a,b)=>LADDER.indexOf(a)-LADDER.indexOf(b));
 return{rawNeeded,buyerNeeded};}
// Discovery is ordered; terrain arrangements, borders and distances remain seeded and random.
// A missing input is a hard obligation, taking precedence over town spacing and water decoration.
function discovery(w){
 const bought=boughtGoods(w),gaps=chainGaps(w),last=Object.values(w.flowers).filter(f=>f.state==='placed').sort((a,b)=>b.order-a.order)[0];
 if(gaps.rawNeeded.length)return {terrain:gaps.rawNeeded[0],reason:'补齐原料'};
 if(last.order>0&&last.design.buys){const goods=Object.keys(last.design.buys);const raw=goods.flatMap(rawOf);return {terrain:raw.includes('ore')?'ore':raw.includes('rock')?'rock':'forest',reason:'配套产地'};}
 const next=LADDER.find(r=>!bought.has(r));
 const previous=Object.values(w.flowers).filter(f=>f.order>0&&f.design?.buys).sort((a,b)=>b.order-a.order)[0];
 const good=next||LADDER.filter(r=>!previous?.design.buys[r]).sort((a,b)=>buyersOf(w,a)-buyersOf(w,b)||LADDER.indexOf(b)-LADDER.indexOf(a))[0];
 return {good,reason:next?'新产业':'新市场'};
}
function sandboxDesign(w,f,rand,force=null){
 const plan=discovery(w),onMap=terrainsOn(w);let buys=force?copy(force):null;
 if(!buys&&plan.good){const r=plan.good;let distance=5;const raw=Object.values(w.tiles).filter(t=>rawOf(r).includes(t.terrain));if(raw.length)distance=Math.min(5,Math.max(1,Math.min(...raw.map(t=>hexDist(t,f.center)))-1));buys={[r]:Math.round(BASE_PRICE[r]*(1+FAR_BONUS*distance))};if(LADDER.every(g=>boughtGoods(w).has(g))){const other=LADDER.filter(g=>g!==r).sort((a,b)=>buyersOf(w,a)-buyersOf(w,b)||LADDER.indexOf(a)-LADDER.indexOf(b))[0];buys[other]=Math.round(BASE_PRICE[other]*(1+FAR_BONUS*distance));}}
 const terrain=buys?null:plan.terrain;
 // Continue neighbouring landforms instead of scattering isolated decorative obstacles.
 const around=neighbours(w,f),waters=around.filter(g=>g.design.water),mountains=around.filter(g=>[g.design.center,...g.design.ring].filter(t=>t==='mountain').length>=2);
 const water=terrain==='ore'?null:waters.length&&rand()<.8?(waters.some(g=>g.design.water==='river')&&rand()<.7?'river':'lake'):mountains.length&&rand()<.7?null:rand()<.5?(rand()<.45?'river':'lake'):null;
 const obstacle=water?'lake':'mountain',count=water==='river'?3:rand()<.7?3:2;
 const must=buys?{town:1}:{[terrain]:terrain==='forest'?3:1};must[obstacle]=count;
 const cap={town:1,mountain:3,lake:3,forest:4,rock:1,ore:1};
 const wooded=!buys||!Object.keys(buys).some(r=>rawOf(r).includes('forest'));
 const pool=wooded?['grass','forest','forest']:['grass'];
 let layouts=drawDesigns(rand,must,pool,cap,false,24);
 if(water==='river')layouts=layouts.filter(ts=>{const waterSlots=ts.map((t,i)=>t==='lake'?i:-1).filter(i=>i>=0);return waterSlots.some(a=>waterSlots.some(b=>a!==b&&!localAdj(a,b)));});
 if(!layouts.length){must[obstacle]=2;layouts=drawDesigns(rand,must,pool,cap,false,24);}
 return {layouts,buys,water,plan};
}
// There is no rotating: the engine lays the flower down in the orientation (and layout) that fits the land around
// it. Mountains and lakes continue ranges on the neighbouring flowers, the passable border to the rest of the map
// is kept to a couple of tiles so ridges have passes rather than gaps, and while nothing earns yet the first road
// to the new town must be affordable. Terrain is fate; the road is the decision.
const CANDIDATES=12;
function orient(w,f,draft,rand){const at=(q,r)=>w.tiles[key(q,r)];let best=null;
 for(const tiles of draft.layouts)for(let rotation=0;rotation<6;rotation++){const g={...f,design:{center:tiles[0],ring:tiles.slice(1),buys:draft.buys,water:draft.water||null},rotation};
  let ridge=0,passes=0,join=0,cluster=0,river=0,apart=0;const RAWT=['forest','rock','ore'];
  // Hard rule: a town and the raw terrain it needs are never adjacent. Checked both ways across the border: this
  // flower's town against the map's raw, and this flower's raw against the map's towns.
  const needs=b=>new Set(Object.keys(b||{}).flatMap(r=>RAW[r]));const myNeeds=needs(g.design.buys);
  for(const p of flowerTiles(g)){const terrain=slotTerrain(g.design,p.slot);
   for(const[dq,dr]of DIRS){const t=at(p.q+dq,p.r+dr);if(!t)continue;
    if(terrain==='town'&&myNeeds.has(t.terrain))apart++;
    if(RAWT.includes(terrain)&&t.building?.type==='town'&&needs(t.building.buys).has(terrain))apart++;}}
  // A river continues from the upstream water tile it touches and runs as far from it as the flower allows.
  if(draft.water){const mine=flowerTiles(g).filter(p=>slotTerrain(g.design,p.slot)==='lake');let up=null;
   for(const p of mine)for(const[dq,dr]of DIRS){const t=at(p.q+dq,p.r+dr);if(t&&t.terrain==='lake'&&w.flowers[t.flower].design.water==='river')up=up||t;}
   if(up){river+=6;if(draft.water==='river')river+=2*Math.max(...mine.map(p=>hexDist(p,up)));}
   else if(draft.water==='river'&&Object.values(w.tiles).some(t=>t.terrain==='lake'&&w.flowers[t.flower].design.water==='river'&&neighbours(w,f).some(n=>n.id===t.flower)))river-=6;}
  for(const p of flowerTiles(g)){const terrain=slotTerrain(g.design,p.slot);
   for(const[dq,dr]of DIRS){const t=at(p.q+dq,p.r+dr);if(!t)continue;
    if(WALL.includes(terrain)&&WALL.includes(t.terrain))ridge+=terrain==='lake'&&t.terrain==='lake'?3:terrain===t.terrain?3:1;
    if(!WALL.includes(terrain)&&!WALL.includes(t.terrain)){passes++;join=1;}
    // Rock and ore keep their distance from every other raw tile across the border; forest may join a forest.
    if(RAWT.includes(terrain)&&RAWT.includes(t.terrain))cluster+=terrain==='forest'&&t.terrain==='forest'?-1.5:1.5;}}
  if(apart||!join)continue;
  // Do not close the last land approach to any unexplored neighbour. Otherwise buying a
  // surrounded fog flower could produce an unreachable resource even with an all-grass layout.
  const added=new Map(flowerTiles(g).map(p=>[key(p.q,p.r),slotTerrain(g.design,p.slot)]));
  const frontier=DIRS.map(([a,b])=>({a:f.a+a,b:f.b+b,center:flowerCenter(f.a+a,f.b+b),rotation:0})).filter(h=>w.flowers[fidOf(h.a,h.b)]?.state!=='placed');
  if(frontier.some(h=>!flowerTiles(h).some(p=>DIRS.some(([dq,dr])=>{const k=key(p.q+dq,p.r+dr),t=added.get(k)||w.tiles[k]?.terrain;return t&&!WALL.includes(t);}))))continue;
  let score=ridge-cluster+river+(passes<=2?1:-(passes-2)*.7)+rand()*.5;
  if(!join)score-=50;
  if(!best||score>best.score)best={score,design:g.design,rotation};}
 return best;}
function generateFlower(w,n,f){const rand=rng(mix(w.seed,n)),draft=sandboxDesign(w,f,rand);let result=orient(w,f,draft,rand);
 if(!result){const center=draft.buys?'town':draft.plan.terrain;const ring=['grass','grass','grass','grass','grass',center==='ore'?'mountain':'grass'];result=orient(w,f,{...draft,layouts:[[center,...ring]],water:null},rand);}
 if(!result)throw Error('无法生成可通行板块');return result;}

/* ---------- world ---------- */
// One rock, not two: with forest, rock, ore and mountain around the start, most exits cost double and the first
// road ate three quarters of the start money. The second grass keeps one cheap way out in every direction.
// The start flower: one forest, a town that buys logs one tile away from it (the same rule as everywhere: a town and
// the raw it needs never touch), the rest grass and a mountain. The camp on the forest and the two-segment road to
// the town is the whole first lesson; START_MONEY pays for exactly that.
const START_DESIGN={center:'grass',ring:['forest','grass','town','grass','mountain','grass'],buys:{log:20}},START_TILE='1,0',START_TOWN='0,-1';
function newWorld(seed=1){const w={schemaVersion:22,seed:seed>>>0,tick:0,serial:0,flowers:{},tiles:{},edges:{},shipments:[],scheduler:{},stats:[],money:START_MONEY,earned:0,spent:0,production:zero(),consumption:zero(),sold:{},tech:{},unlocked:0,lastTownUnlock:0,preview:null,clicks:0,manual:{out:zero(),tiles:{},sales:{},gross:0},goals:Object.fromEntries(GOALS.map(g=>[g.id,1])),flags:{},paused:false,lastNovel:0};
 for(const k of Object.keys(TECH))w.tech[k]=0;
 const f={id:fidOf(0,0),a:0,b:0,center:flowerCenter(0,0),state:'placed',design:copy(START_DESIGN),rotation:0,order:0};
 w.flowers[f.id]=f;materialize(w,f);spawnFog(w,f);
 w.initial=totals(w);return w;}

/* ---------- prices ---------- */
function buildingCost(w,type){const n=Object.values(w.tiles).filter(t=>t.building?.type===type).length;return Math.round(PRICE[type]*BUILDING_GROWTH**n);}
function workerCost(w,t){const b=t.building;return Math.round(WORKER[b.type]*WORKER_GROWTH**b.workers.length);}
// What one more piece of a good is worth at best: its town price, or the price of what it turns into.
function goodValue(r){if(BASE_PRICE[r])return BASE_PRICE[r];return Math.max(0,...Object.values(RECIPES).filter(rc=>rc.in[r]).map(rc=>goodValue(rc.out)));}
const workersOf=(w,b)=>Object.values(w.tiles).reduce((n,t)=>n+(t.building?.type===b?t.building.workers.length:0),0);
// A craft level adds one piece per worker of that type; an era adds TOWN_RATE per resident of every good.
function craftCost(w,b){return Math.round(CRAFT_BASE[b]*(1+w.tech[craftOf(b)])**CRAFT_GROWTH);}
function eraCost(w){return ERA_BASE*2**w.tech.era;}
function techCost(w,k){const u=TECH[k];if(k==='era')return eraCost(w);if(u.building)return craftCost(w,u.building);return u.repeat?Math.round(u.base*u.growth**w.tech[k]):u.cost;}
const techOwned=(w,k)=>!TECH[k].repeat&&w.tech[k]>0;
const techMaxed=(w,k)=>TECH[k].max!=null&&w.tech[k]>=TECH[k].max;
const techAvailable=(w,k)=>TECH[k].requires.every(r=>w.tech[r]>0);
const workerPower=(w,type)=>1+(w.tech[craftOf(type)]||0),eraPower=w=>1+(w.tech.era||0);
// Manual work follows this workshop type's craft; towns only buy automatically.
function clickPower(w,t){return workshop(t?.building)?workerPower(w,t.building.type):0;}
const passable=(w,t)=>t.terrain!=='mountain'&&(t.terrain!=='lake'||w.tech.waterway>0);
const terrainFactor=(a,b)=>Math.max(TERRAIN_FACTOR[a.terrain],TERRAIN_FACTOR[b.terrain]);
function segmentCost(w,factor){return Math.round(ROAD_BASE*factor);}
function edgeCost(w,e){return segmentCost(w,terrainFactor(w.tiles[e.a],w.tiles[e.b]));}
// A resident is priced by what it adds: PAYBACK rounds of the extra income, x GROWTH per resident already there.
function residentCost(w,tile){const b=w.tiles[tile].building;const extra=TOWN_RATE*eraPower(w)*Object.values(b.buys).reduce((n,p)=>n+p,0);return Math.round(extra*PAYBACK*GROWTH**(b.residents-1));}
const townRate=(w,b)=>b.residents*TOWN_RATE*eraPower(w);
// Working stock: a turn of demand plus twenty spare pieces. Transport reservations add transit separately.
const townCap=(w,b)=>YARD+townRate(w,b);
function buys(w,tile){const b=w.tiles[tile].building,out={},rate=townRate(w,b),cap=townCap(w,b);for(const[r,price]of Object.entries(b.buys))out[r]={price,rate,cap};return out;}
const bname=b=>b.type==='town'?'城镇':RECIPES[b.type].name;

/* ---------- statistics ---------- */
function windowStats(w,seconds=WINDOW){const S=w.stats.filter(s=>s.tick>w.tick-seconds);return{S,span:S.length?w.tick-S[0].tick+1:0};}
function recentSales(w,tile,r){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+(s.sales[tile]?.[r]||0),0)/span;}
function income(w){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+s.income,0)/span;}
const rate=(w,t)=>t.building.workers.length*workerPower(w,t.building.type);

/* ---------- routing ---------- */
// Fewest segments over built roads, ties broken by edge ids so the choice is stable. The road graph only changes
// between rounds or through a road command, so results are cached per world object and round; road commands drop it.
const pathCache=new WeakMap();
function pathState(w){let c=pathCache.get(w);if(c&&c.tick===w.tick)return c;c={tick:w.tick,found:new Map(),edgesOf:{}};pathCache.set(w,c);
 for(const e of Object.values(w.edges)){if(e.removing||e.readyAt>w.tick)continue;(c.edgesOf[e.a]||(c.edgesOf[e.a]=[])).push(e);(c.edgesOf[e.b]||(c.edgesOf[e.b]=[])).push(e);}return c;}
function path(w,from,to){if(from===to)return [];const c=pathState(w),ck=from+'|'+to;if(c.found.has(ck)){const p=c.found.get(ck);return p&&p.slice();}const p=findPath(c.edgesOf,from,to);c.found.set(ck,p);return p&&p.slice();}
function findPath(edgesOf,from,to){const dist={[from]:[0,'']},prev={},open=[from];const cmp=(a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]);
 while(open.length){open.sort((a,b)=>cmp(dist[a],dist[b])||a.localeCompare(b));const k=open.shift();if(k===to)break;for(const e of (edgesOf[k]||[]).sort((a,b)=>a.id.localeCompare(b.id))){const n=e.a===k?e.b:e.a,d=[dist[k][0]+1,dist[k][1]+e.id];if(!dist[n]||cmp(d,dist[n])<0){dist[n]=d;prev[n]=[k,e.id];if(!open.includes(n))open.push(n);}}}
 if(!dist[to])return null;const out=[];for(let k=to;k!==from;k=prev[k][0])out.unshift(prev[k][1]);return out;}
// Fewest segments across passable terrain, then lowest new terrain cost. Existing roads are free to reuse.
// Bends have no separate fee; detours cost more when they add new segments.
function route(w,from,to){
 const skey=(k,d)=>k+'|'+d,dist={[skey(from,-1)]:[0,0,'']},prev={},open=[[from,-1]];
 const compare=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].localeCompare(b[2]);
 let end=null;
 while(open.length){open.sort((a,b)=>compare(dist[skey(...a)],dist[skey(...b)])||skey(...a).localeCompare(skey(...b)));
  const[k,dir]=open.shift();if(k===to){end=[k,dir];break;}const here=w.tiles[k],d0=dist[skey(k,dir)];
  for(let i=0;i<DIRS.length;i++){const[dq,dr]=DIRS[i],t=w.tiles[key(here.q+dq,here.r+dr)];if(!t||!passable(w,t))continue;
   const eid=edgeId(k,t.id),e=w.edges[eid];if(e?.removing)continue;
   const score=[d0[0]+1,d0[1]+(e?0:terrainFactor(here,t)),d0[2]+eid];
   const sk=skey(t.id,i);if(!dist[sk]||compare(score,dist[sk])<0){dist[sk]=score;prev[sk]=[k,dir];if(!open.some(([a,b])=>a===t.id&&b===i))open.push([t.id,i]);}}}
 if(!end)return null;
 const tiles=[],dirs=[];for(let s=end;s;s=prev[skey(...s)]){tiles.unshift(s[0]);dirs.unshift(s[1]);}
 const segments=[];let cost=0,lakes=0;
 for(let i=1;i<tiles.length;i++){const a=tiles[i-1],b=tiles[i];if(w.edges[edgeId(a,b)])continue;
  const factor=terrainFactor(w.tiles[a],w.tiles[b]),lake=[w.tiles[a].terrain,w.tiles[b].terrain].includes('lake');
  const c=segmentCost(w,factor);
  segments.push({a,b,lake,cost:c,factor});cost+=c;if(lake)lakes++;}
 return{tiles,segments,cost,lakes};}
// A road may start from any building or from any tile the road network already touches, and may end anywhere
// passable: a stub into open country is legal, it just earns nothing until both its ends mean something.
const anchored=(w,k)=>!!w.tiles[k]?.building||Object.values(w.edges).some(e=>!e.removing&&(e.a===k||e.b===k));
function connection(w,from,to){
 if(from===to)throw Error('拖到别的格子才能修路');
 if(!w.tiles[from]||!w.tiles[to])throw Error('请选择地图上的格子');
 if(!anchored(w,from))throw Error('路要从建筑或已有的路出发');
 if(!passable(w,w.tiles[to]))throw Error(w.tiles[to].terrain==='lake'?'湖上修路需要航道科技':'山上修不了路');
 const r=route(w,from,to);if(!r)throw Error(Object.values(w.tiles).some(t=>t.terrain==='lake')&&!w.tech.waterway?'这两点之间没有可铺设的路线（湖需要航道科技）':'这两点之间没有可铺设的路线');
 return r;}
const formatMoney = n => '$'+Math.round(n).toLocaleString('zh-CN');
// Purchases are the only cash outflow and cannot overdraw the balance.
function pay(w,cost){if(w.money<cost)throw Error(`金币不足：需要 ${formatMoney(cost)}，现有 ${formatMoney(w.money)}`);w.money-=cost;w.spent+=cost;}
// Cheapest road from any workshop to a town that buys its output, or 0 once something earns or no such pair exists.
function firstRoad(w){if(earning(w))return 0;let best=0;const any=Object.values(w.tiles).some(t=>workshop(t.building));
 for(const u of Object.values(w.tiles)){let r,extra=0;
  if(workshop(u.building))r=RECIPES[u.building.type].out;else if(!any&&u.terrain==='forest'&&!u.building){r='log';extra=buildingCost(w,'camp');}else continue;
  for(const t of Object.values(w.tiles)){if(t.building?.type!=='town'||!t.building.buys[r])continue;const x=route(w,u.id,t.id);if(x&&(!best||x.cost+extra<best))best=x.cost+extra;}}
 return best;}
// No dead start: while nothing earns yet, a purchase that would leave less than that first road costs is refused.
function reserve(w,cost){const need=firstRoad(w);if(need&&w.money-cost<need)throw Error(`先把路修到城镇（要 ${formatMoney(need)}），买了这个就修不起路了`);}
function refund(w,paid){const back=Math.round(paid*REFUND);w.money+=back;return back;}
// True once any building can deliver its output to a town that buys it: from then on income never drops to zero.
function earning(w){return Object.values(w.tiles).some(t=>workshop(t.building)&&Object.values(w.tiles).some(u=>u.building?.type==='town'&&u.building.buys[RECIPES[t.building.type].out]&&path(w,t.id,u.id)));}
// What the cheapest road from an existing building to a town on the previewed flower would cost, or null.
// Returns null when no existing building makes anything the new town buys (nothing to guard), {unreachable:true}
// when a pair exists but no road can be laid in this orientation, else the cheapest road.
function previewRoute(w,f){const temp=copy(w);temp.serial+=1000;materialize(temp,f);let best=null,pairs=0;
 for(const t of Object.values(temp.tiles)){if(t.flower!==f.id||t.terrain!=='town')continue;
  for(const u of Object.values(temp.tiles)){if(!workshop(u.building))continue;pairs++;const r=route(temp,u.id,t.id);if(r&&(!best||r.cost<best.cost))best={cost:r.cost,tiles:r.tiles,segments:r.segments.length,from:u.id,to:t.id};}}
 return best||(pairs?{unreachable:true,cost:Infinity}:null);}

/* ---------- commands ---------- */
function command(w,c){const t=w.tiles[c.tile],b=t?.building;const fail=m=>{throw Error(m);};
 if(c.type==='build'){if(!RECIPES[c.buildType])fail('未知建筑');if(c.buildType!=='camp'&&!w.tech[c.buildType])fail(`先在科技树里解锁${RECIPES[c.buildType].name}`);if(!t||t.building)fail('这里已有建筑');if(!RECIPES[c.buildType].fits.includes(t.terrain))fail('这种建筑不适合这块地');const cost=buildingCost(w,c.buildType);
  // The first camp is the plan itself: it only has to leave the road from this forest to a log-buying town.
  if(c.buildType==='camp'&&!Object.values(w.tiles).some(x=>workshop(x.building))&&!earning(w)){let need=0;for(const u of Object.values(w.tiles)){if(u.building?.type!=='town'||!u.building.buys.log)continue;const x=route(w,t.id,u.id);if(x&&(!need||x.cost<need))need=x.cost;}if(need&&w.money-cost<need)fail(`建在这里之后修不起到城镇的路（要 ${formatMoney(need)}）`);}else reserve(w,cost);pay(w,cost);t.building={id:id(w),type:c.buildType,paid:cost,workers:[]};
 }else if(c.type==='click'){if(!b)fail('点击工坊才能生产');
  if(b.type==='town')fail('城镇自动收购，点击只查看详情');
  const rc=RECIPES[b.type];let n=Math.min(clickPower(w,t),YARD-t.loose[rc.out]);if(n<=0)fail('堆场已满，先把货运出去');for(const r in rc.in)n=Math.min(n,t.loose[r]);if(n<=0){const missing=Object.keys(rc.in).filter(r=>t.loose[r]<1).map(r=>GOODS[r]).join('和');fail(`没有${missing}可加工`);}for(const r in rc.in){t.loose[r]-=n;w.consumption[r]+=n;}t.loose[rc.out]+=n;w.production[rc.out]+=n;w.manual.out[rc.out]+=n;w.manual.tiles[t.id]=(w.manual.tiles[t.id]||0)+n;w.clicks++;
 }else if(c.type==='worker'){if(!workshop(b))fail('先选择一座已建工坊');if(b.workers.length>=MAX_WORKERS)fail(`每座建筑最多 ${MAX_WORKERS} 名工人，产能要靠新建筑和对应工艺`);const cost=workerCost(w,t);reserve(w,cost);pay(w,cost);b.workers.push({id:id(w),paid:cost});
 }else if(c.type==='fireWorker'){if(!workshop(b))fail('请选择工坊');if(!b.workers.length)fail('这里没有工人');refund(w,b.workers.pop().paid);
 }else if(c.type==='tech'){const u=TECH[c.key];if(!u)fail('未知科技');if(techOwned(w,c.key))fail('已经买过这项科技');if(techMaxed(w,c.key))fail('已经是最高等级');if(!techAvailable(w,c.key))fail(`先解锁${u.requires.filter(r=>!w.tech[r]).map(r=>TECH[r].name).join('和')}`);reserve(w,techCost(w,c.key));pay(w,techCost(w,c.key));w.tech[c.key]++;
 }else if(c.type==='connect'){const r=connection(w,c.from,c.to);pay(w,r.cost);for(const s of r.segments){const k=edgeId(s.a,s.b);w.edges[k]={id:k,a:s.a,b:s.b,removing:false,readyAt:w.tick,paid:s.cost};}pathCache.delete(w);
 }else if(c.type==='demolish'){if(!b||b.type==='town')fail('请选择工坊');refund(w,b.paid+b.workers.reduce((n,m)=>n+m.paid,0));t.building=null;
 }else if(c.type==='removeRoad'){const e=w.edges[c.edge];if(!e)fail('请选择道路');e.removing=true;pathCache.delete(w);
 }else if(c.type==='restoreRoad'){if(w.edges[c.edge])w.edges[c.edge].removing=false;pathCache.delete(w);
 }else if(c.type==='resident'){if(b?.type!=='town')fail('请选择城镇');if(b.residents>=MAX_RESIDENTS)fail(`每座城镇最多 ${MAX_RESIDENTS} 名居民，需求要靠新城镇和时代`);const cost=residentCost(w,t.id);reserve(w,cost);pay(w,cost);b.residents++;b.paid+=cost;
 }else if(c.type==='explore'){const f=w.flowers[c.flower];if(!f||f.state!=='fog')fail('只能解锁迷雾中的板块');const cost=flowerCost(w,f);reserve(w,cost);pay(w,cost);const n=++w.unlocked;
  const before={goods:boughtGoods(w),terrains:terrainsOn(w)};
  const g=generateFlower(w,n,f);f.design=g.design;f.rotation=g.rotation;f.state='placed';f.order=n;f.paid=cost;materialize(w,f);spawnFog(w,f);if(f.design.buys)w.lastTownUnlock=n;
  // Did this flower bring something the map had never seen? Then the novelty clock resets.
  if([...boughtGoods(w)].some(r=>!before.goods.has(r))||[...terrainsOn(w)].some(t=>!before.terrains.has(t)))w.lastNovel=n;
 }else fail('未知操作');}

/* ---------- freight ---------- */
// A processing building keeps a few ticks of every input on hand; a town fills its warehouse to the cap.
function buffer(w,t){const b=t.building;return b&&Object.keys(RECIPES[b.type].in).length?YARD+Math.max(1,rate(w,t)):0;}
// Longest connected supply route: reconciliation must retain reservations for distant producers.
// Dispatch below uses each source's own travel time, so a distant idle producer cannot overfill a nearby buyer.
function transit(w,t,r){let best=0;for(const u of Object.values(w.tiles)){const b=u.building;if(!b||b.type==='town'||RECIPES[b.type].out!==r||u.id===t.id)continue;const p=path(w,u.id,t.id);if(p)best=Math.max(best,p.length);}return best;}
// What a workshop asks to have on hand plus on the road: the buffer, and one round of output for every round
// of travel, so a long road delays freight but never caps it.
function pipeline(w,t,r){return buffer(w,t)+Math.max(1,rate(w,t))*transit(w,t,r);}
function available(w,t,r){const b=t.building;if(b?.type==='town')return 0;const keep=b&&RECIPES[b.type].in[r]?buffer(w,t):0;return Math.max(0,t.loose[r]-keep);}
// What one more piece is worth at the demand's door: the town's price, or for a workshop the best price its
// output can reach. Freight is served in this order, so a mason outbids the town next door for logs.
function saleValue(w,from,r){let best=0;for(const t of Object.values(w.tiles))if(t.building?.type==='town'&&t.building.buys[r]&&t.id!==from&&path(w,from,t.id))best=Math.max(best,t.building.buys[r]);return best;}
function demands(w){const ds=[];for(const t of Object.values(w.tiles)){const b=t.building;if(!b)continue;
 if(b.type==='town'){for(const[r,d]of Object.entries(buys(w,t.id)))ds.push({key:`t${b.id}:${r}`,tile:t.id,r,stock:d.cap,target:d.cap+d.rate*transit(w,t,r),local:t.loose[r],rate:d.rate,value:d.price});continue;}
 const rc=RECIPES[b.type];if(!Object.keys(rc.in).length)continue;const v=saleValue(w,t.id,rc.out);
 for(const r in rc.in)ds.push({key:`b${b.id}:${r}`,tile:t.id,r,stock:buffer(w,t),target:pipeline(w,t,r),local:t.loose[r],rate:Math.max(1,rate(w,t)),value:v});}
 return ds.sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key));}
const value=(w,d)=>d.value;
// A town sells n pieces of r out of its warehouse at price.
function sell(w,t,r,n,price){t.loose[r]-=n;w.consumption[r]+=n;w.sold[t.id][r]+=n;const gross=n*price;w.money+=gross;w.earned+=gross;return gross;}
// The engine's steady income: what it earns per round with nobody clicking, once the pipeline has filled. A shadow
// copy runs `rounds` rounds and the last `window` are averaged. Prices never depend on this estimate.
function steady(w,rounds=100,window=WINDOW){const v=copy(w);v.manual={out:zero(),tiles:{},sales:{},gross:0};for(let i=0;i<rounds;i++)tick(v);const S=v.stats.slice(-window);return S.length?S.reduce((n,s)=>n+s.income,0)/S.length:0;}
function allocated(w,k){return w.shipments.filter(s=>s.key===k).length;}
function release(w,s){w.tiles[s.node].loose[s.r]++;w.shipments.splice(w.shipments.indexOf(s),1);}
function reconcile(w,ds,sample){const map=new Map(ds.map(d=>[d.key,d]));for(const s of w.shipments)if(!map.has(s.key))s.key=null;for(const d of ds){const ss=w.shipments.filter(s=>s.key===d.key).sort((a,b)=>b.id.localeCompare(a.id));let excess=ss.length-Math.max(0,d.target-d.local);for(const s of ss){if(excess--<=0)break;s.key=null;}}for(const s of [...w.shipments])if(!s.edge){const d=map.get(s.key);if(!d){release(w,s);continue;}if(s.node===d.tile){w.tiles[d.tile].loose[s.r]++;if(sample){const row=sample.received[d.tile]||(sample.received[d.tile]=zero());row[s.r]++;}w.shipments.splice(w.shipments.indexOf(s),1);continue;}const p=path(w,s.node,d.tile);if(!p){release(w,s);continue;}s.next=p[0];}}
// Among equally valuable demands the scheduler round-robins; higher value always goes first.
function choose(w,scope,ds,eligible){const top=ds.filter(eligible);if(!top.length)return null;const best=Math.max(...top.map(d=>d.value));const ring=top.filter(d=>d.value===best).sort((a,b)=>a.key.localeCompare(b.key));let start=ring.findIndex(d=>d.key===w.scheduler[scope]);start=start<0?0:(start+1)%ring.length;const d=ring[start];w.scheduler[scope]=d.key;return d;}
/* ---------- goals ---------- */
// Two goals: sales income and exploration. Production and travel remain diagnostics, not incentives.
const GOAL_REWARD_ROUNDS=.5,GOAL_REWARD_FLOOR=100;
const goodsIn=a=>RES.reduce((n,r)=>n+(a[r]||0),0);
const GOALS=[
 {id:'income',icon:'coin',label:'每回合收入',unit:'金币',base:20,step:2,value:income},
 {id:'map',icon:'fog',label:'已解锁板块',unit:'块',base:1,step:1,value:w=>w.unlocked}];
function windowRate(w,pick){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+pick(s),0)/span;}
// Tier 1 is the base; after that the step either multiplies (rates) or adds (counts).
function goalTarget(g,tier){return g.step===1?g.base+tier-1:g.base*g.step**(tier-1);}
function goalFloor(g,tier){return tier<=1?0:goalTarget(g,tier-1);}
// Small on purpose: always less than the cheapest road segment, so a reward can never decide a build.
function goalReward(w){return Math.min(ROAD_BASE-1,Math.max(GOAL_REWARD_FLOOR,Math.round(income(w)*GOAL_REWARD_ROUNDS)));}
function goalProgress(w,g){const tier=w.goals[g.id],cur=g.value(w),target=goalTarget(g,tier),floor=goalFloor(g,tier);
 return{tier,cur,target,floor,ratio:Math.max(0,Math.min(1,(cur-floor)/(target-floor)))};}
// Every track is checked every round and completes the moment it is reached, in any order and with nothing to
// claim. A tier that is already met completes at once, so after a burst the ladder catches up in one round.
// Cleared tiers never come back, so a dip in the moving average cannot farm the same reward twice.
function advanceGoals(w,sample){const reward=goalReward(w);
 for(const g of GOALS){const cur=g.value(w);let levels=0;
  while(cur>=goalTarget(g,w.goals[g.id])){w.goals[g.id]++;levels++;}
  if(!levels)continue;
  const paid=levels*reward;w.money+=paid;w.earned+=paid;
  (sample.goals||(sample.goals={}))[g.id]={levels,reward:paid,tier:w.goals[g.id]};}}
// Only completed simulation rounds advance a persistent warning streak.
const WARNING_ROUNDS=5;
function townBacklog(w,t){return Object.entries(buys(w,t.id)).reduce((n,[r,d])=>n+(t.loose[r]>=d.cap?t.loose[r]:0),0);}
// Diagnose completed-round flow, not an empty yard alone. The renderer and streak
// accumulator share this classifier so recovery cannot leave a stale warning.
function buildingBottleneck(w,t,sample=w.stats.at(-1)){
 const b=t.building;if(!b||!sample)return null;
 const made=u=>sample.tiles[u.id]||0;
 const supplied=(u,r)=>u.building.type==='town'?(sample.sales[u.id]?.[r]||0):made(u);
 const consumers=r=>Object.values(w.tiles).filter(u=>u.id!==t.id&&u.building&&(u.building.type==='town'?u.building.buys[r]:RECIPES[u.building.type].in[r])&&path(w,t.id,u.id));
 const need=(u,r)=>u.building.type==='town'?buys(w,u.id)[r].rate:rate(w,u);
 if(b.type==='town'){
  const count=townBacklog(w,t);if(count>0)return {kind:'backlog',count,good:'件货物'};
  for(const [r,d] of Object.entries(buys(w,t.id)))if(supplied(t,r)<d.rate&&t.loose[r]<d.rate)return {kind:'supply'};
  return null;
 }
 const rc=RECIPES[b.type],count=t.loose[rc.out],output=made(t)+(w.manual.tiles[t.id]||0);
 if(count>=YARD)return {kind:'backlog',count,good:GOODS[rc.out]};
 if(b.workers.length&&output<rate(w,t))for(const r of Object.keys(rc.in))if(t.loose[r]<rate(w,t)-output)return {kind:'shortage'};
 // Zero stock is healthy when buyers are satisfied. Warn only when a connected
 // buyer is underfed and this building cannot provide more automatic output.
 if(count===0&&(!b.workers.length||output>=rate(w,t))&&consumers(rc.out).some(u=>supplied(u,rc.out)<need(u,rc.out)&&u.loose[rc.out]<need(u,rc.out)))return {kind:'capacity'};
 return null;
}
function warning(w,t){
 const a=t.building?.warning;if(!a||a.rounds<WARNING_ROUNDS)return null;
 const current=buildingBottleneck(w,t);return current?.kind===a.kind?{...current,rounds:a.rounds}:null;
}
function updateWarnings(w,sample){
 for(const t of Object.values(w.tiles)){const b=t.building;if(!b)continue;const issue=buildingBottleneck(w,t,sample);
 b.warning=issue?{kind:issue.kind,rounds:b.warning?.kind===issue.kind?(b.warning.rounds||0)+1:1}:null;
 }
}
function tick(w){w.tick++;const sample={tick:w.tick,out:zero(),tiles:{},edges:{},received:{},dispatched:{},manualTiles:{...w.manual.tiles},capacities:Object.fromEntries(Object.values(w.tiles).filter(t=>workshop(t.building)).map(t=>[t.id,rate(w,t)])),income:0,gross:0,sales:{}};const oldEdges=new Set(Object.keys(w.edges));
 add(sample.out,w.manual.out);Object.assign(sample.tiles,w.manual.tiles);sample.gross+=w.manual.gross;for(const[k,v]of Object.entries(w.manual.sales))add(sample.sales[k]||(sample.sales[k]=zero()),v);w.manual={out:zero(),tiles:{},sales:{},gross:0};
 for(const s of w.shipments)if(s.edge){s.remaining--;if(s.remaining<=0){s.node=s.to;s.edge=null;s.remaining=0;}}
 for(const e of Object.values(w.edges))if(e.removing&&!w.shipments.some(s=>s.edge===e.id)){refund(w,e.paid);delete w.edges[e.id];}
 reconcile(w,demands(w),sample);
 const remaining=new Map(Object.values(w.tiles).filter(t=>workshop(t.building)).map(t=>[t.id,rate(w,t)]));
 const potential=t=>{if(!remaining.has(t.id))return 0;const rc=RECIPES[t.building.type];return Math.min(remaining.get(t.id),...Object.keys(rc.in).map(r=>t.loose[r]));};
 const produce=(t,n)=>{const rc=RECIPES[t.building.type];for(const r in rc.in){t.loose[r]-=n;w.consumption[r]+=n;}t.loose[rc.out]+=n;w.production[rc.out]+=n;sample.out[rc.out]+=n;sample.tiles[t.id]=(sample.tiles[t.id]||0)+n;remaining.set(t.id,remaining.get(t.id)-n);};
 // Towns buy available stock up to their demand, including partial batches.
 for(const t of Object.values(w.tiles)){const b=t.building;if(b?.type!=='town')continue;sample.sales[t.id]=sample.sales[t.id]||zero();
  for(const[r,d]of Object.entries(buys(w,t.id))){const n=Math.min(t.loose[r],d.rate);if(!n)continue;sample.gross+=sell(w,t,r,n,d.price);sample.sales[t.id][r]+=n;}}
 const ds=demands(w);reconcile(w,ds,sample);
 // Roads that existed at the start of the round carry freight this round; a new segment opens next round.
 for(const e of Object.values(w.edges))if(oldEdges.has(e.id)&&!e.removing&&e.readyAt<=w.tick)sample.edges[e.id]={flows:{}};
 // Every piece moves one segment per round; a segment carries any number.
 // Shortest path whose first segment, the only one taken this round, is open this round.
 const openPath=(from,to)=>{const all=pathState(w).edgesOf,edgesOf={...all};edgesOf[from]=(all[from]||[]).filter(e=>sample.edges[e.id]);return findPath(edgesOf,from,to);};
 const send=(s,eid)=>{const e=w.edges[eid];s.edge=eid;s.from=s.node;s.to=e.a===s.node?e.b:e.a;s.remaining=1;s.next=null;const fk=s.from+'>'+s.to+':'+s.r;sample.edges[eid].flows[fk]=(sample.edges[eid].flows[fk]||0)+1;};
 // Freight already under way takes its next segment.
 for(const s of w.shipments){if(s.edge||!s.key||!s.next)continue;
  if(sample.edges[s.next]){send(s,s.next);continue;}
  const p=openPath(s.node,s.destination);if(p&&p.length)send(s,p[0]);}
 // New freight: the most valuable demands are served first, equally valuable ones take turns piece by piece,
 // and every piece comes from the nearest source that still has one to spare.
 const groups=new Map();for(const d of ds){const g=d.r+'@'+d.value;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(d);}
 const reservations=new Map();for(const shipment of w.shipments)reservations.set(shipment.key,(reservations.get(shipment.key)||0)+1);
 // Reserve by arrival horizon: freight still far away must not block nearby top-ups.
 const arrivals=new Map();
 const reserveArrival=(k,hops)=>{if(!arrivals.has(k))arrivals.set(k,new Map());const a=arrivals.get(k);a.set(hops,(a.get(hops)||0)+1);};
 const demandMap=new Map(ds.map(d=>[d.key,d]));
 for(const s of w.shipments){const d=demandMap.get(s.key);if(!d)continue;const p=path(w,s.edge?s.to:s.node,d.tile);if(p)reserveArrival(s.key,p.length+(s.edge?s.remaining:0));}
 const arriving=(k,hops)=>{let n=0;for(const [eta,count]of arrivals.get(k)||[])if(eta<=hops)n+=count;return n;};
 const canSupply=(t,r)=>available(w,t,r)>0||(workshop(t.building)&&RECIPES[t.building.type].out===r&&potential(t)>0);
 const routes=new Map(),options=new Map();
 for(const d of ds){const list=[];for(const t of Object.values(w.tiles)){if(t.id===d.tile||!canSupply(t,d.r))continue;const key=t.id+'>'+d.tile;if(!routes.has(key))routes.set(key,openPath(t.id,d.tile));const p=routes.get(key);if(p?.length)list.push({t,p});}options.set(d.key,list.sort((a,b)=>a.p.length-b.p.length||a.t.id.localeCompare(b.t.id)));}
 const source=d=>options.get(d.key).find(x=>canSupply(x.t,d.r)&&d.stock+d.rate*x.p.length>d.local+arriving(d.key,x.p.length));
 for(const[scope,group]of groups)for(;;){const d=choose(w,scope,group,d=>d.target-d.local-(reservations.get(d.key)||0)>0&&source(d));if(!d)break;const x=source(d);if(available(w,x.t,d.r)<=0)produce(x.t,1);x.t.loose[d.r]--;const dispatched=sample.dispatched[x.t.id]||(sample.dispatched[x.t.id]=zero());dispatched[d.r]++;const shipment={id:id(w),key:d.key,r:d.r,node:x.t.id,destination:d.tile};w.shipments.push(shipment);reservations.set(d.key,(reservations.get(d.key)||0)+1);reserveArrival(d.key,x.p.length);send(shipment,x.p[0]);}
 // Only unsent surplus occupies the output yard; no goods are discarded or teleported.
 for(const t of Object.values(w.tiles))if(workshop(t.building)){const n=Math.max(0,Math.min(potential(t),YARD-t.loose[RECIPES[t.building.type].out]));if(n)produce(t,n);if(t.loose[RECIPES[t.building.type].out]>=YARD)w.flags.yardFull=true;}
 updateWarnings(w,sample);
 sample.income=sample.gross;
 w.stats.push(sample);while(w.stats.length&&w.stats[0].tick<=w.tick-WINDOW)w.stats.shift();
 advanceGoals(w,sample);
}
function totals(w){const sum=zero();for(const t of Object.values(w.tiles))add(sum,t.loose);for(const s of w.shipments)sum[s.r]++;return sum;}
function validate(w){const int=n=>Number.isSafeInteger(n)&&n>=0;
 if(w?.schemaVersion!==22||!w.tiles||!w.flowers||!Array.isArray(w.shipments)||!Array.isArray(w.stats)||!w.scheduler||!w.goals||!w.tech||!w.manual||!w.sold||!w.flags||!int(w.tick)||!int(w.serial)||!int(w.money)||!int(w.earned)||!int(w.spent)||!int(w.clicks)||!int(w.seed)||!int(w.unlocked)||!int(w.lastTownUnlock)||!int(w.lastNovel))throw Error('存档格式不兼容');
 for(const g of GOALS)if(!Number.isSafeInteger(w.goals[g.id])||w.goals[g.id]<1)throw Error('目标等级无效');
 for(const k of Object.keys(w.goals))if(!GOALS.some(g=>g.id===k))throw Error('目标等级无效');
 for(const k of Object.keys(TECH))if(!int(w.tech[k])||(!TECH[k].repeat&&w.tech[k]>1)||(TECH[k].max!=null&&w.tech[k]>TECH[k].max))throw Error('科技无效');
 for(const k of Object.keys(w.tech))if(!TECH[k])throw Error('科技无效');
 const qty=a=>{if(!a||!RES.every(r=>int(a[r])))throw Error('材料数量无效');},ids=new Set();const unique=n=>{if(typeof n!=='string'||!/^\d+$/.test(n)||+n>w.serial||ids.has(n))throw Error('对象 ID 无效');ids.add(n);};
 let placed=0,orders=new Set();
 for(const[k,f]of Object.entries(w.flowers)){if(k!==f.id||k!==fidOf(f.a,f.b)||!Number.isSafeInteger(f.a)||!Number.isSafeInteger(f.b)||f.center.q!==3*f.a+f.b||f.center.r!==-f.a+2*f.b||!['fog','placed'].includes(f.state)||!int(f.rotation)||f.rotation>5||!int(f.order))throw Error('板块无效');
  if(f.state==='fog'){if(f.design)throw Error('板块无效');continue;}
  if(!f.design||!TERRAINS.includes(f.design.center)||!Array.isArray(f.design.ring)||f.design.ring.length!==6||!f.design.ring.every(t=>TERRAINS.includes(t)))throw Error('板块内容无效');
  if(f.order){if(orders.has(f.order)||f.order>w.unlocked)throw Error('板块次序无效');orders.add(f.order);}
  placed++;for(const p of flowerTiles(f)){const t=w.tiles[key(p.q,p.r)];if(!t||t.flower!==k||t.terrain!==slotTerrain(f.design,p.slot))throw Error('地图与板块不一致');}}
 if(w.preview)throw Error('预览状态无效');
 if(Object.keys(w.tiles).length!==7*placed)throw Error('地图无效');
 for(const f of Object.values(w.flowers))if(f.state==='placed')for(const[da,db]of DIRS)if(!w.flowers[fidOf(f.a+da,f.b+db)])throw Error('迷雾缺失');
 for(const[k,t]of Object.entries(w.tiles)){if(k!==t.id||k!==key(t.q,t.r)||!TERRAINS.includes(t.terrain))throw Error('地图无效');qty(t.loose);const b=t.building;
  if(t.terrain==='town'!==(b?.type==='town'))throw Error('城镇无效');if(!b)continue;unique(b.id);
  if(b.type==='town'){if(!int(b.residents)||b.residents<1||b.residents>MAX_RESIDENTS||!int(b.paid)||!b.buys||!Object.entries(b.buys).every(([r,p])=>SELLABLE.includes(r)&&int(p)&&p>0)||Object.keys(b.buys).length<1||Object.keys(b.buys).length>2)throw Error('城镇无效');if(!w.sold[k])throw Error('城镇无效');qty(w.sold[k]);continue;}
  if(!RECIPES[b.type]||!RECIPES[b.type].fits.includes(t.terrain)||!Array.isArray(b.workers)||b.workers.length>MAX_WORKERS||!int(b.paid))throw Error('建筑无效');if(b.type!=='camp'&&!w.tech[b.type])throw Error('建筑未解锁');for(const m of b.workers){unique(m.id);if(!int(m.paid))throw Error('金额无效');}}
 for(const k of Object.keys(w.sold))if(w.tiles[k]?.building?.type!=='town')throw Error('销售记录无效');
 for(const[k,e]of Object.entries(w.edges)){const a=w.tiles[e.a],b=w.tiles[e.b];if(!a||!b||!adjacent(a,b)||!passable(w,a)||!passable(w,b)||k!==e.id||k!==edgeId(e.a,e.b)||!int(e.readyAt)||!int(e.paid))throw Error('道路引用无效');}
 for(const s of w.shipments){unique(s.id);if(!RES.includes(s.r)||!w.tiles[s.node]||!w.tiles[s.destination]||(s.edge&&(!w.edges[s.edge]||![w.edges[s.edge].a,w.edges[s.edge].b].includes(s.from)||![w.edges[s.edge].a,w.edges[s.edge].b].includes(s.to)||s.from===s.to||s.remaining!==1)))throw Error('货物引用无效');if(s.key!==null&&typeof s.key!=='string')throw Error('货物需求无效');}
 qty(w.manual.out);if(!int(w.manual.gross)||!w.manual.sales||!Object.entries(w.manual.sales).every(([k,v])=>w.tiles[k]?.building?.type==='town'&&RES.every(r=>int(v[r]))))throw Error('手工收购无效');if(!w.manual.tiles||!Object.entries(w.manual.tiles).every(([k,n])=>w.tiles[k]&&int(n)))throw Error('手工产量无效');
 if(w.stats.length>WINDOW)throw Error('统计窗口无效');for(const s of w.stats){if(!int(s.tick)||s.tick>w.tick||!s.out||!RES.every(r=>int(s.out[r]))||!s.tiles||!s.edges||!int(s.income)||!int(s.gross))throw Error('统计数据无效');}
 qty(w.initial);qty(w.production);qty(w.consumption);const total=totals(w);for(const r of RES)if(total[r]!==w.initial[r]+w.production[r]-w.consumption[r])throw Error('资源账本不守恒');return true;}
function apply(w,c){const next=copy(w);command(next,c);validate(next);return next;}
function load(saved){const next=copy(saved);if(next&&next.lastNovel==null)next.lastNovel=0;
 // v19 saves paid per-piece wages and tolls, had road capacity (the fleet tech) and a demand pool per town. v20 pays a
 // fixed upkeep and gives towns a warehouse: the old costs fold into the upkeep ledger, the pools are dropped.
 if(next&&next.schemaVersion===19&&next.tech&&next.manual&&Array.isArray(next.stats)){next.schemaVersion=20;next.upkeep=(next.wages||0)+(next.tollPaid||0);delete next.wages;delete next.tollPaid;delete next.tech.fleet;next.manual={out:next.manual.out,tiles:next.manual.tiles,sales:{},gross:0};
  for(const s of next.stats){s.upkeep=(s.wages||0)+(s.toll||0);delete s.wages;delete s.toll;}
  for(const t of Object.values(next.tiles||{}))if(t.building?.type==='town')delete t.building.demand;}
 // Existing balances are preserved; legacy maintenance debt is cleared. Start a fresh income window.
 if(next&&next.schemaVersion===20){if(!Number.isSafeInteger(next.money))throw Error('金额无效');next.schemaVersion=21;next.money=Math.max(0,next.money);delete next.upkeep;next.stats=[];}
 if(next&&next.schemaVersion===21){
  // Refund the removed independent click upgrade once, preserving all buildings and purchased upgrades.
  const level=next.tech.tools||0;if(!Number.isSafeInteger(level)||level<0)throw Error('科技无效');
  const back=2000*(2**level-1);if(!Number.isSafeInteger(next.money+back))throw Error('金额无效');next.money+=back;delete next.tech.tools;
  next.goals=Object.fromEntries(GOALS.map(g=>[g.id,next.goals[g.id]||1]));
  for(const sample of next.stats)if(sample.goals)for(const key of Object.keys(sample.goals))if(!next.goals[key])delete sample.goals[key];
  next.schemaVersion=22;
 }
 validate(next);return next;}
const api={WARNING_ROUNDS,buildingBottleneck,warning,formatMoney,RES,SELLABLE,GOODS,BASE_PRICE,DT,TPS,WINDOW,YARD,PRICE,WORKER,WORKER_GROWTH,MAX_WORKERS,TECH,ERAS,craftOf,RECIPES,BUILDINGS,RAW,TERRAINS,TERRAIN_NAME,TERRAIN_FACTOR,ROAD_BASE,FAR_BONUS,BUILDING_GROWTH,CRAFT_BASE,CRAFT_GROWTH,ERA_BASE,townCap,steady,TOWN_RATE,MAX_RESIDENTS,PAYBACK,GROWTH,START_MONEY,START_TILE,START_TOWN,START_DESIGN,FLOWER_BASE,FLOWER_PAIR,TUTORIAL,CANDIDATES,GEN,discovery,rawDeficit,boughtGoods,terrainsOn,chainGaps,rawOf,goodsFrom,DIRS,GOALS,GOAL_REWARD_ROUNDS,GOAL_REWARD_FLOOR,goalTarget,goalFloor,goalReward,goalProgress,
 copy,zero,add,workshop,newWorld,edgeId,adjacent,hexDist,flowerCenter,flowerTiles,flowerCost,flowerDistance,slotTerrain,generateFlower,validDesign,rng,path,route,connection,command,tick,totals,validate,apply,load,demands,allocated,buffer,transit,pipeline,available,buildingCost,workerCost,firstRoad,techCost,techOwned,techAvailable,techMaxed,workerPower,clickPower,eraPower,goodValue,workersOf,craftCost,eraCost,edgeCost,segmentCost,anchored,residentCost,townRate,income,buys,recentSales,terrainFactor,passable,rate,value,saleValue,earning,previewRoute,producible,nextGoods};
if(typeof module!=='undefined')module.exports=api;root.TradeEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
