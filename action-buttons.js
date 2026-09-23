/* Shared action structure for the game and isolated UI examples. */
window.ActionButtons = (() => {
 const icons={unlock:'ui-locked',build:'ui-plus',upgrade:'ui-gear',remove:'ui-cross',neutral:'ui-plus'};
 function enhance(button,{kind='neutral',icon,reason,base='assets/icons/v1/'}={}) {
  if(button.classList.contains('action-button'))return;
  button.dataset.action=kind;
  button.classList.add('action-button','detail-button');
  if(!button.querySelector('.action-copy')){
   const copy=document.createElement('span');copy.className='action-copy';
   const title=document.createElement('strong');title.className='action-title';
   const small=button.querySelector('small');if(small)small.remove();
   while(button.firstChild)title.append(button.firstChild);
   copy.append(title);
   const refund=small?.textContent.trim().match(/^退回\s*(\$[\d,]+)/);
   if(small&&!refund){small.className='action-description';copy.append(small);}
   button.append(copy);
   if(refund){const cost=document.createElement('span');cost.className='action-cost';cost.innerHTML='<small class="action-refund">退回</small>';cost.append(refund[1]);button.append(cost);}
  }
  for(const child of [...button.children])if(child.matches('.tt-icon,[data-icon]'))child.remove();
  button.insertAdjacentHTML('afterbegin',TradeIcons.icon(icon||icons[kind],{base,size:24,decorative:true}));
  const cost=button.querySelector('.action-cost');
  if(cost){
   for(const child of cost.querySelectorAll('.tt-icon,[data-icon]'))child.remove();
   cost.insertAdjacentHTML('afterbegin',TradeIcons.icon('coin',{base,size:18,decorative:true}));
  }
  if(button.disabled){
   const state=document.createElement('small');state.className='action-reason';
   state.textContent=reason||(kind==='remove'?'操作不可用':'金币不足');
   button.querySelector('.action-copy').append(state);
  }
 }
 return {enhance};
})();
/* One action grammar for industry purchases and progress on every surface. */
window.IndustryButtons=(()=>{
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function control({title,action,level='',icon,kind,state,cost,progress,reason='',inspect=false,selected=false,attributes='',className='',base='assets/icons/v1/'},E){
  const ico=(id,size)=>TradeIcons.icon(id,{base,size,decorative:true}),complete=state==='complete';
  const percent=progress?Math.floor(progress.done/progress.duration*100):0;
  const description=action+(level?' · '+level:'');
  const label=title+'，'+description+(progress?'，'+percent+'%':complete?'':'，'+E.formatMoney(cost))+(reason?'，'+reason:'');
  const tail=progress?percent+'%':complete?ico('ui-checkmark',18):ico('coin',18)+escape(E.formatMoney(cost));
  const badge=kind==='unlock'?ico('ui-locked',11):kind==='upgrade'?'↑':'+';
  return `<button type="button" class="industry-button ${className}" data-industry-kind="${kind}" data-industry-state="${state}" ${attributes} ${selected?'aria-pressed="true"':''} ${!inspect&&state!=='ready'?'disabled':''} aria-label="${escape(label)}" title="${escape(description+(reason?' · '+reason:''))}" style="--industry-progress:${percent}%"><span class="industry-symbol">${ico(icon,30)}<span class="industry-action-badge" aria-hidden="true">${badge}</span></span><span class="industry-copy"><strong>${escape(title)}</strong><small class="industry-action-label">${escape(description)}</small></span><span class="industry-end"><span class="industry-value">${tail}</span></span>${progress?`<span class="industry-progress" role="progressbar" aria-label="${escape(title+' '+action)}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i></i></span>`:''}</button>`;
 }
 function tech(E,w,key,options={}){
  const t=E.TECH[key],p=E.techProgress(w,key),complete=E.techOwned(w,key)||E.techMaxed(w,key),cost=E.techCost(w,key);
  const available=E.techAvailable(w,key),poor=w.money<cost,kind=t.repeat?'upgrade':'unlock';
  const state=p?'progress':complete?'complete':!available?'locked':poor?'poor':'ready';
  const title=options.name||(t.building?E.RECIPES[t.building].name:t.name);
  const level=t.repeat?IndustryGraph.roman(w.tech[key]+1)+(complete?'':' → '+IndustryGraph.roman(w.tech[key]+2)):'';
  const icon=t.building||(E.RECIPES[key]?key:key==='era'?'town':t.icon||'ui-gear');
  const action=complete?(kind==='unlock'?'已解锁':'已满级'):kind==='unlock'?(p?'解锁中':'解锁'):t.building?(p?'工艺升级中':'升级工艺'):key==='era'?(p?'时代升级中':'升级时代'):(p?'科技升级中':'升级科技');
  const reason=!p&&!complete?(!available?(E.techDiscoveryReason(w,key)||'前置未满足'):poor?'金币不足':''):'';
  return control({...options,title,action,level,icon,kind,state,cost,progress:p,reason},E);
 }
 function build(E,w,type,options={}){
  const cost=E.buildingCost(w,type),poor=w.money<cost,p=options.progress;
  return control({...options,title:E.RECIPES[type].name,action:p?'建造中':'建造',icon:type,kind:'build',state:p?'progress':poor?'poor':'ready',cost,reason:!p&&poor?'金币不足':''},E);
 }
 return {tech,build};
})();
