/* v0.14 deterministic simulation. One tick is one round (DT seconds of real time at 1x). Every stored quantity is an
   integer. The map is an unbounded field of seven-hex "flowers": only the start flower is preset, every other one is
   generated the moment the player unlocks it, from the unlock order, the current state of the world and the save's seed.
   Buildings follow shared upstream connections, techs are one global tree bought with coins, roads have
   unlimited capacity, and markets buy all connected outputs. */
(function(root){
'use strict';
const NEW_GOODS=['charcoal','paper','book','machine'],NEW_BUILDINGS=['kiln','paperMill','printer','machineWorks'];
const RES=['log','stone','board','tool','ore','iron',...NEW_GOODS],SELLABLE=['log','stone','board','tool','iron','paper','book','machine'];
const GOODS={log:'原木',stone:'石头',board:'木板',tool:'石头工具',ore:'铁矿石',iron:'铁',charcoal:'木炭',paper:'纸张',book:'书籍',machine:'机械'};
const BASE_PRICE={log:20,stone:30,board:50,tool:120,iron:150,paper:180,book:280,machine:450};
const TPS=1,DT=2,WINDOW=30,YARD=20;
const PRICE={camp:1200,quarry:1000,sawmill:1400,mason:2000,mine:1800,smelter:2600,kiln:2200,paperMill:3200,printer:4600,machineWorks:6500};
const WORKER={camp:300,quarry:400,mine:500,sawmill:600,mason:700,smelter:900,kiln:650,paperMill:1000,printer:1400,machineWorks:1800},WORKER_GROWTH=1.3,MAX_WORKERS=3;
// Recipes: every input requires one connected active producer, with no per-piece consumption. `fits` is the terrain the building stands on.
const RECIPES={
 camp:{name:'伐木营',in:{},out:'log',fits:['forest']},
 quarry:{name:'采石场',in:{},out:'stone',fits:['rock']},
 sawmill:{name:'锯木厂',in:{log:1},out:'board',fits:['grass']},
 mason:{name:'石匠铺',in:{log:1,stone:1},out:'tool',fits:['grass']},
 mine:{name:'矿山',in:{},out:'ore',fits:['ore']},
 smelter:{name:'铁厂',in:{ore:1,log:1},out:'iron',fits:['grass']},
 kiln:{name:'炭窑',in:{log:1},out:'charcoal',fits:['grass']},
 paperMill:{name:'造纸坊',in:{log:1},out:'paper',fits:['grass']},
 printer:{name:'印刷坊',in:{paper:1,tool:1},out:'book',fits:['grass']},
 machineWorks:{name:'机械厂',in:{board:1,iron:1,charcoal:1},out:'machine',fits:['grass']}};
const BUILDINGS=Object.keys(RECIPES);
const workshop=b=>!!b&&b.type!=='town';
// The raw terrain a good ultimately comes from: a town never shares a flower with the terrain that feeds it.
const RAW={log:['forest'],stone:['rock'],board:['forest'],tool:['forest','rock'],iron:['ore','forest'],paper:['forest'],book:['forest','rock'],machine:['forest','ore']};
// One global tech tree, all coins. `kind` building unlocks a building type, `waterway` opens lakes,
// `economy` is a global multiplier; `repeat` techs are levelled with type-specific prices.
// Every building type has a repeatable `craft` tech: each level gives every worker of that type one more
// piece per round, a fixed increase independent of upstream throughput.
// Every era adds 25% of the base market price, additive with resident bonuses.
const ERAS=['农业时代','封建时代','工业时代','电气时代','信息时代'];
const TECH={
 era:{name:'时代',requires:[],kind:'economy',tier:1,repeat:true,max:ERAS.length-1,desc:'全图城镇基础售价 +25%，与居民加成相加'},
 quarry:{name:'采石场',cost:600,requires:[],kind:'building',tier:1,desc:'可以在岩地建采石场'},
 sawmill:{name:'锯木厂',cost:1200,requires:['quarry'],kind:'building',tier:1,desc:'可以在草地建锯木厂，原木 → 木板'},
 mason:{name:'石匠铺',cost:2400,requires:['sawmill','quarry'],kind:'building',tier:2,desc:'原木 + 石头 → 石头工具'},
 waterway:{name:'航道',cost:1600,requires:['sawmill'],kind:'waterway',tier:2,desc:'湖上可以铺路'},
 mine:{name:'矿山',cost:3000,requires:['mason'],kind:'building',tier:3,desc:'可以在铁矿建矿山'},
 smelter:{name:'铁厂',cost:6000,requires:['mine'],kind:'building',tier:4,desc:'铁矿石 + 原木 → 铁'},
 kiln:{name:'炭窑',cost:3200,requires:['mason'],kind:'building',tier:3,desc:'草地建造，原木 → 木炭；木炭是机械厂原料，不直接出售'},
 paperMill:{name:'造纸坊',cost:4800,requires:['sawmill'],kind:'building',tier:2,desc:'草地建造，原木 → 纸张；可卖给纸张城镇或供印刷坊'},
 printer:{name:'印刷坊',cost:7200,requires:['paperMill','mason'],kind:'building',tier:3,desc:'草地建造，纸张 + 石头工具 → 书籍'},
 machineWorks:{name:'机械厂',cost:10000,requires:['smelter','kiln','sawmill'],kind:'building',tier:5,desc:'草地建造，木板 + 铁 + 木炭 → 机械'}};
for(const b of BUILDINGS)TECH[b+'Craft']={name:RECIPES[b].name+'工艺',requires:b==='camp'?[]:[b],kind:'economy',tier:b==='camp'?1:TECH[b].tier,repeat:true,building:b,desc:`每座${RECIPES[b].name}的每名工人每回合多 1 件`};
// Optional branches adapt Roads & Boats' transport and mine research to our coin economy.
// No extra resources, throughput caps, running costs or changes to discovery are introduced.
const RESEARCH={
 roadEngineering:{name:'石工筑路',cost:2400,requires:['mason'],kind:'road',tier:3,branch:'运输',icon:'rail',desc:'新修道路费用降低 20%；已有道路仍按原实付金额退款。'},
 navigation:{name:'水运工程',cost:3200,requires:['waterway'],kind:'waterway',tier:3,branch:'运输',icon:'waterway',desc:'湖格道路系数从 ×3 降为 ×2，可叠加石工筑路。'},
 waterPower:{name:'水力机械',cost:3600,requires:['waterway','mason'],kind:'waterway',tier:3,branch:'生产',icon:'waterway',desc:'与湖格相邻的加工工坊，每名工人每回合多产 1 件；上游保持接通，手工不加成。'},
 mountainPass:{name:'山地工程',cost:4800,requires:['roadEngineering','mine'],kind:'road',tier:4,branch:'运输',icon:'pickaxe',desc:'山格可以修路，地形系数 ×4；不可建厂，不影响固定生产与收购。'},
 specialization:{name:'专业分工',cost:4800,requires:['mason','sawmillCraft'],kind:'economy',tier:3,branch:'生产',icon:'worker',desc:'满 3 名工人的加工工坊每回合额外产 3 件；可叠加水力，上游保持接通，手工不加成。'},
 deepMining:{name:'深井开采',cost:6000,requires:['mine','smelter'],kind:'economy',tier:5,branch:'采掘',icon:'mine',desc:'每名矿工每回合多产 2 件铁矿石，每名铁厂工人多产 1 件铁；手工不加成。'}
};
Object.assign(TECH,RESEARCH);
const craftOf=b=>b+'Craft';
const TERRAINS=['grass','town','forest','rock','ore','mountain','lake'];
const TERRAIN_NAME={grass:'草地',town:'城镇',forest:'森林',rock:'岩地',ore:'铁矿',mountain:'山',lake:'湖'};
const TERRAIN_FACTOR={grass:1,town:1,forest:2,rock:2,ore:2,lake:3,mountain:4};
// Roads only determine connectivity; route length never throttles production or sales.
const ROAD_BASE=250;
// Connected industries share upstream access and have no transport costs.
// Production and idling are free. Buildings are paid for once, at a price based on their existing count.
const FAR_BONUS=.15,BUILDING_GROWTH=1.3;
// Residents and eras add fixed base-price bonuses. Costs never depend on live output.
const TOWN_RATE=2,MAX_RESIDENTS=3,PAYBACK=12,GROWTH=1.5,REFUND=1,START_MONEY=2600;
// Starting cash is available for investment; the initial operating line is free.
// Exploration grows more slowly than exponentially, leaving budget for the complete new production chain.
const FLOWER_BASE=400,FLOWER_PAIR=2,TUTORIAL=0;
const CRAFT_BASE={camp:600,quarry:750,sawmill:1100,mason:1800,mine:1300,smelter:2200,kiln:1600,paperMill:2600,printer:3500,machineWorks:4800},CRAFT_GROWTH=1.6,ERA_BASE=2400;
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
function flowerCost(w,f=null,n=w.unlocked+1){return Math.round(FLOWER_BASE*(1+.25*(n-1))**1.2);}
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
 const obstacle=water?'lake':'mountain',count=3;
 const must=buys?{town:1}:{[terrain]:terrain==='forest'?3:1};must[obstacle]=count;
 const cap={town:1,mountain:3,lake:3,forest:5,rock:1,ore:1};
 const wooded=!buys;
 const pool=wooded?['grass','grass','forest','forest','forest']:['grass'];
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
  const points=flowerTiles(g).map(p=>({...p,terrain:slotTerrain(g.design,p.slot)}));
  const landmarks=points.filter(p=>['town','rock','ore'].includes(p.terrain));
  const oldLandmarks=Object.values(w.tiles).filter(t=>['town','rock','ore'].includes(t.terrain));
  const crowding=landmarks.reduce((n,p)=>n+oldLandmarks.reduce((m,t)=>m+Math.max(0,3-hexDist(p,t)),0),0);
  let ridge=0,passes=0,join=0,cluster=0,river=0,apart=0,landContinuity=0;const RAWT=['forest','rock','ore'];
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
    if(terrain===t.terrain&&['grass','forest'].includes(terrain))landContinuity++;
    // Rock and ore keep their distance from every other raw tile across the border; forest may join a forest.
    if(RAWT.includes(terrain)&&RAWT.includes(t.terrain))cluster+=terrain==='forest'&&t.terrain==='forest'?-1.5:1.5;}}
  if(apart||!join)continue;
  // Do not close the last land approach to any unexplored neighbour. Otherwise buying a
  // surrounded fog flower could produce an unreachable resource even with an all-grass layout.
  const added=new Map(flowerTiles(g).map(p=>[key(p.q,p.r),slotTerrain(g.design,p.slot)]));
  const frontier=DIRS.map(([a,b])=>({a:f.a+a,b:f.b+b,center:flowerCenter(f.a+a,f.b+b),rotation:0})).filter(h=>w.flowers[fidOf(h.a,h.b)]?.state!=='placed');
  if(frontier.some(h=>!flowerTiles(h).some(p=>DIRS.some(([dq,dr])=>{const k=key(p.q+dq,p.r+dr),t=added.get(k)||w.tiles[k]?.terrain;return t&&!WALL.includes(t);}))))continue;
  let score=ridge+landContinuity*2-cluster+river+(passes<=2?1:-(passes-2)*.7)-crowding*20+rand()*.5;
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
// the town are supplied free, with one worker, so income starts without any setup.
const START_DESIGN={center:'grass',ring:['forest','grass','town','grass','mountain','grass'],buys:{log:20}},START_TILE='1,0',START_TOWN='0,-1';
function newWorld(seed=1){const w={schemaVersion:25,seed:seed>>>0,tick:0,serial:0,flowers:{},tiles:{},edges:{},shipments:[],scheduler:{},stats:[],money:START_MONEY,earned:0,spent:0,production:zero(),consumption:zero(),sold:{},tech:{},unlocked:0,lastTownUnlock:0,preview:null,clicks:0,manual:{out:zero(),tiles:{},sales:{},gross:0},goals:Object.fromEntries(GOALS.map(g=>[g.id,1])),flags:{},paused:false,lastNovel:0};
 for(const k of Object.keys(TECH))w.tech[k]=0;
 const f={id:fidOf(0,0),a:0,b:0,center:flowerCenter(0,0),state:'placed',design:copy(START_DESIGN),rotation:0,order:0};
 w.flowers[f.id]=f;materialize(w,f);spawnFog(w,f);
 w.tiles[START_TILE].building={id:id(w),type:'camp',paid:0,workers:[{id:id(w),paid:0}]};
 for(const s of route(w,START_TILE,START_TOWN).segments){const k=edgeId(s.a,s.b);w.edges[k]={id:k,a:s.a,b:s.b,road:edgeId(START_TILE,START_TOWN),removing:false,readyAt:0,paid:0};}
 w.initial=totals(w);return w;}

