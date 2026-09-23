'use strict';
const E = TradeEngine;
const $ = id => document.getElementById(id);
const SAVE = 'tnt-mvp-v17';
const names = Object.assign({town:'城镇'}, E.GOODS, E.TERRAIN_NAME, Object.fromEntries(Object.entries(E.RECIPES).map(([k, r]) => [k, r.name])));
const colors = {forest:'var(--terrain-forest)',grass:'var(--terrain-grass)',rock:'var(--terrain-rock)',ore:'var(--terrain-ore)',mountain:'var(--terrain-mountain)',lake:'var(--terrain-lake)',town:'var(--terrain-town)',fog:'var(--terrain-fog)',
 log:'var(--goods-log)',stone:'var(--goods-stone)',board:'var(--goods-board)',tool:'var(--goods-tool)',ore_good:'var(--goods-ore)',iron:'var(--goods-iron)',charcoal:'var(--goods-charcoal)',paper:'var(--goods-paper)',book:'var(--goods-book)',machine:'var(--goods-machine)'};
const goodColor = r => r === 'ore' ? colors.ore_good : colors[r];
const iconIds = new Set(TradeIcons.catalog.map(item=>item.id));
const iconAliases = {check:'ui-checkmark',warn:'ui-exclamation',fog:'ui-question',tech:'ui-gear'};
const icon = (name, cls='') => {
 const id=iconAliases[name]||name;
 if(iconIds.has(id))return TradeIcons.icon(id,{base:'assets/icons/v1/',size:E.BUILDINGS.includes(id)||id==='town'?48:id.startsWith('ui-')?18:24,decorative:true});
 return `<svg class="icon ${cls}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
};
const glyph = (name, x, y, size, fill) => iconIds.has(name)?TradeIcons.svgIcon(name,{x,y,size}):`<use href="#icon-${name}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;
document.querySelector('.money-hud .icon').outerHTML=icon('coin');
for(const [buttonId,iconId] of [['import','ui-import'],['export','ui-export']]){
 const button=$(buttonId);button.innerHTML=icon(iconId)+button.textContent;
}
const fmt = n => Math.round(n).toLocaleString('zh-CN');
const per = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
const coins = E.formatMoney;
const signed = n => (n < 0 ? '−' : '+') + coins(Math.abs(n));
const position = MapGeometry.position;
let world = E.newWorld(Math.floor(Math.random() * 2 ** 31));
let selected = E.START_TILE, selectedEdge = null, selectedFlower = null, buildType = null, connectFrom = null;
let gesture = null, suppressClick = false, interacting = false, speed = 1;
let last = performance.now(), accumulator = 0, lastSave = 0, lastPaint = 0;
let storageBlocked = false, welcome = '', mapKey = '', hovered = null;
let industryMode='production',industrySelected='camp',industryScale=1,industryLayout=null;
try {
 const raw = localStorage.getItem(SAVE);
 if (raw) { world = E.load(JSON.parse(raw)); welcome = '已恢复进度'; }
 else if (['tnt-mvp-v16','tnt-mvp-v15','tnt-mvp-v14','tnt-mvp-v13','tnt-mvp-v12','tnt-mvp-v11','tnt-mvp-v10','tnt-mvp-v9','tnt-mvp-v8'].some(k => localStorage.getItem(k))) welcome = 'v0.15：里程碑换成了五条一直在跑的目标——产出、运量、卖出、收入、板块，达标即完成，下一级目标直接翻倍。旧存档已保留但不再读取。';
} catch {
 storageBlocked = true;
 welcome = '原存档无法读取，已保留；当前进度可通过导出保存';
}

function toast(message, hold = 3500) { MapNotice.show(message,'',hold); }
function save() {
 if (storageBlocked) return;
 try {
  E.validate(world);
  localStorage.setItem(SAVE, JSON.stringify(world));
  lastSave = world.tick;
  $('save-status').textContent = '已自动保存';
 } catch { $('save-status').textContent = '保存失败，请导出存档'; }
}
function act(command, message) {
 try {
  world = E.apply(world, command);
  save(); render();
  if (message) toast(message);
  return true;
 } catch (error) { toast(error.message); return false; }
}
const messages = {build:'已开始建造',worker:'已雇一名工人',fireWorker:'已辞退一名工人，全额退款',demolish:'已拆除，全额退款',resident:'已加一名居民',tech:'已开始研究，关闭产业面板后继续推进',removeRoad:'下一回合拆除，全额退款',restoreRoad:'已撤销拆除'};
function bindCommands(root) {
 for (const b of root.querySelectorAll('[data-command]')) b.onclick = () => {
  const c = JSON.parse(b.dataset.command);
  if (c.type === 'explore') return explore(c.flower);
  if (c.type === 'place') { const keep = selectedFlower; selectedFlower = null; if (!act(c, messages.place)) selectedFlower = keep; else focusFlower(c.flower); return; }
  act(c, messages[c.type] ?? '已更新');
  if($('industry-dialog').open){$('planner-notice').textContent='';($('tech-body').querySelector('button:not(:disabled)')||$('planner-graph').querySelector(`[data-industry="${industrySelected}"]`)).focus({preventScroll:true});}
 };
}
function canPlace(type, tile) { return !!tile && !tile.building && E.RECIPES[type].fits.includes(tile.terrain); }
const afford = cost => world.money >= cost;
// 可负担三态 · 见 docs/ui-system.html「状态 · 操作与选择」
const costly = cost => afford(cost) ? '' : 'costly';
const unlockedBuildings = () => E.BUILDINGS.filter(b => b === 'camp' || world.tech[b]);
const townTiles = () => Object.values(world.tiles).filter(t => t.building?.type === 'town');
const connectedTowns = () => townTiles().filter(u => Object.values(world.tiles).some(t => t.building && t.building.type !== 'town' && u.building.buys[E.RECIPES[t.building.type].out] && E.path(world, t.id, u.id))).map(t => t.id);
function cancelGesture() {
 gesture = null; buildType = null; connectFrom = null;
 $('drag-label').style.display = 'none'; $('preview').innerHTML = '';
 render();
}
function place(type, tile) {
 buildType = null;
 if (act({type:'build',tile,buildType:type}, `${names[type]}已开始建造`)) { selected = tile; selectedEdge = null; selectedFlower = null; }
 render();
}
function connect(from, to) {
 try{const route=E.connection(world,from,to);if(!route.segments.length){toast('这两座建筑已经连接');return;}if(!afford(route.cost)){toast(`金币不足 · 需要 ${coins(route.cost)}，还差 ${coins(route.cost-world.money)}`);return;}}catch(error){toast(error.message);return;}
 const town = [from,to].some(k => world.tiles[k]?.building?.type === 'town');
 if (act({type:'connect',from,to}, town ? '已连到城镇' : '道路已修好')) {
  selected = to; selectedEdge = null; selectedFlower = null; connectFrom = null;
  render();
 }
}
function explore(fid) {
 const known=new Set(Object.keys(world.tiles));
 if (act({type:'explore',flower:fid})) {
  const added=Object.values(world.tiles).filter(t=>!known.has(t.id));
  const resources=[...new Set(added.filter(t=>['forest','rock','ore'].includes(t.terrain)).map(t=>names[t.terrain]))];
  const towns=added.filter(t=>t.building?.type==='town');
  MapNotice.show(towns.length?'发现新城镇':resources.length?'发现新资源':'板块已揭开',[resources.length?'资源：'+resources.join('、'):'',towns.length?'城镇收购：'+[...new Set(towns.flatMap(t=>Object.keys(t.building.buys)))].map(r=>names[r]).join('、'):'','建设道路，接通产业网络'].filter(Boolean).join(' · '),6000); selectedFlower = fid; selected = null; selectedEdge = null; render(); focusFlower(fid); }
}
function tileClick(key) {
 if (suppressClick) { suppressClick = false; return; }
 if (buildType) return place(buildType, key);
 if (connectFrom) {
  if(roadOptions().get(key)?.cost!==undefined){selected=key;selectedEdge=null;selectedFlower=null;render();}
  else cancelGesture();
  return;
 }
 selected = key; selectedEdge = null; selectedFlower = null;
 if (E.workshop(world.tiles[key].building)) produce(key); else render();
}
// Only workshops perform manual production. Town selection never changes the economy.
function produce(key) {
 const t = world.tiles[key], b = t.building;
 if(!E.workshop(b))return;
 const r = E.RECIPES[b.type].out, before = t.loose[r];
 try {
  world = E.apply(world, {type:'click', tile:key});
  pop(key, world.tiles[key].loose[r] - before, r);
  render();
 } catch (error) {
  const now = performance.now();
  if (now - (produce.warned || 0) > 1000) { toast(error.message); produce.warned = now; }
  render();
 }
}
function pop(key, n, r) {
 if(n<=0)return;
 const layer=$('pops');if(!layer)return;
 const duration=Math.min(1500,E.DT/speed*900);
 const old=layer.querySelector('[data-production-tile="'+key+'"]');if(old){clearTimeout(old.timer);old.remove();}
 const [x,y]=position(world.tiles[key]),node=document.createElementNS('http://www.w3.org/2000/svg','g');
 node.dataset.productionTile=key;node.setAttribute('transform','translate('+x+','+y+')');node.style.setProperty('--production-duration',duration+'ms');
 node.innerHTML=BuildingTiles.productionPop(r,n);
 layer.appendChild(node);node.timer=setTimeout(()=>node.remove(),duration);
}

// Actual tick events only: do not replay history on render, resume, or save loading.
function showRoundProduction(sample) {
 for(const t of Object.values(world.tiles)){
  const b=t.building;if(!b)continue;
  const town=b.type==='town';
  const amount=town?Object.values(sample.revenue[t.id]||{}).reduce((sum,n)=>sum+n,0):(sample.tiles[t.id]||0)-(sample.manualTiles?.[t.id]||0);
  if(amount<=0)continue;
  pop(t.id,amount,town?'coin':E.RECIPES[b.type].out);
 }
}
function windowStats() {
 const S = world.stats;
 const empty = {span:0, rate:() => 0, flow:() => 0, goodFlow:() => 0, inflow:() => 0, outflow:() => 0, income:0, sales:() => 0};
 if (!S.length) return empty;
 const span = world.tick - S[0].tick + 1;
 const out = E.zero(), edges = {}, inflow = {}, outflow = {}, sales = {};
 let income = 0;
 for (const s of S) {
  E.add(out, s.out); income += s.income;
  for (const [k, v] of Object.entries(s.sales)) E.add(sales[k] || (sales[k] = E.zero()), v);
  for (const [k, v] of Object.entries(s.edges)) {
   const u = edges[k] || (edges[k] = {flow:0, goods:E.zero()});
   for (const [f, n] of Object.entries(v.flows)) {
    u.flow += n;
    const m = f.match(/^(.*)>(.*):(\w+)$/);
    u.goods[m[3]] += n;
    (inflow[m[2]] || (inflow[m[2]] = E.zero()))[m[3]] += n;
    (outflow[m[1]] || (outflow[m[1]] = E.zero()))[m[3]] += n;
   }
  }
 }
 return {
  span,
  rate: r => out[r] / span,
  flow: k => edges[k] ? edges[k].flow / span : 0,
  goodFlow: (k, r) => edges[k] ? edges[k].goods[r] / span : 0,
  inflow: (k, r) => (inflow[k]?.[r] || 0) / span,
  outflow: (k, r) => (outflow[k]?.[r] || 0) / span,
  income: income / span,
  sales: (k, r) => (sales[k]?.[r] || 0) / span,
 };
}
function tileRate(t) {
 const S = world.stats; if (!S.length) return 0;
 const span = world.tick - S[0].tick + 1;
 return S.reduce((n, s) => n + (s.tiles[t.id] || 0), 0) / span;
}
function crew(t) {
 const n = t.building.workers.length, producing = stateOf(t) === '生产中';
 const beat = Math.max(.25, E.DT / speed / E.workerPower(world, t.building.type));
 return {n, producing, blocked: n > 0 && !producing, beat};
}
function beatStyle(c, i, clock = performance.now() / 1000) {
 const phase = (clock + (i * c.beat) / c.n) % c.beat;
 return `--beat:${c.beat.toFixed(3)}s;animation-delay:${(-phase).toFixed(3)}s`;
}
const missingInputs = t => E.productionState(world,t).missing;
function stateOf(t) {
 if(!t.building.workers.length)return '待雇工';
 const state=E.productionState(world,t);
 return state.active?'生产中':'待连接'+state.missing.map(r=>names[r]).join('、')+'的运行中上游';
}
// The supply chain around one tile: who feeds it, who takes from it, and the road segments in between.
// Both the map highlight and the card's flow diagram read from this.
function chainOf(t, st = windowStats()) {
 const b = t.building, up = [], down = [], edges = new Set(), nodes = new Set([t.id]);
 const walk = (from, to) => { const p = E.path(world, from, to); if (!p) return null; for (const k of p) edges.add(k); return p.length; };
 const wants = b.type === 'town' ? Object.keys(b.buys) : Object.keys(E.RECIPES[b.type].in);
 for (const r of wants) for (const u of Object.values(world.tiles)) {
  if (!u.building || !E.workshop(u.building) || E.RECIPES[u.building.type].out !== r || u.id === t.id) continue;
  const hops = walk(u.id, t.id); if (hops === null) continue;
  nodes.add(u.id); up.push({tile:u, r, hops, rate:E.rate(world, u), made:tileRate(u), stock:u.loose[r], sent:st.outflow(u.id, r)});
 }
 if (b.type !== 'town') {
  const r = E.RECIPES[b.type].out;
  for (const u of Object.values(world.tiles)) {
   if (!u.building || u.id === t.id) continue;
   const takes = u.building.type === 'town' ? u.building.buys[r] : E.RECIPES[u.building.type].in[r];
   if (!takes) continue;
   const hops = walk(t.id, u.id); if (hops === null) continue;
   nodes.add(u.id);
   down.push(u.building.type === 'town' ? {tile:u, r, hops, town:true, price:u.building.buys[r], taken:st.sales(u.id, r)} : {tile:u, r, hops, town:false, taken:st.inflow(u.id, r), value:E.saleValue(world, u.id, E.RECIPES[u.building.type].out)});
  }
 }
 const goods = new Set([...wants, ...(b.type === 'town' ? [] : [E.RECIPES[b.type].out])]);
 return {up, down, edges, nodes, goods};
}
// The logistics chart in the details panel: source → input warehouse → workshop → product warehouse → buyers, one
// small card per stage, flows written on the links between them. See docs/ui-system.html「物流流程图」.
const ic = id => `<i class="ic">${TradeIcons.icon(id, {base:'assets/icons/v1/', size:14, decorative:true})}</i>`;
// Use recorded revenue so a price upgrade never rewrites earlier income.
function townRevenue(tile,r){const S=world.stats;if(!S.length)return 0;return S.reduce((n,s)=>n+(s.revenue?.[tile]?.[r]??((s.sales[tile]?.[r]||0)*(world.tiles[tile].building.buys[r]||0))),0)/(world.tick-S[0].tick+1);}
const svg = $('map');
const hexPoints = MapGeometry.points;
// Everything the map must show: placed tiles, fog flowers and the previewed one. The view box follows the map as it grows.
function flowerPoints(f) { return E.flowerTiles(f).map(p => position({q:p.q, r:p.r})); }
// The camera: `view` is the map point at the top-left corner plus a zoom scale (screen px per map unit).
const view = {x:0, y:0, scale:1};
const ZOOM = [0.45, 2.5];
// Map quantities and fog labels use 11 world units; match the panels' 14px body text.
// Keep this independent of viewport size and unexplored fog bounds.
const INITIAL_MAP_SCALE = 14 / 11;
function applyView() {
 const w = svg.clientWidth || 1, h = svg.clientHeight || 1;
 svg.setAttribute('viewBox', `${view.x} ${view.y} ${w / view.scale} ${h / view.scale}`);
}
function centerOn(x, y, scale = view.scale) {
 view.scale = Math.min(ZOOM[1], Math.max(ZOOM[0], scale));
 view.x = x - svg.clientWidth / 2 / view.scale; view.y = y - svg.clientHeight / 2 / view.scale;
 if(matchMedia('(max-width:740px)').matches){
  const mapRect=svg.getBoundingClientRect(),top=document.querySelector('.industry-launch').getBoundingClientRect().bottom;
  const bottom=document.querySelector('.mobile-stack-wrap').getBoundingClientRect().top;
  if(bottom>top)view.y=y-((top+bottom)/2-mapRect.top)/view.scale;
 }
 applyView();
}
function mapBounds() {
 let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
 const grow = ([x, y]) => { minX = Math.min(minX, x - 55); maxX = Math.max(maxX, x + 55); minY = Math.min(minY, y - 55); maxY = Math.max(maxY, y + 55); };
 for (const t of Object.values(world.tiles)) grow(position(t));
 for (const f of Object.values(world.flowers)) if (f.state !== 'placed') for (const p of flowerPoints(f)) grow(p);
 return {minX, minY, maxX, maxY};
}
let fitted = false;
function fitAll() {
 if (!svg.clientWidth || !svg.clientHeight) { fitted = false; return; }
 fitted = true;
 const b = mapBounds();
 centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, INITIAL_MAP_SCALE);
}
function focusFlower(fid) {
 const f = world.flowers[fid];
 if (!f) return;
 const [cx, cy] = flowerPoints(f)[0];
 centerOn(cx, cy + 40, Math.max(view.scale, 0.8));
}
function zoomAt(clientX, clientY, factor) {
 const r = svg.getBoundingClientRect(), cx = clientX - r.left, cy = clientY - r.top;
 const px = view.x + cx / view.scale, py = view.y + cy / view.scale;
 view.scale = Math.min(ZOOM[1], Math.max(ZOOM[0], view.scale * factor));
 view.x = px - cx / view.scale; view.y = py - cy / view.scale;
 applyView();
}
// A fog flower is drawn as one grey blob: seven gap-free hexes plus its outer boundary, so no inner outlines show.
const HEX_DIRS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
function flowerOutline(f) {
 const tiles = E.flowerTiles(f), keys = new Set(tiles.map(p => `${p.q},${p.r}`));
 let d = '';
 for (const p of tiles) {
  const [x, y] = position(p);
  for (let i = 0; i < 6; i++) {
   const [dq, dr] = HEX_DIRS[i];
   if (keys.has(`${p.q + dq},${p.r + dr}`)) continue;
   const a = MapGeometry.vertex(x,y,51,i), b = MapGeometry.vertex(x,y,51,i+1);
   d += `M${a.join(",")}L${b.join(",")}`;
  }
 }
 return d;
}
function buildMap() {
 const key = Object.values(world.flowers).map(f => f.id + f.state + f.rotation).join('|');
 if (key === mapKey) return;
 mapKey = key;
 svg.innerHTML = `<g id="fog"></g><g id="terrain">${Object.values(world.tiles).map(t => {
  const [x,y] = position(t);
  return `<g class="hex" data-tile="${t.id}" tabindex="0" role="button"><polygon class="ground" points="${hexPoints(x,y,51)}" fill="${colors[t.terrain]}" stroke="${colors[t.terrain]}"/></g>`;
 }).join('')}</g><g id="highlight" pointer-events="none"></g><g id="roads"></g><g id="preview" pointer-events="none"></g><g id="ambient" pointer-events="none">${Object.values(world.tiles).map(t=>{const [x,y]=position(t);return `<g data-tile-ambient="${t.id}" transform="translate(${x},${y})"></g>`;}).join('')}</g><g id="freight" pointer-events="none"></g><g id="tile-ui" pointer-events="none">${Object.values(world.tiles).map(t=>{const [x,y]=position(t);return `<g data-tile-ui="${t.id}" transform="translate(${x},${y})"><g class="tile-content"></g><g class="tile-crew"></g></g>`;}).join('')}</g><g id="pops" pointer-events="none"></g>`;
 $('fog').innerHTML = Object.values(world.flowers).filter(f => f.state === 'fog').map(f => {
  const pts = flowerPoints(f), [cx, cy] = pts[0];
  return `<g class="fog-flower" data-flower="${f.id}" tabindex="0" role="button">${pts.map(([x,y]) => `<polygon class="fog-hex" points="${hexPoints(x,y,51)}"/>`).join('')}<path class="fog-edge" d="${flowerOutline(f)}"/><g class="fog-cta" data-fog-unlock="${f.id}" tabindex="0" role="button"><rect class="fog-action-bg" x="${cx-29}" y="${cy-22}" width="58" height="42" rx="7"/><text x="${cx}" y="${cy - 4}" text-anchor="middle" class="fog-label">解锁</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" class="fog-price"></text></g></g>`;
 }).join('');
 for (const g of svg.querySelectorAll('[data-tile]')) {
  g.addEventListener('click', () => tileClick(g.dataset.tile));
  g.addEventListener('pointerenter', () => { hovered = g.dataset.tile; renderHighlight(); });
  g.addEventListener('pointerleave', () => { if (hovered === g.dataset.tile) { hovered = null; renderHighlight(); } });
  g.addEventListener('focus',renderHighlight);
  g.addEventListener('blur',renderHighlight);
  g.addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); suppressClick = false; tileClick(g.dataset.tile); } });
 }
 for (const g of svg.querySelectorAll('[data-flower]')) {
  const pick = () => { if (suppressClick) { suppressClick = false; return; } selectedFlower = g.dataset.flower; selected = null; selectedEdge = null; render(); };
  g.addEventListener('click', e => { if(connectFrom)return; if (e.target.closest('[data-fog-unlock]')) { e.stopPropagation(); if (afford(E.flowerCost(world))) explore(g.dataset.flower); } else pick(); });
  g.addEventListener('keydown', e => { if (!['Enter',' '].includes(e.key)||connectFrom) return; e.preventDefault(); e.stopPropagation(); if (e.target.closest('[data-fog-unlock]')) { if (afford(E.flowerCost(world))) explore(g.dataset.flower); } else pick(); });
 }
 applyView();
}
let roadOptionsKey='',roadOptionsCache=new Map();
function roadTradePair(a,b){
 const supplies=(producer,consumer)=>{const recipe=E.RECIPES[producer?.type];return !!recipe&&!!(consumer.type==='town'?consumer.buys[recipe.out]:E.RECIPES[consumer.type]?.in[recipe.out]);};
 return supplies(a,b)||supplies(b,a);
}
function roadOptions(){
 if(!connectFrom)return new Map();
 const key=JSON.stringify([connectFrom,Object.values(world.tiles).map(t=>[t.id,t.terrain,t.building?.id,t.building?.type,t.building?.buys]),Object.values(world.edges).map(e=>[e.id,e.road,e.removing]),world.tech]);
 if(key!==roadOptionsKey){
  roadOptionsKey=key;roadOptionsCache=new Map();
  for(const t of Object.values(world.tiles))if(t.building&&t.id!==connectFrom){
   if(!roadTradePair(world.tiles[connectFrom].building,t.building))continue;
   try{const route=E.connection(world,connectFrom,t.id);roadOptionsCache.set(t.id,route.segments.length?{cost:route.cost,route}:{reason:'已连接'});}
   catch(error){roadOptionsCache.set(t.id,{reason:error.message});}
  }
 }
 return roadOptionsCache;
}
// Outlines live in their own layer above the terrain, so a highlighted hex is never half-covered by its neighbours.
function renderHighlight() {
 const ring = (t, cls) => { const [x,y] = position(t); return `<polygon class="hl ${cls}" points="${hexPoints(x,y,49)}"/>`; };
 let html = '';
 if (buildType) for (const t of Object.values(world.tiles)) if (canPlace(buildType, t)) html += ring(t, 'legal');
 if (!connectFrom&&hovered && world.tiles[hovered]) html += ring(world.tiles[hovered], 'hover');
 if (selected && world.tiles[selected]) html += ring(world.tiles[selected], 'selected');
 $('highlight').innerHTML = html;
}
function tileAt(clientX, clientY) {
 const matrix = svg.getScreenCTM();
 if (!matrix) return null;
 const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
 let best = null, distance = Infinity;
 for (const t of Object.values(world.tiles)) {
  const [x,y] = position(t), d = Math.hypot(p.x-x,(p.y-y)/MapGeometry.depth);
  if (d < distance) { best=t; distance=d; }
 }
 if (!best) return null;
 const [x,y] = position(best), dx = Math.abs(p.x-x), dy = Math.abs(p.y-y);
 return MapGeometry.contains(dx,dy) ? best.id : null;
}
// What a tile's pills show. Buildings: last round's output, and every warehouse. Towns: what each good
// earns per round (30-round average, so all-or-nothing eating does not flicker) and each warehouse.
// Trace actual sales back through this round's recorded supply links.
function earningBuildings() {
 const last=world.stats.at(-1), earning=new Set();
 if(!last)return earning;
 for(const [id,goods] of Object.entries(last.revenue||{}))if(Object.values(goods).some(n=>n>0))earning.add(id);
 const flows=last.traffic||[];
 let changed=true;
 while(changed){changed=false;for(const flow of flows){
  if(earning.has(flow.destination)&&!earning.has(flow.node)){earning.add(flow.node);changed=true;}
 }}
 return earning;
}
function tileView(t, st, earning=earningBuildings()) {
 const b = t.building, last = world.stats.at(-1);
 if (b.type === 'town') {
  const d = E.buys(world, t.id);
  return {type:'town', name:'城镇', inactive:!earning.has(t.id), attention:!Object.values(last?.sales[t.id]||{}).some(n=>n>0),attentionLabel:'待连接供货产业',attentionSeed:t.id, undeveloped:!Object.values(world.sold[t.id]||{}).some(n=>n>0), offers:Object.entries(d).map(([id, x]) => ({id, price:x.price, used:last?.sales[t.id]?.[id] || 0, income:Math.round(townRevenue(t.id,id))})),
   store:[]};
 }
 const rc = E.RECIPES[b.type], n = last?.tiles[t.id] || 0, ins = Object.keys(rc.in), active = E.productionState(world,t).active;
 return {type:b.type, name:names[b.type], inactive:!b.construction&&(!active||!earning.has(t.id)),status:!active?stateOf(t):!earning.has(t.id)?'尚未产生金钱收益':'生产中', attentionLabel:!active?stateOf(t):'待连接收购市场',attentionSeed:t.id,attention:!b.construction&&(!active||!townTiles().some(u=>u.building.buys[rc.out]&&E.path(world,t.id,u.id))), made:[{id:rc.out, n}], used:[],
  starved:[], store:[]};
}
let hoveredRoad=null;
let decorativeRoads=null,decorativeTraffic=null,travelClock=0,travelLast=performance.now();
const reducedTravelMotion=matchMedia('(prefers-reduced-motion: reduce)');
function renderMap() {
 buildMap();
 const options=roadOptions();
 const st = windowStats(), earning = earningBuildings();
 const resourceHints=new Set();
 for(const terrain of ['forest','rock','ore']){
  const candidates=Object.values(world.tiles).filter(t=>!t.building&&t.terrain===terrain&&unlockedBuildings().some(type=>canPlace(type,t)&&afford(E.buildingCost(world,type))));
  const origin=position(world.tiles[E.START_TILE]);
  candidates.sort((a,b)=>{const pa=position(a),pb=position(b);return Math.hypot(pa[0]-origin[0],pa[1]-origin[1])-Math.hypot(pb[0]-origin[0],pb[1]-origin[1]);});
  if(candidates.length)resourceHints.add(candidates[0].id);
 }
 const roadLayout=RoadTiles.layout(world.tiles,Object.values(world.edges),position);
 const hoveredRoads=new Set(hoveredRoad?E.roadComponent(world,hoveredRoad).map(e=>e.id):[]);
 const selectedRoads=new Set(selectedEdge?E.roadComponent(world,selectedEdge).map(e=>e.id):[]);
 for (const g of svg.querySelectorAll('[data-flower]')) {
  g.classList.toggle('selected', g.dataset.flower === selectedFlower);
  const cost = E.flowerCost(world), ok = afford(cost);
  g.classList.toggle('affordable', ok);
  g.querySelector('.fog-price').textContent = coins(cost);
  g.setAttribute('aria-label', `迷雾板块，选择后可解锁，费用 ${coins(cost)}`);
  const action=g.querySelector('[data-fog-unlock]');
  if (g.dataset.flower === selectedFlower && ok) action.setAttribute('tabindex','0'); else action.removeAttribute('tabindex');
  action.setAttribute('aria-disabled', ok?'false':'true');
  action.setAttribute('aria-label', ok?`解锁迷雾板块，费用 ${coins(cost)}`:`解锁迷雾板块，费用 ${coins(cost)}，金币不足`);
 }
 renderHighlight();
 const focus=connectFrom?{nodes:new Set([connectFrom,...[...options].filter(([,o])=>o.cost!==undefined).map(([id])=>id)]),edges:new Set()}:world.tiles[selected]?.building&&!buildType?chainOf(world.tiles[selected],st):null;
 svg.classList.toggle('chain',!!focus);
 svg.classList.toggle('road-picking',!!connectFrom);
 for (const g of svg.querySelectorAll('[data-tile]')) {
  const t=world.tiles[g.dataset.tile], b=t.building;
  g.classList.toggle('selected', t.id===selected);
  g.classList.toggle('chain-node', !!focus&&focus.nodes.has(t.id));
  g.classList.toggle('has-building', !!b);
  g.classList.toggle('legal', !!buildType && canPlace(buildType,t));
  g.classList.toggle('invalid', !!buildType && !canPlace(buildType,t));
  g.setAttribute('aria-label', `${names[b?.type || t.terrain]} (${t.id})`);
  let content='',ambient='';
  if (b) {
   // Production and stock pills, expanded into the full two rows while the tile is selected. See docs/ui-system.html「地图反馈」.
   content=BuildingTiles.render({...tileView(t,st,earning),pills:true,expanded:false});
   if(b.construction)content+=BuildingTiles.constructionMeter(E.buildingProgress(world,t));
 g.setAttribute('aria-label',names[b.type]+' ('+t.id+')'+(b.construction?'，建造中':''));
   if(connectFrom){const option=options.get(t.id);g.setAttribute('aria-label',`${names[b.type]} (${t.id})，${t.id===connectFrom?'修路起点':option?.cost!==undefined?`${afford(option.cost)?'可连接':'金币不足'}，${coins(option.cost)}`:option?.reason||'不可连接'}`);}
  } else if (t.terrain!=='grass'||!roadLayout.ports.has(t.id)) {
   // Resource land and mountains keep their scenery whatever runs across them. Empty grass and open water keep
   // theirs only until a road (or a waterway) arrives: from then on the road is the one thing drawn on that tile.
   ambient=AmbientTiles.render({terrain:t.terrain,id:t.id,attention:resourceHints.has(t.id)});
  }
  const scenery=svg.querySelector(`[data-tile-ambient="${t.id}"]`);
  if(scenery._markup!==ambient){scenery.innerHTML=ambient;scenery._markup=ambient;}
  scenery.classList.toggle('chain-dim',!!focus&&!focus.nodes.has(t.id));
  const ui=svg.querySelector(`[data-tile-ui="${t.id}"]`);
  ui.classList.toggle('chain-dim',!!focus&&!focus.nodes.has(t.id));
  const tileContent=ui.querySelector('.tile-content');if(tileContent._markup!==content){const phase=tileContent.querySelector('.needs-attention')?.getAnimations()[0]?.currentTime;tileContent.innerHTML=content;tileContent._markup=content;const motion=tileContent.querySelector('.needs-attention')?.getAnimations()[0];if(motion&&phase!=null)motion.currentTime=phase;}
  const holder=ui.querySelector('.tile-crew');
  const c=b?.type==='town'?{n:b.residents,blocked:!Object.values(world.stats.at(-1)?.sales[t.id]||{}).some(n=>n>0),beat:Math.max(.25,E.DT/speed)}:b?crew(t):null;
  const key=c?`${b.type}|${c.n}|${c.blocked}|${c.beat}|${world.paused}`:'';
  if(holder.dataset.key!==key){
   holder.dataset.key=key;
   holder.classList.toggle('blocked',!!c&&c.blocked);
   holder.classList.toggle('halted',!!c&&world.paused);
   holder.innerHTML=c?BuildingTiles.people({kind:b.type==='town'?'resident':'worker',count:c.n,seed:t.id,active:!c.blocked,paused:world.paused,beat:c.beat,clock:performance.now()/1000}):'';
  }
 }
 if(selected&&world.tiles[selected]?.building){const ui=svg.querySelector(`[data-tile-ui="${selected}"]`);if(ui&&ui.nextSibling)ui.parentNode.appendChild(ui);}
 $('roads').innerHTML=roadLayout.junctions.map(d=>`<path class="road-junction" d="${d}"/>`).join('')+[...roadLayout.roads.values()].map(e => {
  const on=focus&&focus.edges.has(e.id);
  return `<g class="road-control ${on?'chain':''}"><path d="${e.d}" class="road ${e.removing?'removing':''} ${selectedRoads.has(e.id)?'selected':''} ${hoveredRoads.has(e.id)?'hovered':''} ${e.water?'water':''} ${on?'chain':''}"/><path d="${e.hit}" class="road-hit" data-edge="${e.id}" tabindex="0" role="button" aria-label="${e.water?'航道':'道路'}${e.removing?'，拆除中':''}" aria-pressed="${selectedRoads.has(e.id)}" fill="none" stroke="transparent" stroke-width="7" pointer-events="stroke"/></g>`;
 }).join('');
 decorativeRoads=roadLayout;
 decorativeTraffic=RoadTiles.traffic(roadLayout,world.stats.at(-1)?.traffic||[],travelClock,decorativeTraffic,(from,to)=>E.path(world,from,to));
 $('freight').innerHTML=RoadTiles.travelers(decorativeTraffic,travelClock,{reduced:reducedTravelMotion.matches});
 renderRoadPrices(options);
}
function renderRoadPrices(options){
 let layer=$('road-prices');if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='road-prices';svg.appendChild(layer);}
 const targets=connectFrom?[...options].filter(([,o])=>o.cost!==undefined):[],keep=new Set(targets.map(([id])=>id));
 const occupied=connectFrom?[connectFrom,...keep].map(id=>{const [x,y]=position(world.tiles[id]);return {x:x-29,y:y-41,w:58,h:59};}):[];
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 let previews='';
 for(const child of [...layer.children])if(!keep.has(child.dataset.roadPrice))child.remove();
 for(const [id,option] of targets){
  let node=[...layer.children].find(el=>el.dataset.roadPrice===id);
  if(!node){
   node=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');node.dataset.roadPrice=id;node.classList.add('road-price');node.setAttribute('width','88');node.setAttribute('height','44');
   const wrap=document.createElement('div'),button=document.createElement('button');button.type='button';button.className='action-button road-price-button';button.dataset.action='build';
   button.innerHTML=icon('coin')+'<span class="road-price-value"></span>';wrap.appendChild(button);node.appendChild(wrap);layer.appendChild(node);
   button.onclick=event=>{event.stopPropagation();if(connectFrom&&!suppressClick)connect(connectFrom,id);};
   node.addEventListener('pointerdown',event=>event.stopPropagation());
   node.addEventListener('click',event=>event.stopPropagation());
  }
  const road=E.edgeId(connectFrom,id),edges=option.route.segments.map(e=>({...e,road,id:E.edgeId(e.a,e.b)+'#preview'}));
  const layout=RoadTiles.layout(world.tiles,[...Object.values(world.edges),...edges],position),parts=edges.map(e=>layout.roads.get(e.id));
  previews+=`<g data-road-preview="${id}">${parts.map(e=>`<path class="preview road-option" d="${e.d}"/>`).join('')}</g>`;
  const anchors=parts.flatMap(e=>[.5,.25,.75].map(t=>e.at(t))).sort((a,b)=>Math.hypot(...a.map((v,i)=>v-parts[Math.floor(parts.length/2)].at(.5)[i]))-Math.hypot(...b.map((v,i)=>v-parts[Math.floor(parts.length/2)].at(.5)[i])));
  const places=[0,42,84,126,168].flatMap(lift=>anchors.map(([x,y])=>({x:x-44,y:y-45-lift,w:88,h:40,anchor:[x,y]})));
  const place=places.find(p=>!occupied.some(b=>overlaps(p,b)))||places.at(-1);occupied.push(place);
  previews+=`<path class="road-price-leader" d="M${place.x+44} ${place.y+34}L${place.anchor.join(' ')}"/>`;
  node.setAttribute('x',place.x);node.setAttribute('y',place.y);
  const button=node.querySelector('button'),label=`连接${names[world.tiles[id].building.type]} · ${coins(option.cost)}`;
  button.querySelector('.road-price-value').textContent=coins(option.cost);button.disabled=!afford(option.cost);
  button.title=label+(button.disabled?` · 还差 ${coins(option.cost-world.money)}`:'');button.setAttribute('aria-label',button.title);
 }
 $('preview').innerHTML=previews;
}
function purchaseLabel(title, cost, description='') {
 return `<span class="action-copy"><strong class="action-title">${title}</strong>${description?`<small class="action-description">${description}</small>`:''}</span><span class="action-cost">${coins(cost)}</span>`;
}
function buildingEffect(type) {
 const recipe=E.RECIPES[type],inputs=Object.keys(recipe.in);
 return inputs.length?`${inputs.map(r=>names[r]).join(' + ')} → ${names[recipe.out]}`:`生产${names[recipe.out]}`;
}
function button(label, command, primary=false, disabled=false, cls='') {
 if(command.type==='build')return IndustryButtons.build(E,world,command.buildType,{attributes:"data-command='"+JSON.stringify(command)+"'"});
 if(command.type==='tech')return IndustryButtons.tech(E,world,command.key,{attributes:"data-command='"+JSON.stringify(command)+"'"});
 if(command.type==='tech'&&!E.TECH[command.key].repeat)cls+=' unlock';
 return `<button data-command='${JSON.stringify(command)}' class="${primary?'primary':''} ${label.includes('action-cost')?'purchase-action':''} ${cls}" ${disabled?'disabled':''}>${label}</button>`;
}
function ledgerTable(headers, rows, footer='') {
 return `<table class="detail-table"><thead><tr>${headers.map(h=>'<th scope="col">'+h+'</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody>${footer}</table>`;
}
function goodCell(r) {return `<th scope="row"><span class="ledger-good">${ic(r)}<span>${names[r]}</span></span></th>`;}
const detailIcon=(id,size=20)=>TradeIcons.icon(id,{base:'assets/icons/v1/',size,decorative:true});
function workshopSupply(t) {
 return IndustryGraph.detail(E,world,t.building.type,'assets/icons/v1/',false,{tile:t});
}
function decorateDetailButtons(box){
 for(const btn of box.querySelectorAll('button')){
  if(btn.hasAttribute('data-planner-focus')||btn.classList.contains('industry-button'))continue;
  const c=btn.dataset.command?JSON.parse(btn.dataset.command):{};
  const kind=c.type==='tech'?(E.TECH[c.key].repeat?'upgrade':'unlock'):['demolish','fireWorker','removeRoad'].includes(c.type)?'remove':c.type==='resident'?'upgrade':c.type==='build'||c.type==='worker'||btn.dataset.build?'build':'neutral';
  const icon=btn.id==='connect-accessible'||c.type==='restoreRoad'?'rail':c.type==='worker'?'worker':undefined;
  const reason=c.type==='tech'&&E.techProgress(world,c.key)?'研究中 · 完成后生效':c.type==='tech'&&!E.techAvailable(world,c.key)?E.techDiscoveryReason(world,c.key)||'前置未满足':undefined;
  ActionButtons.enhance(btn,{kind,icon,reason});
 }
}
function refundLabel(title,amount){
 return `<span class="action-copy"><strong class="action-title">${title}</strong></span><span class="action-cost"><small class="action-refund">退回</small>${coins(amount)}</span>`;
}
function townPanel(t) {
 const b=t.building,next=E.residentCost(world,t.id),goods=Object.entries(E.buys(world,t.id));
 const rows=goods.map(([r,d])=>`<tr>${goodCell(r)}<td>${coins(d.price)}</td><td>${coins(townRevenue(t.id,r))}</td></tr>`);
 return `<h2>城镇 ${BuildingTiles.formatLevel(E.eraPower(world))}</h2><div class="workshop-status"><span>当前城镇</span><span class="state-badge">不限量收购</span></div><div class="workshop-metrics"><div><span class="metric-label">实际收入 / 回合</span><strong>${coins(goods.reduce((n,[r])=>n+townRevenue(t.id,r),0))}</strong></div><div class="crew-metric"><span class="metric-label">居民</span><strong>${b.residents}<small>/ ${E.MAX_RESIDENTS}</small></strong></div></div><div class="actions detail-actions">${b.residents<E.MAX_RESIDENTS?button(purchaseLabel('增加居民',next,'本城镇基础售价 +25%'),{type:'resident',tile:t.id},true,!afford(next),costly(next)):''}<button id="connect-accessible">从这里修路</button></div>`+disclosure('market','收购明细',`<p class="detail-caption">售价加成 ${(b.residents-1+world.tech.era)*25}%</p>${ledgerTable(['货物','单价 / 件','实际收入 / 回合'],rows)}`);
}
function flowerPanel(f) {
 if (f.state === 'fog') {
  const cost=E.flowerCost(world);
  return `<div class="empty-state"><h2>${icon('fog','quarry-c')}迷雾板块</h2><p>${coins(cost)}${afford(cost)?'':' · 金币不足'}</p></div>`;
 }
}
function detailTechAction(key,label){
 if(E.techMaxed(world,key))return '';
 if(E.techDiscoveryReason(world,key))return `<p class="tip">${E.techDiscoveryReason(world,key)}</p>`;
 const cost=E.techCost(world,key),missing=E.TECH[key].requires.filter(r=>!world.tech[r]);
 if(missing.length)return `<p class="tip">${E.TECH[key].name}需要先解锁${missing.map(r=>E.TECH[r].name).join('、')}</p>`;
 const description=E.TECH[key].building?'':key==='era'?'':E.BUILDINGS.includes(key)?buildingEffect(key):E.TECH[key].desc;
 return button(purchaseLabel(label,cost,description),{type:'tech',key},true,!afford(cost),`${E.TECH[key].repeat?'upgrade ':''}${costly(cost)}`);
}
function disclosure(key,title,content){return `<details class="detail-disclosure" data-key="${key}"><summary>${title}</summary><div class="detail-disclosure-body">${content}</div></details>`;}
function detailResearch(keys){
 const ready=keys.filter(k=>!world.tech[k]&&E.techAvailable(world,k));
 return ready.length?disclosure("research","关联研究",`<div class="actions">${ready.map(k=>detailTechAction(k,`研究${E.TECH[k].name}`)).join('')}</div>`):'';
}
// Patch unchanged elements in place so live updates do not restart hover transitions.
function syncContent(target,source){
 const key=n=>n.nodeType===1?(n.id||n.getAttribute('data-command')||n.getAttribute('data-key')||''):'';
 for(let i=0;i<source.childNodes.length;i++){
  const next=source.childNodes[i],current=target.childNodes[i];
  if(!current){target.append(next.cloneNode(true));continue;}
  if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName||key(current)!==key(next)){
   current.replaceWith(next.cloneNode(true));continue;
  }
  if(next.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;continue;}
  for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name)&&!(current.tagName==='DETAILS'&&attr.name==='open'))current.removeAttribute(attr.name);
  for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
  syncContent(current,next);
 }
 while(target.childNodes.length>source.childNodes.length)target.lastChild.remove();
}
function renderSelection() {
 const box=$('selection');
 const active=document.activeElement?.dataset.command;
 const activeId=box.contains(document.activeElement)?document.activeElement.id:null;
 const selectionKey=selectedEdge||selectedFlower||selected||'';
 const changedSelection=box.dataset.selectionKey!==selectionKey;
 const wasOpen=new Map(!changedSelection?[...box.querySelectorAll('details')].map(d=>[d.dataset.key,d.open]):[]);
 box.dataset.selectionKey=selectionKey;
 let html='';
 const t=world.tiles[selected],f=world.flowers[selectedFlower],st=windowStats();
 if(connectFrom&&t?.building){
  const b=t.building;
  html=`<h2>${names[b.type]}</h2>`+(b.type==='town'
   ?`<p class="detail-caption">不限量收购</p>${ledgerTable(['货物','单价 / 件'],Object.entries(E.buys(world,t.id)).map(([r,d])=>`<tr>${goodCell(r)}<td>${coins(d.price)}</td></tr>`))}`
   :workshopSupply(t,st)+`<p class="detail-caption">${buildingEffect(b.type)}</p>`);
 } else if (selectedEdge && world.edges[selectedEdge]) {
  const e=world.edges[selectedEdge];
  const group=E.roadComponent(world,e.id),paid=group.reduce((sum,part)=>sum+part.paid,0);
  const endpoints=E.roadEndpoints(group).map(id=>names[world.tiles[id]?.building?.type]||'路口').join(' ↔ ');
  html=`<h2>道路</h2><p class="detail-caption">${endpoints} · 仅管理这条连接</p>${e.removing?'<p class="detail-caption">拆除中 · 下一回合退款</p>':''}<div class="actions">${button(e.removing?'撤销拆除':refundLabel('拆除整条路',paid),{type:e.removing?'restoreRoad':'removeRoad',edge:e.id},false,false,e.removing?'':'danger')}</div>`+detailResearch(['roadEngineering','navigation','mountainPass']);
 } else if (f && f.state !== 'placed') html=flowerPanel(f);
 else if (t?.building?.type==='town') {
  html=townPanel(t)+disclosure('era','时代科技',IndustryGraph.detail(E,world,'era')+`<div class="actions">${detailTechAction('era',`进入${E.ERAS[world.tech.era+1]||E.ERAS[world.tech.era]}`)}</div>`);
 } else if (t?.building?.construction) {
 const p=E.buildingProgress(world,t);html='<h2>'+names[t.building.type]+'</h2>'+IndustryButtons.build(E,world,t.building.type,{progress:p})+'<p>完工后可雇工生产。</p>'+button(refundLabel('取消建造',t.building.paid),{type:'demolish',tile:t.id},false,false,'danger');
 } else if (t?.building) {
  const b=t.building,next=E.workerCost(world,t),rc=E.RECIPES[b.type],r=rc.out,n=b.workers.length;
  const paid=b.paid+b.workers.reduce((n,m)=>n+m.paid,0);
  const recipe=Object.keys(rc.in).length?`${Object.keys(rc.in).map(i=>names[i]).join(' + ')} → ${names[r]}`:`生产${names[r]}`;
  const craft=E.craftOf(b.type),upgrade=detailTechAction(craft,`升级工艺 · ${IndustryGraph.roman(world.tech[craft]+2)}`);
  html=`<h2>${names[b.type]} ${BuildingTiles.formatLevel(E.workerPower(world,b.type))}</h2>`+workshopSupply(t,st)
   +`<div class="actions detail-actions">${n<E.MAX_WORKERS?button(purchaseLabel('雇用工人',next,`每回合多产 ${E.rate(world,t,n+1)-E.rate(world,t)} 件`),{type:'worker',tile:t.id},true,!afford(next),costly(next)):upgrade}<button id="produce"><span class="action-copy"><strong class="action-title">手工生产</strong><small class="action-description">+${E.clickPower(world,t)} 件${names[r]}</small></span></button></div>`
   +'<div class="actions"><button id="connect-accessible">从这里修路</button></div>'
   +disclosure('recipe','生产配方',IndustryGraph.detail(E,world,b.type,'assets/icons/v1/',false,{tile:t,section:'recipe'}))
   +disclosure('craft','工艺升级',IndustryGraph.detail(E,world,b.type,'assets/icons/v1/',false,{section:'upgrade'})+(n<E.MAX_WORKERS?`<div class="actions">${upgrade}</div>`:''))
   +(E.productionBonuses(world,t).length?disclosure('bonuses','生产加成',IndustryGraph.detail(E,world,b.type,'assets/icons/v1/',false,{tile:t,section:'bonuses'})):'');
  html+=disclosure('manage','管理建筑',`<div class="actions">${n?button(refundLabel('辞退一名工人',b.workers[n-1].paid),{type:'fireWorker',tile:t.id}):''}${button(refundLabel('拆除建筑',paid),{type:'demolish',tile:t.id},false,false,'danger')}</div>`);
  html+=detailResearch(b.type==='mine'?['deepMining']:E.processing(t)?['waterPower','specialization']:[]);
 } else if (t) {
  const fits=unlockedBuildings().filter(b=>E.RECIPES[b].fits.includes(t.terrain));
  const locked=E.BUILDINGS.filter(b=>!world.tech[b]&&b!=='camp'&&E.techAvailable(world,b)&&E.RECIPES[b].fits.includes(t.terrain));
  html=`<div class="empty-state"><h2>${names[t.terrain]}</h2></div>`;
  if(!fits.length&&!locked.length&&t.terrain==='mountain')html+=`<div class="terrain-association"><b>${world.tech.mountainPass?'山地工程已开放':'需要山地工程科技'}</b><span>${world.tech.mountainPass?'可修路':'研究后可修路'}，不可建造 · 地形系数 ×4</span></div>`;
  else if(t.terrain==='lake')html+=`<div class="terrain-association">${icon('waterway')}<b>${world.tech.waterway?'航道已开放':'需要航道科技'}</b><span>可通行，不可建造</span></div>`;
  if(fits.length)html+=`<div class="actions">${fits.map(b=>button(purchaseLabel(`建造${names[b]}`,E.buildingCost(world,b),buildingEffect(b)),{type:'build',tile:t.id,buildType:b},true,!afford(E.buildingCost(world,b)),costly(E.buildingCost(world,b)))).join('')}</div>`;
  if(locked.length)html+=`<section class="detail-tech"><h3>可解锁科技</h3><div class="actions">${locked.map(b=>detailTechAction(b,`解锁${names[b]}`)).join('')}</div></section>`;
  if(t.terrain==='lake'){
   if(!world.tech.waterway)html+=`<section class="detail-tech"><h3>可解锁科技</h3><div class="actions">${detailTechAction('waterway','解锁航道')}</div></section>`;
   html+=detailResearch(['navigation','waterPower']);
  }
  if(t.terrain==='mountain')html+=detailResearch(['mountainPass']);
 }
 $('selection-panel').hidden=!html;
 const draft=document.createElement('div');draft.innerHTML=html;
 const heading=draft.querySelector('h2');
 $('selection-panel').querySelector('.panel-title').textContent=heading?.textContent||'详情';
 const panelTitle=$('selection-panel').querySelector('.panel-title');
 if(t?.building)panelTitle.insertAdjacentHTML('afterbegin',detailIcon(t.building.type,26));
 heading?.remove();decorateDetailButtons(draft);
 if(changedSelection)box.replaceChildren(...draft.childNodes);else syncContent(box,draft);
 if(changedSelection){box.scrollTop=0;const stack=document.querySelector('.mobile-stack-wrap');if(stack&&window.matchMedia('(max-width:740px)').matches)stack.scrollTop=0;}
 for(const d of box.querySelectorAll('details'))if(wasOpen.has(d.dataset.key))d.open=wasOpen.get(d.dataset.key);
 bindCommands(box);

 if($('connect-accessible'))$('connect-accessible').onclick=()=>{connectFrom=t.id;buildType=null;render();toast($('build-intent').textContent+' · Esc 取消');};
 if($('produce'))$('produce').onclick=()=>produce(t.id);
 if(active)[...box.querySelectorAll('[data-command]')].find(b=>b.dataset.command===active)?.focus({preventScroll:true});
 else if(activeId)box.querySelector('#'+activeId)?.focus({preventScroll:true});
}
// Goals live here and nowhere else: five tracks, always on screen, nothing to pin and nothing to claim. A row is
// four things and no prose -- what to reach, what it pays, how far along, and a bar. The bar measures the CURRENT
// tier's span, not cur / target: targets double, so cur / target would sit at 50% the instant a tier cleared and
// the bar would look stuck at half.
const goalFlash = {};
const goalNum = n => n >= 100 ? fmt(n) : per(n);
function renderGoals() {
 const now=performance.now(), reward=E.goalReward(world);
 const fog=Object.values(world.flowers).filter(f=>f.state==='fog').sort((a,b)=>E.flowerDistance(a)-E.flowerDistance(b)||a.id.localeCompare(b.id))[0];
 const price=fog?E.flowerCost(world,fog):0;
 const missing=townTiles().flatMap(t=>Object.keys(t.building.buys)).find(r=>!Object.values(world.tiles).some(t=>E.workshop(t.building)&&E.RECIPES[t.building.type].out===r));
 const plan=!!missing||!fog;
 const step=missing?`新城镇想收购${names[missing]} · 查看科技与建造`:fog?(afford(price)?`探索一块新地图 · ${coins(price)}`:`探索还差 ${coins(price-world.money)} · 可点击伐木营手工生产`):'打开产业规划，尝试新的科技和产线';
 const draft=document.createElement('div');
 draft.innerHTML=`<div class="next-step"><span><b>下一步</b> ${step}</span><button id="next-step-action">${plan?'产业规划':'查看迷雾'}</button></div><ul class="goals">${E.GOALS.map(g=>{
  const p=E.goalProgress(world,g), done=goalFlash[g.id]>now;
  const number=g.id==='income'?coins:goalNum;
  const num=done?`达成 ${number(p.floor)}`:`${number(Math.min(p.cur,p.target))} / ${number(p.target)}`;
  return `<li class="goal ${done?'done':''}"><svg class="icon" aria-hidden="true"><use href="#icon-${done?'check':g.icon}"/></svg>`
   +`<span class="glbl">${g.label}</span>`
   +`<span class="gval"><b class="gnum">${num}</b>${g.id==='income'?'':`<span class="gunit">${g.unit}</span>`}</span>`
   +`<span class="gpay">+${coins(reward)}</span>`
   +`<span class="progress"><span style="width:${(done?1:p.ratio)*100}%"></span></span></li>`;
 }).join('')}</ul>`;
 syncContent($('goals-body'),draft);
 $('next-step-action').onclick=()=>{if(plan)openIndustry();else{focusFlower(fog.id);selectedFlower=fog.id;selected=null;selectedEdge=null;renderSelection();}};
}
// Goal results share the transient feedback queue with discoveries and actions.
function announceGoals(cleared) {
 const lines=[];
 for(const[id,d]of Object.entries(cleared)){
  const g=E.GOALS.find(g=>g.id===id),tier=world.goals[id];
  goalFlash[id]=performance.now()+1600;
  const target=n=>g.id==='income'?coins(E.goalTarget(g,n)):fmt(E.goalTarget(g,n))+' '+g.unit;
  lines.push(g.label+' '+target(tier-1)+' · +'+coins(d.reward)+' · 下一级 '+target(tier));
 }
 if(lines.length)MapNotice.show('目标达成'+(lines.length>1?' ×'+lines.length:''),lines.join('\n'),6000);
}
// The tech tree: one dialog, tiers top to bottom; buyable nodes are live, owned ones ticked, locked ones grey with their missing prerequisites.
// The tech tree is one card per building, plus the era and the waterway. A card
// starts as an unlock; once owned, the same button becomes the craft upgrade for that type.
function techCards() {
 const cards = [{id:'era', name:'时代', icon:'town', tier:1, kind:'economy', desc:'每级提高全图城镇基础售价 25%，与居民加成相加', craft:'era', per:n=>`全图基础售价 +${(n-1)*25}%`, title:n=>E.ERAS[n], next:n=>`进入${E.ERAS[n]}`}];
 for (const b of E.BUILDINGS) {
  const t = E.TECH[b], rc = E.RECIPES[b];
  const ins = Object.keys(rc.in).map(r => names[r]).join(' + ');
  cards.push({id:b, name:names[b], icon:b, tier:t ? t.tier : 1, kind:'building', unlock:t ? b : null, craft:E.craftOf(b),
   desc:t ? t.desc : `在${names[rc.fits[0]]}建，产${names[rc.out]}`, per:n=>`每名工人 <b>${n}</b> 件${names[rc.out]} / 回合 · 手工 <b>${n}</b> 件`});
 }
 cards.push({id:'waterway', name:E.TECH.waterway.name, icon:'waterway', tier:E.TECH.waterway.tier, kind:'waterway', unlock:'waterway', desc:E.TECH.waterway.desc});
 for(const [id,t] of Object.entries(E.RESEARCH))cards.push({...t,id,unlock:id,research:true});
 return cards.filter(c=>E.TECH[c.craft||c.unlock]);
}
function renderTech() {
 const key=world.tick+'|'+JSON.stringify(world.research||{})+'|'+industrySelected+'|'+world.unlocked+'|'+world.money+'|'+Object.keys(E.RESEARCH).map(k=>E.researchStatus(world,k)).join('|')+Object.keys(E.TECH).map(k=>`${world.tech[k]||0}${E.techAvailable(world,k)?'a':''}${E.techCost(world,k)}${afford(E.techCost(world,k))?'$':''}`).join('');
 if ($('tech-body').dataset.key===key) return;
 $('tech-body').dataset.key=key;
 const state=IndustryGraph.status(E,world,industrySelected),command={type:'tech',key:state.key};
 const control=IndustryButtons.tech(E,world,state.key,{attributes:"data-command='"+JSON.stringify(command)+"'"});
 const reason=state.reason||(!state.available?E.TECH[state.key].requires.filter(k=>!world.tech[k]).map(k=>E.TECH[k].name).join('、'):'');
 $('tech-body').innerHTML='<div class="node" data-tech="'+industrySelected+'">'+control+IndustryGraph.detail(E,world,industrySelected)+(state.pending?'<p class="detail-caption">关闭产业规划后继续研究</p>':'')+(reason?'<p class="tip">'+reason+'</p>':'')+(state.kind==='poor'?'<p class="tech-shortfall">还差 '+coins(state.cost-world.money)+'</p>':'')+'</div>';
 decorateDetailButtons($('tech-body'));
 bindCommands($('tech-body'));
}
function setPanel(id, collapsed) {
 $(id).classList.toggle('collapsed', collapsed);
 $(id).querySelector('.panel-head').setAttribute('aria-expanded',String(!collapsed));
 folded[id]=collapsed;
 try{localStorage.setItem(PANELS,JSON.stringify(folded));}catch{}
}
function renderToolbar() {
 const jobs=E.projects(world).filter(p=>p.kind==='研究');
 $('tech-ready').textContent='';
 $('industry-open').classList.add('industry-button');
 const list=$('project-list'),markup=jobs.map(p=>IndustryButtons.tech(E,world,p.key,{inspect:true,attributes:'data-progress-tech="'+p.key+'"'})).join('');
 if(list.innerHTML!==markup){const focus=list.contains(document.activeElement)?document.activeElement.dataset.progressTech:null;list.innerHTML=markup;if(focus)list.querySelector('[data-progress-tech="'+focus+'"]')?.focus({preventScroll:true});}
 list.hidden=!jobs.length;
 for(const btn of list.querySelectorAll('[data-progress-tech]'))btn.onclick=()=>{industrySelected=E.TECH[btn.dataset.progressTech].building||btn.dataset.progressTech;openIndustry();setIndustryMode('tech');selectIndustry(industrySelected,true);};
 $('build-intent').hidden=!buildType&&!connectFrom;
 $('build-intent').textContent=buildType?`待建：${names[buildType]} · 点选${E.RECIPES[buildType].fits.map(f=>names[f]).join('/')}地块`:connectFrom?'点选另一座建筑以自动修路':'';
 if(connectFrom){
  const routes=[...roadOptions().values()].filter(o=>o.cost!==undefined),count=routes.filter(o=>afford(o.cost)).length;
  $('build-intent').textContent=routes.length?'点击道路上方价格修路':'暂无可连接建筑 · 可建造或探索更多板块';
 }
}
function plannerZoom(scale){
 industryScale=Math.max(.15,Math.min(1.5,scale));
 $('planner-graph').style.transform=`scale(${industryScale})`;
 $('planner-space').style.width=industryLayout.width*industryScale+'px';$('planner-space').style.height=industryLayout.height*industryScale+'px';
 $('planner-scale').textContent=Math.round(industryScale*100)+'%';
}
function locateIndustry(){
 const node=industryLayout.nodes.find(n=>n.id===industrySelected),view=$('planner-viewport');
 if(node)view.scrollTo({left:Math.max(0,(node.x+110)*industryScale-view.clientWidth/2),top:Math.max(0,(node.y+65)*industryScale-view.clientHeight/2)});
}
function selectIndustry(id,locate=false){industrySelected=id;renderPlanner();if(locate)locateIndustry();}
function renderPlanner(){
 if(!$('industry-dialog').open)return;
 let graph=IndustryGraph.markup(E,world,industryMode,industrySelected);
 if(!graph.nodes.some(n=>n.id===industrySelected&&n.discovered)){
  industrySelected='camp';graph=IndustryGraph.markup(E,world,industryMode,industrySelected);
 }
 industryLayout=graph;$('planner-graph').innerHTML=graph.html;
 $('planner-graph').style.width=graph.width+'px';$('planner-graph').style.height=graph.height+'px';plannerZoom(industryScale);
 for(const node of $('planner-graph').querySelectorAll('[data-industry]'))node.onclick=()=>{selectIndustry(node.dataset.industry);$('planner-graph').querySelector(`[data-industry="${industrySelected}"]`).focus({preventScroll:true});};
 renderTech();
 const b=industrySelected,rc=E.RECIPES[b],owned=b==='camp'||world.tech[b]>0,ins=rc?Object.keys(rc.in):[],deps=E.TECH[b]?.requires||[];
 const go=(key,label)=>`<button class="tech-flow-item" data-planner-focus="${E.TECH[key]?.building||key}">${detailIcon(E.TECH[key]?.building||E.TECH[key]?.icon||key,28)}<span>${label}</span></button>`;
 const extraMarkup=(rc&&owned?IndustryButtons.build(E,world,b,{attributes:'data-build="'+b+'"'}):'')
  +(rc&&owned?disclosure('recipe','生产配方',IndustryGraph.detail(E,world,b,'assets/icons/v1/',true,{section:'recipe'})):'')
  +(rc?disclosure('placement','建造条件与统计',`<div class="tech-terrain">建造地形 <b>${rc.fits.map(f=>names[f]).join(' / ')}</b></div><div class="tech-facts"><span>${detailIcon(b,24)}<b>${Object.values(world.tiles).filter(t=>t.building?.type===b).length}</b> 已建</span>${E.SELLABLE.includes(rc.out)?`<span>${detailIcon('coin',22)}<b>${fmt(E.BASE_PRICE[rc.out])}</b> / 件</span>`:'<span>中间原料</span>'}</div>`):'')
  +(deps.length?disclosure('prerequisites','研究前置',`<div class="planner-related">${deps.map(d=>go(d,E.TECH[d].name+(E.TECH[d].building?' II':''))).join('<span class="tech-flow-plus">+</span>')}</div>`):'');
 const extra=$('planner-extra'),draft=document.createElement('div');draft.innerHTML=extraMarkup;
 if(extra.dataset.selection!==b)for(const section of draft.querySelectorAll('details'))section.open=true;
 if(extra.dataset.selection===b)syncContent(extra,draft);else extra.replaceChildren(...draft.childNodes);
 extra.dataset.selection=b;
 decorateDetailButtons($('planner-extra'));
 for(const button of document.querySelectorAll('.planner-details [data-planner-focus]'))button.onclick=()=>{const id=button.dataset.plannerFocus;if(!industryLayout.nodes.some(n=>n.id===id))setIndustryMode('tech');selectIndustry(id,true);};
 const build=$('planner-extra').querySelector('[data-build]');if(build)build.onclick=()=>{buildType=b;connectFrom=null;$('industry-dialog').close();render();};
}
function setIndustryMode(mode){
 industryMode=mode;
 if(mode==='production'&&!E.BUILDINGS.includes(industrySelected))industrySelected='camp';
 for(const tab of ['production','tech']){$('view-'+tab).setAttribute('aria-selected',String(tab===mode));$('view-'+tab).tabIndex=tab===mode?0:-1;}
 $('planner-viewport').setAttribute('aria-labelledby','view-'+mode);
 renderPlanner();locateIndustry();
}
function openIndustry(){
 gesture=null;interacting=false;$('preview').innerHTML='';$('drag-label').style.display='none';
 $('industry-dialog').showModal();accumulator=0;last=performance.now();renderPlanner();locateIndustry();
}
$('industry-open').onclick=openIndustry;
$('industry-close').onclick=()=>$('industry-dialog').close();
$('industry-dialog').addEventListener('close',()=>{accumulator=0;last=performance.now();$('industry-open').focus();});
$('industry-dialog').addEventListener('cancel',event=>{event.preventDefault();$('industry-dialog').close();});
for(const mode of ['production','tech'])$('view-'+mode).onclick=()=>setIndustryMode(mode);
document.querySelector('.planner-tabs').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setIndustryMode(event.key==='Home'?'production':event.key==='End'?'tech':industryMode==='production'?'tech':'production');$('view-'+industryMode).focus();}};
$('planner-minus').onclick=()=>plannerZoom(industryScale-.1);$('planner-plus').onclick=()=>plannerZoom(industryScale+.1);
$('planner-fit').onclick=()=>{const view=$('planner-viewport');plannerZoom(Math.min(view.clientWidth/industryLayout.width,view.clientHeight/industryLayout.height,1));view.scrollTo(0,0);};
function render() {
 $('money').textContent=fmt(world.money);
 $('income').textContent=signed(windowStats().income).replace(/\$/g,'')+'/回合';
 $('pause').innerHTML=icon(world.paused?'ui-play':'ui-pause')+(world.paused?'继续':'暂停');$('speed').textContent=speed+'×';
 $('cancel').hidden=!buildType&&!connectFrom;
 renderToolbar();
 svg.classList.toggle('connecting',!!connectFrom||!!buildType||gesture?.kind==='connect');
 renderGoals();renderMap();renderSelection();renderPlanner();
}

