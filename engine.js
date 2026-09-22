/* v0.11 deterministic simulation. One tick is one round (DT seconds of real time at 1x). Every stored quantity is an
   integer: goods in pieces, money in coins, rates in pieces per tick. Buildings make nothing on their own: the player
   clicks a building to make one piece, and hires workers so it makes pieces every tick. */
(function(root){
'use strict';
const RES=['log','board','stone'],TPS=1,DT=2,WINDOW=30,YARD=20,POOL_TICKS=20,BUFFER_TICKS=5;
const PRICE={camp:1200,sawmill:2400,quarry:1600},ROAD_BASE=250,BRIDGE=3,UPGRADE_MULT=3,TOWN_BASE=1500,TOWN_GROWTH=1.5,REFUND=.5,START_MONEY=1000;
// Workers are the only thing that makes a building produce on its own: each one makes `workerPower`
// pieces per tick. The first worker costs about twenty clicks' worth of goods; each next one costs 30% more.
const WORKER={camp:400,quarry:600,sawmill:1000},WORKER_GROWTH=1.3,MAX_WORKERS=3;
// Levelled global techs: training raises every worker, tools raise every click.
const TECH={training:{name:'工人培训',base:5000,growth:2,desc:'每名工人每回合多 1 件'},tools:{name:'工具改良',base:2000,growth:2,desc:'每次点击多 1 件'}};
const TERRAIN_FACTOR={grass:1,town:1,forest:2,rock:2,dense:3,rich:3};
const ROAD_CAP=[4,12];// pieces per tick, before the cart research
// Every town takes TOWN_RATE pieces per tick of each listed good at level 0; each paid level adds as many.
const TOWN_RATE=2;
const TOWNS={
 west:{tile:'-3,1',name:'西镇',buys:{log:20,stone:30}},
 south:{tile:'0,3',name:'南镇',buys:{board:50,stone:40,log:10}},
 east:{tile:'3,-1',name:'东集',buys:{board:90,log:30,stone:50}}};
const RESEARCH={cart:{name:'货运马车',cost:16000,desc:'所有道路运力 ×2'}};
const zero=()=>({log:0,board:0,stone:0}),copy=x=>JSON.parse(JSON.stringify(x));
const add=(a,b)=>{for(const r of RES)a[r]=(a[r]||0)+(b[r]||0);};
const id=w=>String(++w.serial).padStart(6,'0'),edgeId=(a,b)=>[a,b].sort().join('|');
const adjacent=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r))===1;
const river=(a,b)=>Math.min(a.q,b.q)===0&&Math.max(a.q,b.q)===1;
const townAt=k=>Object.keys(TOWNS).find(key=>TOWNS[key].tile===k)||null;
const FITS={camp:['forest','dense'],sawmill:['grass'],quarry:['rock','rich']},OUTPUT={camp:'log',sawmill:'board',quarry:'stone'},START_TILE='-2,1';
function terrain(k){if(townAt(k))return 'town';if(['0,-1','-2,1','-2,0','0,-3'].includes(k))return 'forest';if(['2,0','2,1'].includes(k))return 'dense';if(['-1,0','-3,2'].includes(k))return 'rock';if(k==='2,-1')return 'rich';if(['-1,2','1,-2'].includes(k))return 'mountain';return 'grass';}
function newWorld(){const w={schemaVersion:11,tick:0,serial:0,tiles:{},edges:{},shipments:[],scheduler:{},stats:[],money:START_MONEY,earned:0,spent:0,production:zero(),consumption:zero(),sold:{},research:{},tech:{training:0,tools:0},clicks:0,manual:{out:zero(),tiles:{}},milestones:{},paused:false};
 for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=3){const k=`${q},${r}`;w.tiles[k]={id:k,q,r,terrain:terrain(k),loose:zero(),building:null};}
 for(const [key,t] of Object.entries(TOWNS)){w.tiles[t.tile].building={id:id(w),type:'town',town:key,level:0,paid:0,demand:zero()};w.sold[key]=zero();}
 // One camp next to the west town and no road: the player clicks it, then discovers roads, workers and the rest.
 w.tiles[START_TILE].building={id:id(w),type:'camp',paid:0,workers:[]};
 w.initial=totals(w);return w;}
