'use strict';
const css = getComputedStyle(document.documentElement);
const value = token => css.getPropertyValue(`--${token}`).trim();
const luminance = hex => {
  const c = hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const neutral = [
  ['surface-canvas','画布','整体环境底色'],['surface-panel','面板','顶栏、详情、弹层'],['surface-inset','内嵌区域','分组、轨道、禁用底色'],['surface-map','地图衬底','浅绿托起鲜彩板块'],
  ['text-primary','主要文字','余额、标题、关键结论'],['text-secondary','次级文字','说明、单位、时间窗口'],['text-disabled','禁用文字','仍然可读的锁定原因'],
  ['border-subtle','分隔边界','装饰性分组，不作控件边界'],['border-control','控件边界','按钮、输入与轮廓']
];
const semantic = [
 ['action-primary','主操作','默认 / 选中 / 焦点'],['action-hover','悬停','可交互时加深'],['action-pressed','按下','按下时进一步加深'],['action-subtle','选中背景','配主操作色描边'],
 ['value-warning','价值损失','深色文字与图标'],['value-warning-bg','损失底色','仅在诊断区域使用'],['bottleneck-1','排名 #1 文字','配红色路芯'],['bottleneck-2','排名 #2 文字','配橙色路芯'],['bottleneck-3','排名 #3 文字','配黄色路芯'],
 ['rank-1-fill','排名 #1 路芯','必须配深色编号'],['rank-2-fill','排名 #2 路芯','必须配深色编号'],['rank-3-fill','排名 #3 路芯','必须配深色编号'],['road-base','普通道路','实线表示已建道路'],['terrain-detail','植被细节','深绿树冠与地形纹理'],['building-roof','建筑屋顶','实体建筑的陶红细节'],['focus-ring','键盘焦点','3px 外轮廓，留出间隔']
];
function swatches(target,items){
 document.getElementById(target).innerHTML=items.map(([token,name,use])=>{
  const color=value(token),dark=value('text-primary'),light=value('surface-panel');
  const ink=contrast(color,dark)>=4.5?dark:contrast(color,light)>=4.5?light:'#000000';
  return `<button class="swatch" data-token="${token}" aria-label="复制 ${name} ${color}"><div class="swatch-color" style="background:${color};color:${ink}"><span>${color.toUpperCase()}</span><span aria-hidden="true">⧉</span></div><div class="swatch-info"><b>${name}</b><code>--${token}</code><small>${use}</small></div></button>`;
 }).join('');
}
swatches('neutral-swatches',neutral);swatches('semantic-swatches',semantic);
let toastTimer;
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-token]');if(!button)return;
 const token=button.dataset.token,text=`--${token}: ${value(token)};`,toast=document.getElementById('copy-status');
 toast.textContent=`${text}（正在复制，也可手动复制）`;toast.classList.add('visible');
 try{await navigator.clipboard.writeText(text);toast.textContent=`已复制 ${text}`;}catch{toast.textContent=`请手动复制：${text}`;}
 toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),4500);
});
const terrains=[['grass','草地','⌁'],['forest','森林','♧'],['rock','岩地','◇'],['ore','铁矿','◈'],['mountain','山地','△'],['lake','湖泊','≈'],['town','城镇','⌂'],['fog','迷雾','?']];
document.getElementById('terrain-swatches').innerHTML=terrains.map(([token,name,icon])=>`<div class="terrain-item"><div class="terrain-chip" style="background:var(--terrain-${token})" aria-hidden="true">${icon}</div><b>${name}</b><code>${value('terrain-'+token).toUpperCase()}</code></div>`).join('');
document.getElementById('goods-list').innerHTML=[['log','原木','◉'],['board','木板','▤'],['stone','石头','◆'],['tool','石头工具','⚒'],['ore','铁矿石','▲'],['iron','铁','▰']].map(([token,name,icon])=>`<div class="good"><i style="color:var(--goods-${token})" aria-hidden="true">${icon}</i><span>${name}<code>${value('goods-'+token).toUpperCase()}</code></span></div>`).join('');
const pairs=[['主要文字 / 纸白面板','text-primary','surface-panel'],['次级文字 / 画布','text-secondary','surface-canvas'],['禁用文字 / 内嵌底色','text-disabled','surface-inset'],['按钮文字 / 主操作','surface-panel','action-primary'],['按钮文字 / 悬停','surface-panel','action-hover'],['按钮文字 / 按下','surface-panel','action-pressed'],['价值损失 / 浅琥珀底','value-warning','value-warning-bg'],['排名 #1 / 纸白面板','bottleneck-1','surface-panel'],['排名 #2 / 纸白面板','bottleneck-2','surface-panel'],['排名 #3 / 纸白面板','bottleneck-3','surface-panel'],['控件边界 / 面板','border-control','surface-panel',3],['焦点轮廓 / 画布','focus-ring','surface-canvas',3]];
document.getElementById('contrast-rows').innerHTML=pairs.map(([label,fg,bg,target=4.5])=>{const ratio=contrast(value(fg),value(bg));return `<tr data-ratio="${ratio}" data-target="${target}"><td>${label}</td><td>${ratio.toFixed(2)} : 1</td><td>${ratio>=target?'✓ 达标':'需调整'} · ${target}:1</td></tr>`;}).join('');
const scenes={
 normal:{title:'伐木营',sub:'森林 · 原木生产',status:'● 生产中 · 每回合 3 件',label:'原木堆场',metric:'12 / 20',width:'60%',diagnosis:'货物正在送往城镇，当前产线运转正常。',action:'查看运输路线',secondary:'手工生产 +1 原木'},
 warning:{title:'伐木营',sub:'森林 · 原木生产',status:'△ 堆场已满 · 生产暂停',label:'原木堆场',metric:'20 / 20',width:'100%',diagnosis:'原木堆场已满。连接新的收购城镇，为库存增加出口。',action:'查看收购城镇',secondary:'检查现有运输路线'},
 bottleneck:{title:'驴道',sub:'伐木营 → 城镇 · 道路详情',status:'#1 首要瓶颈 · 运力已用满',label:'当前运力',metric:'4 件 / 回合',width:'100%',diagnosis:'先分流或升级运力，让更多货物抵达城镇。',action:'预览第二条路线',secondary:'比较石头路与货运马车'}
};
let currentScene='normal';
let demoStock=12;
const points=(x,y,r)=>Array.from({length:6},(_,i)=>{const angle=(60*i-30)*Math.PI/180;return `${x+r*Math.cos(angle)},${y+r*Math.sin(angle)}`;}).join(' ');
function drawMap(scene,alternate=false){
 const svg=document.getElementById('demo-map');let tiles='';
 const kinds=['fog','grass','forest','grass','fog','rock','forest','grass','town','fog','mountain','grass','lake','grass','fog'];
 for(let row=0;row<3;row++)for(let col=0;col<5;col++){
  const x=115+col*92+(row%2)*46,y=87+row*80,kind=kinds[row*5+col];
  tiles+=`<polygon points="${points(x,y+5,51)}" fill="var(--road-base)" opacity=".24"/><polygon points="${points(x,y,51)}" fill="var(--terrain-${kind})" stroke="var(--surface-panel)" stroke-width="2.5"/>`;
  if(kind==='grass')tiles+=`<path d="M${x-20} ${y+7}l3 -8 3 8 m16 -14 3 -8 3 8 m-11 29 3 -8 3 8" fill="none" stroke="var(--terrain-detail)" stroke-width="2" opacity=".4"/>`;
  if(kind==='forest')tiles+=`<path d="M${x-9} ${y+2} l9 -20 9 20z M${x} ${y+2}v8" fill="var(--terrain-detail)"/>`;
  if(kind==='lake')tiles+=`<path d="M${x-22} ${y-6}q6 -5 12 0t12 0t12 0 M${x-18} ${y+8}q6 -5 12 0t12 0t12 0" fill="none" stroke="var(--surface-panel)" stroke-width="3"/>`;
  if(kind==='mountain')tiles+=`<text x="${x}" y="${y+8}" text-anchor="middle" font-size="30">△</text>`;
  if(kind==='fog')tiles+=`<text x="${x}" y="${y+5}" text-anchor="middle" font-size="15">?</text>`;
 }
 const path='M253 167 L345 167 L437 167';
 const route=scene==='bottleneck'?'rank-1-fill':'road-base';
 svg.innerHTML=tiles+(scene==='bottleneck'?`<path d="${path}" fill="none" stroke="var(--action-primary)" stroke-width="20" stroke-linecap="round"/>`:'')+`<path d="${path}" fill="none" stroke="var(--surface-panel)" stroke-width="14" stroke-linecap="round"/><path d="${path}" fill="none" stroke="var(--${route})" stroke-width="7" stroke-linecap="round"/>`+
 (scene==='bottleneck'?`<rect x="328" y="136" width="34" height="22" rx="6" fill="var(--surface-panel)"/><text x="345" y="151" text-anchor="middle" font-size="12" style="fill:var(--bottleneck-1)">#1</text>`:'')+
 (scene!=='bottleneck'?`<polygon points="${points(253,167,51)}" fill="none" stroke="var(--surface-panel)" stroke-width="7"/><polygon points="${points(253,167,51)}" fill="none" stroke="var(--action-primary)" stroke-width="3"/>`:'')+
 `<text x="253" y="162" text-anchor="middle" font-size="29">♧</text><rect x="423" y="143" width="28" height="27" rx="2" fill="var(--surface-panel)"/><path d="M419 145l18 -19 18 19z" fill="var(--building-roof)"/><rect x="434" y="154" width="7" height="16" fill="var(--road-base)"/><rect x="215" y="180" width="76" height="24" rx="5" fill="var(--surface-panel)"/><text x="253" y="196" text-anchor="middle" font-size="12">伐木营</text><rect x="407" y="183" width="60" height="24" rx="5" fill="var(--surface-panel)"/><text x="437" y="199" text-anchor="middle" font-size="12">城镇</text>`+
 [304,367,396].map(x=>`<circle cx="${x}" cy="167" r="5" fill="var(--goods-log)" stroke="var(--surface-panel)" stroke-width="2"/>`).join('')+
 (scene==='warning'?`<rect x="208" y="218" width="91" height="26" rx="6" fill="var(--value-warning-bg)"/><text x="253" y="235" text-anchor="middle" font-size="12" style="fill:var(--value-warning)">△ 满仓 20/20</text>`:'')+
 (alternate?`<path d="M253 167 L299 247 L391 247 L437 167" fill="none" stroke="var(--surface-panel)" stroke-width="8"/><path d="M253 167 L299 247 L391 247 L437 167" fill="none" stroke="var(--action-primary)" stroke-width="3" stroke-dasharray="7 5"/>`:'');
}
function setScene(name){
 currentScene=name;demoStock=12;const s=scenes[name];
 document.querySelectorAll('[data-scene]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scene===name)));
 for(const [id,key] of [['scene-title','title'],['scene-subtitle','sub'],['scene-status','status'],['metric-label','label'],['metric-value','metric'],['scene-diagnosis','diagnosis'],['scene-action','action'],['scene-secondary','secondary']])document.getElementById(id).textContent=s[key];
 document.getElementById('scene-status').className=`status-box ${name}`;
 document.getElementById('scene-meter').style.width=s.width;
 document.getElementById('scene-meter').style.background=`var(--${name==='normal'?'road-base':name==='warning'?'value-warning':'rank-1-fill'})`;
 document.getElementById('demo-feedback').textContent=`当前示例：${s.status}。${s.diagnosis}`;drawMap(name);
}
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>setScene(button.dataset.scene)));
document.querySelector('[data-show-warning]').addEventListener('click',()=>setScene('warning'));
document.getElementById('scene-action').addEventListener('click',()=>{drawMap(currentScene,true);document.getElementById('demo-feedback').textContent='◎ 路线预览：钴蓝虚线表示待确认路线，实线表示已有道路。示例不会扣除金币。';});
document.getElementById('scene-secondary').addEventListener('click',()=>{
 const feedback=document.getElementById('demo-feedback');
 if(currentScene==='normal'){const previous=demoStock;demoStock=Math.min(20,demoStock+1);if(demoStock===20){setScene('warning');feedback.textContent='手工生产示例：库存达到 20 / 20，切换到满仓状态。';}else{document.getElementById('metric-value').textContent=`${demoStock} / 20`;document.getElementById('scene-meter').style.width=`${demoStock*5}%`;feedback.textContent=`手工生产示例：原木库存 ${previous} → ${demoStock}。普通库存变化保持墨色。`;}}
 else if(currentScene==='warning'){drawMap(currentScene,true);feedback.textContent='检查路线示例：寻找新的收购出口，避免只增加产能。';}
 else feedback.textContent='升级比较：石头路 12 件/回合；货运马车让当前道路运力 ×2。道路科技购买后全图生效。';
});
document.querySelector('.state-sample').addEventListener('click',()=>{const toast=document.getElementById('copy-status');toast.textContent='主操作示例：悬停、按下与键盘焦点使用同一钴蓝色系。';toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),4500);});
const links=[...document.querySelectorAll('.page-sections a')];
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){links.forEach(a=>{const selected=a.hash==='#'+entry.target.id;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-5% 0px -65% 0px'});
links.forEach(a=>observer.observe(document.querySelector(a.hash)));drawMap('normal');
