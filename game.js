'use strict';
const E = TradeEngine;
const $ = id => document.getElementById(id);
const SAVE = 'tnt-mvp-v16';
const names = Object.assign({town:'城镇'}, E.GOODS, E.TERRAIN_NAME, Object.fromEntries(Object.entries(E.RECIPES).map(([k, r]) => [k, r.name])));
const colors = {forest:'var(--terrain-forest)',grass:'var(--terrain-grass)',rock:'var(--terrain-rock)',ore:'var(--terrain-ore)',mountain:'var(--terrain-mountain)',lake:'var(--terrain-lake)',town:'var(--terrain-town)',fog:'var(--terrain-fog)',
 log:'var(--goods-log)',stone:'var(--goods-stone)',board:'var(--goods-board)',tool:'var(--goods-tool)',ore_good:'var(--goods-ore)',iron:'var(--goods-iron)'};
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
const coins = n => `${Math.round(n).toLocaleString('zh-CN')} 金币`;
const position = t => [Math.sqrt(3) * 51 * (t.q + t.r / 2), 76.5 * t.r];
let world = E.newWorld(Math.floor(Math.random() * 2 ** 31));
let selected = E.START_TILE, selectedEdge = null, selectedFlower = null, buildType = null, connectFrom = null;
let gesture = null, suppressClick = false, interacting = false, speed = 1;
let last = performance.now(), accumulator = 0, lastSave = 0, lastPaint = 0;
let storageBlocked = false, welcome = '', popTick = -1, mapKey = '', hovered = null;
let history = [];
const HISTORY_CAP = 600, HISTORY = 'tnt-history';
function loadHistory() {
 try {
  const h = JSON.parse(localStorage.getItem(HISTORY) || 'null');
  if (h && h.seed === world.seed && Array.isArray(h.pts) && h.pts.every(p => p.tick <= world.tick)) history = h.pts;
 } catch {}
}
function recordHistory() {
 const st=windowStats(), goods={};
 for (const r of E.SELLABLE) goods[r]=townTiles().reduce((n,t)=>n+(t.building.buys[r]?st.sales(t.id,r)*t.building.buys[r]:0),0);
 history.push({tick:world.tick, income:st.income, goods});
 if (history.length > HISTORY_CAP) history = history.filter((_, i) => i % 2 === 0);
}

try {
 const raw = localStorage.getItem(SAVE);
 if (raw) { world = E.load(JSON.parse(raw)); welcome = '已恢复进度'; }
 else if (['tnt-mvp-v15','tnt-mvp-v14','tnt-mvp-v13','tnt-mvp-v12','tnt-mvp-v11','tnt-mvp-v10','tnt-mvp-v9','tnt-mvp-v8'].some(k => localStorage.getItem(k))) welcome = 'v0.14：修路自由了——从任何建筑或已有的路出发，停在任何格子上，拐弯要加钱。驿站已取消。旧存档已保留但不再读取。';
} catch {
 storageBlocked = true;
 welcome = '原存档无法读取，已保留；当前进度可通过导出保存';
}