/* ---------- prices ---------- */
const projectDuration=cost=>8*(2+Math.ceil(Math.sqrt(cost/100)));
function projectProgress(w,p){if(!p)return null;const done=Math.min(p.duration,Math.max(0,w.tick-p.started));return {...p,done,remaining:p.duration-done,percent:Math.floor(done/p.duration*100)};}
const buildingProgress=(w,t)=>projectProgress(w,t?.building?.construction);
const techProgress=(w,k)=>projectProgress(w,w.research?.[k]);
function projects(w){return [...Object.values(w.tiles).filter(t=>t.building?.construction).map(t=>({...buildingProgress(w,t),name:RECIPES[t.building.type].name,kind:'建造',tile:t.id})),...Object.entries(w.research||{}).map(([k,p])=>({...projectProgress(w,p),name:TECH[k].name,kind:'研究',key:k}))];}
function buildingCost(w,type){const n=Object.values(w.tiles).filter(t=>t.building?.type===type).length;return Math.round(PRICE[type]*BUILDING_GROWTH**n);}
function workerCost(w,t){const b=t.building;return Math.round(WORKER[b.type]*WORKER_GROWTH**b.workers.length);}
// What one more piece of a good is worth at best: its town price, or the price of what it turns into.
function goodValue(r){if(BASE_PRICE[r])return BASE_PRICE[r];return Math.max(0,...Object.values(RECIPES).filter(rc=>rc.in[r]).map(rc=>goodValue(rc.out)));}
const workersOf=(w,b)=>Object.values(w.tiles).reduce((n,t)=>n+(t.building?.type===b?t.building.workers.length:0),0);
// A craft level adds one piece per worker of that type; an era adds 25% of base market prices.
function craftCost(w,b){return Math.round(CRAFT_BASE[b]*(1+w.tech[craftOf(b)])**CRAFT_GROWTH);}
function eraCost(w){return ERA_BASE*2**w.tech.era;}
function techCost(w,k){const u=TECH[k];if(k==='era')return eraCost(w);if(u.building)return craftCost(w,u.building);return u.repeat?Math.round(u.base*u.growth**w.tech[k]):u.cost;}
const techOwned=(w,k)=>!TECH[k].repeat&&w.tech[k]>0;
const techMaxed=(w,k)=>TECH[k].max!=null&&w.tech[k]>=TECH[k].max;
const techPrerequisitesMet=(w,k)=>TECH[k].requires.every(r=>w.tech[r]>0);
const DISCOVERY_MARKET={mason:'tool',mine:'iron',smelter:'iron',paperMill:'paper',printer:'book',kiln:'machine',machineWorks:'machine'};
function techDiscoveryReason(w,k){
 if(techOwned(w,k)||TECH[k].building)return '';
 if(k==='era'){const threshold=[2,4,8,12][w.tech.era];return threshold&&w.unlocked<threshold?`探索 ${threshold} 块地图后可提升时代（当前 ${w.unlocked} 块）`:'';}
 const good=DISCOVERY_MARKET[k];return good&&!boughtGoods(w).has(good)?`探索发现收购${GOODS[good]}的城镇`:'';
}
const techAvailable=(w,k)=>techPrerequisitesMet(w,k)&&!techDiscoveryReason(w,k);
const workerPower=(w,type)=>1+(w.tech[craftOf(type)]||0),eraPower=w=>1+(w.tech.era||0);
// Manual work follows this workshop type's craft; towns only buy automatically.
function clickPower(w,t){return workshop(t?.building)?workerPower(w,t.building.type):0;}
const passable=(w,t)=>(t.terrain!=='mountain'||w.tech.mountainPass>0)&&(t.terrain!=='lake'||w.tech.waterway>0);
const terrainFactor=(a,b,w)=>Math.max(...[a,b].map(t=>t.terrain==='lake'&&w?.tech.navigation?2:TERRAIN_FACTOR[t.terrain]));
function segmentCost(w,factor){return Math.round(ROAD_BASE*factor*(w.tech.roadEngineering ? .8 : 1));}
function edgeCost(w,e){return segmentCost(w,terrainFactor(w.tiles[e.a],w.tiles[e.b],w));}
// A resident is priced by what it adds: PAYBACK rounds of the extra income, x GROWTH per resident already there.
function residentCost(w,tile){const b=w.tiles[tile].building;return Math.round(Object.values(b.buys).reduce((n,p)=>n+p,0)*PAYBACK*GROWTH**(b.residents-1));}
// Compatibility helpers for external summaries: markets never cap purchases or storage.
const townRate=()=>Infinity,townCap=()=>Infinity;
function buys(w,tile){const b=w.tiles[tile].building,out={};for(const[r,base]of Object.entries(b.buys))out[r]={price:Math.round(base*(1+.25*(b.residents-1+w.tech.era))),rate:Infinity,cap:Infinity};return out;}
// Connection entitlements are shared. The recipe graph is acyclic, but the guard also
// makes a malformed future cycle inactive instead of recursing forever.
function productionState(w,t,memo=new Map(),visiting=new Set()){
 if(memo.has(t.id))return memo.get(t.id);
 if(t.building?.construction||!workshop(t.building)||visiting.has(t.id))return {active:false,missing:[],sources:{}};
 const branch=new Set(visiting).add(t.id),sources={},missing=[];
 for(const r of Object.keys(RECIPES[t.building.type].in)){
  const source=Object.values(w.tiles).find(u=>u.id!==t.id&&workshop(u.building)&&RECIPES[u.building.type].out===r&&path(w,u.id,t.id)&&productionState(w,u,memo,branch).active);
  if(source)sources[r]=source.id;else missing.push(r);
 }
 const result={active:t.building.workers.length>0&&!missing.length,missing,sources};memo.set(t.id,result);return result;
}
const bname=b=>b.type==='town'?'城镇':RECIPES[b.type].name;

