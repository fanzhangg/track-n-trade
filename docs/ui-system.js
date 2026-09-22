'use strict';
const css = getComputedStyle(document.documentElement);
const value = token => css.getPropertyValue(`--${token}`).trim();
const luminance = hex => {
  const c = hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const neutral = [
  ['surface-canvas','画布','整体环境底色'],['surface-panel','面板','顶栏、详情、弹层'],['surface-inset','内嵌区域','分组、轨道、禁用底色'],['surface-map','地图衬底','中性浅灰衬托鲜明地形'],
  ['text-primary','主要文字','余额、标题、关键结论'],['text-secondary','次级文字','说明、单位、时间窗口'],['text-disabled','禁用文字','仍然可读的锁定原因'],
  ['border-subtle','分隔边界','装饰性分组，不作控件边界'],['border-control','控件边界','按钮、输入与轮廓']
];
const semantic = [
 ['action-primary','主操作','默认 / 选中 / 焦点'],['action-hover','悬停','可交互时加深'],['action-pressed','按下','按下时进一步加深'],['action-subtle','选中背景','配主操作色描边'],
 ['value-warning','价值损失','深色文字与图标'],['value-warning-bg','损失底色','仅在诊断区域使用'],
 ['road-dirt','砂色道路','连续曲线与路口填面'],['road-base','道路与进度','保留基础材质色'],['terrain-detail','植被细节','深绿树冠与地形纹理'],['building-roof','建筑屋顶','实体建筑的陶红细节'],['focus-ring','键盘焦点','3px 外轮廓，留出间隔']
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
const terrains=[['grass','草地','⌁'],['forest','森林','♧'],['rock','岩地','◇'],['ore','铁矿','◈'],['mountain','山地','△'],['lake','湖泊','≈'],['town','城镇','⌂'],['fog','迷雾 · 买得起','?'],['fog-costly','迷雾 · 买不起','?']];
document.getElementById('terrain-swatches').innerHTML=terrains.map(([token,name,icon])=>`<div class="terrain-item"><div class="terrain-chip" style="background:var(--terrain-${token})" aria-hidden="true">${icon}</div><b>${name}</b><code>${value('terrain-'+token).toUpperCase()}</code></div>`).join('');
document.getElementById('goods-list').innerHTML=[['log','原木','◉'],['board','木板','▤'],['stone','石头','◆'],['tool','石头工具','⚒'],['ore','铁矿石','▲'],['iron','铁','▰']].map(([token,name,icon])=>`<div class="good">${TradeIcons.icon(token,{base:'../assets/icons/v1/',size:24,decorative:true})}<span>${name}<code>${value('goods-'+token).toUpperCase()}</code></span></div>`).join('');
const pairs=[['主要文字 / 暖白面板','text-primary','surface-panel'],['次级文字 / 画布','text-secondary','surface-canvas'],['禁用文字 / 内嵌底色','text-disabled','surface-inset'],['按钮文字 / 主操作','surface-panel','action-primary'],['按钮文字 / 悬停','surface-panel','action-hover'],['按钮文字 / 按下','surface-panel','action-pressed'],['价值损失 / 浅琥珀底','value-warning','value-warning-bg'],['控件边界 / 面板','border-control','surface-panel',3],['焦点轮廓 / 画布','focus-ring','surface-canvas',3],['板块文字 / 买得起雾色','text-primary','terrain-fog'],['板块文字 / 买不起雾色','text-disabled','terrain-fog-costly']];
document.getElementById('contrast-rows').innerHTML=pairs.map(([label,fg,bg,target=4.5])=>{const ratio=contrast(value(fg),value(bg));return `<tr data-ratio="${ratio}" data-target="${target}"><td>${label}</td><td>${ratio.toFixed(2)} : 1</td><td>${ratio>=target?'✓ 达标':'需调整'} · ${target}:1</td></tr>`;}).join('');
const links=[...document.querySelectorAll('.page-sections a')];
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){links.forEach(a=>{const selected=a.hash==='#'+entry.target.id;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-5% 0px -65% 0px'});
links.forEach(a=>observer.observe(document.querySelector(a.hash)));