function toast(message) {
 $('toast').textContent = message;
 $('toast').classList.add('show');
 clearTimeout(toast.timer);
 toast.timer = setTimeout(() => $('toast').classList.remove('show'), 3500);
}
function save() {
 if (storageBlocked) return;
 try {
  E.validate(world);
  localStorage.setItem(SAVE, JSON.stringify(world));
  localStorage.setItem(HISTORY, JSON.stringify({seed:world.seed, pts:history}));
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
const messages = {build:'已建成',worker:'已雇一名工人',fireWorker:'已辞退一名工人，全额退款',demolish:'已拆除，全额退款',resident:'已加一名居民',tech:'科技已解锁',removeRoad:'在途货物通过后拆除，全额退款',restoreRoad:'已撤销拆除'};
function bindCommands(root) {
 for (const b of root.querySelectorAll('[data-command]')) b.onclick = () => {
  const c = JSON.parse(b.dataset.command);
  if (c.type === 'explore') return explore(c.flower);
  if (c.type === 'place') { const keep = selectedFlower; selectedFlower = null; if (!act(c, messages.place)) selectedFlower = keep; else focusFlower(c.flower); return; }
  act(c, messages[c.type] ?? '已更新');
 };
}
function canPlace(type, tile) { return !!tile && !tile.building && E.RECIPES[type].fits.includes(tile.terrain); }
const afford = cost => world.money >= cost;
// 可负担三态 · 见 docs/ui-system.html「状态 · 操作与选择」
const costly = cost => afford(cost) ? '' : 'costly';
const unlockedBuildings = () => E.BUILDINGS.filter(b => b === 'camp' || world.tech[b]);
const townTiles = () => Object.values(world.tiles).filter(t => t.building?.type === 'town');
// Stock of a good sitting at producers that can reach this town, beyond what its demand pool will take: the part
// only a click (or more residents) can sell.
function backlog(town, r) {
 const stock = Object.values(world.tiles).reduce((n, t) => E.workshop(t.building) && E.RECIPES[t.building.type].out === r && E.path(world, t.id, town) ? n + t.loose[r] : n, 0);
 return Math.max(0, stock - world.tiles[town].building.demand[r]);
}
const connectedTowns = () => townTiles().filter(u => Object.values(world.tiles).some(t => t.building && t.building.type !== 'town' && u.building.buys[E.RECIPES[t.building.type].out] && E.path(world, t.id, u.id))).map(t => t.id);
function cancelGesture() {
 gesture = null; buildType = null; connectFrom = null;
 $('drag-label').style.display = 'none'; $('preview').innerHTML = '';
 render();
}
function place(type, tile) {
 buildType = null;
 if (act({type:'build',tile,buildType:type}, `${names[type]}已建成`)) { selected = tile; selectedEdge = null; selectedFlower = null; }
 render();
}
function connect(from, to) {
 const town = [from,to].some(k => world.tiles[k]?.building?.type === 'town');
 if (act({type:'connect',from,to}, town ? '已连到城镇' : '道路已修好')) {
  selected = to; selectedEdge = null; selectedFlower = null; connectFrom = null;
  render();
 }
}
function explore(fid) {
 if (act({type:'explore',flower:fid}, '板块已揭开')) { selectedFlower = fid; selected = null; selectedEdge = null; render(); focusFlower(fid); }
}
function tileClick(key) {
 if (suppressClick) { suppressClick = false; return; }
 if (buildType) return place(buildType, key);
 if (connectFrom) return connect(connectFrom, key);
 selected = key; selectedEdge = null; selectedFlower = null;
 if (world.tiles[key].building) produce(key); else render();
}
// A click on a workshop makes goods; a click on a town asks for more of every good it buys. Both pop "+n".
function produce(key) {
 const t = world.tiles[key], b = t.building, town = b.type === 'town';
 const r = town ? null : E.RECIPES[b.type].out, before = town ? {...b.demand} : t.loose[r];
 try {
  world = E.apply(world, {type:'click', tile:key});
  if (town) { const after = world.tiles[key].building.demand; for (const g in before) if (after[g] > before[g]) pop(key, after[g] - before[g], g); }
  else pop(key, world.tiles[key].loose[r] - before, r);
  const g = svg.querySelector(`[data-tile="${key}"]`);
  g.classList.remove('bump'); void g.getBoundingClientRect(); g.classList.add('bump');
  render();
 } catch (error) {
  const now = performance.now();
  if (now - (produce.warned || 0) > 1000) { toast(error.message); produce.warned = now; }
  render();
 }
}
function pop(key, n, r) {
 const [x, y] = position(world.tiles[key]), g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
 g.setAttribute('class', 'pop'); g.setAttribute('transform', `translate(${x + 14},${y - 28})`);
 g.innerHTML = `<text text-anchor="middle" class="pop-text click" fill="${goodColor(r)}">+${n}</text>`;
 $('pops').appendChild(g); setTimeout(() => g.remove(), 900);
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
const missingInputs = t => Object.keys(E.RECIPES[t.building.type].in).filter(r => t.loose[r] < 1);
// A workshop whose inputs arrive and are used within the same round shows empty yards between deliveries;
// what the player needs to know is whether it made something last round.
const madeLastRound = t => (world.stats[world.stats.length - 1]?.tiles[t.id] || 0) > 0;
function stateOf(t) {
 const b = t.building, miss = missingInputs(t);
 if (miss.length && !madeLastRound(t)) return `等待${miss.map(r => names[r]).join('、')}`;
 if (t.loose[E.RECIPES[b.type].out] >= E.YARD && !madeLastRound(t)) return '堆场已满，停工';
 if (!b.workers.length) return '没有工人，点击才生产';
 return '生产中';
}
// The one thing the map says about a stalled workshop: which input it lacks. A full yard already shows as an
// amber 20 with idle workers, so it gets no text.
function stallOf(t) {
 const b = t.building, miss = missingInputs(t);
 if (!b.workers.length || madeLastRound(t) || !miss.length) return '';
 return `缺${miss.map(r => names[r]).join('、')}`;
}
function buyersOf(r, from) { return townTiles().filter(u => u.building.buys[r] && E.path(world, from, u.id)).map(u => u.id); }
function saturated(k, r, st = windowStats()) { return st.span >= 5 && st.sales(k, r) >= E.buys(world, k)[r].rate * .95; }
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
   down.push(u.building.type === 'town' ? {tile:u, r, hops, town:true, price:u.building.buys[r], taken:st.sales(u.id, r), full:saturated(u.id, r, st), backlog:backlog(u.id, r)} : {tile:u, r, hops, town:false, taken:st.inflow(u.id, r), value:E.saleValue(world, u.id, E.RECIPES[u.building.type].out)});
  }
 }
 const goods = new Set([...wants, ...(b.type === 'town' ? [] : [E.RECIPES[b.type].out])]);
 return {up, down, edges, nodes, goods};
}
// Where a workshop is stuck right now, as one of a few named causes, with the action that fixes it.
// Inputs are judged first, then the output side, then the workshop's own capacity.
function bottleneck(t, st, chain) {
 const b = t.building, rc = E.RECIPES[b.type], need = Math.max(1, E.rate(world, t)), r = rc.out;
 const level = (cause, action, key) => ({level:'warn', cause, action, key});
 for (const i of Object.keys(rc.in)) {
  const srcs = chain.up.filter(u => u.r === i), got = st.inflow(t.id, i);
  if (!srcs.length) return level(`没有连到产${names[i]}的建筑`, `修一条路到${names[E.BUILDINGS.find(x => E.RECIPES[x].out === i)]}，或新建一座`, i);
  if (st.span < 5 || got >= need * .9 || (madeLastRound(t) && t.loose[i] >= 1)) continue;
  const cap = srcs.reduce((n, u) => n + u.rate, 0), maker = names[srcs[0].tile.building.type];
  if (cap < need) return level(`上游${maker}产能 ${per(cap)} 件/回合，不够这里的 ${need} 件`, `给${maker}加工人、升${maker}工艺，或再建一座`, i);
  const idle = srcs.filter(u => u.stock >= 1).length;
  if (idle) {
   const rivals = Object.values(world.tiles).filter(u => u.building && u.id !== t.id && (u.building.type === 'town' ? u.building.buys[i] : E.RECIPES[u.building.type].in[i]) && srcs.some(s => E.path(world, s.tile.id, u.id)));
   const mine = E.saleValue(world, t.id, r), who = u => u.building.type === 'town' ? '城镇' : names[u.building.type];
   const ranked = rivals.map(u => ({u, v:u.building.type === 'town' ? u.building.buys[i] : E.saleValue(world, u.id, E.RECIPES[u.building.type].out)})).sort((a, b) => b.v - a.v);
   const above = ranked.find(x => x.v > mine), peer = ranked.find(x => x.v === mine);
   if (above) return level(`${maker}的${names[i]}先给了出价 ${above.v} 的${who(above.u)}，这里只值 ${mine}`, `再建一座${maker}，或给这里找更高价的买家`, i);
   if (peer) return level(`${maker}的${names[i]}要和出价相同的${who(peer.u)}轮流分`, `再建一座${maker}，或给${maker}加工人`, i);
   return level(`${names[i]}还在路上，${srcs[0].hops} 段路要走 ${srcs[0].hops} 回合`, `修一条更短的路`, i);
  }
  return level(`上游${maker}自己也停工了`, `先去看${maker}缺什么`, i);
 }
 if (t.loose[r] >= E.YARD && !madeLastRound(t)) {
  if (!chain.down.length) return level(`${names[r]}没有去处`, `修一条路到收${names[r]}的城镇或用它的工坊`, r);
  if (chain.down.every(d => d.town ? d.full : false)) return level(`收${names[r]}的城镇都喂饱了`, `给城镇加居民、升时代，或连到下一座城镇`, r);
  return {level:'info', cause:'堆场已满，货正在陆续运出', action:'', key:r};
 }
 if (b.workers.length && tileRate(t) >= need * .9) return {level:'ok', cause:'满产，瓶颈是自身产能', action:`雇工人或升${rc.name}工艺`, key:'self'};
 if (!b.workers.length) return {level:'ok', cause:'没有工人，只靠点击', action:'雇第一名工人', key:'self'};
 return null;
}
// The card's flow diagram: one bar per stage (actual / limit), inputs above, this workshop in the middle, the
// output below. Colour is the bar's fill level; the bottleneck row is tinted and the verdict says cause and fix.
const barRow = ({key, iconHtml, name, got, cap, unit = '', note = '', hot = false, grade}) => {
 const g = grade || (cap <= 0 ? 'none' : got >= cap * .9 ? 'ok' : got > 0 ? 'short' : 'none');
 const pct = cap > 0 ? Math.max(0, Math.min(100, got / cap * 100)) : (got > 0 ? 100 : 0);
 return `<div class="frow ${hot ? 'hot' : ''}" data-key="${key}"><span class="flbl">${iconHtml}<b>${name}</b>${hot ? '<em class="ftag">瓶颈</em>' : ''}</span><span class="fbar"><i class="${g}" style="width:${pct.toFixed(0)}%"></i></span><span class="fnum">${per(got)}${cap > 0 ? ` / ${cap}` : unit}</span>${note ? `<small class="fsrc">${note}</small>` : ''}</div>`;
};
const countOf = (n, what) => `${n} 座${what}`;
function flowSection(t, st) {
 const b = t.building, rc = E.RECIPES[b.type], r = rc.out, chain = chainOf(t, st), need = Math.max(1, E.rate(world, t)), v = bottleneck(t, st, chain);
 const young = st.span < 5;
 let html = '<h3>供需</h3><div class="flow">';
 for (const i of Object.keys(rc.in)) {
  const srcs = chain.up.filter(u => u.r === i), got = st.inflow(t.id, i);
  const kinds = [...new Set(srcs.map(u => names[u.tile.building.type]))].join('、');
  const note = srcs.length ? `来自 ${countOf(srcs.length, kinds)} · 最近 ${Math.min(...srcs.map(u => u.hops))} 段` : '没有连到来源';
  html += barRow({key:i, iconHtml:icon(i, i + '-c'), name:names[i], got, cap:need, note, hot:v?.key === i, grade:young && srcs.length ? 'ok' : undefined});
 }
 if (Object.keys(rc.in).length) html += '<div class="farrow"></div>';
 html += barRow({key:'self', iconHtml:icon(b.type, b.type + '-c'), name:names[b.type], got:tileRate(t), cap:need, hot:v?.key === 'self', grade:!b.workers.length ? 'none' : young ? 'ok' : undefined});
 html += '<div class="farrow"></div>';
 const towns = chain.down.filter(d => d.town), shops = chain.down.filter(d => !d.town);
 const parts = [];
 if (towns.length) parts.push(`卖给 ${countOf(towns.length, '城镇')} · ${towns.map(d => `$${d.price} 收 ${per(d.taken)}`).join(' · ')}`);
 if (shops.length) parts.push(`供 ${shops.map(d => `${names[d.tile.building.type]}用 ${per(d.taken)}`).join('、')}`);
 const outNote = parts.length ? parts.join('；') : '没有去处';
 const stuck = t.loose[r] >= E.YARD && !madeLastRound(t);
 html += barRow({key:r, iconHtml:icon(r, r + '-c'), name:names[r], got:st.outflow(t.id, r), cap:0, unit:' 运出', note:outNote, hot:v?.key === r, grade:!chain.down.length ? 'none' : stuck ? 'short' : 'ok'});
 html += '</div>';
 if (v) html += `<div class="verdict ${v.level}"><b>${v.cause}。</b>${v.action ? `<span>${v.action}。</span>` : ''}</div>`;
 return html;
}
// A town's flow: one bar per good it buys (taken / demand), who supplies it, and what limits it.
function townFlowSection(t, st) {
 const b = t.building, chain = chainOf(t, st), buys = E.buys(world, t.id), young = st.span < 5;
 let html = '<h3>供需</h3><div class="flow">', verdict = null;
 for (const [r, d] of Object.entries(buys)) {
  const srcs = chain.up.filter(u => u.r === r), got = st.sales(t.id, r), stuck = backlog(t.id, r);
  const kinds = [...new Set(srcs.map(u => names[u.tile.building.type]))].join('、');
  const cap = srcs.reduce((n, u) => n + u.rate, 0);
  let note = `$${d.price}`;
  note += srcs.length ? ` · 来自 ${countOf(srcs.length, kinds)} · 最近 ${Math.min(...srcs.map(u => u.hops))} 段 · 产 ${cap}` : ' · 没有连到来源';
  if (stuck) note += ` · <b class="warn">积压 ${stuck}</b>`;
  let v = null;
  if (!srcs.length) v = {level:'warn', cause:`没有连到产${names[r]}的建筑`, action:`修一条路到${names[E.BUILDINGS.find(x => E.RECIPES[x].out === r)]}，或新建一座`};
  else if (stuck) v = {level:'warn', cause:`${names[r]}积压 ${stuck} 件，需求到顶了`, action:'点城镇收购，或加居民、升时代'};
  else if (!young && got < d.rate * .9) {
   if (cap < d.rate) v = {level:'warn', cause:`${names[r]}供给只有需求的 ${Math.round(cap / d.rate * 100)}%`, action:`给${kinds}加工人、升工艺，或再连一座`};
   else {
    const rival = townTiles().filter(u => u.id !== t.id && u.building.buys[r] > d.price && srcs.some(x => E.path(world, x.tile.id, u.id))).map(u => u.building.buys[r]).sort((a, b) => b - a)[0];
    v = {level:'warn', cause:rival ? `${kinds}的${names[r]}先给了出价 $${rival} 的城镇，这里只出 $${d.price}` : `${kinds}的${names[r]}被同价的城镇轮流分走`, action:`再建一座${kinds}，或加居民抬高这里的需求`};
   }
  }
  if (v && !verdict) verdict = {...v, key:r};
  html += barRow({key:r, iconHtml:icon(r, r + '-c'), name:names[r], got, cap:d.rate, note, hot:verdict?.key === r, grade:young && srcs.length ? 'ok' : undefined});
 }
 html += '</div>';
 if (verdict) html += `<div class="verdict ${verdict.level}"><b>${verdict.cause}。</b><span>${verdict.action}。</span></div>`;
 else if (Object.keys(buys).length) html += '<div class="verdict ok"><b>供需平衡。</b><span>想多赚就加居民或升时代。</span></div>';
 return html;
}
// One sentence naming the layer that limits this building right now, or nothing.
function diagnose(t, st) {
 const b = t.building;
 if (!b || b.type === 'town') return null;
 const rc = E.RECIPES[b.type];
 const edges = Object.values(world.edges).filter(e => !e.removing && (e.a === t.id || e.b === t.id));
 const miss = madeLastRound(t) ? [] : missingInputs(t);
 if (miss.length) {
  if (!edges.length) return {level:'warn', text:`没有道路，${miss.map(r => names[r]).join('和')}进不来。`};
  for (const r of miss) {
   const makers = Object.values(world.tiles).filter(x => E.workshop(x.building) && E.RECIPES[x.building.type].out === r && E.path(world, x.id, t.id));
   if (!makers.length) return {level:'warn', text:`没有连接到任何产${names[r]}的建筑。`};
  }
  if (st.span < 5) return null;
  const need = Math.max(1, E.rate(world, t));
  const short = miss.filter(r => st.inflow(t.id, r) < need * .9);
  if (!short.length) return null;
  const text = short.map(r => `${names[r]}到货 ${per(st.inflow(t.id, r))} 件/回合，需要 ${need} 件/回合。`).join('');
  return {level:'warn', text};
 }
 const r = rc.out;
 if (t.loose[r] < E.YARD || madeLastRound(t)) return null;
 const buyers = buyersOf(r, t.id), users = Object.values(world.tiles).filter(x => E.workshop(x.building) && E.RECIPES[x.building.type].in[r] && E.path(world, t.id, x.id));
 if (!buyers.length && !users.length) return {level:'warn', text:`堆场已满。没有连到收${names[r]}的地方。`};
 if (buyers.length && buyers.every(k => saturated(k, r, st)) && !users.length) return {level:'warn', text:`堆场已满。收${names[r]}的城镇已喂饱。`};
 return {level:'info', text:'堆场已满，货正在陆续运出。'};
}