/* ---------- statistics ---------- */
function windowStats(w,seconds=WINDOW){const S=w.stats.filter(s=>s.tick>w.tick-seconds);return{S,span:S.length?w.tick-S[0].tick+1:0};}
function recentSales(w,tile,r){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+(s.sales[tile]?.[r]||0),0)/span;}
function income(w){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+s.income,0)/span;}
const processing=t=>workshop(t?.building)&&Object.keys(RECIPES[t.building.type].in).length>0;
const nearWater=(w,t)=>DIRS.some(([dq,dr])=>w.tiles[key(t.q+dq,t.r+dr)]?.terrain==='lake');
function productionBonuses(w,t,workers=t.building?.workers?.length||0){
 const bonuses=[];
 if(w.tech.waterPower&&processing(t)&&nearWater(w,t))bonuses.push({key:'waterPower',amount:workers});
 if(w.tech.specialization&&processing(t)&&workers===MAX_WORKERS)bonuses.push({key:'specialization',amount:3});
 if(w.tech.deepMining&&['mine','smelter'].includes(t.building?.type))bonuses.push({key:'deepMining',amount:(t.building.type==='mine'?2:1)*workers});
 return bonuses.filter(b=>b.amount>0);
}
const rate=(w,t,workers=t.building.workers.length)=>workers*workerPower(w,t.building.type)+productionBonuses(w,t,workers).reduce((n,b)=>n+b.amount,0);
function researchStatus(w,k){
 const tiles=Object.values(w.tiles),processors=tiles.filter(processing);
 if(k==='waterPower')return `适用：${processors.filter(t=>nearWater(w,t)).length} / ${processors.length} 座加工工坊邻湖 · 需雇工`;
 if(k==='specialization')return `适用：${processors.filter(t=>t.building.workers.length===MAX_WORKERS).length} / ${processors.length} 座加工工坊满 3 人`;
 if(k==='deepMining')return `适用：${tiles.filter(t=>['mine','smelter'].includes(t.building?.type)).length} 座矿山／铁厂 · 雇工并接通后固定增产`;
 if(k==='mountainPass')return `已发现 ${tiles.filter(t=>t.terrain==='mountain').length} 格山地 · ${w.tech.mountainPass?'可修路，不可建造':'研究后可修路'}`;
 if(k==='navigation')return `已发现 ${tiles.filter(t=>t.terrain==='lake').length} 格湖泊 · 仅新修道路享受优惠`;
 return '适用：全图新修道路 · 已有道路不追溯退款';
}

