/* Shared transient feedback, isolated from player progress. */
(function(){
 const host=document.getElementById('toast'),queue=[];let timer,current,hover=false,closing=false;
 host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.setAttribute('aria-atomic','true');
 function schedule(){clearTimeout(timer);if(current&&!hover&&!host.contains(document.activeElement))timer=setTimeout(close,current.hold);}
 function close(){if(closing||!current)return;clearTimeout(timer);closing=true;host.classList.remove('show');setTimeout(()=>{current=null;closing=false;next();},240);}
 function next(){if(current||closing||!queue.length)return;current=queue.shift();host.replaceChildren();const badge=document.createElement('span');badge.className='notice-badge';badge.textContent='✦';badge.setAttribute('aria-hidden','true');const copy=document.createElement('div');copy.className='notice-copy';const title=document.createElement('strong');title.textContent=current.title;copy.append(title);if(current.detail){const p=document.createElement('p');p.textContent=current.detail;copy.append(p);}const button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label','关闭通知');button.onclick=close;host.append(badge,copy,button);host.classList.add('show');schedule();}
 host.onmouseenter=()=>{hover=true;clearTimeout(timer);};host.onmouseleave=()=>{hover=false;schedule();};host.onfocusin=()=>clearTimeout(timer);host.onfocusout=()=>setTimeout(schedule,0);
 window.MapNotice={show(title,detail='',hold=3500){queue.push({title,detail,hold});next();}};
})();