const svg = $('map');
function hexPoints(x, y, s = 50) {
 return Array.from({length:6}, (_, i) => {
  const a = (i * 60 - 30) * Math.PI / 180;
  return `${x + s * Math.cos(a)},${y + s * Math.sin(a)}`;
 }).join(' ');
}
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
   const a = (i * 60 - 30) * Math.PI / 180, b = ((i + 1) * 60 - 30) * Math.PI / 180;
   d += `M${x + 51 * Math.cos(a)},${y + 51 * Math.sin(a)}L${x + 51 * Math.cos(b)},${y + 51 * Math.sin(b)}`;
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
  return `<g class="fog-flower" data-flower="${f.id}" tabindex="0" role="button" aria-label="迷雾板块，解锁 ${coins(E.flowerCost(world))}">${pts.map(([x,y]) => `<polygon class="fog-hex" points="${hexPoints(x,y,51)}"/>`).join('')}<path class="fog-edge" d="${flowerOutline(f)}"/><g class="fog-cta"><text x="${cx}" y="${cy - 4}" text-anchor="middle" class="fog-label">解锁</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" class="fog-price"></text></g></g>`;
 }).join('');
 for (const g of svg.querySelectorAll('[data-tile]')) {
  g.addEventListener('click', () => tileClick(g.dataset.tile));
  g.addEventListener('pointerenter', () => { hovered = g.dataset.tile; renderHighlight(); });
  g.addEventListener('pointerleave', () => { if (hovered === g.dataset.tile) { hovered = null; renderHighlight(); } });
  g.addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); suppressClick = false; tileClick(g.dataset.tile); } });
 }
 for (const g of svg.querySelectorAll('[data-flower]')) {
  const pick = () => { if (suppressClick) { suppressClick = false; return; } if (!afford(E.flowerCost(world))) return; selectedFlower = g.dataset.flower; selected = null; selectedEdge = null; render(); };
  g.addEventListener('click', pick);
  g.addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); pick(); } });
 }
 applyView();
}
// Outlines live in their own layer above the terrain, so a highlighted hex is never half-covered by its neighbours.
function renderHighlight() {
 const ring = (t, cls) => { const [x,y] = position(t); return `<polygon class="hl ${cls}" points="${hexPoints(x,y,49)}"/>`; };
 let html = '';
 if (buildType) for (const t of Object.values(world.tiles)) if (canPlace(buildType, t)) html += ring(t, 'legal');
 if (hovered && world.tiles[hovered]) html += ring(world.tiles[hovered], 'hover');
 if (selected && world.tiles[selected]) html += ring(world.tiles[selected], 'selected');
 $('highlight').innerHTML = html;
}
function tileAt(clientX, clientY) {
 const matrix = svg.getScreenCTM();
 if (!matrix) return null;
 const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
 let best = null, distance = Infinity;
 for (const t of Object.values(world.tiles)) {
  const [x,y] = position(t), d = Math.hypot(p.x-x,p.y-y);
  if (d < distance) { best=t; distance=d; }
 }
 if (!best) return null;
 const [x,y] = position(best), dx = Math.abs(p.x-x), dy = Math.abs(p.y-y);
 return dx <= Math.sqrt(3)*25 && dy <= 50-dx/Math.sqrt(3) ? best.id : null;
}
function renderMap() {
 buildMap();
 const st = windowStats();
 const roadLayout=RoadTiles.layout(world.tiles,Object.values(world.edges),position);
 for (const g of svg.querySelectorAll('[data-flower]')) {
  g.classList.toggle('selected', g.dataset.flower === selectedFlower);
  // 买不起的板块整块不可交互：不可点、不可聚焦、无悬停。见 docs/ui-system.html
  const cost = E.flowerCost(world), ok = afford(cost);
  g.classList.toggle('affordable', ok);
  g.querySelector('.fog-price').textContent = coins(cost);
  if (ok) g.setAttribute('tabindex', '0'); else g.removeAttribute('tabindex');
  g.setAttribute('role', ok ? 'button' : 'img');
  g.setAttribute('aria-label', ok ? `迷雾板块，解锁 ${coins(cost)}` : `迷雾板块，需要 ${coins(cost)}，金币不足`);
 }
 renderHighlight();
 const focus=world.tiles[selected]?.building&&!buildType&&!connectFrom?chainOf(world.tiles[selected],st):null;
 svg.classList.toggle('chain',!!focus);
 for (const g of svg.querySelectorAll('[data-tile]')) {
  const t=world.tiles[g.dataset.tile], b=t.building;
  g.classList.toggle('selected', t.id===selected);
  g.classList.toggle('chain-node', !!focus&&focus.nodes.has(t.id));
  g.classList.toggle('has-building', !!b);
  g.classList.toggle('legal', !!buildType && canPlace(buildType,t));
  g.classList.toggle('invalid', !!buildType && !canPlace(buildType,t));
  g.setAttribute('aria-label', `${names[b?.type || t.terrain]} (${t.id})`);
  let content='',ambient='';
  if (b?.type === 'town') {
   const earning=Object.entries(E.buys(world,t.id)).reduce((n,[r,d])=>n+st.sales(t.id,r)*d.price,0);
   const linked=connectedTowns().includes(t.id);
   const offers=Object.entries(E.buys(world,t.id)).map(([id,d])=>({id,price:d.price,backlog:backlog(t.id,id),full:backlog(t.id,id)>0,income:linked?st.sales(t.id,id)*d.price:null}));
   content=BuildingTiles.render({type:'town',name:'城镇',level:E.eraPower(world),residents:b.residents,offers,status:linked?`+${fmt(earning)}金/回合`:'未连路',alert:!linked});
  } else if (b) {
   const rc=E.RECIPES[b.type],stall=stallOf(t),count=t.loose[rc.out];
   const status=stall||(count>=E.YARD?'满仓 · 待运出':!b.workers.length?'点击生产':'生产中');
   content=BuildingTiles.render({type:b.type,name:names[b.type],level:E.workerPower(world,b.type),output:rc.out,count,capacity:E.YARD,status,alert:!!stall||count>=E.YARD});
   g.setAttribute('aria-label',`${names[b.type]}，${names[rc.out]}库存 ${count}，${status} (${t.id})`);
  } else if (!['grass','lake'].includes(t.terrain)||!roadLayout.ports.has(t.id)) {
   // Resource land and mountains keep their scenery whatever runs across them. Empty grass and open water keep
   // theirs only until a road (or a waterway) arrives: from then on the road is the one thing drawn on that tile.
   ambient=AmbientTiles.render({terrain:t.terrain,id:t.id});
  }
  const scenery=svg.querySelector(`[data-tile-ambient="${t.id}"]`);
  scenery.innerHTML=ambient;
  scenery.classList.toggle('chain-dim',!!focus&&!focus.nodes.has(t.id));
  const ui=svg.querySelector(`[data-tile-ui="${t.id}"]`);
  ui.classList.toggle('chain-dim',!!focus&&!focus.nodes.has(t.id));
  ui.querySelector('.tile-content').innerHTML=content;
  const holder=ui.querySelector('.tile-crew');
  const c=b?.type==='town'?{n:b.residents,blocked:!Object.values(world.stats.at(-1)?.sales[t.id]||{}).some(n=>n>0),beat:Math.max(.25,E.DT/speed)}:b?crew(t):null;
  const key=c?`${b.type}|${c.n}|${c.blocked}|${c.beat}|${world.paused}`:'';
  if(holder.dataset.key!==key){
   holder.dataset.key=key;
   holder.classList.toggle('blocked',!!c&&c.blocked);
   holder.classList.toggle('halted',!!c&&world.paused);
   holder.innerHTML=c?BuildingTiles.people({kind:b.type==='town'?'resident':'worker',count:c.n,active:!c.blocked,paused:world.paused,beat:c.beat,clock:performance.now()/1000}):'';
  }
 }
 $('roads').innerHTML=roadLayout.junctions.map(d=>`<path class="road-junction" d="${d}"/>`).join('')+[...roadLayout.roads.values()].map(e => {
  const on=focus&&focus.edges.has(e.id);
  let label='';
  if(on){const goods=[...focus.goods].map(r=>[r,st.goodFlow(e.id,r)]).filter(([,n])=>n>=.05);if(goods.length){const [x,y]=e.at(.5);label=`<g class="road-label" transform="translate(${x},${y})"><rect x="-19" y="-8" width="38" height="16" rx="4"/><text text-anchor="middle" y="4">${goods.map(([r,n])=>`<tspan fill="${goodColor(r)}">${per(n)}</tspan>`).join('<tspan> </tspan>')}</text></g>`;}}
  return `<g class="road-control ${on?'chain':''}"><path d="${e.d}" class="road ${e.water?'water':''} ${e.removing?'removing':''} ${e.id===selectedEdge?'selected':''} ${on?'chain':''}"/><path class="road-hit" d="${e.hit}" data-edge="${e.id}" tabindex="0" role="button" aria-label="${e.water?'航线':'道路'} (${e.a}) 到 (${e.b})"/>${label}</g>`;
 }).join('');
 const f=Math.max(0,Math.min(1,accumulator/E.DT));
 $('freight').innerHTML=world.shipments.filter(s=>s.edge).map(s=>{
  const road=roadLayout.roads.get(s.edge);
  if(!road)return '';
  const [x,y]=road.at(s.from===road.a?f:1-f);
  return `<circle class="freight" cx="${x}" cy="${y}" r="3.5" fill="${goodColor(s.r)}"/>`;
 }).join('');
 if (world.tick!==popTick) {
  popTick=world.tick;const lastS=world.stats[world.stats.length-1];
  for(const old of $('pops').querySelectorAll('.pop.tick'))old.remove();
  if(lastS)for(const[k,n]of Object.entries(lastS.tiles)){const tile=world.tiles[k],b=tile?.building;if(!b||b.type==='town'||!b.workers.length)continue;const shown=Math.min(n,E.rate(world,tile));if(shown<1)continue;const[x,y]=position(tile);$('pops').insertAdjacentHTML('beforeend',`<g class="pop tick" transform="translate(${x+14},${y-28})"><text text-anchor="middle" class="pop-text" fill="${goodColor(E.RECIPES[b.type].out)}">+${shown}</text></g>`);}
 }
 for (const hit of $('roads').querySelectorAll('[data-edge]')) {
  const select=()=>{if(suppressClick){suppressClick=false;return;} if(buildType||connectFrom)return;selectedEdge=hit.dataset.edge;selected=null;selectedFlower=null;render();};
  hit.onclick=select;hit.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select();}};
 }
}
function button(label, command, primary=false, disabled=false, cls='') {
 return `<button data-command='${JSON.stringify(command)}' class="${primary?'primary':''} ${cls}" ${disabled?'disabled':''}>${label}</button>`;
}
function milestonesPanel(open=false) {
 const done=E.MILESTONES.filter(m=>world.milestones[m.id]).length;
 return `<details class="more" data-key="milestones" ${open?'open':''}><summary>里程碑 ${done} / ${E.MILESTONES.length}</summary><ul class="milestones">${E.MILESTONES.map(m=>`<li class="${world.milestones[m.id]?'done':''}"><span>${m.name}</span><small>+${m.reward}</small></li>`).join('')}</ul></details>`;
}
function townPanel(t) {
 const st=windowStats(), key=t.id, buys=E.buys(world,key), linked=connectedTowns().includes(key), b=t.building;
 const earning=Object.entries(buys).reduce((n,[r,d])=>n+st.sales(key,r)*d.price,0), next=E.residentCost(world,key), rate=E.townRate(world,b), full=b.residents>=E.MAX_RESIDENTS, era=E.eraPower(world);
 let html=`<h2>${icon('town','town-c')}城镇</h2><div class="subtitle">${E.ERAS[world.tech.era]} · 每种货每回合收 ${rate} 件</div><div class="state ${linked?'':'wait'}">${linked?'正在收购':'尚未连路'}</div><div class="coins"><span>来自本镇</span><b>+${fmt(earning)}</b><small>金币 / 回合</small></div>`;
 html+=`<div class="crew"><div class="crew-top"><span>居民 ${b.residents}</span><b>${b.residents} × ${E.TOWN_RATE*era} = ${rate} 件/回合</b></div><div class="slots residents">${Array.from({length:b.residents},(_,i)=>`<span class="resident bt-person-beat ${world.paused||!Object.values(world.stats.at(-1)?.sales[key]||{}).some(n=>n>0)?'is-idle':''}" style="--beat:${Math.max(.25,E.DT/speed)}s;animation-delay:-${i*.15}s">${icon('resident')}</span>`).join('')}</div></div>`;
 html+=townFlowSection(t,st);
 html+=`<div class="actions">${full?'':button(`加第 ${b.residents+1} 名居民<small>${coins(next)} · 每种货每回合多收 ${E.TOWN_RATE*era} 件</small>`,{type:'resident',tile:t.id},true,!afford(next),costly(next))}<button id="produce" class="produce">${icon('town','')}手工收购 每种货 ${E.clickPower(world,t)} 件<small>点城镇加需求，货会立刻派来</small></button></div>`;
 return html;
}
function flowerPanel(f) {
 if (f.state === 'fog') {
  const cost=E.flowerCost(world), n=world.unlocked+1;
  return `<div class="empty-state"><h2>${icon('fog','quarry-c')}迷雾板块</h2><p>第 ${n} 块 · ${n%E.FLOWER_PAIR?`下一块同价`:`下一块 ×${E.GEN.flowerGrowth}`}，两块一档，每档涨 ${E.GEN.flowerGrowth} 倍</p></div><div class="actions">${button(`解锁这块板块<small>${coins(cost)}</small>`,{type:'explore',flower:f.id},true,!afford(cost),costly(cost))}</div>`;
 }
}
function renderSelection() {
 const box=$('selection');
 const active=document.activeElement?.dataset.command;
 const wasOpen=new Map([...box.querySelectorAll('details')].map(d=>[d.dataset.key,d.open]));
 let html='';
 const e=world.edges[selectedEdge],t=world.tiles[selected],f=world.flowers[selectedFlower],st=windowStats();
 if (f && f.state !== 'placed') html=flowerPanel(f);
 else if (e) {
  const water=[world.tiles[e.a].terrain,world.tiles[e.b].terrain].includes('lake');
  html=`<h2>${icon(water?'waterway':'road','quarry-c')}${water?'航线':'道路'}</h2><div class="subtitle">货物每回合走一段</div><div class="state ${e.removing?'wait':''}">${e.removing?'等待在途货物通过后拆除':'运转中'}</div><div class="metrics"><div><span>近 30 回合运量</span><b>${per(st.flow(e.id))} 件/回合</b></div></div>`;
  html+=`<div class="actions">${e.removing?button('撤销拆除',{type:'restoreRoad',edge:e.id}):button(`拆除这段路<small>退回 ${coins(e.paid)}</small>`,{type:'removeRoad',edge:e.id})}</div>`;
 } else if (t?.building?.type==='town') {
  html=townPanel(t);
 } else if (t?.building) {
  const b=t.building,rate=E.rate(world,t),next=E.workerCost(world,t),rc=E.RECIPES[b.type],r=rc.out,n=b.workers.length;
  const paid=b.paid+b.workers.reduce((n,m)=>n+m.paid,0), state=stateOf(t);
  const c=crew(t), full=n>=E.MAX_WORKERS;
  const dots=Array.from({length:c.n},(_,i)=>`<span class="wmeeple" style="${beatStyle(c,i)}">${icon('worker')}</span>`).join('');
  const recipe=Object.keys(rc.in).length?`${Object.keys(rc.in).map(i=>names[i]).join(' + ')} → ${names[r]}`:names[r];
  html=`<h2>${icon(b.type,b.type+'-c')}${names[b.type]}</h2><div class="subtitle">${names[t.terrain]} · ${recipe}</div><div class="state ${state==='生产中'?'':'wait'}">${state}</div><div class="crew"><div class="crew-top"><span>工人 ${n}</span><b>${E.workerPower(world,b.type)>1?`${n} × ${E.workerPower(world,b.type)} = `:''}${rate} 件/回合</b></div>${n?`<div class="slots ${c.blocked?'blocked':''} ${world.paused?'halted':''}">${dots}</div>`:'<div class="slots empty-crew">没有工人</div>'}</div><div class="actions">${full?'':button(`雇第 ${n+1} 名工人<small>${coins(next)} · 每回合自动多 ${E.workerPower(world,b.type)} 件</small>`,{type:'worker',tile:t.id},true,!afford(next),costly(next))}<button id="produce" class="produce">${icon(r,'')}手工生产 ${E.clickPower(world,t)} 件${names[r]}</button></div><h3>近 30 回合每回合</h3><div class="metrics"><div><span>产出 / 产能</span><b>${per(tileRate(t))} / ${rate} 件</b></div><div><span>${names[r]} 产出 / 运出</span><b>${per(tileRate(t))} / ${per(st.outflow(t.id,r))} 件</b></div><div><span>${names[r]} 堆场</span><b class="${t.loose[r]>=E.YARD?'warn':''}">${t.loose[r]} / ${E.YARD}</b></div>${Object.keys(rc.in).map(i=>`<div><span>${names[i]} 堆场</span><b class="${t.loose[i]<1?'warn':''}">${t.loose[i]} / ${E.YARD}</b></div>`).join('')}</div>`;
  html=html.replace('<h3>近 30 回合每回合</h3>',flowSection(t,st)+'<h3>近 30 回合每回合</h3>');
  html+=`<details class="more" data-key="manage"><summary>管理建筑</summary><div class="actions"><button id="connect-accessible">从这里修路</button>${n?button(`辞退一名工人<small>退回 ${coins(b.workers[n-1].paid)}</small>`,{type:'fireWorker',tile:t.id}):''}${button(`拆除建筑<small>退回 ${coins(paid)}</small>`,{type:'demolish',tile:t.id})}</div></details>`;
 } else if (t) {
  const fits=unlockedBuildings().filter(b=>E.RECIPES[b].fits.includes(t.terrain));
  const locked=E.BUILDINGS.filter(b=>!world.tech[b]&&b!=='camp'&&E.RECIPES[b].fits.includes(t.terrain));
  html=`<div class="empty-state"><h2>${names[t.terrain]}</h2></div>`;
  const related=[...fits,...locked];
  if(related.length)html+=`<div class="terrain-association"><span>${names[t.terrain]}</span><span class="assoc-arrow">→</span>${related.map(b=>`${icon(b)}<b>${names[b]}</b>`).join('<span>、</span>')}</div>`;
  else if(t.terrain==='mountain')html+='<div class="terrain-association"><b>不可建造</b><span>道路也无法通过</span></div>';
  else if(t.terrain==='lake')html+=`<div class="terrain-association">${icon('waterway')}<b>${world.tech.waterway?'航道已开放':'需要航道科技'}</b><span>可通行，不可建造</span></div>`;
  if(fits.length)html+=`<div class="actions">${fits.map(b=>button(`建造${names[b]}<small>${coins(E.buildingCost(world,b))}</small>`,{type:'build',tile:t.id,buildType:b},true,!afford(E.buildingCost(world,b)),costly(E.buildingCost(world,b)))).join('')}</div>`;
  if(locked.length)html+=`<p class="tip">未解锁：${locked.map(b=>names[b]).join('、')}</p>`;
 } else html=milestonesPanel(true);
 box.innerHTML=html;
 for(const d of box.querySelectorAll('details'))if(wasOpen.has(d.dataset.key))d.open=wasOpen.get(d.dataset.key);
 bindCommands(box);
 if($('connect-accessible'))$('connect-accessible').onclick=()=>{connectFrom=t.id;buildType=null;render();};
 if($('produce'))$('produce').onclick=()=>produce(t.id);
 if(active)[...box.querySelectorAll('[data-command]')].find(b=>b.dataset.command===active)?.focus({preventScroll:true});
}
function renderGoals() {
 const next=E.MILESTONES.find(m=>!world.milestones[m.id]);
 $('goal-hud').innerHTML=next?`<span>下一目标</span><b>${next.name}</b><small>+${next.reward}</small>`:'';
}
// The tech tree: one dialog, tiers top to bottom; buyable nodes are live, owned ones ticked, locked ones grey with their missing prerequisites.
// The tech tree is one card per building, plus the golden finger (manual clicks) and the waterway. A card
// starts as an unlock; once owned, the same button becomes the craft upgrade for that type.
function techCards() {
 const cards = [{id:'finger', name:'金手指', icon:'worker', tier:1, kind:'economy', desc:'手工点击：点工坊出货，点城镇加需求。每次至少这么多，工人和居民多了还会跟着涨', craft:'tools', per:n=>`每次点击至少 ${n} 件`},
  {id:'era', name:'时代', icon:'town', tier:1, kind:'economy', desc:'全图所有城镇的居民。时代越高，每名居民每回合收得越多', craft:'era', per:n=>`每名居民每种货每回合 ${E.TOWN_RATE*n} 件`, title:n=>E.ERAS[n], next:n=>`进入${E.ERAS[n]}`}];
 for (const b of E.BUILDINGS) {
  const t = E.TECH[b], rc = E.RECIPES[b];
  const ins = Object.keys(rc.in).map(r => names[r]).join(' + ');
  cards.push({id:b, name:names[b], icon:b, tier:t ? t.tier : 1, kind:'building', unlock:t ? b : null, craft:E.craftOf(b),
   desc:t ? t.desc : `在${names[rc.fits[0]]}建，产${names[rc.out]}`, per:n=>`每名工人每回合 ${n} 件`});
 }
 cards.push({id:'waterway', name:E.TECH.waterway.name, icon:'waterway', tier:E.TECH.waterway.tier, kind:'waterway', unlock:'waterway', desc:E.TECH.waterway.desc});
 return cards;
}
function renderTech() {
 const key=Object.keys(E.TECH).map(k=>`${world.tech[k]||0}${E.techAvailable(world,k)?'a':''}${E.techCost(world,k)}${afford(E.techCost(world,k))?'$':''}`).join('');
 if ($('tech-body').dataset.key===key) return;
 $('tech-body').dataset.key=key;
 const cards=techCards(), tiers=[...new Set(cards.map(c=>c.tier))].sort();
 $('tech-body').innerHTML=tiers.map(tier=>`<div class="tier"><div class="tier-label">第 ${tier} 层</div><div class="nodes">${cards.filter(c=>c.tier===tier).map(c=>{
  const owned=!c.unlock||world.tech[c.unlock]>0;
  const level=c.craft?world.tech[c.craft]||0:0;
  let cls, body;
  if (!owned) {
   const avail=E.techAvailable(world,c.unlock), cost=E.techCost(world,c.unlock);
   const missing=E.TECH[c.unlock].requires.filter(r=>!world.tech[r]).map(r=>E.TECH[r].name);
   cls=!avail?'locked':afford(cost)?'ready':'costly';
   body=!avail?`<div class="locked-note">${icon('ui-locked')}需要先解锁${missing.join('、')}</div>`:button(`解锁<small>${coins(cost)}</small>`,{type:'tech',key:c.unlock},true,!afford(cost),costly(cost));
  } else if (c.craft) {
   const cost=E.techCost(world,c.craft), maxed=E.techMaxed(world,c.craft);
   cls=maxed?'owned':afford(cost)?'owned ready':'owned costly';
   body=`<div class="craft-now">${c.per(level+1)}</div>`+(maxed?`<div class="owned-mark">${icon('check')}已是最高</div>`:button(`${c.next?c.next(level+1):`升级到 Lv.${level+2}`}<small>${coins(cost)} · ${c.per(level+2)}</small>`,{type:'tech',key:c.craft},true,!afford(cost),costly(cost)));
  } else {
   cls='owned'; body=`<div class="owned-mark">${icon('check')}已开通</div>`;
  }
  return `<div class="node ${cls} kind-${c.kind}"><div class="node-head"><b>${iconIds.has(c.icon)?icon(c.icon):`<span class="building-icon">${icon(c.icon)}</span>`}${c.title?c.title(level):c.name}${owned&&c.craft&&!c.title?` Lv.${level+1}`:''}</b></div><p>${c.desc}</p>${body}</div>`;
 }).join('')}</div></div>`).join('');
 bindCommands($('tech-body'));
}
function setPanel(id, collapsed) {
 $(id).classList.toggle('collapsed', collapsed);
 folded[id]=collapsed;
 try{localStorage.setItem(PANELS,JSON.stringify(folded));}catch{}
}
// The production chain: raw buildings on the left, their goods, then processing buildings and products. Data comes from the engine's recipes.
// The production chain as a picture: building icons feeding good icons, each good labelled with what the whole
// map earns from it per round, so the player sees which chain carries the income and which one is idle.
function renderChain() {
 const raw=E.BUILDINGS.filter(b=>!Object.keys(E.RECIPES[b].in).length), proc=E.BUILDINGS.filter(b=>Object.keys(E.RECIPES[b].in).length);
 const N={}, W=320, ROW=78, BS=40, GS=30;
 raw.forEach((b,i)=>{N[b]={x:44,y:40+i*ROW};N[E.RECIPES[b].out]={x:122,y:40+i*ROW};});
 proc.forEach((b,i)=>{N[b]={x:200,y:40+i*ROW};N[E.RECIPES[b].out]={x:280,y:40+i*ROW};});
 const H=40+ROW*(Math.max(raw.length,proc.length)-1)+44;
 const unlocked=new Set(unlockedBuildings()), st=windowStats();
 const earned=r=>townTiles().reduce((n,t)=>n+(t.building.buys[r]?st.sales(t.id,r)*t.building.buys[r]:0),0);
 let edges='', nodes='';
 for (const b of E.BUILDINGS) {
  const locked=!unlocked.has(b), rc=E.RECIPES[b], B=N[b], O=N[rc.out];
  for (const i of Object.keys(rc.in)) { const A=N[i]; edges+=`<path class="e ${i==='log'?'log':''} ${locked?'locked':''}" d="M${A.x+GS/2},${A.y} C${A.x+GS/2+30},${A.y} ${B.x-BS/2-30},${B.y} ${B.x-BS/2},${B.y}"/>`; }
  edges+=`<path class="e ${locked?'locked':''}" d="M${B.x+BS/2},${B.y} L${O.x-GS/2},${O.y}"/>`;
  nodes+=`<g class="${locked?'locked':''}"><title>${rc.name} · ${rc.fits.map(t=>names[t]).join('/')}</title>${TradeIcons.svgIcon(b,{x:B.x-BS/2,y:B.y-BS/2,size:BS})}<text class="lbl" x="${B.x}" y="${B.y+BS/2+11}" text-anchor="middle">${rc.name}</text></g>`;
  const inc=earned(rc.out), price=E.BASE_PRICE[rc.out];
  nodes+=`<g class="${locked?'locked':''}"><title>${names[rc.out]}${price?` · 基准价 ${price}${inc>0?` · +${fmt(inc)}/回合`:''}`:' · 没有城镇收，只能炼铁'}</title><circle class="g ${locked?'locked':''} ${inc>0?'earning':''}" cx="${O.x}" cy="${O.y}" r="${GS/2+3}"/>${TradeIcons.svgIcon(rc.out,{x:O.x-GS/2,y:O.y-GS/2,size:GS})}<text class="gsub ${inc>0?'earning':''}" x="${O.x}" y="${O.y+GS/2+13}" text-anchor="middle">${names[rc.out]}</text></g>`;
 }
 $('chain-body').innerHTML=`<svg class="chain" viewBox="0 0 ${W} ${H}" role="img" aria-label="生产链">${edges}${nodes}</svg>`;
}
// Growth chart: the header's income/turn figure over the whole run, on a linear scale so the exponential curve reads as one.
function renderGrowth() {
 if (history.length<2) { $('growth-body').innerHTML='<p class="growth-empty">再玩几回合，增长曲线就会开始画出来。</p>'; return; }
 const W=310,H=130,PAD=6;
 const maxIncome=Math.max(1,...history.map(p=>p.income));
 const x=i=>PAD+(W-PAD*2)*i/(history.length-1);
 const y=v=>H-8-(H-30)*v/maxIncome;
 const line=get=>history.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join('');
 const last=history.at(-1), sold=E.SELLABLE.filter(r=>history.some(p=>p.goods[r]>0));
 let base=history.map(()=>0), goodLines='';
 for (const r of sold) {
  const top=base.map((b,i)=>b+history[i].goods[r]);
  const upper=top.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`), lower=base.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse();
  goodLines+=`<path class="good-area" style="fill:${goodColor(r)}" d="M${upper.join('L')}L${lower.join('L')}Z"/>`;
  base=top;
 }
 const legend=[`<span><i style="background:#b8743a"></i>合计 +${fmt(last.income)}</span>`,...sold.map(r=>`<span><i style="background:${goodColor(r)}"></i>${names[r]} +${fmt(last.goods[r])}</span>`)].join('');
 $('growth-body').innerHTML=`
  <svg class="growth-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每回合收入随时间变化">
   <text class="chart-label" x="${PAD}" y="14">每回合收入 · 峰值 ${fmt(maxIncome)}</text>
   <line class="axis" x1="${PAD}" y1="${H-8}" x2="${W-PAD}" y2="${H-8}"/>
   ${goodLines}
   <path class="income-line" d="${line(p=>p.income)}"/>
  </svg>
  <div class="growth-legend">${legend}</div>`;
}
function renderToolbar() {
 const bar=$('build-buttons');
 const want=unlockedBuildings().join(',');
 if (bar.dataset.key!==want) {
  bar.dataset.key=want;
  bar.innerHTML=unlockedBuildings().map(b=>`<button data-build="${b}">${icon(b)}<span>${names[b]}<small></small></span></button>`).join('');
  for(const button of bar.querySelectorAll('[data-build]')){
   button.onpointerdown=event=>{if(event.button!==0)return;gesture={kind:'build',type:button.dataset.build,x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId};button.setPointerCapture(event.pointerId);};
   button.onclick=()=>{if(suppressClick){suppressClick=false;return;}buildType=buildType===button.dataset.build?null:button.dataset.build;connectFrom=null;render();};
  }
 }
 for(const b of bar.querySelectorAll('[data-build]')){
  b.classList.toggle('active',b.dataset.build===buildType);
  b.setAttribute('aria-pressed',b.dataset.build===buildType?'true':'false');
  b.querySelector('small').textContent=coins(E.buildingCost(world,b.dataset.build));
  const ok=afford(E.buildingCost(world,b.dataset.build));
  b.classList.toggle('primary',ok);b.classList.toggle('costly',!ok);
 }
 const ready=Object.keys(E.TECH).filter(k=>!E.techOwned(world,k)&&!E.techMaxed(world,k)&&E.techAvailable(world,k)&&afford(E.techCost(world,k))).length;
 $('tech-ready').textContent=ready?`${ready} 项可买`:'';
}
function render() {
 const st=windowStats();
 $('money').textContent=world.money.toLocaleString('zh-CN');$('income').textContent=`+${fmt(st.income)}/回合`;
 $('pause').innerHTML=icon(world.paused?'ui-play':'ui-pause')+(world.paused?'继续':'暂停');$('speed').textContent=speed+'×';
 $('cancel').hidden=!buildType&&!connectFrom;
 renderToolbar();
 svg.classList.toggle('connecting',!!connectFrom||!!buildType||gesture?.kind==='connect');
 renderGoals();renderMap();renderSelection();renderTech();renderChain();
 if (!$('growth-panel').classList.contains('collapsed')) renderGrowth();
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
   const rough=route.segments.filter(s=>s.factor===2).length;
   $('drag-label').textContent=route.segments.length?`${afford(route.cost)?'松开修路':'金币不足'} · ${route.segments.length} 段 ${coins(route.cost)}${route.lakes?` · ${route.lakes} 段航线 ×3`:''}${rough?` · ${rough} 段林地/岩地 ×2`:''}`:'已有道路相连';
   if(!afford(route.cost))$('drag-label').classList.add('bad');
  }catch(error){$('preview').innerHTML='';$('drag-label').textContent=error.message;$('drag-label').classList.add('bad');}
 }else{
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const[x,y]=position(world.tiles[from]);
  $('preview').innerHTML=`<line x1="${x}" y1="${y}" x2="${p.x}" y2="${p.y}" class="preview"/>`;
  $('drag-label').textContent='拖到任意格子修路';
 }
}
document.addEventListener('pointerdown',()=>{interacting=true;suppressClick=false;},true);
document.addEventListener('pointerup',()=>{setTimeout(()=>{interacting=false;},0);},true);
svg.addEventListener('pointerdown',event=>{
 if(event.button!==0||gesture)return;
 // A road's hit area covers the tile centres it runs through, so the tile under the pointer decides: from an
 // anchored tile the drag lays road, anywhere else it pans. A click that never moved still selects the road.
 const tile=event.target.closest('[data-tile]')?.dataset.tile||tileAt(event.clientX,event.clientY);
 const edge=event.target.closest('[data-edge]')?.dataset.edge;
 if(tile&&E.anchored(world,tile)&&!buildType&&!connectFrom){
  gesture={kind:'connect',from:tile,edge,x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId};
 }else if(!buildType&&!connectFrom){
  gesture={kind:'pan',x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,pointerId:event.pointerId};
 }else return;
 if(gesture.kind==='connect')svg.setPointerCapture(event.pointerId);
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
 $('drag-label').style.display='none';$('preview').innerHTML='';
 svg.classList.remove('panning');
 if(finished.kind==='pan'){if(finished.moved)suppressClick=true;return;}
 if(!finished.moved){
  // A press that never moved is a click: on a road it selects that road (the panel offers to remove it), on a
  // building it produces, on bare ground it just selects the tile.
  if(finished.kind==='connect'){selectedFlower=null;suppressClick=true;
   if(finished.edge&&world.edges[finished.edge]){selectedEdge=finished.edge;selected=null;render();}
   else{selected=finished.from;selectedEdge=null;if(world.tiles[finished.from].building)produce(finished.from);else render();}}
  return;
 }
 suppressClick=true;
 const tile=tileAt(event.clientX,event.clientY);
 if(finished.kind==='build'){
  if(tile)place(finished.type,tile);else{buildType=null;render();}
 }else if(tile&&tile!==finished.from)connect(finished.from,tile);
 else render();
});
document.addEventListener('pointercancel',()=>{interacting=false;cancelGesture();});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape')cancelGesture();
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
  accumulator=0;last=performance.now();mapKey='';history=[];recordHistory();save();cancelGesture();fitAll();toast('已恢复存档');
 }catch(error){toast('导入失败：'+error.message);}finally{event.target.value='';}
};
// Developer cheats: open the page with `?cheat` to reveal a dev section in the menu. Money is added directly
// and not counted in `earned`, so income stats stay honest. Nothing here touches engine.js.
if(new URLSearchParams(location.search).has('cheat')){
 $('dev-menu').hidden=false;
 $('cheat-money').onclick=()=>{world.money+=1_000_000;save();render();toast('作弊：+1,000,000 金币');};
}
$('reset').onclick=()=>{
 if(!confirm('重新开始？可先导出当前进度。'))return;
 world=E.newWorld(Math.floor(Math.random()*2**31));selected=E.START_TILE;selectedEdge=null;selectedFlower=null;storageBlocked=false;
 accumulator=0;last=performance.now();mapKey='';history=[];recordHistory();save();cancelGesture();fitAll();
};document.addEventListener('visibilitychange',()=>{accumulator=0;last=performance.now();if(document.hidden){save();if(gesture)cancelGesture();}});
window.addEventListener('pagehide',save);
// Floating panels fold down to their title bar; the folded set is remembered per browser.
const PANELS='tnt-panels';
let folded={};try{folded=JSON.parse(localStorage.getItem(PANELS)||'{}');}catch{}
const isMobileStack=()=>window.matchMedia('(max-width:740px)').matches;
for(const panel of document.querySelectorAll('.panel')){
 if(panel.id in folded)panel.classList.toggle('collapsed',!!folded[panel.id]);
 panel.querySelector('.panel-head').addEventListener('click',e=>{
  if(e.target.closest('button,details,a'))return;
  const opening=panel.classList.contains('collapsed');
  setPanel(panel.id,!opening);
  if(opening&&isMobileStack())for(const other of document.querySelectorAll('.panel'))if(other!==panel&&other.id!=='tools-panel')setPanel(other.id,true);
 });
}
if(isMobileStack()){
 const open=[...document.querySelectorAll('.panel')].filter(p=>p.id!=='tools-panel'&&!p.classList.contains('collapsed'));
 for(const panel of open.slice(1))setPanel(panel.id,true);
}
loadHistory();recordHistory();render();fitAll();requestAnimationFrame(()=>{if(!fitted)fitAll();});if(welcome)toast(welcome);if(!storageBlocked)save();
setInterval(()=>{
 const now=performance.now(),elapsed=Math.min(.5,(now-last)/1000);last=now;
 if(!document.hidden&&!world.paused){
  accumulator+=elapsed*speed;
  const before=Object.keys(world.milestones);
  let ticked=false;
  while(accumulator>=E.DT){E.tick(world);recordHistory();accumulator-=E.DT;ticked=true;}
  const fresh=Object.keys(world.milestones).filter(k=>!before.includes(k));
  if(fresh.length){const m=E.MILESTONES.find(m=>m.id===fresh[0]);toast(`里程碑「${m.name}」达成，+${m.reward} 金币`);}
  if(world.tick-lastSave>=5)save();
  if(!gesture&&!interacting&&(ticked||now-lastPaint>=100)){render();lastPaint=now;}
 }
},100);
