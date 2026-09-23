(function(){
'use strict';
const $=id=>document.getElementById(id),fmt=n=>Math.round(n).toLocaleString('zh-CN');
async function run(){
 $('run').disabled=true;$('reset').disabled=true;$('summary').textContent='正在运行真实引擎…';
 try{
  const number=(id,min,max)=>Math.min(max,Math.max(min,Number($(id).value)||min));
  const r=await EconomyModel.simulateAsync({seed:number('model-seed',1,100000),rounds:number('model-rounds',100,1800),clicks:number('model-clicks',0,2)});
  $('summary').textContent=`种子 ${r.seed} · ${r.rounds} 回合 · ${r.events.length} 次购买；这是固定策略样本，不代表最优解。`;
  $('kpi').innerHTML=[[r.maxWait+' 回合','两次购买间最长等待'],[r.medianWait+' 回合','购买等待中位数'],[r.unfinishedWait+' 回合','结束时尚未完成的等待'],[fmt(r.income),'每回合销售收入'],[r.flowers,'已探索板块'],[r.averageChoices.toFixed(1),'策略每回合候选投资数']].map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('first-sales').textContent=TradeEngine.SELLABLE.map(g=>`${TradeEngine.GOODS[g]}：${r.firstSales[g]?'第 '+r.firstSales[g]+' 回合首次售出':'尚未售出'}`).join(' · ');
  $('timeline').innerHTML='<tr><th>回合</th><th>购买</th><th>费用</th><th>余额</th><th>近期收入 / 回合</th></tr>'+r.events.map(e=>`<tr><td>${e.tick}</td><td>${e.label}</td><td>${fmt(e.cost)}</td><td>${fmt(e.balance)}</td><td>${fmt(e.income)}</td></tr>`).join('');
  const max=Math.max(1,...r.series.map(p=>p.income)),x=t=>55+t/r.rounds*820,y=v=>280-v/max*250;
  const points=r.series.map(p=>`${x(p.tick)},${y(p.income)}`).join(' ');
  $('chart').innerHTML=`<path d="M55 25V280H880" fill="none" stroke="#aaa"/><text x="55" y="18">每回合收入</text><text x="0" y="35">${fmt(max)}</text><text x="55" y="304">0</text><text x="830" y="304">${r.rounds} 回合</text><polyline points="${points}" fill="none" stroke="#486b3a" stroke-width="2.5"/>`;
 }catch(e){$('summary').textContent='模拟失败：'+e.message;}
 finally{$('run').disabled=false;$('reset').disabled=false;}
}
$('run').onclick=run;$('reset').onclick=()=>{$('model-seed').value=1;$('model-rounds').value=600;$('model-clicks').value=0;run();};run();
})();