// Prices. A new building costs its base price; every worker already on a building makes the
// next one dearer. Roads are priced per segment by terrain only, never by count.
function buildingCost(w,type){return PRICE[type];}
function workerCost(w,t){const b=t.building;return Math.round(WORKER[b.type]*WORKER_GROWTH**b.workers.length);}
function techCost(w,key){const u=TECH[key];return Math.round(u.base*u.growth**w.tech[key]);}
const workerPower=w=>1+w.tech.training,clickPower=w=>1+w.tech.tools;
const terrainFactor=(a,b)=>Math.max(TERRAIN_FACTOR[a.terrain],TERRAIN_FACTOR[b.terrain]);
function segmentCost(bridge,factor=1){return ROAD_BASE*factor*(bridge?BRIDGE:1);}
function edgeCost(w,e){const a=w.tiles[e.a],b=w.tiles[e.b];return segmentCost(river(a,b),terrainFactor(a,b));}
function upgradeCost(w,e){return edgeCost(w,e)*UPGRADE_MULT;}
function townLevelCost(w,key){return Math.round(TOWN_BASE*TOWN_GROWTH**w.tiles[TOWNS[key].tile].building.level);}
function linkReason(w,from,to){const a=w.tiles[from]?.building,b=w.tiles[to]?.building;if(!a||!b)return '请连接两座已建建筑或城镇';
 const flows=(x,y)=>{if(x.type==='town')return false;const r=OUTPUT[x.type];return y.type==='town'?!!TOWNS[y.town].buys[r]:y.type==='sawmill'&&r==='log';};
 if(flows(a,b)||flows(b,a))return null;
 const name=x=>x.type==='town'?TOWNS[x.town].name:{camp:'伐木营',sawmill:'锯木厂',quarry:'采石场'}[x.type];
 if(a.type==='town'&&b.type==='town')return '城镇之间没有货可运';
 const p=a.type==='town'?b:a,q=a.type==='town'?a:b;const r={log:'原木',board:'木板',stone:'石头'}[OUTPUT[p.type]];
 return q.type==='town'?`${name(q)}不收${r}`:`${name(q)}不需要${r}，这条路没有货可运`;}
// A town's level is bought by the player: each level takes TOWN_RATE more pieces per tick of every good.
function buys(w,key){const L=w.tiles[TOWNS[key].tile].building.level,out={};for(const[r,price]of Object.entries(TOWNS[key].buys))out[r]={price,rate:(1+L)*TOWN_RATE,pool:(1+L)*TOWN_RATE*POOL_TICKS};return out;}
function windowStats(w,seconds=WINDOW){const S=w.stats.filter(s=>s.tick>w.tick-seconds);return{S,span:S.length?w.tick-S[0].tick+1:0};}
function recentSales(w,key,r){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+(s.sales[key]?.[r]||0),0)/span;}
function income(w){const{S,span}=windowStats(w);if(!span)return 0;return S.reduce((n,s)=>n+s.income,0)/span;}
const capacity=(w,e)=>ROAD_CAP[e.level]*(w.research.cart?2:1);// pieces per tick
const rate=(w,t)=>t.building.workers.length*workerPower(w);// pieces per tick from workers alone
function queueCost(w,e){return w.shipments.filter(s=>!s.edge&&s.next===e.id).length/capacity(w,e);}
function path(w,from,to){if(from===to)return [];const dist={[from]:[0,0,'']},prev={},open=[from];const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].localeCompare(b[2]);
 while(open.length){open.sort((a,b)=>cmp(dist[a],dist[b])||a.localeCompare(b));const k=open.shift();if(k===to)break;for(const e of Object.values(w.edges).sort((a,b)=>a.id.localeCompare(b.id))){if(e.removing||e.readyAt>w.tick||!(e.a===k||e.b===k))continue;const n=e.a===k?e.b:e.a,d=[dist[k][0]+1,dist[k][1]+queueCost(w,e),dist[k][2]+e.id];if(!dist[n]||cmp(d,dist[n])<0){dist[n]=d;prev[n]=[k,e.id];if(!open.includes(n))open.push(n);}}}
 if(!dist[to])return null;const out=[];for(let k=to;k!==from;k=prev[k][0])out.unshift(prev[k][1]);return out;}