/* ---------- routing ---------- */
// Fewest segments over built roads, ties broken by edge ids so the choice is stable. The road graph only changes
// between rounds or through a road command, so results are cached per world object and round; road commands drop it.
const pathCache=new WeakMap();
function pathState(w){let c=pathCache.get(w);if(c&&c.tick===w.tick)return c;c={tick:w.tick,found:new Map(),edgesOf:{}};pathCache.set(w,c);
 for(const original of Object.values(w.edges)){if(original.removing||original.readyAt>w.tick)continue;const e=original.road?original:{...original,road:'legacy:'+roadComponent(w,original.id).map(part=>part.id).sort()[0]};(c.edgesOf[e.a]||(c.edgesOf[e.a]=[])).push(e);(c.edgesOf[e.b]||(c.edgesOf[e.b]=[])).push(e);}return c;}
function path(w,from,to){if(from===to)return [];const c=pathState(w),ck=from+'|'+to;if(c.found.has(ck)){const p=c.found.get(ck);return p&&p.slice();}const p=findPath(c.edgesOf,from,to,w.tiles);c.found.set(ck,p);return p&&p.slice();}
function findPath(edgesOf,from,to,tiles){
 const key=(node,road)=>JSON.stringify([node,road]),first=key(from,null),dist={[first]:[0,'']},prev={},open=[[from,null]],cmp=(a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]);let end=null;
 while(open.length){open.sort((a,b)=>cmp(dist[key(...a)],dist[key(...b)]));const [node,road]=open.shift(),current=key(node,road);if(node===to){end=current;break;}
  for(const e of (edgesOf[node]||[]).slice().sort((a,b)=>a.id.localeCompare(b.id))){
   if(road&&e.road&&road!==e.road&&!tiles[node]?.building)continue;
   const next=e.a===node?e.b:e.a,nextRoad=e.road||null,k=key(next,nextRoad),score=[dist[current][0]+1,dist[current][1]+e.id];
   if(!dist[k]||cmp(score,dist[k])<0){dist[k]=score;prev[k]=[current,e.id];if(!open.some(state=>key(...state)===k))open.push([next,nextRoad]);}
  }
 }
 if(!end)return null;const out=[];for(let k=end;k!==first;k=prev[k][0])out.unshift(prev[k][1]);return out;
}
// Fewest segments across passable terrain, then lowest new terrain cost. Existing roads are free to reuse.
// Bends have no separate fee; detours cost more when they add new segments.
function route(w,from,to,independent=false){
 const occupied=new Map(),seen=new Set();
 for(const e of Object.values(w.edges)){if(seen.has(e.id))continue;const group=roadComponent(w,e.id),identity=group.map(e=>e.id).sort()[0];for(const part of group){seen.add(part.id);for(const id of [part.a,part.b]){if(!occupied.has(id))occupied.set(id,new Set());occupied.get(id).add(identity);}}}
 const skey=(k,d)=>k+'|'+d,dist={[skey(from,-1)]:[0,0,'']},prev={},open=[[from,-1]];
 const compare=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].localeCompare(b[2]);
 let end=null;
 while(open.length){open.sort((a,b)=>compare(dist[skey(...a)],dist[skey(...b)])||skey(...a).localeCompare(skey(...b)));
  const[k,dir]=open.shift();if(k===to){end=[k,dir];break;}const here=w.tiles[k],d0=dist[skey(k,dir)];
  for(let i=0;i<DIRS.length;i++){const[dq,dr]=DIRS[i],t=w.tiles[key(here.q+dq,here.r+dr)];if(!t||!passable(w,t))continue;
   const eid=edgeId(k,t.id),e=w.edges[eid];if(!independent&&e?.removing)continue;
   if(independent&&t.id!==to&&(t.building||(occupied.get(t.id)?.size||0)>=2))continue;
   const score=[d0[0]+1,d0[1]+(!independent&&e?0:segmentCost(w,terrainFactor(here,t,w))),d0[2]+eid];
   const sk=skey(t.id,i);if(!dist[sk]||compare(score,dist[sk])<0){dist[sk]=score;prev[sk]=[k,dir];if(!open.some(([a,b])=>a===t.id&&b===i))open.push([t.id,i]);}}}
 if(!end)return null;
 const tiles=[],dirs=[];for(let s=end;s;s=prev[skey(...s)]){tiles.unshift(s[0]);dirs.unshift(s[1]);}
 const segments=[];let cost=0,lakes=0;
 for(let i=1;i<tiles.length;i++){const a=tiles[i-1],b=tiles[i];if(!independent&&w.edges[edgeId(a,b)])continue;
  const factor=terrainFactor(w.tiles[a],w.tiles[b],w),lake=[w.tiles[a].terrain,w.tiles[b].terrain].includes('lake');
  const c=segmentCost(w,factor);
  segments.push({a,b,lake,cost:c,factor});cost+=c;if(lake)lakes++;}
 return{tiles,segments,cost,lakes};}
