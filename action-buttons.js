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
