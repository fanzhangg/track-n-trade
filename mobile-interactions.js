/* Shared by the game and isolated component samples; never accesses player storage. */
window.MobileInteractions=(()=>{
 const narrow=matchMedia('(max-width:740px)');
 const phone=()=>narrow.matches||(matchMedia('(pointer:coarse)').matches&&Math.min(innerWidth,innerHeight)<=740);
 const editable=target=>target.closest('input,textarea,select,[contenteditable="true"]');
 for(const type of ['contextmenu','selectstart','dragstart'])document.addEventListener(type,event=>{
  const target=event.target instanceof Element?event.target:event.target.parentElement;
  if(phone()&&target?.closest('.game-surface,.touch-surface')&&!editable(target))event.preventDefault();
 });
 function goals(button,popover,panel){
  const origin=document.createComment('desktop goals position');panel.before(origin);
  const slot=popover.querySelector('[data-goals-slot]');
  const sync=()=>{
   popover.hidePopover();button.setAttribute('aria-expanded','false');
   if(narrow.matches)slot.append(panel);else origin.after(panel);
  };
  popover.addEventListener('toggle',()=>button.setAttribute('aria-expanded',String(popover.matches(':popover-open'))));
  // A goal navigation action returns the map to the player immediately.
  slot.addEventListener('click',event=>{if(event.target.closest('button,a'))popover.hidePopover();});
  narrow.addEventListener('change',sync);sync();
 }
 return {goals};
})();