function connection(w,from,to){
 if(from===to)throw Error('拖到另一座建筑即可连接');
 const reason=linkReason(w,from,to);if(reason)throw Error(reason);
 const dist={[from]:[0,0,'']},prev={},open=[from];
 const compare=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].localeCompare(b[2]);
 while(open.length){open.sort((a,b)=>compare(dist[a],dist[b]));const k=open.shift();if(k===to)break;
  for(const t of Object.values(w.tiles).sort((a,b)=>a.id.localeCompare(b.id))){
   if(t.terrain==='mountain'||!adjacent(w.tiles[k],t))continue;
   const eid=edgeId(k,t.id),e=w.edges[eid];if(e?.removing)continue;
   const score=[dist[k][0]+1,dist[k][1]+(e?0:river(w.tiles[k],t)?3:terrainFactor(w.tiles[k],t)),dist[k][2]+eid];
   if(!dist[t.id]||compare(score,dist[t.id])<0){dist[t.id]=score;prev[t.id]=k;if(!open.includes(t.id))open.push(t.id);}
  }
 }
 if(!dist[to])throw Error('这两点之间没有可铺设的路线');
 const tiles=[to];while(tiles[0]!==from)tiles.unshift(prev[tiles[0]]);
 const segments=[];let cost=0,bridges=0;
 for(let i=1;i<tiles.length;i++){const a=tiles[i-1],b=tiles[i];if(w.edges[edgeId(a,b)])continue;const bridge=river(w.tiles[a],w.tiles[b]),factor=terrainFactor(w.tiles[a],w.tiles[b]);const c=segmentCost(bridge,factor);segments.push({a,b,bridge,cost:c,factor});cost+=c;if(bridge)bridges++;}
 return{tiles,segments,cost,bridges};
}
function pay(w,cost){if(w.money<cost)throw Error(`金币不足：需要 ${cost}，现有 ${w.money}`);w.money-=cost;w.spent+=cost;}
function refund(w,paid){const back=Math.round(paid*REFUND);w.money+=back;return back;}
function command(w,c){const t=w.tiles[c.tile],b=t?.building;const fail=m=>{throw Error(m);};
 if(c.type==='build'){if(!t||t.building)fail('这里已有建筑');if(!(FITS[c.buildType]||[]).includes(t.terrain))fail('这种建筑不适合这块地');const cost=buildingCost(w,c.buildType);pay(w,cost);t.building={id:id(w),type:c.buildType,paid:cost,workers:[]};
 }else if(c.type==='click'){if(!b||b.type==='town')fail('点击工坊才能生产');const r=OUTPUT[b.type];let n=Math.min(clickPower(w),YARD-t.loose[r]);if(n<=0)fail('堆场已满，先把货运出去');if(b.type==='sawmill'){n=Math.min(n,t.loose.log);if(n<=0)fail('没有原木可加工');t.loose.log-=n;w.consumption.log+=n;}t.loose[r]+=n;w.production[r]+=n;w.manual.out[r]+=n;w.manual.tiles[t.id]=(w.manual.tiles[t.id]||0)+n;w.clicks++;
 }else if(c.type==='worker'){if(!b||b.type==='town')fail('先选择一座已建工坊');if(b.workers.length>=MAX_WORKERS)fail(`每座建筑最多 ${MAX_WORKERS} 名工人，产能要靠新建筑和工人培训`);const cost=workerCost(w,t);pay(w,cost);b.workers.push({id:id(w),paid:cost});
 }else if(c.type==='fireWorker'){if(!b||b.type==='town')fail('请选择工坊');if(!b.workers.length)fail('这里没有工人');refund(w,b.workers.pop().paid);
 }else if(c.type==='tech'){const u=TECH[c.key];if(!u)fail('未知科技');const cost=techCost(w,c.key);pay(w,cost);w.tech[c.key]++;
 }else if(c.type==='connect'){const route=connection(w,c.from,c.to);pay(w,route.cost);for(const s of route.segments){const k=edgeId(s.a,s.b);w.edges[k]={id:k,a:s.a,b:s.b,level:0,removing:false,readyAt:w.tick,paid:s.cost,upgradePaid:0};}
 }else if(c.type==='upgrade'){const e=w.edges[c.edge];if(!e||e.removing||e.level)fail('这段路暂时不能扩容');const cost=upgradeCost(w,e);pay(w,cost);e.level=1;e.upgradePaid=cost;
 }else if(c.type==='downgrade'){const e=w.edges[c.edge];if(!e||e.removing||!e.level)fail('请选择已扩容的道路');refund(w,e.upgradePaid);e.level=0;e.upgradePaid=0;
 }else if(c.type==='demolish'){if(!b||b.type==='town')fail('请选择工坊');refund(w,b.paid+b.workers.reduce((n,m)=>n+m.paid,0));t.building=null;
 }else if(c.type==='removeRoad'){const e=w.edges[c.edge];if(!e)fail('请选择道路');e.removing=true;
 }else if(c.type==='restoreRoad'){if(w.edges[c.edge])w.edges[c.edge].removing=false;
 }else if(c.type==='townLevel'){if(b?.type!=='town')fail('请选择城镇');const cost=townLevelCost(w,b.town);pay(w,cost);b.level++;b.paid+=cost;
 }else if(c.type==='research'){const u=RESEARCH[c.key];if(!u)fail('未知升级');if(w.research[c.key])fail('已经购买过这项升级');pay(w,u.cost);w.research[c.key]=true;
 }else fail('未知操作');}