function preview(event) {
 const tile=tileAt(event.clientX,event.clientY);
 $('drag-label').style.display='block';
 $('drag-label').style.left=event.clientX+'px';$('drag-label').style.top=event.clientY+'px';
 if(gesture.kind==='build'){
  const valid=canPlace(gesture.type,world.tiles[tile]),cost=E.buildingCost(world,gesture.type);
  $('drag-label').textContent=tile?(valid?`松开建造${names[gesture.type]} · ${coins(cost)}`:'不能放在这里'):`拖动${names[gesture.type]}到地图`;
  if(valid&&!afford(cost))$('drag-label').textContent=`金币不足：需要 ${coins(cost)}`;
  return;
 }
 const from=gesture.from;
 $('drag-label').classList.remove('bad');
 if(tile && tile!==from){
  try{
   const route=E.connection(world,from,tile);
   const edges=new Map(Object.values(world.edges).map(e=>[e.id,e]));
   const ids=route.tiles.slice(1).map((b,i)=>{
    const a=route.tiles[i],existing=Object.values(world.edges).find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
    const id=existing?.id||`preview-${i}`;
    if(!existing)edges.set(id,{id,a,b});
    return id;
   });
   const preview=RoadTiles.layout(world.tiles,[...edges.values()],position);
   $('preview').innerHTML=ids.map(id=>`<path d="${preview.roads.get(id).d}" class="preview ${afford(route.cost)?'':'invalid'}"/>`).join('');
   $('drag-label').textContent=route.segments.length?`${afford(route.cost)?'松开修路':'金币不足'} · ${coins(route.cost)}`:'已连接';
   if(!afford(route.cost))$('drag-label').classList.add('bad');
  }catch(error){$('preview').innerHTML='';$('drag-label').textContent=error.message;$('drag-label').classList.add('bad');}
 }else{
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const[x,y]=position(world.tiles[from]);
  $('preview').innerHTML=`<line x1="${x}" y1="${y}" x2="${p.x}" y2="${p.y}" class="preview"/>`;
  $('drag-label').textContent='拖到目标地块修路';
 }
}
document.addEventListener('pointerdown',()=>{interacting=true;suppressClick=false;},true);
// Dismiss before map handlers can select, produce or explore on the same click.
document.addEventListener('click',event=>{
 if(!connectFrom)return;
 if(suppressClick){suppressClick=false;event.preventDefault();event.stopPropagation();return;}
 if(event.target.closest('[data-road-price], #selection-panel'))return;
 const tile=svg.contains(event.target)?event.target.closest('[data-tile]')?.dataset.tile||tileAt(event.clientX,event.clientY):null;
 if(tile&&roadOptions().get(tile)?.cost!==undefined)return;
 event.preventDefault();event.stopPropagation();cancelGesture();
},true);
document.addEventListener('pointerup',()=>{setTimeout(()=>{interacting=false;},0);},true);
// Track touch contacts before the single-pointer pan handler. A pinch never commits a map action.
const mapTouches=new Map();let pinch=null;
function touchPair(){const [a,b]=[...mapTouches.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
svg.addEventListener('pointerdown',event=>{
 if(event.pointerType!=='touch')return;
 mapTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(mapTouches.size>=2){gesture=null;svg.classList.remove('panning');pinch=touchPair();suppressClick=true;event.preventDefault();event.stopImmediatePropagation();}
},{capture:true});
document.addEventListener('pointermove',event=>{
 if(!mapTouches.has(event.pointerId))return;
 mapTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(!pinch)return;
 event.preventDefault();event.stopImmediatePropagation();suppressClick=true;
 if(mapTouches.size<2)return;
 const next=touchPair();zoomAt(pinch.x,pinch.y,next.d/pinch.d);
 view.x-=(next.x-pinch.x)/view.scale;view.y-=(next.y-pinch.y)/view.scale;applyView();pinch=next;
},{capture:true,passive:false});
function finishMapTouch(event){
 if(!mapTouches.delete(event.pointerId))return;
 if(pinch){suppressClick=true;gesture=null;event.stopImmediatePropagation();interacting=false;if(!mapTouches.size)pinch=null;}
}
document.addEventListener('pointerup',finishMapTouch,true);
document.addEventListener('pointercancel',finishMapTouch,true);
window.addEventListener('blur',()=>{mapTouches.clear();pinch=null;});
svg.addEventListener('pointerdown',event=>{
 if(event.button!==0||gesture)return;
 // Map drags pan. Road building starts explicitly from a building detail action.
 const tile=event.target.closest('[data-tile]')?.dataset.tile||tileAt(event.clientX,event.clientY);
 if(event.target.closest('[data-road-price]'))return;
 const edge=event.target.closest('[data-edge]')?.dataset.edge;
 gesture={kind:'pan',x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,pointerId:event.pointerId};
});
function highlightRoad(id){
 hoveredRoad=id;const ids=new Set(id?E.roadComponent(world,id).map(e=>e.id):[]);
 svg.querySelectorAll('#roads .road-control').forEach(g=>g.querySelector('.road').classList.toggle('hovered',ids.has(g.querySelector('[data-edge]').dataset.edge)));
}
svg.addEventListener('pointermove',event=>{if(!connectFrom&&!buildType)highlightRoad(event.target.closest('[data-edge]')?.dataset.edge||null);});
svg.addEventListener('pointerleave',()=>highlightRoad(null));
svg.addEventListener('focusin',event=>{const id=event.target.closest('[data-edge]')?.dataset.edge;if(id)highlightRoad(id);});

svg.addEventListener('keydown',event=>{
 const edge=event.target.closest('[data-edge]')?.dataset.edge;
 if(!edge||!['Enter',' '].includes(event.key)||buildType||connectFrom)return;
 event.preventDefault();selectedEdge=edge;selected=null;selectedFlower=null;render();
 svg.querySelector(`[data-edge="${edge}"]`)?.focus();
});
svg.addEventListener('click',event=>{
 if(connectFrom){
  // Road hit paths sit above tiles; resolve the intended building from the map position.
  if(event.target.closest('[data-tile]'))return;
  const tile=tileAt(event.clientX,event.clientY);
  if(tile&&roadOptions().get(tile)?.cost!==undefined)tileClick(tile);
  return;
 }
 const edge=event.target.closest('[data-edge]')?.dataset.edge;
 if(!edge||buildType||connectFrom||suppressClick)return;
 selectedEdge=edge;selected=null;selectedFlower=null;render();
});
svg.addEventListener('wheel',event=>{event.preventDefault();zoomAt(event.clientX,event.clientY,Math.exp(-event.deltaY*.0015));},{passive:false});
window.addEventListener('resize',()=>{if(!fitted)return fitAll();const cx=view.x+svg.clientWidth/2/view.scale,cy=view.y+svg.clientHeight/2/view.scale;applyView();centerOn(cx,cy);});
document.addEventListener('pointermove',event=>{
 if(!gesture||event.pointerId!==gesture.pointerId)return;
 if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>6){
  gesture.moved=true;
  if(gesture.kind==='build'){buildType=gesture.type;connectFrom=null;render();}
  else if(gesture.kind==='pan'){svg.classList.add('panning');try{svg.setPointerCapture(gesture.pointerId);}catch{}}
  else svg.classList.add('connecting');
 }
 if(!gesture.moved)return;
 event.preventDefault();
 if(gesture.kind==='pan'){
  view.x-=(event.clientX-gesture.lastX)/view.scale;view.y-=(event.clientY-gesture.lastY)/view.scale;
  gesture.lastX=event.clientX;gesture.lastY=event.clientY;applyView();return;
 }
 preview(event);
},{passive:false});
document.addEventListener('pointerup',event=>{
 if(!gesture||event.pointerId!==gesture.pointerId)return;
 const finished=gesture;gesture=null;
 $('drag-label').style.display='none';if(!connectFrom)$('preview').innerHTML='';
 svg.classList.remove('panning');
 if(finished.kind==='pan'){if(finished.moved)suppressClick=true;return;}
 if(!finished.moved){
  // A press that never moved is a click: on a road it selects that road (the panel offers to remove it), on a
  // building it produces, on bare ground it just selects the tile.
  if(finished.kind==='connect'){selectedFlower=null;suppressClick=true;
   if(finished.edge&&world.edges[finished.edge]){selectedEdge=finished.edge;selected=null;render();}
   else{selected=finished.from;selectedEdge=null;if(E.workshop(world.tiles[finished.from].building))produce(finished.from);else render();}}
  return;
 }
 suppressClick=true;
 const tile=tileAt(event.clientX,event.clientY);
 if(finished.kind==='build'){
  if(tile)place(finished.type,tile);else{buildType=null;render();}
 }else render();
});
document.addEventListener('pointercancel',()=>{interacting=false;cancelGesture();});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!$('industry-dialog').open)cancelGesture();
 if(['Enter',' '].includes(event.key)){interacting=true;suppressClick=false;}
});
document.addEventListener('keyup',()=>{interacting=false;});
window.addEventListener('blur',()=>{interacting=false;if(gesture)cancelGesture();});
$('cancel').onclick=cancelGesture;
$('pause').onclick=()=>{world.paused=!world.paused;accumulator=0;last=performance.now();save();render();};
$('speed').onclick=()=>{speed=speed===1?2:speed===2?5:1;render();};
$('export').onclick=()=>{
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(world)],{type:'application/json'}));
 a.download='tracks-trade-v12.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try{
  if(file.size>10e6)throw Error('文件过大');
  const loaded=E.load(JSON.parse(await file.text()));
  if(!confirm('用这份存档替换当前进度？'))return;
  world=loaded;selected=E.START_TILE;selectedEdge=null;selectedFlower=null;storageBlocked=false;
  accumulator=0;last=performance.now();mapKey='';save();cancelGesture();fitAll();toast('已恢复存档');
 }catch(error){toast('导入失败：'+error.message);}finally{event.target.value='';}
};
// Developer cheats: open the page with `?cheat` to reveal a dev section in the menu. Money is added directly
// and not counted in `earned`, so income stats stay honest. Nothing here touches engine.js.
if(new URLSearchParams(location.search).has('cheat')){
 $('dev-menu').hidden=false;
 $('cheat-money').onclick=()=>{world.money+=1_000_000;save();render();toast('作弊：+$1,000,000');};
}

