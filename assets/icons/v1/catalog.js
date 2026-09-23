/* Semantic identifiers are stable; source filenames live in sources.json. */
(function (root) {
 'use strict';
 const items = [
{"id": "charcoal", "name": "木炭", "group": "goods", "file": "charcoal", "cue": "深灰切面炭块", "use": "扩展生产链"},{"id": "paper", "name": "纸张", "group": "goods", "file": "paper", "cue": "暖白叠页", "use": "扩展生产链"},{"id": "book", "name": "书籍", "group": "goods", "file": "book", "cue": "蓝灰书封与暖白书页", "use": "扩展生产链"},{"id": "machine", "name": "机械", "group": "goods", "file": "machine", "cue": "金属齿轮与底座", "use": "扩展生产链"},{"id": "kiln", "name": "炭窑", "group": "building", "file": "kiln", "cue": "圆窑、烟囱与炭堆", "use": "扩展生产链"},{"id": "paperMill", "name": "造纸坊", "group": "building", "file": "paperMill", "cue": "晾纸架与浅色纸堆", "use": "扩展生产链"},{"id": "printer", "name": "印刷坊", "group": "building", "file": "printer", "cue": "压印机与蓝色书本", "use": "扩展生产链"},{"id": "machineWorks", "name": "机械厂", "group": "building", "file": "machineWorks", "cue": "齿轮、厂房与高烟囱", "use": "扩展生产链"},
  {id:'camp',name:'伐木营',group:'building',file:'camp',cue:'原木堆与木架、树桩和斧头',use:'森林上的原木生产点'},
  {id:'quarry',name:'采石场',group:'building',file:'quarry',cue:'阶梯岩壁、吊架与切割石块',use:'岩地上的石头生产点'},
  {id:'sawmill',name:'锯木厂',group:'building',file:'sawmill',cue:'圆锯、进料原木与出料板材',use:'原木 → 木板'},
  {id:'mason',name:'石匠铺',group:'building',file:'mason',cue:'石制工作台与成品石锤',use:'原木 + 石头 → 石头工具'},
  {id:'mine',name:'矿山',group:'building',file:'mine',cue:'矿洞、短轨与装矿小车',use:'铁矿地形上的铁矿石生产点'},
  {id:'smelter',name:'铁厂',group:'building',file:'smelter',cue:'炉膛、浇铸槽与成品铁锭',use:'铁矿石 + 原木 → 铁'},
  {id:'town',name:'城镇',group:'building',file:'town',cue:'蓝白棚顶、交易柜台与货箱',use:'收购货物的目的地'},
  {id:'worker',name:'工人',group:'people',file:'worker',cue:'蓝灰三切面 meeple 棋子',use:'放在生产建筑板块上的自动生产单位'},
  {id:'resident',name:'居民',group:'people',file:'resident',cue:'陶土三切面 meeple 棋子',use:'放在城镇板块上的收购人口'},
  {id:'log',name:'原木',group:'goods',file:'log',cue:'圆形端面、单根原木',use:'三条加工链的共同输入'},
  {id:'board',name:'木板',group:'goods',file:'board',cue:'平直边缘、三层板材',use:'与圆截面的原木区分'},
  {id:'stone',name:'石头',group:'goods',file:'stone',cue:'浅灰、宽底、钝角岩块',use:'与尖锐的铁矿石区分'},
  {id:'tool',name:'石头工具',group:'goods',file:'tool',cue:'宽石锤头与短木柄',use:'石匠铺产物，不能用于拆除按钮'},
  {id:'ore',name:'铁矿石',group:'goods',file:'ore',cue:'深蓝灰、尖角、竖向岩簇',use:'原料；不能直接出售给城镇'},
  {id:'iron',name:'铁',group:'goods',file:'iron',cue:'蓝灰、规则梯形金属块',use:'炼制成品，与天然矿石区分'},
  {id:'coin',name:'金币',group:'economy',file:'coin',cue:'圆形金币与菱形压印',use:'唯一全局货币'},
  {id:'tree',name:'森林',group:'world',file:'tree',cue:'三层绿色树冠',use:'地形与伐木科技辅助图示'},
  {id:'axe',name:'伐木',group:'world',file:'axe',cue:'单侧宽刃',use:'伐木营紧凑视图'},
  {id:'pickaxe',name:'采掘',group:'world',file:'pickaxe',cue:'双端尖镐',use:'采石场紧凑视图'},
  {id:'cart',name:'货运马车',group:'world',file:'cart',cue:'开放货斗与大木轮',use:'全局运力 ×2；不代表手动运输单位'},
  {id:'rail',name:'铁路',group:'world',file:'rail',cue:'双轨与四根枕木',use:'全局道路科技'},
  {id:'waterway',name:'航道',group:'world',file:'waterway',cue:'开口船舱与横放船桨',use:'允许经过湖泊；不新增船只单位'}
 ];
 const controls = [['pause','暂停'],['right','继续'],['fastForward','速度'],['plus','增加'],['cross','取消'],['checkmark','已购买'],['exclamation','需关注'],['locked','未解锁'],['gear','科技'],['question','探索'],['import','导入'],['export','导出']].map(([file,name])=>({id:file==='right'?'ui-play':'ui-'+file,name,group:'control',file,cue:'单色实心轮廓',use:'操作或状态，始终配可访问名称'}));
 const catalog = [...items,...controls];
 const lookup = Object.fromEntries(catalog.map(item=>[item.id,item]));
 const escape = value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function metadata(id){const meta=root.TradeIconSources?.assets.find(a=>a.id===id);if(!meta)throw new Error('Missing icon source: '+id);return meta;}
 function artwork(id,base){
  const meta=metadata(id),b=meta.bounds,s=.82/Math.max(b.width,b.height);
  return `<img src="${escape(base+meta.file+'?v=redrawn2')}" alt="" draggable="false" style="width:${meta.width*s*100}%;height:${meta.height*s*100}%;left:${(.5-(b.x+b.width/2)*s)*100}%;top:${(.5-(b.y+b.height/2)*s)*100}%">`;
 }
 function icon(id,{base='../assets/icons/v1/',size=64,decorative=false}={}){
  const item=lookup[id];if(!item)throw new Error('Unknown icon: '+id);
  const label=decorative?'aria-hidden="true"':`role="img" aria-label="${escape(item.name)}"`;
  return `<span class="tt-icon ${item.group==='control'?'tt-control':''}" style="--icon-size:${Number(size)}px" ${label}>${artwork(id,base)}</span>`;
 }
 function svgIcon(id,{base='assets/icons/v1/',x=0,y=0,size=48}={}){
  if(!lookup[id])throw new Error('Unknown icon: '+id);
  const meta=metadata(id),b=meta.bounds,s=52.48/Math.max(b.width,b.height);
  return `<g class="tt-map-icon" aria-hidden="true" pointer-events="none" transform="translate(${Number(x)} ${Number(y)}) scale(${Number(size)/64})"><image href="${escape(base+meta.file+'?v=redrawn2')}" x="${32-(b.x+b.width/2)*s}" y="${32-(b.y+b.height/2)*s}" width="${meta.width*s}" height="${meta.height*s}"/></g>`;
 }
 root.TradeIcons={catalog,icon,svgIcon};
})(window);