// A sawmill keeps a few ticks of logs on hand (at least a few for clicking even with no
// workers); a town asks only for what its demand pool currently wants, so freight never
// overshoots a town that has stopped buying.
function buffer(w,t){const b=t.building;return b?.type==='sawmill'?Math.min(YARD,BUFFER_TICKS*Math.max(1,rate(w,t))):0;}
function available(w,t,r){if(t.building?.type==='town')return 0;return Math.max(0,t.loose[r]-(r==='log'?buffer(w,t):0));}
function demands(w){const ds=[];for(const t of Object.values(w.tiles)){const b=t.building;if(!b)continue;
 if(b.type==='sawmill')ds.push({key:`b${b.id}:log`,tile:t.id,r:'log',target:buffer(w,t),local:t.loose.log,rate:Math.max(1,rate(w,t)),weight:1,active:true});
 if(b.type==='town')for(const[r,d]of Object.entries(buys(w,b.town)))ds.push({key:`t${b.id}:${r}`,tile:t.id,r,target:b.demand[r],local:t.loose[r],rate:d.rate,weight:1,active:true});}
 return ds.sort((a,b)=>a.key.localeCompare(b.key));}
// What one more piece is worth at the demand's door: the town's price, or for a sawmill the
// best board price it can reach.
function value(w,d){const b=w.tiles[d.tile].building;if(b.type==='town')return buys(w,b.town)[d.r].price;let best=0;for(const[k,t]of Object.entries(TOWNS))if(t.buys.board&&path(w,d.tile,t.tile))best=Math.max(best,t.buys.board);return best;}
function allocated(w,key){return w.shipments.filter(s=>s.key===key).length;}
function release(w,s){w.tiles[s.node].loose[s.r]++;w.shipments.splice(w.shipments.indexOf(s),1);}
function reconcile(w,ds){const map=new Map(ds.map(d=>[d.key,d]));for(const s of w.shipments)if(!map.has(s.key))s.key=null;for(const d of ds){const ss=w.shipments.filter(s=>s.key===d.key).sort((a,b)=>b.id.localeCompare(a.id));let excess=ss.length-Math.max(0,d.target-d.local);for(const s of ss){if(excess--<=0)break;s.key=null;}}for(const s of [...w.shipments])if(!s.edge){const d=map.get(s.key);if(!d){release(w,s);continue;}if(s.node===d.tile){w.tiles[d.tile].loose[s.r]++;w.shipments.splice(w.shipments.indexOf(s),1);continue;}const p=path(w,s.node,d.tile);if(!p){release(w,s);continue;}s.next=p[0];}}
function choose(w,scope,ds,eligible){const ring=ds.flatMap(d=>Array.from({length:d.weight},(_,i)=>({d,slot:d.key+'#'+i})));if(!ring.length)return null;let start=ring.findIndex(x=>x.slot===w.scheduler[scope]);start=start<0?0:(start+1)%ring.length;for(let j=0;j<ring.length;j++){const x=ring[(start+j)%ring.length];if(eligible(x.d)){w.scheduler[scope]=x.slot;return x.d;}}return null;}
const MILESTONES=[
 {id:'click',name:'点击伐木营，做出第一根原木',reward:200,test:w=>w.clicks>0},
 {id:'market',name:'把货卖进第一座城镇',reward:500,test:w=>Object.values(w.sold).some(s=>RES.some(r=>s[r]>0))},
 {id:'worker',name:'雇第一名工人',reward:500,test:w=>Object.values(w.tiles).some(t=>t.building?.workers?.length>0)},
 {id:'quarry',name:'建成采石场',reward:1000,test:w=>Object.values(w.tiles).some(t=>t.building?.type==='quarry')},
 {id:'sawmill',name:'建成锯木厂',reward:1500,test:w=>Object.values(w.tiles).some(t=>t.building?.type==='sawmill')},
 {id:'board',name:'卖出第一块木板',reward:500,test:w=>Object.values(w.sold).some(s=>s.board>0)},
 {id:'camp2',name:'建成第二座伐木营',reward:1000,test:w=>Object.values(w.tiles).filter(t=>t.building?.type==='camp').length>=2},
 {id:'towns2',name:'向两座城镇供货',reward:1500,test:w=>Object.values(w.sold).filter(s=>RES.some(r=>s[r]>0)).length>=2},
 {id:'income100',name:'收入达到 100 金币/回合',reward:2000,test:w=>income(w)>=100},
 {id:'road',name:'扩容一段道路',reward:1500,test:w=>Object.values(w.edges).some(e=>e.level)},
 {id:'townlevel',name:'扩建一座城镇',reward:3000,test:w=>Object.values(w.tiles).some(t=>t.building?.type==='town'&&t.building.level>0)},
 {id:'bridge',name:'架起第一座桥',reward:2500,test:w=>Object.values(w.edges).some(e=>river(w.tiles[e.a],w.tiles[e.b]))},
 {id:'towns3',name:'向三座城镇供货',reward:4000,test:w=>Object.values(w.sold).filter(s=>RES.some(r=>s[r]>0)).length>=3},
 {id:'workersfull',name:`把一座建筑的工人雇满（${MAX_WORKERS} 名）`,reward:3000,test:w=>Object.values(w.tiles).some(t=>t.building?.workers?.length>=MAX_WORKERS)},
 {id:'training',name:'完成第一次工人培训',reward:3000,test:w=>w.tech.training>0},
 {id:'east',name:'在河东建锯木厂',reward:4000,test:w=>Object.values(w.tiles).some(t=>t.q>=1&&t.building?.type==='sawmill')},
 {id:'income300',name:'收入达到 300 金币/回合',reward:8000,test:w=>income(w)>=300},
 {id:'income1000',name:'收入达到 1000 金币/回合',reward:20000,test:w=>income(w)>=1000}];