// Roads connect two buildings. Intermediate tiles and bends are chosen automatically.
const anchored=(w,k)=>!!w.tiles[k]?.building||Object.values(w.edges).some(e=>!e.removing&&(e.a===k||e.b===k));
function connection(w,from,to){
 if(from===to)throw Error('请选择另一座建筑');
 if(!w.tiles[from]||!w.tiles[to])throw Error('请选择地图上的格子');
 if(!w.tiles[from].building||!w.tiles[to].building)throw Error('只能连接两个有建筑的板块');
 if(!passable(w,w.tiles[to]))throw Error(w.tiles[to].terrain==='lake'?'湖上修路需要航道科技':'山上修不了路：需要山地工程科技');
 const seen=new Set();
 for(const edge of Object.values(w.edges)){
  if(seen.has(edge.id))continue;
  const group=roadComponent(w,edge.id),ends=roadEndpoints(group);
  for(const part of group)seen.add(part.id);
  if(ends.length===2&&ends.includes(from)&&ends.includes(to)){
   if(group.some(e=>e.removing))throw Error('这条路正在拆除，请先撤销拆除');
   const tiles=[from];let node=from,previous=null;
   while(node!==to){const part=group.find(e=>e.id!==previous&&(e.a===node||e.b===node));if(!part)break;previous=part.id;node=part.a===node?part.b:part.a;tiles.push(node);if(tiles.length>group.length+1)break;}
   if(node===to)return {tiles,segments:[],cost:0,lakes:0};
  }
 }
 const r=route(w,from,to,true);if(!r)throw Error('没有独立路线：需要绕开已容纳两条道路的板块和中途建筑，可探索更多板块后连接');
 return r;}