$('reset').onclick=()=>{
 if(!confirm('重新开始？可先导出当前进度。'))return;
 world=E.newWorld(Math.floor(Math.random()*2**31));selected=E.START_TILE;selectedEdge=null;selectedFlower=null;storageBlocked=false;
 accumulator=0;last=performance.now();mapKey='';save();cancelGesture();fitAll();
};document.addEventListener('visibilitychange',()=>{accumulator=0;last=performance.now();if(document.hidden){save();if(gesture)cancelGesture();}});
window.addEventListener('pagehide',save);
// Floating panels fold down to their title bar; the folded set is remembered per browser.
const PANELS='tnt-panels';
let folded={};try{folded=JSON.parse(localStorage.getItem(PANELS)||'{}');}catch{}
const isMobileStack=()=>window.matchMedia('(max-width:740px)').matches;
for(const panel of document.querySelectorAll('.panel')){
 if(panel.id in folded)panel.classList.toggle('collapsed',!!folded[panel.id]);
 else if(isMobileStack()&&panel.id==='goals-panel')panel.classList.add('collapsed');
 const head=panel.querySelector('.panel-head');
 head.setAttribute('role','button');head.tabIndex=0;head.setAttribute('aria-expanded',String(!panel.classList.contains('collapsed')));
 head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();head.click();}});
 head.addEventListener('click',e=>{
  if(e.target.closest('button,details,a'))return;
  const opening=panel.classList.contains('collapsed');
  setPanel(panel.id,!opening);
  if(opening&&isMobileStack())for(const other of document.querySelectorAll('.panel'))if(other!==panel&&!['tools-panel','goals-panel'].includes(other.id))setPanel(other.id,true);
 });
}
if(isMobileStack()){
 const open=[...document.querySelectorAll('.panel')].filter(p=>!['tools-panel','goals-panel'].includes(p.id)&&!p.classList.contains('collapsed'));
 for(const panel of open.slice(1))setPanel(panel.id,true);
}
render();fitAll();requestAnimationFrame(()=>{if(!fitted)fitAll();});if(welcome)toast(welcome);if(!storageBlocked)save();
setInterval(()=>{
 const now=performance.now(),elapsed=Math.min(.5,(now-last)/1000);last=now;
 if(!document.hidden&&!world.paused&&!$('industry-dialog').open&&!$('mobile-advice').open){
  accumulator+=elapsed*speed;
  let ticked=false;
  const cleared={};
  while(accumulator>=E.DT){
   const finishing=E.projects(world).filter(p=>p.remaining===1);E.tick(world);showRoundProduction(world.stats.at(-1));accumulator-=E.DT;ticked=true;if(finishing.length)toast(finishing.map(p=>p.name+' '+p.kind+'完成').join(' · '));
   for(const[id,d]of Object.entries(world.stats.at(-1).goals||{})){
    const u=cleared[id]||(cleared[id]={levels:0,reward:0});u.levels+=d.levels;u.reward+=d.reward;}
  }
  if(Object.keys(cleared).length)announceGoals(cleared);
  if(world.tick-lastSave>=5)save();
  if(!gesture&&!interacting&&(ticked||now-lastPaint>=100)){render();lastPaint=now;}
 }
},100);

