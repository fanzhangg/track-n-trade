'use strict';
const E = TradeEngine;
const $ = id => document.getElementById(id);
const SAVE = 'tnt-mvp-v10';
const names = {camp:'伐木营',sawmill:'锯木厂',quarry:'采石场',town:'城镇',forest:'森林',dense:'密林',grass:'草地',rock:'岩地',rich:'富岩地',mountain:'山地',log:'原木',board:'木板',stone:'石头'};
const colors = {forest:'#dcecdf',dense:'#c4dfcb',grass:'#f0f3ed',rock:'#e0e6eb',rich:'#d0dce5',mountain:'#d2d9df',town:'#f6e7d2',log:'#719d78',board:'#cdab71',stone:'#8d9cad'};
const icon = (name, cls='') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
// Map-side glyph: same sprite, positioned in SVG user units.
const glyph = (name, x, y, size, fill) => `<use href="#icon-${name}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;
const fmt = n => Math.round(n).toLocaleString('zh-CN');
const per = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
const coins = n => `${Math.round(n).toLocaleString('zh-CN')} 金币`;
const position = t => [Math.sqrt(3) * 51 * (t.q + t.r / 2), 76.5 * t.r];
let world = E.newWorld();
let selected = '0,0', selectedEdge = null, buildType = null, connectFrom = null;
let gesture = null, suppressClick = false, interacting = false, speed = 1;
let last = performance.now(), accumulator = 0, lastSave = 0, lastPaint = 0;
let storageBlocked = false, welcome = '', popTick = -1;

try {
 const raw = localStorage.getItem(SAVE);
 if (raw) { world = E.load(JSON.parse(raw)); welcome = '已恢复进度'; }
 else if (['tnt-mvp-v9','tnt-mvp-v8','tnt-mvp-v7','tnt-mvp-v6','tnt-mvp-v5'].some(k => localStorage.getItem(k))) welcome = 'v0.10 改为每回合一件的整数模型，旧存档已保留但不再读取。从头开始：先把采石场连到西镇。';
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
const messages = {build:'已建成',module:'已扩产',equipment:'设备已安装',upgrade:'道路已扩容',downgrade:'已降级，退回一半',demolish:'已拆除，退回一半金币',removeModule:'已拆掉一个模块，退回一半',removeEquipment:'已拆下设备，退回一半',townLevel:'城镇已扩建，每种货每回合多收 1 件',research:'升级已生效',removeRoad:'在途货物通过后拆除，退回一半',restoreRoad:'已撤销拆除'};
function bindCommands(root) {
 for (const b of root.querySelectorAll('[data-command]')) b.onclick = () => {
  const c = JSON.parse(b.dataset.command);
  act(c, messages[c.type] || '已更新');
 };
}
function canPlace(type, tile) {
 return !!tile && !tile.building && (E.FITS[type] || []).includes(tile.terrain);
}
const afford = cost => world.money >= cost;
const townKeys = () => Object.keys(E.TOWNS);
const connectedTowns = () => townKeys().filter(k => Object.values(world.tiles).some(t => t.building && t.building.type !== 'town' && E.path(world, t.id, E.TOWNS[k].tile)));
function cancelGesture() {
 gesture = null; buildType = null; connectFrom = null;
 $('drag-label').style.display = 'none'; $('preview').innerHTML = '';
 render();
}
function place(type, tile) {
 buildType = null;
 if (act({type:'build',tile,buildType:type}, `${names[type]}已建成`)) { selected = tile; selectedEdge = null; }
 render();
}
function connect(from, to) {
 const town = E.townAt(from) || E.townAt(to);
 if (act({type:'connect',from,to}, town ? `已连到${E.TOWNS[town].name}，货物开始自动售卖` : '道路已连接，开始自动运输')) {
  selected = to; selectedEdge = null; connectFrom = null;
  render();
 }
}
function tileClick(key) {
 if (suppressClick) { suppressClick = false; return; }
 if (buildType) return place(buildType, key);
 if (connectFrom) return connect(connectFrom, key);
 selected = key; selectedEdge = null; render();
}

// Rolling window over the engine's own samples. Roads are ranked by how much demand they
// blocked, valued at the door: only the top three get a colour on the map.
function windowStats() {
 const S = world.stats;
 const empty = {span:0, rate:() => 0, util:() => 0, flow:() => 0, blocked:() => 0, rank:() => 0, inflow:() => 0, income:0, sales:() => 0, ranked:[]};
 if (!S.length) return empty;
 const span = world.tick - S[0].tick + 1;
 const out = E.zero(), edges = {}, inflow = {}, sales = {};
 let income = 0;
 for (const s of S) {
  E.add(out, s.out); income += s.income;
  for (const [k, v] of Object.entries(s.sales)) E.add(sales[k] || (sales[k] = E.zero()), v);
  for (const [k, v] of Object.entries(s.edges)) {
   const u = edges[k] || (edges[k] = {cap:0, flow:0, blocked:0});
   u.cap += v.capacity; u.blocked += v.blocked;
   for (const [f, n] of Object.entries(v.flows)) {
    u.flow += n;
    const m = f.match(/^(.*)>(.*):(\w+)$/);
    (inflow[m[2]] || (inflow[m[2]] = E.zero()))[m[3]] += n;
   }
  }
 }
 const ranked = Object.entries(edges).filter(([k, u]) => u.blocked > 0 && world.edges[k] && !world.edges[k].removing).sort((a, b) => b[1].blocked - a[1].blocked || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k);
 return {
  span, ranked,
  rate: r => out[r] / span,
  util: k => edges[k] && edges[k].cap > 0 ? Math.min(1, edges[k].flow / edges[k].cap) : 0,
  flow: k => edges[k] ? edges[k].flow / span : 0,
  blocked: k => edges[k] ? edges[k].blocked / span : 0,
  rank: k => ranked.indexOf(k) + 1,
  inflow: (k, r) => (inflow[k]?.[r] || 0) / span,
  income: income / span,
  sales: (k, r) => (sales[k]?.[r] || 0) / span,
 };
}
function tileRate(t) {
 const S = world.stats; if (!S.length) return 0;
 const span = world.tick - S[0].tick + 1;
 return S.reduce((n, s) => n + (s.tiles[t.id] || 0), 0) / span;
}
function stateOf(t) {
 const b = t.building;
 if (b.paused) return '已暂停';
 if (b.type === 'sawmill' && t.loose.log < 1) return '等待原木';
 if (t.loose[E.OUTPUT[b.type]] >= E.YARD) return '堆场已满，停工';
 return '生产中';
}
function buyersOf(r, from) {
 return townKeys().filter(k => E.TOWNS[k].buys[r] && E.path(world, from, E.TOWNS[k].tile));
}
// A town is fed on a good when its per-tick rate is fully used: more supply cannot raise income,
// only expanding the town can.
function saturated(k, r, st = windowStats()) {
 return st.span >= 5 && st.sales(k, r) >= E.buys(world, k)[r].rate * .95;
}
// One sentence naming the layer that limits this building right now, or nothing.
function diagnose(t, st) {
 const b = t.building;
 if (!b || b.paused || b.type === 'town') return null;
 const edges = Object.values(world.edges).filter(e => !e.removing && (e.a === t.id || e.b === t.id));
 const ranked = edges.map(e => st.rank(e.id)).filter(Boolean).sort()[0];
 const roadNote = ranked ? `相连道路是扩容优先级第 ${ranked} 位。` : '';
 if (b.type === 'sawmill') {
  if (t.loose.log >= 1) return null;
  if (!edges.length) return {level:'warn', text:'没有道路，原木进不来。'};
  if (st.span < 5) return null;
  const need = E.rate(world, t), got = st.inflow(t.id, 'log');
  if (got >= need * .9) return null;
  const text = `原木到货 ${per(got)} 件/回合，加工需要 ${need} 件/回合。`;
  if (roadNote) return {level:'warn', text:text + roadNote};
  const camps = Object.values(world.tiles).filter(x => x.building?.type === 'camp' && E.path(world, x.id, t.id));
  if (!camps.length) return {level:'warn', text:'没有连接到任何伐木营。'};
  return {level:'warn', text:text + '伐木营产量不够：扩产、装设备，或再建一座。'};
 }
 const r = E.OUTPUT[b.type];
 if (t.loose[r] < E.YARD) return null;
 const buyers = buyersOf(r, t.id);
 if (!buyers.length) return {level:'warn', text:`堆场已满。没有连到收${names[r]}的地方。`};
 if (roadNote) return {level:'warn', text:'堆场已满。' + roadNote};
 if (buyers.every(k => saturated(k, r, st))) return {level:'warn', text:`堆场已满。${buyers.map(k => E.TOWNS[k].name).join('、')}的${names[r]}已喂饱：扩建城镇，或去下一座。`};
 return {level:'info', text:'堆场已满，货正在陆续运出。'};
}

const svg = $('map');
function hexPoints(x, y) {
 return Array.from({length:6}, (_, i) => {
  const a = (i * 60 - 30) * Math.PI / 180;
  return `${x + 50 * Math.cos(a)},${y + 50 * Math.sin(a)}`;
 }).join(' ');
}
function buildMap() {
 svg.innerHTML = `<g id="terrain">${Object.values(world.tiles).map(t => {
  const [x,y] = position(t);
  return `<g class="hex" data-tile="${t.id}" tabindex="0" role="button"><polygon class="ground" points="${hexPoints(x,y)}" fill="${colors[t.terrain]}"/><g class="tile-content" transform="translate(${x},${y})"></g></g>`;
 }).join('')}</g><g id="river" pointer-events="none"></g><g id="roads"></g><g id="freight" pointer-events="none"></g><g id="pops" pointer-events="none"></g><g id="preview" pointer-events="none"></g>`;
 let river = '';
 for (const a of Object.values(world.tiles)) for (const b of Object.values(world.tiles)) {
  if (a.q !== 0 || b.q !== 1 || !E.adjacent(a,b)) continue;
  const [x,y] = position(a), [u,v] = position(b);
  const mx = (x+u)/2, my = (y+v)/2, dx = (v-y)/Math.sqrt(3), dy = (u-x)/Math.sqrt(3);
  river += `<path d="M${mx-dx/2},${my+dy/2}L${mx+dx/2},${my-dy/2}" fill="none" stroke="#bbdaed" stroke-width="6" stroke-linecap="round"/>`;
 }
 $('river').innerHTML = river;
 for (const g of svg.querySelectorAll('[data-tile]')) {
  g.addEventListener('click', () => tileClick(g.dataset.tile));
  g.addEventListener('keydown', e => {
   if (['Enter',' '].includes(e.key)) { e.preventDefault(); suppressClick=false; tileClick(g.dataset.tile); }
  });
 }
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
// The map shows only what changes a decision: a building's yard when it holds something, a
// town's income and whether it is full, and the three roads most worth widening.
function renderMap() {
 const st = windowStats();
 for (const g of svg.querySelectorAll('[data-tile]')) {
  const t=world.tiles[g.dataset.tile], b=t.building;
  g.classList.toggle('selected', t.id===selected);
  g.classList.toggle('has-building', !!b);
  g.classList.toggle('legal', !!buildType && canPlace(buildType,t));
  g.classList.toggle('invalid', !!buildType && !canPlace(buildType,t));
  g.setAttribute('aria-label', `${b?.type==='town'?E.TOWNS[b.town].name:names[b?.type || t.terrain]} (${t.id})`);
  let content='';
  if (b?.type === 'town') {
   const town=E.TOWNS[b.town], earning=Object.entries(E.buys(world,b.town)).reduce((n,[r,d])=>n+st.sales(b.town,r)*d.price,0);
   const linked=connectedTowns().includes(b.town), full=Object.keys(town.buys).filter(r=>saturated(b.town,r,st));
   content=`${glyph('town',-16,-46,32,'')}<text y="-2" text-anchor="middle" class="tile-label">${town.name} Lv.${b.level+1}<tspan class="tile-status ${linked?'':'alert'}"> ${linked?`+${fmt(earning)}/回合`:'未连路'}</tspan></text>`;
   // Every good the town buys, its price per piece and how much demand is waiting: the core
   // decision of where to sell stays on the map.
   content+=Object.entries(E.buys(world,b.town)).map(([r,d],i)=>{
    const y=10+i*10,want=b.demand[r]/d.pool,fullNow=full.includes(r);
    return glyph(r,-27,y-7,8,'')+`<text x="-17" y="${y}" class="price-label">${d.price}</text><rect x="6" y="${y-6}" width="20" height="4" rx="1" class="demand-track"/><rect x="6" y="${y-6}" width="${Math.max(0,Math.min(1,want))*20}" height="4" rx="1" class="demand-fill ${fullNow?'alert':''}"/>`;
   }).join('');
  } else if (b) {
   const d=diagnose(t, st), r=E.OUTPUT[b.type];
   content=glyph(b.type,-16,-24,32,'');
   const stocks=[[r,t.loose[r],t.loose[r]>=E.YARD]];
   if (b.type==='sawmill'&&t.loose.log<1&&!b.paused) stocks.unshift(['log',0,true]);
   const shown=stocks.filter(([,n,alert])=>n>0||alert);
   const w=shown.length*30, x0=-w/2;
   content+=shown.map(([r,n,alert],i)=>glyph(r,x0+i*30,17,9,'')+`<text x="${x0+i*30+11}" y="24.5" class="tile-stock ${alert?'alert':''}">${n>0?n:'缺'}</text>`).join('');
   content+=`<text y="36" text-anchor="middle" class="tile-status">${b.paused?'已暂停':`${E.rate(world,t)} 件/回合`}</text>`;
   if (d?.level==='warn') content+='<circle cx="16" cy="-22" r="6" class="warn-dot"/><text x="16" y="-18.5" text-anchor="middle" fill="white" font-size="8" font-weight="700">!</text>';
  } else if (t.terrain==='mountain') {
   content=glyph('mountain',-16,-16,32,'#acb7c1');
  } else if (['dense','rich'].includes(t.terrain)) content='<text y="4" text-anchor="middle" class="terrain-label">×2</text>';
  g.querySelector('.tile-content').innerHTML=content;
 }
 $('roads').innerHTML=Object.values(world.edges).map(e => {
  const [x,y]=position(world.tiles[e.a]),[u,v]=position(world.tiles[e.b]);
  const length=Math.hypot(u-x,v-y),angle=Math.atan2(v-y,u-x)*180/Math.PI;
  const start=world.tiles[e.a].building ? .28 : 0, end=world.tiles[e.b].building ? .28 : 0;
  const rank=st.rank(e.id), flowing=st.flow(e.id)>0;
  return `<line x1="${x+(u-x)*start}" y1="${y+(v-y)*start}" x2="${u-(u-x)*end}" y2="${v-(v-y)*end}" class="road ${e.level?'expanded':''} ${e.removing?'removing':''} ${e.id===selectedEdge?'selected':''} ${rank?'rank'+rank:''} ${flowing?'flowing':''}"/><rect class="road-hit" x="${-length*.22}" y="-9" width="${length*.44}" height="18" transform="translate(${(x+u)/2},${(y+v)/2}) rotate(${angle})" data-edge="${e.id}" tabindex="0" role="button" aria-label="${E.river(world.tiles[e.a],world.tiles[e.b])?'桥梁':'道路'} (${e.a}) 到 (${e.b})${rank?' · 扩容优先级 '+rank:''}"/>`;
 }).join('');
 // Trucks: every shipment on a road is a dot the colour of its good, moved by how far the
 // current tick has advanced so the one-second hop reads as motion.
 const f=Math.max(0,Math.min(1,accumulator/E.DT));
 $('freight').innerHTML=world.shipments.filter(s=>s.edge).map(s=>{
  const[x,y]=position(world.tiles[s.from]),[u,v]=position(world.tiles[s.to]);
  return `<circle class="freight" cx="${x+(u-x)*f}" cy="${y+(v-y)*f}" r="3.5" fill="${colors[s.r]}" stroke="white" stroke-width="1"/>`;
 }).join('');
 // Production pops: once per tick, each building that made something shows +n rising away.
 if (world.tick!==popTick) {
  popTick=world.tick;const last=world.stats[world.stats.length-1];
  $('pops').innerHTML=last?Object.entries(last.tiles).map(([k,n])=>{const[x,y]=position(world.tiles[k]);return `<g class="pop" transform="translate(${x+14},${y-28})"><text text-anchor="middle" class="pop-text" fill="${colors[E.OUTPUT[world.tiles[k].building?.type]||'log']}">+${n}</text></g>`;}).join(''):'';
 }
 for (const hit of $('roads').querySelectorAll('[data-edge]')) {
  const select=()=>{if(suppressClick){suppressClick=false;return;} if(buildType||connectFrom)return;selectedEdge=hit.dataset.edge;selected=null;render();};
  hit.onclick=select;hit.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select();}};
 }
}
function button(label, command, primary=false, disabled=false) {
 return `<button data-command='${JSON.stringify(command)}' class="${primary?'primary':''}" ${disabled?'disabled':''}>${label}</button>`;
}
// Research lives in the toolbar next to the buildings, so every global upgrade is visible from the start.
function researchButton(key) {
 const u=E.RESEARCH[key];
 return world.research[key]?`<button class="research owned" disabled>${icon('check')}<span>${u.name}<small>${u.desc}</small></span></button>`:`<button class="research ${afford(u.cost)?'':'unaffordable'}" data-command='${JSON.stringify({type:'research',key})}'><span>${u.name}<small>${u.desc} · ${coins(u.cost)}</small></span></button>`;
}
function milestonesPanel(open=false) {
 const done=E.MILESTONES.filter(m=>world.milestones[m.id]).length;
 return `<details class="more" data-key="milestones" ${open?'open':''}><summary>里程碑 ${done} / ${E.MILESTONES.length}</summary><ul class="milestones">${E.MILESTONES.map(m=>`<li class="${world.milestones[m.id]?'done':''}"><span>${m.name}</span><small>+${m.reward}</small></li>`).join('')}</ul></details>`;
}
function townPanel(t) {
 const st=windowStats(), key=t.building.town, town=E.TOWNS[key], buys=E.buys(world,key), linked=connectedTowns().includes(key), b=t.building;
 const earning=Object.entries(buys).reduce((n,[r,d])=>n+st.sales(key,r)*d.price,0), next=E.townLevelCost(world,key);
 let html=`<h2>${icon('town','town-c')}${town.name}</h2><div class="subtitle">城镇 Lv.${b.level+1} · 每种货每回合收 ${b.level+1} 件</div><div class="state ${linked?'':'wait'}">${linked?'正在收购':'尚未连路'}</div><div class="coins"><span>来自本镇</span><b>+${fmt(earning)}</b><small>金币 / 回合</small></div>`;
 html+=`<h3>收购</h3><div class="contract">${Object.entries(buys).map(([r,d])=>{const s=st.sales(key,r),full=saturated(key,r,st);return `<div class="line"><span>${icon(r,r+'-c')}${names[r]}</span><b>${d.price} 金币/件</b><small class="${full?'warn':''}">${full?`已喂饱 · 每回合 ${d.rate} 件全部收下`:`收 ${per(s)} / ${d.rate} 件/回合 · 待收 ${b.demand[r]}`}</small></div>`;}).join('')}</div>`;
 html+=`<div class="actions">${button(`扩建城镇 Lv.${b.level+2}<small>${coins(next)} · 每种货每回合多收 1 件</small>`,{type:'townLevel',tile:t.id},true,!afford(next))}</div>`;
 return html;
}
function renderSelection() {
 const box=$('selection');
 const active=document.activeElement?.dataset.command;
 const wasOpen=new Map([...box.querySelectorAll('details')].map(d=>[d.dataset.key,d.open]));
 let html='';
 const e=world.edges[selectedEdge],t=world.tiles[selected],st=windowStats();
 if (e) {
  const bridge=E.river(world.tiles[e.a],world.tiles[e.b]),cap=E.capacity(world,e),rank=st.rank(e.id),up=E.upgradeCost(world,e);
  html=`<h2>${icon(bridge?'bridge':'road','quarry-c')}${bridge?'桥梁':'道路'}</h2><div class="subtitle">${e.level?'已扩容 · ':''}每回合 ${cap} 件</div><div class="state ${rank?'rank'+rank:''}">${e.removing?'等待在途货物通过后拆除':rank?`扩容优先级 第 ${rank} 位`:'运转正常'}</div><div class="metrics"><div><span>近 30 回合实际</span><b>${per(st.flow(e.id))} 件/回合</b></div>${rank?`<div><span>堵住的货</span><b class="rank${rank}">约 ${fmt(st.blocked(e.id))} 金币/回合</b></div>`:''}</div>`;
  html+='<div class="actions">';
  if (e.removing) html+=button('撤销拆除',{type:'restoreRoad',edge:e.id});
  else {
   if (!e.level) html+=button(`扩容道路<small>${coins(up)} · 每回合 ${E.ROAD_CAP[1]*(world.research.cart?2:1)} 件</small>`,{type:'upgrade',edge:e.id},true,!afford(up));
   else html+=button(`降级道路<small>退回 ${coins(e.upgradePaid/2)}</small>`,{type:'downgrade',edge:e.id});
   html+=button(`拆除道路<small>退回 ${coins((e.paid+e.upgradePaid)/2)}</small>`,{type:'removeRoad',edge:e.id});
  }
  html+='</div>';
 } else if (t?.building?.type==='town') {
  html=townPanel(t);
 } else if (t?.building) {
  const b=t.building,rate=E.rate(world,t),next=E.moduleCost(world,t),equip=E.equipmentCost(world),d=diagnose(t,st),r=E.OUTPUT[b.type];
  const paid=b.modules.reduce((n,m)=>n+m.paid,0)+(b.equipment?.paid||0), state=stateOf(t);
  html=`<h2>${icon(b.type,b.type+'-c')}${names[b.type]}</h2><div class="subtitle">${names[t.terrain]} · ${b.modules.length} 个模块${b.equipment?' · 设备 ×2':''}</div><div class="state ${state==='生产中'?'':'wait'}">${state}</div>${d?`<div class="diag ${d.level}">${d.text}</div>`:''}<div class="metrics"><div><span>产能</span><b>${rate} 件/回合</b></div><div><span>近 30 回合实际</span><b>${per(tileRate(t))} 件/回合</b></div><div><span>堆场 ${names[r]}</span><b class="${t.loose[r]>=E.YARD?'warn':''}">${t.loose[r]} / ${E.YARD}</b></div>${b.type==='sawmill'?`<div><span>堆场原木</span><b class="${t.loose.log<1?'warn':''}">${t.loose.log}</b></div>`:''}</div><div class="actions">${button(`扩产 +1 模块<small>${coins(next)} · 每回合多 ${rate/b.modules.length} 件</small>`,{type:'module',tile:t.id},true,!afford(next))}${!b.equipment?button(`高效设备<small>${coins(equip)} · 产能 ×2</small>`,{type:'equipment',tile:t.id},false,!afford(equip)):''}</div>`;
  html+=`<details class="more" data-key="manage"><summary>管理建筑</summary><div class="actions"><button id="connect-accessible">选择要连接的建筑</button>${button(b.paused?'恢复生产':'暂停生产',{type:'productionPause',tile:t.id})}${b.modules.length>1?button(`拆掉一个模块<small>退回 ${coins(b.modules[b.modules.length-1].paid/2)}</small>`,{type:'removeModule',tile:t.id}):''}${b.equipment?button(`拆下设备<small>退回 ${coins(b.equipment.paid/2)}</small>`,{type:'removeEquipment',tile:t.id}):''}${button(`拆除建筑<small>退回 ${coins(paid/2)}</small>`,{type:'demolish',tile:t.id})}</div></details>`;
 } else if (t) {
  const type=['forest','dense'].includes(t.terrain)?'camp':['rock','rich'].includes(t.terrain)?'quarry':'sawmill',cost=E.buildingCost(world,type);
  html=`<div class="empty-state"><h2>${names[t.terrain]}${['dense','rich'].includes(t.terrain)?' · 产量 ×2':''}</h2><p>${t.terrain==='mountain'?'道路会自动绕过山地。':`可以建${names[type]}。`}</p></div>`;
  if(t.terrain!=='mountain')html+=`<div class="actions">${button(`建造${names[type]}<small>${coins(cost)}</small>`,{type:'build',tile:t.id,buildType:type},true,!afford(cost))}</div>`;
 } else html='<div class="empty-state"><h2>点选建筑、道路或城镇</h2></div>'+milestonesPanel(true);
 box.innerHTML=html;
 for(const d of box.querySelectorAll('details'))if(wasOpen.has(d.dataset.key))d.open=wasOpen.get(d.dataset.key);
 bindCommands(box);
 if($('connect-accessible'))$('connect-accessible').onclick=()=>{connectFrom=t.id;buildType=null;render();};
 if(active)[...box.querySelectorAll('[data-command]')].find(b=>b.dataset.command===active)?.focus({preventScroll:true});
}
function renderGoals() {
 const st=windowStats(), linked=connectedTowns();
 let c;
 if (!linked.length) c=`<b>第一步</b><span>按住采石场拖到西镇（${coins(E.connection(world,'-1,0','-3,1').cost)}）。连上后石头和原木自动卖出。</span>`;
 else {
  const unlinked=townKeys().filter(k=>!linked.includes(k));
  const parts=linked.map(k=>{const b=E.buys(world,k);const earning=Object.entries(b).reduce((n,[r,d])=>n+st.sales(k,r)*d.price,0);const full=Object.keys(b).filter(r=>saturated(k,r,st));return `${E.TOWNS[k].name} +${fmt(earning)}/回合${full.length?`<em class="warn">（${full.map(r=>names[r]).join('、')}已满）</em>`:''}`;});
  c=`<b>收入 ${fmt(st.income)} 金币/回合</b><span>${parts.join(' · ')}</span>${unlinked.length?`<span class="reward">未连接：${unlinked.map(k=>E.TOWNS[k].name+'（'+Object.keys(E.TOWNS[k].buys).map(r=>names[r]).join('/')+'）').join('、')}</span>`:''}`;
 }
 const next=E.MILESTONES.find(m=>!world.milestones[m.id]);
 $('contract-strip').innerHTML=c;
 $('milestone-strip').innerHTML=next?`<span>下一目标</span><b>${next.name}</b><small>+${next.reward} 金币</small>`:'<b>全部里程碑已完成</b>';
}
function render() {
 const stock=E.totals(world), st=windowStats();
 $('totals').innerHTML=`<div class="resource coins"><span>${icon('coin','coin-c')}金币</span><strong>${world.money.toLocaleString('zh-CN')}</strong><small>+${fmt(st.income)}/回合</small></div>`+E.RES.map(r=>`<div class="resource"><span>${icon(r,r+'-c')}${names[r]}</span><strong>${fmt(stock[r])}</strong><small>+${per(st.rate(r))}/回合</small></div>`).join('');
 $('pause').textContent=world.paused?'继续':'暂停';$('speed').textContent=speed+'×';
 $('research').innerHTML=Object.keys(E.RESEARCH).map(researchButton).join('');bindCommands($('research'));
 $('cancel').hidden=!buildType&&!connectFrom;
 $('hint').textContent=buildType?`将${names[buildType]}放到高亮格子，松开立即建成`:connectFrom?'选择另一座建筑或城镇，立即连接道路':'拖建筑到地图即可建造 · 从建筑拖到另一处即可连路 · 红、橙、黄道路是最值得扩容的三段 · 1 回合 = 2 秒';
 for(const b of document.querySelectorAll('[data-build]')){
  b.classList.toggle('active',b.dataset.build===buildType);
  b.setAttribute('aria-pressed',b.dataset.build===buildType?'true':'false');
  b.querySelector('small').textContent=coins(E.buildingCost(world,b.dataset.build));
  b.classList.toggle('unaffordable',!afford(E.buildingCost(world,b.dataset.build)));
 }
 svg.classList.toggle('connecting',!!connectFrom||!!buildType||gesture?.kind==='connect');
 renderGoals();renderMap();renderSelection();
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
 if(tile && tile!==from && world.tiles[tile].building){
  const reason=E.linkReason(world,from,tile);
  if(reason){const[x,y]=position(world.tiles[from]),[u,v]=position(world.tiles[tile]);$('preview').innerHTML=`<line x1="${x}" y1="${y}" x2="${u}" y2="${v}" class="preview invalid"/>`;$('drag-label').textContent='不能连接：'+reason;$('drag-label').classList.add('bad');return;}
  try{
   const route=E.connection(world,from,tile),points=route.tiles.map(k=>position(world.tiles[k]).join(',')).join(' ');
   $('preview').innerHTML=`<polyline points="${points}" class="preview ${afford(route.cost)?'':'invalid'}"/>`;
   const rough=route.segments.filter(s=>s.factor>1).length;
   $('drag-label').textContent=route.segments.length?`${afford(route.cost)?'松开连接':'金币不足'} · ${route.segments.length} 段 ${coins(route.cost)}${route.bridges?' · 含桥梁 ×3':''}${rough?` · ${rough} 段林地/岩地加价`:''}`:'已有道路相连';
  }catch(error){$('preview').innerHTML='';$('drag-label').textContent=error.message;}
 }else{
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const[x,y]=position(world.tiles[from]);
  $('preview').innerHTML=`<line x1="${x}" y1="${y}" x2="${p.x}" y2="${p.y}" class="preview"/>`;
  $('drag-label').textContent='拖到另一座建筑或城镇';
 }
}
document.addEventListener('pointerdown',()=>{interacting=true;suppressClick=false;},true);
document.addEventListener('pointerup',()=>{setTimeout(()=>{interacting=false;},0);},true);
for(const button of document.querySelectorAll('[data-build]')){
 button.onpointerdown=event=>{
  if(event.button!==0)return;
  gesture={kind:'build',type:button.dataset.build,x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId};
  button.setPointerCapture(event.pointerId);
 };
 button.onclick=()=>{
  if(suppressClick){suppressClick=false;return;}
  buildType=buildType===button.dataset.build?null:button.dataset.build;connectFrom=null;render();
 };
}
svg.addEventListener('pointerdown',event=>{
 if(event.button!==0||buildType||connectFrom)return;
 const tile=event.target.closest('[data-tile]')?.dataset.tile;
 if(!world.tiles[tile]?.building)return;
 gesture={kind:'connect',from:tile,x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId};
 svg.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 if(!gesture||event.pointerId!==gesture.pointerId)return;
 if(!gesture.moved&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>6){
  gesture.moved=true;
  if(gesture.kind==='build'){buildType=gesture.type;connectFrom=null;render();}
  else svg.classList.add('connecting');
 }
 if(gesture.moved){event.preventDefault();preview(event);}
},{passive:false});
document.addEventListener('pointerup',event=>{
 if(!gesture||event.pointerId!==gesture.pointerId)return;
 const finished=gesture;gesture=null;
 $('drag-label').style.display='none';$('preview').innerHTML='';
 if(!finished.moved){
  if(finished.kind==='connect'){selected=finished.from;selectedEdge=null;suppressClick=true;render();}
  return;
 }
 suppressClick=true;
 const tile=tileAt(event.clientX,event.clientY);
 if(finished.kind==='build'){
  if(tile)place(finished.type,tile);else{buildType=null;render();}
 }else if(tile&&tile!==finished.from&&world.tiles[tile].building)connect(finished.from,tile);
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
 a.download='tracks-trade-v10.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try{
  if(file.size>10e6)throw Error('文件过大');
  const loaded=E.load(JSON.parse(await file.text()));
  if(!confirm('用这份存档替换当前进度？'))return;
  world=loaded;selected='0,0';selectedEdge=null;storageBlocked=false;
  accumulator=0;last=performance.now();save();cancelGesture();toast('已恢复存档');
 }catch(error){toast('导入失败：'+error.message);}finally{event.target.value='';}
};
$('reset').onclick=()=>{
 if(!confirm('重新开始？可先导出当前进度。'))return;
 world=E.newWorld();selected='0,0';selectedEdge=null;storageBlocked=false;
 accumulator=0;last=performance.now();save();cancelGesture();
};
document.addEventListener('visibilitychange',()=>{accumulator=0;last=performance.now();if(document.hidden){save();if(gesture)cancelGesture();}});
window.addEventListener('pagehide',save);
buildMap();render();if(welcome)toast(welcome);if(!storageBlocked)save();
// One tick per E.DT seconds at 1x. The map is repainted a few times a second so the tick reads as a beat.
setInterval(()=>{
 const now=performance.now(),elapsed=Math.min(.5,(now-last)/1000);last=now;
 if(!document.hidden&&!world.paused){
  accumulator+=elapsed*speed;
  const before=Object.keys(world.milestones);
  let ticked=false;
  while(accumulator>=E.DT){E.tick(world);accumulator-=E.DT;ticked=true;}
  const fresh=Object.keys(world.milestones).filter(k=>!before.includes(k));
  if(fresh.length){const m=E.MILESTONES.find(m=>m.id===fresh[0]);toast(`里程碑「${m.name}」达成，+${m.reward} 金币`);}
  if(world.tick-lastSave>=5)save();
  if(!gesture&&!interacting&&(ticked||now-lastPaint>=100)){render();lastPaint=now;}
 }
},100);