function roadComponent(w,id){
 const start=w.edges[id];if(!start)return [];
 if(start.road)return Object.values(w.edges).filter(e=>e.road===start.road);
 // Legacy saves lack route identity. Stop at buildings and forks, never flood the network.
 const found=new Set([id]),nodes=[start.a,start.b];
 while(nodes.length){const node=nodes.pop();if(w.tiles[node]?.building)continue;
  const touching=Object.values(w.edges).filter(e=>e.a===node||e.b===node);
  if(touching.length!==2)continue;
  for(const e of touching)if(!e.road&&!found.has(e.id)){found.add(e.id);nodes.push(e.a===node?e.b:e.a);}
 }
 return [...found].map(k=>w.edges[k]);
}
function roadEndpoints(group){const degree=new Map();for(const e of group)for(const node of [e.a,e.b])degree.set(node,(degree.get(node)||0)+1);return [...degree].filter(([,n])=>n===1).map(([node])=>node);}
const formatMoney = n => '$'+Math.round(n).toLocaleString('zh-CN');
// Purchases are the only cash outflow and cannot overdraw the balance.
function pay(w,cost){if(w.money<cost)throw Error(`金币不足：需要 ${formatMoney(cost)}，现有 ${formatMoney(w.money)}`);w.money-=cost;w.spent+=cost;}
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
  pay(w,cost);t.building={id:id(w),type:c.buildType,paid:cost,workers:[],construction:{started:w.tick,duration:projectDuration(cost)}};
 }else if(c.type==='click'){if(b?.construction)fail('建筑施工中');if(!b)fail('点击工坊才能生产');
  if(b.type==='town')fail('城镇自动收购，点击只查看详情');
  const state=productionState(w,t);if(state.missing.length)fail('请连接'+state.missing.map(r=>GOODS[r]).join('、')+'的运行中上游');
  const rc=RECIPES[b.type],n=clickPower(w,t);t.loose[rc.out]+=n;w.production[rc.out]+=n;w.manual.out[rc.out]+=n;w.manual.tiles[t.id]=(w.manual.tiles[t.id]||0)+n;w.clicks++;
 }else if(c.type==='worker'){if(b?.construction)fail('建筑施工中');if(!workshop(b))fail('先选择一座已建工坊');if(b.workers.length>=MAX_WORKERS)fail(`每座建筑最多 ${MAX_WORKERS} 名工人，产能要靠新建筑和对应工艺`);const cost=workerCost(w,t);pay(w,cost);b.workers.push({id:id(w),paid:cost});
 }else if(c.type==='fireWorker'){if(!workshop(b))fail('请选择工坊');if(!b.workers.length)fail('这里没有工人');refund(w,b.workers.pop().paid);
 }else if(c.type==='tech'){const u=TECH[c.key];if(!u)fail('未知科技');if(techProgress(w,c.key))fail('科技研究中');if(techOwned(w,c.key))fail('已经买过这项科技');if(techMaxed(w,c.key))fail('已经是最高等级');if(!techPrerequisitesMet(w,c.key))fail(`先解锁${u.requires.filter(r=>!w.tech[r]).map(r=>TECH[r].name).join('和')}`);if(techDiscoveryReason(w,c.key))fail(techDiscoveryReason(w,c.key));const cost=techCost(w,c.key);pay(w,cost);(w.research||={})[c.key]={started:w.tick,duration:projectDuration(cost)};
 }else if(c.type==='connect'){const r=connection(w,c.from,c.to);pay(w,r.cost);for(const s of r.segments){const base=edgeId(s.a,s.b),road=edgeId(c.from,c.to),k=w.edges[base]?base+'#'+road:base;w.edges[k]={id:k,a:s.a,b:s.b,road,removing:false,readyAt:w.tick,paid:s.cost};}pathCache.delete(w);
 }else if(c.type==='demolish'){if(!b||b.type==='town')fail('请选择工坊');refund(w,b.paid+b.workers.reduce((n,m)=>n+m.paid,0));t.building=null;
 }else if(c.type==='removeRoad'){const group=roadComponent(w,c.edge);if(!group.length)fail('请选择道路');for(const e of group)e.removing=true;pathCache.delete(w);
 }else if(c.type==='restoreRoad'){for(const e of roadComponent(w,c.edge))e.removing=false;pathCache.delete(w);
 }else if(c.type==='resident'){if(b?.type!=='town')fail('请选择城镇');if(b.residents>=MAX_RESIDENTS)fail(`每座城镇最多 ${MAX_RESIDENTS} 名居民，售价可通过时代继续提升`);const cost=residentCost(w,t.id);pay(w,cost);b.residents++;b.paid+=cost;
 }else if(c.type==='explore'){const f=w.flowers[c.flower];if(!f||f.state!=='fog')fail('只能解锁迷雾中的板块');const cost=flowerCost(w,f);pay(w,cost);const n=++w.unlocked;
  const before={goods:boughtGoods(w),terrains:terrainsOn(w)};
  const g=generateFlower(w,n,f);f.design=g.design;f.rotation=g.rotation;f.state='placed';f.order=n;f.paid=cost;materialize(w,f);spawnFog(w,f);if(f.design.buys)w.lastTownUnlock=n;
  // Did this flower bring something the map had never seen? Then the novelty clock resets.
  if([...boughtGoods(w)].some(r=>!before.goods.has(r))||[...terrainsOn(w)].some(t=>!before.terrains.has(t)))w.lastNovel=n;
 }else fail('未知操作');}

/* ---------- connected markets ---------- */
function saleValue(w,from,r,seen=new Set()){
 const visit=from+':'+r;if(seen.has(visit))return 0;seen=new Set(seen).add(visit);
 let best=0;
 for(const t of Object.values(w.tiles)){
  const b=t.building;if(!b||t.id===from)continue;
  if(b.type==='town'){if(b.buys[r]&&path(w,from,t.id))best=Math.max(best,b.buys[r]);}
  else if(RECIPES[b.type].in[r]&&path(w,from,t.id))best=Math.max(best,saleValue(w,t.id,RECIPES[b.type].out,seen));
 }
 return best;
}
// A town sells n pieces of r out of its warehouse at price.
function sell(w,t,r,n,price){t.loose[r]-=n;w.consumption[r]+=n;w.sold[t.id][r]+=n;const gross=n*price;w.money+=gross;w.earned+=gross;return gross;}
// The engine's steady income: what it earns per round with nobody clicking, after stored surplus has sold. A shadow
// copy runs `rounds` rounds and the last `window` are averaged. Prices never depend on this estimate.
function steady(w,rounds=100,window=WINDOW){const v=copy(w);v.manual={out:zero(),tiles:{},sales:{},gross:0};for(let i=0;i<rounds;i++)tick(v);const S=v.stats.slice(-window);return S.length?S.reduce((n,s)=>n+s.income,0)/S.length:0;}
/* ---------- goals ---------- */
// Two goals: sales income and exploration. Production and travel remain diagnostics, not incentives.
const GOAL_REWARD_ROUNDS=2,GOAL_REWARD_FLOOR=800;
const goodsIn=a=>RES.reduce((n,r)=>n+(a[r]||0),0);
const GOALS=[
 {id:'income',icon:'coin',label:'每回合收入',unit:'金币',base:20,step:2,value:income},
 {id:'map',icon:'fog',label:'已解锁板块',unit:'块',base:1,step:1,value:w=>w.unlocked}];