// Animate only the decorative layer at display cadence; economy and render timing stay unchanged.
function animateTravelers(now){
 if(!world.paused&&!document.hidden)travelClock+=Math.min(now-travelLast,80)/1000;
 travelLast=now;
 if(decorativeRoads&&!document.hidden&&!world.paused&&!reducedTravelMotion.matches){
  $('freight').innerHTML=RoadTiles.travelers(decorativeTraffic,travelClock);
 }
 requestAnimationFrame(animateTravelers);
}
reducedTravelMotion.addEventListener('change',()=>{if(decorativeRoads)$('freight').innerHTML=RoadTiles.travelers(decorativeTraffic,travelClock,{reduced:reducedTravelMotion.matches});});
requestAnimationFrame(animateTravelers);

// Advice is session-only and independent of saved player progress.
const mobileAdvice=$('mobile-advice');
mobileAdvice.addEventListener('close',()=>{accumulator=0;last=performance.now();try{sessionStorage.setItem('tnt-mobile-advice','dismissed');}catch{}$('industry-open').focus();});
let adviceDismissed=false;try{adviceDismissed=sessionStorage.getItem('tnt-mobile-advice')==='dismissed';}catch{}
if(!adviceDismissed&&(matchMedia('(max-width:740px)').matches||(matchMedia('(pointer:coarse)').matches&&Math.min(innerWidth,innerHeight)<=740)))mobileAdvice.showModal();
for(const [id,factor] of [['map-plus',1.25],['map-minus',.8]])$(id).onclick=()=>{const r=svg.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,factor);};
$('map-home').onclick=()=>{const [x,y]=position(world.tiles[E.START_TILE]);centerOn(x,y,INITIAL_MAP_SCALE);};
