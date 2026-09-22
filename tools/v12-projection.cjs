// v0.12 收益预测：按购买计划逐回合模拟一位「合理玩家」的前一小时。
// 不是引擎，只是把每个阶段的收入速率和支出串起来，看节奏对不对。
// 用法：node tools/v12-projection.cjs
const ROUND_SEC=2;              // 1× 速度一回合 2 秒
const CLICK_PER_SEC=3;          // 玩家手点节奏（件/秒），只在没工人时算
const P={log:20,stone:30,board:50,tool:120,iron:150};
const plan=[
 // [名称, 价格, 生效函数(state)]
 ['解锁 F1（城镇收原木 20）',500,s=>{s.town.log=2;}],
 ['修路 伐木营→F1 城镇 2 段',500,s=>{s.road=true;}],
 ['伐木工 #1',400,s=>{s.w.camp=1;}],
 ['伐木工 #2',520,s=>{s.w.camp=2;}],
 ['解锁 F2（城镇收石头 30）',2000,s=>{s.town.stone=2;}],
 ['科技 采石场',1200,s=>{}],
 ['建 采石场',1600,s=>{s.b.quarry=1;}],
 ['修路 F0 采石场→F2 城镇 4 段（岩地 ×2）',1500,s=>{}],
 ['采石工 #1',600,s=>{s.w.quarry=1;}],
 ['伐木工 #3',676,s=>{s.w.camp=3;}],
 ['采石工 #2',780,s=>{s.w.quarry=2;}],
 ['解锁 F3（城镇收木板 50）',5000,s=>{s.town.board=2;}],
 ['科技 锯木厂',3000,s=>{}],
 ['建 锯木厂',2400,s=>{s.b.sawmill=1;}],
 ['修路 伐木营→锯木厂→F3 城镇 5 段',1500,s=>{}],
 ['锯木工 #1',1000,s=>{s.w.sawmill=1;}],
 ['建 第二座伐木营（F2 的森林）',1200,s=>{s.b.camp2=1;}],
 ['伐木工 #1（二营）',400,s=>{s.w.camp2=1;}],
 ['伐木工 #2（二营）',520,s=>{s.w.camp2=2;}],
 ['锯木工 #2',1300,s=>{s.w.sawmill=2;}],
 ['解锁 F4（湖，城镇收石头工具 120）',15000,s=>{s.town.tool=2;}],
 ['科技 石匠铺',8000,s=>{}],
 ['建 石匠铺',2000,s=>{s.b.mason=1;}],
 ['科技 航道',8000,s=>{}],
 ['修路 石匠铺→F4 城镇 过湖 4 段（湖 ×3）',2000,s=>{}],
 ['石匠 #1',1000,s=>{s.w.mason=1;}],
 ['采石工 #3',1014,s=>{s.w.quarry=3;}],
 ['石匠 #2',1300,s=>{s.w.mason=2;}],
 ['扩建 F1 城镇 Lv1（2 × 20 × 30）',1200,s=>{s.town.log=4;}],
 ['科技 石头路（全图 12 件/回合）',20000,s=>{s.cap=12;}],
 ['解锁 F5（山脉，城镇收铁 150）',40000,s=>{s.town.iron=2;}],
 ['科技 矿山',5000,s=>{}],
 ['建 矿山',2000,s=>{s.b.mine=1;}],
 ['修路 F0 矿山→铁厂 2 段（矿 ×2）',750,s=>{}],
 ['矿工 #1',600,s=>{s.w.mine=1;}],
 ['矿工 #2',780,s=>{s.w.mine=2;}],
 ['科技 铁厂',40000,s=>{}],
 ['建 铁厂',3000,s=>{s.b.smelter=1;}],
 ['修路 铁厂 ↔ 伐木营 / F5 城镇 5 段',2500,s=>{}],
 ['炼铁工 #1',1000,s=>{s.w.smelter=1;}],
 ['炼铁工 #2',1300,s=>{s.w.smelter=2;}],
 ['教学结束：进入沙盒',0,s=>{}],
];
const s={money:2000,road:false,cap:4,town:{},w:{camp:0,camp2:0,quarry:0,sawmill:0,mason:0,mine:0,smelter:0},b:{}};
// 每回合收入：每种货 = min(产量, 城镇需求, 道路运力) × 价格。加工链取上游供给的最小值。
function income(){
 if(!s.road)return 0;
 const cap=s.cap;
 const logsA=s.w.camp, logsB=s.w.camp2;           // 两座伐木营
 const stone=s.w.quarry, ore=s.w.mine;
 // 分配：原木优先喂锯木厂、石匠铺、铁厂，剩下卖给 F1 城镇
 let logs=logsA+logsB;
 const boards=Math.min(s.w.sawmill, logs, s.town.board||0, cap); logs-=boards;
 let st=stone;
 const tools=Math.min(s.w.mason, logs, st, s.town.tool||0, cap); logs-=tools; st-=tools;
 let or=ore;
 const iron=Math.min(s.w.smelter, logs, or, s.town.iron||0, cap); logs-=iron; or-=iron;
 const sellLog=Math.min(logs, s.town.log||0, cap);
 const sellStone=Math.min(st, s.town.stone||0, cap);
 return boards*P.board+tools*P.tool+iron*P.iron+sellLog*P.log+sellStone*P.stone;
}
let t=0, i=0; const rows=[];
// 开局：没有城镇，先点满 20 根原木（教堆场上限），约 7 秒
t+=20/CLICK_PER_SEC; let yard=20;
while(i<plan.length){
 const [name,cost,fx]=plan[i];
 while(s.money<cost){
  let inc=income();
  if(inc===0 && s.road && yard>0){ /* 无工人时手点卖原木：受城镇 2 件/回合限制 */ inc=Math.min(2,yard)*P.log; }
  if(inc===0){ rows.push(['卡死',name,t,s.money]); return report('卡死于 '+name); }
  s.money+=inc; t+=ROUND_SEC;
 }
 s.money-=cost; fx(s);
 rows.push([name,cost,t,s.money,income()]);
 i++;
}
report('完成');
function report(tag){
 console.log('阶段 | 花费 | 累计时间(1×) | 余额 | 之后每回合收入');
 for(const r of rows){const m=Math.floor(r[2]/60),sec=Math.round(r[2]%60);console.log(`${r[0]} | ${r[1]} | ${m}m${String(sec).padStart(2,'0')}s | ${Math.round(r[3])} | ${r[4]??''}`);}
 console.log(tag,'总时长',Math.round(t/60),'分钟（1× 速度）');
}