function windowRate(w,pick){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+pick(s),0)/span;}
// Tier 1 is the base; after that the step either multiplies (rates) or adds (counts).
function goalTarget(g,tier){return g.step===1?g.base+tier-1:g.base*g.step**(tier-1);}
function goalFloor(g,tier){return tier<=1?0:goalTarget(g,tier-1);}
// Small on purpose: always less than the cheapest road segment, so a reward can never decide a build.
function goalReward(w){return Math.min(1200,Math.max(GOAL_REWARD_FLOOR,Math.round(income(w)*GOAL_REWARD_ROUNDS)));}
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
// Legacy diagnostics are intentionally inert; connection state is the only prerequisite.
const WARNING_ROUNDS=5;
function buildingBottleneck(){return null;}
function warning(){return null;}
function tick(w){
 w.tick++;
 for(const t of Object.values(w.tiles))if(t.building?.construction&&!buildingProgress(w,t).remaining)delete t.building.construction;
 for(const k of Object.keys(w.research||{}))if(!techProgress(w,k).remaining){w.tech[k]++;delete w.research[k];}
 const sample={tick:w.tick,out:zero(),tiles:{...w.manual.tiles},manualTiles:{...w.manual.tiles},capacities:{},edges:{},received:{},dispatched:{},income:0,gross:w.manual.gross,sales:{},revenue:{},traffic:[]};
 add(sample.out,w.manual.out);for(const[k,v]of Object.entries(w.manual.sales))add(sample.sales[k]||(sample.sales[k]=zero()),v);
 w.manual={out:zero(),tiles:{},sales:{},gross:0};
 // Old physical freight is preserved as stock exactly once, without new reservations.
 for(const s of w.shipments)w.tiles[s.edge?s.to:s.node].loose[s.r]++;
 w.shipments=[];
 for(const e of Object.values(w.edges))if(e.removing){refund(w,e.paid);delete w.edges[e.id];}
 pathCache.delete(w);
 const flow=(from,to,r,n)=>{const p=path(w,from,to);if(!p?.length)return;
  let node=from;for(const eid of p){const e=w.edges[eid],next=e.a===node?e.b:e.a;
   const row=sample.edges[eid]||(sample.edges[eid]={flows:{}}),key=node+'>'+next+':'+r;row.flows[key]=(row.flows[key]||0)+n;node=next;}
  const e=w.edges[p[0]];sample.traffic.push({r,node:from,from,to:e.a===from?e.b:e.a,edge:e.id,destination:to});
 };
 const memo=new Map();
 for(const t of Object.values(w.tiles)){if(!workshop(t.building))continue;
  const state=productionState(w,t,memo),n=state.active?rate(w,t):0,r=RECIPES[t.building.type].out;
  sample.capacities[t.id]=rate(w,t);delete t.building.warning;
  if(!n)continue;t.loose[r]+=n;w.production[r]+=n;sample.out[r]+=n;sample.tiles[t.id]=(sample.tiles[t.id]||0)+n;
  for(const [input,source]of Object.entries(state.sources))flow(source,t.id,input,1);
 }
 const markets=Object.values(w.tiles).filter(t=>t.building?.type==='town');
 for(const town of markets){sample.sales[town.id]||=zero();sample.revenue[town.id]=zero();}
 // Every stored output sells once to the best connected market. Production does not
 // depend on buyers, route length, input quantities or available warehouse space.
 for(const t of Object.values(w.tiles))for(const r of SELLABLE){const n=t.loose[r];if(!n)continue;
  const candidates=markets.filter(u=>u.building.buys[r]&&(u.id===t.id||path(w,t.id,u.id))).sort((a,b)=>buys(w,b.id)[r].price-buys(w,a.id)[r].price||a.id.localeCompare(b.id));
  const town=candidates[0];if(!town)continue;const price=buys(w,town.id)[r].price;
  if(town.id!==t.id){t.loose[r]-=n;town.loose[r]+=n;flow(t.id,town.id,r,n);}
  const gross=sell(w,town,r,n,price);sample.gross+=gross;sample.sales[town.id][r]+=n;sample.revenue[town.id][r]+=gross;
  (sample.received[town.id]||=zero())[r]+=n;(sample.dispatched[t.id]||=zero())[r]+=n;
 }
 sample.income=sample.gross;w.stats.push(sample);while(w.stats.length&&w.stats[0].tick<=w.tick-WINDOW)w.stats.shift();advanceGoals(w,sample);
}
function totals(w){const sum=zero();for(const t of Object.values(w.tiles))add(sum,t.loose);for(const s of w.shipments)sum[s.r]++;return sum;}
function validate(w){const int=n=>Number.isSafeInteger(n)&&n>=0;
 if(w?.schemaVersion!==25||!w.tiles||!w.flowers||!Array.isArray(w.shipments)||!Array.isArray(w.stats)||!w.scheduler||!w.goals||!w.tech||!w.manual||!w.sold||!w.flags||!int(w.tick)||!int(w.serial)||!int(w.money)||!int(w.earned)||!int(w.spent)||!int(w.clicks)||!int(w.seed)||!int(w.unlocked)||!int(w.lastTownUnlock)||!int(w.lastNovel))throw Error('存档格式不兼容');
 const checkProject=p=>{if(!p||!int(p.started)||p.started>w.tick||!int(p.duration)||p.duration<1||p.started+p.duration<=w.tick)throw Error('进度无效');};
 if(w.research!==undefined&&(!w.research||typeof w.research!=='object'||Array.isArray(w.research)))throw Error('研究进度无效');
 for(const [k,p]of Object.entries(w.research||{})){if(!TECH[k]||techOwned(w,k)||techMaxed(w,k)||!techPrerequisitesMet(w,k))throw Error('研究进度无效');checkProject(p);}
 for(const t of Object.values(w.tiles))if(t.building?.construction)checkProject(t.building.construction);
 for(const g of GOALS)if(!Number.isSafeInteger(w.goals[g.id])||w.goals[g.id]<1)throw Error('目标等级无效');
 for(const k of Object.keys(w.goals))if(!GOALS.some(g=>g.id===k))throw Error('目标等级无效');
 for(const k of Object.keys(TECH))if(!int(w.tech[k])||(!TECH[k].repeat&&w.tech[k]>1)||(TECH[k].max!=null&&w.tech[k]>TECH[k].max))throw Error('科技无效');
 for(const k of Object.keys(w.tech))if(!TECH[k])throw Error('科技无效');
 for(const k of Object.keys(RESEARCH))if(w.tech[k]&&!techPrerequisitesMet(w,k))throw Error('研究前置无效');
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
 for(const[k,e]of Object.entries(w.edges)){const a=w.tiles[e.a],b=w.tiles[e.b];if(!a||!b||!adjacent(a,b)||!passable(w,a)||!passable(w,b)||k!==e.id||(k!==edgeId(e.a,e.b)&&(!e.road||k!==edgeId(e.a,e.b)+'#'+e.road))||!int(e.readyAt)||!int(e.paid))throw Error('道路引用无效');}
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
 if(next?.schemaVersion===22&&next.tech){
  for(const k of Object.keys(RESEARCH))if(next.tech[k]===undefined)next.tech[k]=0;
  next.schemaVersion=23;
 }
 if(next?.schemaVersion===23&&next.tech){
  for(const b of NEW_BUILDINGS)for(const k of [b,craftOf(b)])if(next.tech[k]===undefined)next.tech[k]=0;
  const fill=a=>{if(a)for(const r of NEW_GOODS)if(a[r]===undefined)a[r]=0;};
  for(const a of [next.initial,next.production,next.consumption,next.manual?.out])fill(a);
  for(const t of Object.values(next.tiles||{}))fill(t.loose);
  for(const a of Object.values(next.sold||{}))fill(a);
  for(const a of Object.values(next.manual?.sales||{}))fill(a);
  for(const s of next.stats||[]){fill(s.out);for(const field of ['sales','received','dispatched','revenue'])for(const a of Object.values(s[field]||{}))fill(a);}
  next.schemaVersion=24;
 }
 if(next?.schemaVersion===24){
  next.schemaVersion=25;validate(next);
  for(const shipment of next.shipments)next.tiles[shipment.edge?shipment.to:shipment.node].loose[shipment.r]++;
  next.shipments=[];next.scheduler={};
  for(const t of Object.values(next.tiles))if(t.building)delete t.building.warning;
  delete next.flags.yardFull;
 }
 validate(next);return next;}