function tick(w){w.tick++;const sample={tick:w.tick,out:zero(),tiles:{},edges:{},income:0,sales:{}};const oldEdges=new Set(Object.keys(w.edges));
 // Clicks since the last tick count as this tick's production.
 add(sample.out,w.manual.out);Object.assign(sample.tiles,w.manual.tiles);w.manual={out:zero(),tiles:{}};
 for(const s of w.shipments)if(s.edge){s.remaining--;if(s.remaining<=0){s.node=s.to;s.edge=null;s.remaining=0;}}
 for(const e of Object.values(w.edges))if(e.removing&&!w.shipments.some(s=>s.edge===e.id)){refund(w,e.paid+e.upgradePaid);delete w.edges[e.id];}
 reconcile(w,demands(w));
 // Production: each building makes `rate` pieces per tick while its yard has room; a sawmill
 // also needs that many logs on hand.
 for(const t of Object.values(w.tiles)){const b=t.building;if(!b||b.type==='town')continue;const r=OUTPUT[b.type];let n=Math.min(rate(w,t),YARD-t.loose[r]);if(b.type==='sawmill')n=Math.min(n,t.loose.log);if(n<=0)continue;if(b.type==='sawmill'){t.loose.log-=n;w.consumption.log+=n;}t.loose[r]+=n;w.production[r]+=n;sample.out[r]+=n;sample.tiles[t.id]=(sample.tiles[t.id]||0)+n;}
 // Towns: demand grows by `rate` per tick into a bounded pool; pieces at the gate sell while
 // the pool wants them. A full pool stops growing, an empty one stops buying.
 for(const t of Object.values(w.tiles)){const b=t.building;if(b?.type!=='town')continue;sample.sales[b.town]=zero();
  for(const[r,d]of Object.entries(buys(w,b.town))){b.demand[r]=Math.min(d.pool,b.demand[r]+d.rate);const n=Math.min(t.loose[r],b.demand[r]);if(!n)continue;t.loose[r]-=n;b.demand[r]-=n;w.consumption[r]+=n;w.sold[b.town][r]+=n;w.money+=n*d.price;w.earned+=n*d.price;sample.income+=n*d.price;sample.sales[b.town][r]+=n;}}
 let ds=demands(w);reconcile(w,ds);
 const left={};for(const e of Object.values(w.edges))if(oldEdges.has(e.id)&&!e.removing&&e.readyAt<=w.tick){left[e.id]=capacity(w,e);sample.edges[e.id]={capacity:left[e.id],flows:{},blocked:0};}
 let moved=true;while(moved){moved=false;ds=demands(w);const candidates=[];
 for(const s of w.shipments)if(!s.edge&&s.key){const d=ds.find(d=>d.key===s.key);if(d&&s.next)candidates.push({d,s,edge:s.next,from:s.node});}
 for(const d of ds)if(d.active&&d.target-d.local-allocated(w,d.key)>0){const sources=Object.values(w.tiles).filter(t=>t.id!==d.tile&&available(w,t,d.r)>0).map(t=>({t,p:path(w,t.id,d.tile)})).filter(x=>x.p!==null&&x.p.length).sort((a,b)=>a.p.length-b.p.length||a.p.reduce((n,k)=>n+queueCost(w,w.edges[k]),0)-b.p.reduce((n,k)=>n+queueCost(w,w.edges[k]),0)||a.t.id.localeCompare(b.t.id));if(sources.length){const x=sources[0];candidates.push({d,edge:x.p[0],from:x.t.id});}}
 const valid=c=>{const e=w.edges[c.edge];if(!e||e.removing||!(left[c.edge]>0))return false;if(c.s)return w.shipments.includes(c.s)&&!c.s.edge;return available(w,w.tiles[c.from],c.d.r)>0&&c.d.target-w.tiles[c.d.tile].loose[c.d.r]-allocated(w,c.d.key)>0;};
 const sourceGroups=new Map();for(const c of candidates)if(!c.s&&valid(c)){const scope='source:'+c.from+':'+c.d.r;if(!sourceGroups.has(scope))sourceGroups.set(scope,[]);sourceGroups.get(scope).push(c);}
 const winners=new Set();for(const[scope,cs]of sourceGroups){const old=w.scheduler[scope],keys=cs.map(c=>c.d).sort((a,b)=>a.key.localeCompare(b.key));const d=choose(w,scope,keys,()=>true);if(old===undefined)delete w.scheduler[scope];else w.scheduler[scope]=old;winners.add(cs.find(c=>c.d.key===d.key));}
 const spend=c=>{const scope='source:'+c.from+':'+c.d.r,keys=sourceGroups.get(scope).map(x=>x.d).sort((a,b)=>a.key.localeCompare(b.key));choose(w,scope,keys,d=>d.key===c.d.key);w.tiles[c.from].loose[c.d.r]--;};
 for(const e of Object.values(w.edges).sort((a,b)=>a.id.localeCompare(b.id))){if(!(left[e.id]>0))continue;const cs=candidates.filter(c=>c.edge===e.id),keys=[...new Map(cs.map(c=>[c.d.key,c.d])).values()].sort((a,b)=>a.key.localeCompare(b.key));const eligible=c=>valid(c)&&(c.s||winners.has(c));const d=choose(w,'edge:'+e.id,keys,d=>cs.some(c=>c.d.key===d.key&&eligible(c)));if(!d)continue;const c=cs.filter(c=>c.d.key===d.key&&eligible(c)).sort((a,b)=>(a.s?.id||'~').localeCompare(b.s?.id||'~'))[0];let s=c.s;if(!s){spend(c);s={id:id(w),key:d.key,r:d.r,node:c.from,destination:d.tile};w.shipments.push(s);}s.edge=e.id;s.from=c.from;s.to=e.a===c.from?e.b:e.a;s.remaining=1;s.next=null;left[e.id]--;const fk=c.from+'>'+s.to+':'+d.r;sample.edges[e.id].flows[fk]=(sample.edges[e.id].flows[fk]||0)+1;moved=true;}
 }
 // Pressure: demand that still has a willing source but could not move this tick is blamed on
 // the saturated roads along its best route, weighted by what a piece is worth at the door.
 ds=demands(w);for(const d of ds){const short=d.target-d.local-allocated(w,d.key);if(short<=0)continue;const v=value(w,d);if(!v)continue;const sources=Object.values(w.tiles).filter(t=>t.id!==d.tile&&available(w,t,d.r)>0).map(t=>({t,p:path(w,t.id,d.tile)})).filter(x=>x.p!==null&&x.p.length).sort((a,b)=>a.p.length-b.p.length||a.t.id.localeCompare(b.t.id));if(!sources.length)continue;for(const k of sources[0].p)if(sample.edges[k]&&left[k]===0)sample.edges[k].blocked+=v*Math.min(short,d.rate);}
 w.stats.push(sample);while(w.stats.length&&w.stats[0].tick<=w.tick-WINDOW)w.stats.shift();
 for(const m of MILESTONES)if(!w.milestones[m.id]&&m.test(w)){w.milestones[m.id]=w.tick;w.money+=m.reward;w.earned+=m.reward;}
}
function totals(w){const sum=zero();for(const t of Object.values(w.tiles))add(sum,t.loose);for(const s of w.shipments)sum[s.r]++;return sum;}
function validate(w){const int=n=>Number.isSafeInteger(n)&&n>=0;
 if(w?.schemaVersion!==11||!w.tiles||Object.keys(w.tiles).length!==37||!Array.isArray(w.shipments)||!Array.isArray(w.stats)||!w.scheduler||!w.milestones||!w.research||!w.tech||!w.manual||!w.sold||!int(w.tick)||!int(w.serial)||!int(w.money)||!int(w.earned)||!int(w.spent)||!int(w.clicks))throw Error('存档格式不兼容');
 for(const k of Object.keys(TECH))if(!int(w.tech[k]))throw Error('科技无效');
 const qty=a=>{if(!a||!RES.every(r=>int(a[r])))throw Error('材料数量无效');},ids=new Set();const unique=n=>{if(typeof n!=='string'||!/^\d+$/.test(n)||+n>w.serial||ids.has(n))throw Error('对象 ID 无效');ids.add(n);};
 for(const[k,t]of Object.entries(w.tiles)){if(k!==t.id||k!==`${t.q},${t.r}`||Math.max(Math.abs(t.q),Math.abs(t.r),Math.abs(t.q+t.r))>3||t.terrain!==terrain(k))throw Error('地图无效');qty(t.loose);const b=t.building;if(!b)continue;unique(b.id);
  if(b.type==='town'){if(TOWNS[b.town]?.tile!==k||!int(b.level)||!int(b.paid))throw Error('城镇无效');qty(b.demand);const d=buys(w,b.town);for(const r of RES)if(b.demand[r]>(d[r]?.pool||0))throw Error('城镇需求无效');continue;}
  if(!PRICE[b.type]||!(FITS[b.type]).includes(t.terrain)||!Array.isArray(b.workers)||b.workers.length>MAX_WORKERS||!int(b.paid))throw Error('建筑无效');for(const m of b.workers){unique(m.id);if(!int(m.paid))throw Error('金额无效');}}
 for(const k of Object.keys(TOWNS)){if(w.tiles[TOWNS[k].tile].building?.type!=='town')throw Error('缺少城镇');qty(w.sold[k]);}
 for(const[k,e]of Object.entries(w.edges)){const a=w.tiles[e.a],b=w.tiles[e.b];if(!a||!b||!adjacent(a,b)||[a.terrain,b.terrain].includes('mountain')||k!==e.id||k!==edgeId(e.a,e.b)||![0,1].includes(e.level)||!int(e.readyAt)||!int(e.paid)||!int(e.upgradePaid))throw Error('道路引用无效');}
 for(const s of w.shipments){unique(s.id);if(!RES.includes(s.r)||!w.tiles[s.node]||!w.tiles[s.destination]||(s.edge&&(!w.edges[s.edge]||![w.edges[s.edge].a,w.edges[s.edge].b].includes(s.from)||![w.edges[s.edge].a,w.edges[s.edge].b].includes(s.to)||s.from===s.to||s.remaining!==1)))throw Error('货物引用无效');if(s.key!==null&&typeof s.key!=='string')throw Error('货物需求无效');}
 qty(w.manual.out);if(!w.manual.tiles||!Object.entries(w.manual.tiles).every(([k,n])=>w.tiles[k]&&int(n)))throw Error('手工产量无效');
 if(w.stats.length>WINDOW)throw Error('统计窗口无效');for(const s of w.stats){if(!int(s.tick)||s.tick>w.tick||!s.out||!RES.every(r=>int(s.out[r]))||!s.tiles||!s.edges||!int(s.income))throw Error('统计数据无效');}
 for(const k of Object.keys(w.research))if(!RESEARCH[k])throw Error('升级无效');
 qty(w.initial);qty(w.production);qty(w.consumption);const total=totals(w);for(const r of RES)if(total[r]!==w.initial[r]+w.production[r]-w.consumption[r])throw Error('资源账本不守恒');return true;}
function apply(w,c){const next=copy(w);command(next,c);validate(next);return next;}
function load(saved){const next=copy(saved);validate(next);return next;}
const api={RES,DT,TPS,WINDOW,YARD,POOL_TICKS,PRICE,WORKER,WORKER_GROWTH,MAX_WORKERS,TECH,TOWN_RATE,START_TILE,ROAD_BASE,BRIDGE,TOWNS,RESEARCH,MILESTONES,FITS,OUTPUT,TERRAIN_FACTOR,ROAD_CAP,copy,zero,add,newWorld,edgeId,adjacent,river,path,queueCost,connection,command,tick,totals,validate,apply,load,demands,allocated,buffer,available,buildingCost,workerCost,techCost,workerPower,clickPower,upgradeCost,edgeCost,segmentCost,townLevelCost,income,townAt,buys,recentSales,linkReason,terrainFactor,capacity,rate,value};if(typeof module!=='undefined')module.exports=api;root.TradeEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