const api={projectDuration,projectProgress,buildingProgress,techProgress,projects,roadEndpoints,techDiscoveryReason,techPrerequisitesMet,DISCOVERY_MARKET,productionState,NEW_GOODS,NEW_BUILDINGS,RESEARCH,productionBonuses,researchStatus,processing,nearWater,WARNING_ROUNDS,buildingBottleneck,warning,formatMoney,RES,SELLABLE,GOODS,BASE_PRICE,DT,TPS,WINDOW,YARD,PRICE,WORKER,WORKER_GROWTH,MAX_WORKERS,TECH,ERAS,craftOf,RECIPES,BUILDINGS,RAW,TERRAINS,TERRAIN_NAME,TERRAIN_FACTOR,ROAD_BASE,FAR_BONUS,BUILDING_GROWTH,CRAFT_BASE,CRAFT_GROWTH,ERA_BASE,townCap,steady,TOWN_RATE,MAX_RESIDENTS,PAYBACK,GROWTH,START_MONEY,START_TILE,START_TOWN,START_DESIGN,FLOWER_BASE,FLOWER_PAIR,TUTORIAL,CANDIDATES,GEN,discovery,rawDeficit,boughtGoods,terrainsOn,chainGaps,rawOf,goodsFrom,DIRS,GOALS,GOAL_REWARD_ROUNDS,GOAL_REWARD_FLOOR,goalTarget,goalFloor,goalReward,goalProgress,
 copy,zero,add,workshop,newWorld,edgeId,adjacent,hexDist,flowerCenter,flowerTiles,flowerCost,flowerDistance,slotTerrain,generateFlower,validDesign,rng,path,route,connection,roadComponent,command,tick,totals,validate,apply,load,buildingCost,workerCost,techCost,techOwned,techAvailable,techMaxed,workerPower,clickPower,eraPower,goodValue,workersOf,craftCost,eraCost,edgeCost,segmentCost,anchored,residentCost,townRate,income,buys,recentSales,terrainFactor,passable,rate,saleValue,earning,previewRoute,producible,nextGoods};
if(typeof module!=='undefined')module.exports=api;root.TradeEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
