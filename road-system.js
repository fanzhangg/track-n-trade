/* Board-space geometry shared by the road surface, picking, preview and freight. */
(function(root){
 const mix=(a,b,t=.5)=>a.map((v,i)=>v+(b[i]-v)*t);
 const quad=(a,b,c,t)=>mix(mix(a,b,t),mix(b,c,t),t);
 const cubic=(a,b,c,d,t)=>mix(quad(a,b,c,t),quad(b,c,d,t),t);
 // A stable spatial hash: previews, saved worlds and reversed edges get the same bends.
 function noise(key){let h=2166136261;for(const ch of key)h=Math.imul(h^ch.charCodeAt(0),16777619);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h>>>0)/4294967295*2-1;}
 const point=p=>p.map(n=>+n.toFixed(3)).join(' ');
 function layout(tiles,edges,position){
  const ports=new Map(),roads=new Map();
  const groups=new Map(),boundaryGroups=new Map();
  for(const e of edges){const road=e.road||'legacy';for(const id of [e.a,e.b]){if(!groups.has(id))groups.set(id,new Set());groups.get(id).add(road);}const key=[e.a,e.b].sort().join('|');if(!boundaryGroups.has(key))boundaryGroups.set(key,new Set());boundaryGroups.get(key).add(road);}
  const depth=root.MapGeometry?.depth||1,plane=id=>{const p=position(tiles[id]);return [p[0],p[1]/depth];},project=p=>[p[0],p[1]*depth];
  for(const e of edges){
   const [first,last]=[e.a,e.b].sort(),a=plane(first),b=plane(last),delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta)||1;
   const normal=delta.map(v=>v/length),seed=first+'|'+last,lanes=[...boundaryGroups.get(seed)].sort(),offset=noise('portal:'+seed)*9+(lanes.indexOf(e.road||'legacy')-(lanes.length-1)/2)*10;
   const side=normal[0]<0||(normal[0]===0&&normal[1]<0)?-1:1;
   const middle=mix(a,b),portal=[middle[0]-normal[1]*offset*side,middle[1]+normal[0]*offset*side],handle=12+(noise('handle:'+seed)+1)*2;
   for(const id of [e.a,e.b]){
    if(!ports.has(id))ports.set(id,[]);
    ports.get(id).push({edge:e.id,road:e.road||'legacy',mid:project(portal),portal,normal:normal.map(v=>v*(id===first?1:-1)),handle});
   }
  }
  function half(id,edge){
   const tile=tiles[id],center=plane(id),port=ports.get(id).find(p=>p.edge===edge),list=ports.get(id).filter(p=>p.road===port.road),p=port.portal;
   const c=[center[0]+noise('tile-x:'+id)*14,center[1]+noise('tile-y:'+id)*10];
   if(!tile.building&&groups.get(id).size>1&&list.length===2){
    const ends=list.map(p=>p.portal).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),dx=ends[1][0]-ends[0][0],dy=ends[1][1]-ends[0][1],length=Math.hypot(dx,dy)||1;
    const lanes=[...groups.get(id)].sort(),offset=(lanes.indexOf(port.road)-(lanes.length-1)/2)*10;
    c[0]-=dy/length*offset;c[1]+=dx/length*offset;
   }
   let entry,control;
   // The split quadratic supplies a shared interior point and tangent. Convert
   // its tangent to cubic form, then constrain the other handle to the boundary normal.
   // All four control points stay inside this convex hex, including tight turns.
   if(!tile.building&&list.length===2){
    const q=list.find(p=>p.edge!==edge).portal;
    entry=quad(p,c,q,.5);control=mix(entry,mix(c,p),2/3);
   }else{
    // Buildings stay anchored in their courtyard. Preserve legacy junction centers.
    entry=tile.building?[center[0],center[1]+7/depth]:list.length>2?center:c;
    control=mix(entry,p,1/3);
   }
   return [entry,control,p.map((v,i)=>v-port.normal[i]*port.handle),p].map(project);
  }
  for(const e of edges){
   const a=half(e.a,e.id),b=half(e.b,e.id);
   const d=`M${point(a[0])}C${point(a[1])} ${point(a[2])} ${point(a[3])}C${point(b[2])} ${point(b[1])} ${point(b[0])}`;
   const at=t=>t<=.5?cubic(...a,t*2):cubic(b[3],b[2],b[1],b[0],t*2-1);
   const hitPoints=Array.from({length:41},(_,i)=>at(i/40)).filter(p=>[e.a,e.b].every(id=>!tiles[id].building||Math.hypot(...p.map((v,i)=>v-position(tiles[id])[i]))>32));
   const hit=hitPoints.map((p,i)=>`${i?'L':'M'}${point(p)}`).join('');
   roads.set(e.id,{...e,d,hit,at,water:[tiles[e.a],tiles[e.b]].some(t=>t.terrain==='lake')});
  }
  const junctions=[];
  for(const [id,list] of ports){
   if(groups.get(id).size>1)continue;
   if(list.length<3||tiles[id].building||tiles[id].terrain==='lake')continue;
   const c=position(tiles[id]);
   const arms=list.filter(p=>!roads.get(p.edge).water&&!roads.get(p.edge).removing).map(p=>{
    const angle=Math.atan2(p.mid[1]-c[1],p.mid[0]-c[0]);
    return {angle,p:[c[0]+28*Math.cos(angle),c[1]+28*Math.sin(angle)]};
   }).sort((a,b)=>a.angle-b.angle);
   if(arms.length<3)continue;
   // Fill the inside shoulders between nearby branches, without adding a node disc.
   junctions.push(arms.map((a,i)=>{
    const b=arms[(i+1)%arms.length],gap=(b.angle-a.angle+Math.PI*2)%(Math.PI*2);
    return gap<Math.PI-.01?`M${point(c)}L${point(a.p)}Q${point(c)} ${point(b.p)}Z`:'';
   }).join(''));
  }
  return {roads,ports,junctions,tiles};
 }
 // Tiny painted miniatures. All movement is decorative, independent of shipments.
 const n=v=>Number(v.toFixed(3));
 function donkey(time){
  const step=Math.sin(time*8),bob=-Math.abs(step)*.65;
  const leg=(x,phase,color)=>`<path d="M${x} -6 l${n(phase*2)} 5.5" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/><path d="M${n(x+phase*2-.7)} -.2 h1.8" stroke="#494644" stroke-width="1.6" stroke-linecap="round"/>`;
  return `<ellipse cy="1" rx="10" ry="2.7" fill="#504c40" opacity=".16"/>
   ${leg(-5,-step,'#6f706b')}${leg(5,step,'#6f706b')}
   <g transform="translate(0 ${n(bob)})">
    <path d="M-9 -10 Q-14 -13 -12 -5" fill="none" stroke="#65635d" stroke-width="1.5" stroke-linecap="round"/><path d="m-12 -6 -1 3 2 -1" fill="#474a46"/>
    <path d="M-10 -11 Q-9 -16 -2 -15 L5 -14 Q9 -13 8 -7 Q0 -4 -7 -7Z" fill="#8e9189"/>
    <path d="M-8 -12 Q-3 -15 4 -12" fill="none" stroke="#b5b8ac" stroke-width="1.5"/>
    <path d="M4 -10 5 -19 Q6 -22 10 -20 L13 -15 Q15 -14 14 -11 L9 -10 8 -7Z" fill="#979b92"/>
    <path d="M6 -20 Q2 -29 5 -28 L9 -21 M9 -21 Q8 -30 11 -29 L12 -20" fill="#8e9189" stroke="#777d74" stroke-width=".7"/>
    <path d="m5 -26 2 5 m3 -6 1 5" stroke="#c8b6a5" stroke-width=".8" stroke-linecap="round"/>
    <path d="M5 -20 4 -17 5 -11" stroke="#50574f" stroke-width="1.8" fill="none"/>
    <path d="M10 -15 Q15 -16 15 -12 Q13 -10 10 -12Z" fill="#ddd8c5"/>
    <circle cx="10.4" cy="-17.1" r=".85" fill="#303c38"/><circle cx="14" cy="-13.2" r=".55" fill="#676f64"/>
    <path d="m8 -14 3 3 3 -1" stroke="#87634a" stroke-width=".85" fill="none"/>
    <path d="M-7 -15 Q-1 -18 4 -14 L3 -7 -7 -8Z" fill="#557775"/>
    <rect x="-8" y="-13" width="9" height="7" rx="2" fill="#b88456"/><path d="M-8 -11 1 -10 -1 -7 -7 -8Z" fill="#c99a67"/>
    <path d="M-4 -13 -4 -6" stroke="#ecd4a6" stroke-width="1"/>
    <path d="m-6 -16 6 1" stroke="#dbc7a2" stroke-width="3" stroke-linecap="round"/>
   </g>${leg(-7,step,'#96998f')}${leg(4,-step,'#96998f')}`;
 }
 function boat(time){
  const sway=Math.sin(time*2.1);
  return `<g fill="none" stroke="#f4f5df" stroke-linecap="round" opacity=".6"><path d="M-13 0 Q-19 -2 -23 -1 M-13 3 Q-20 5 -26 3" stroke-width="1.1"/><path d="M-17 1 h-11" stroke-width=".65"/></g>
   <ellipse cy="2" rx="13" ry="3" fill="#365e60" opacity=".18"/>
   <g transform="translate(0 ${n(sway*.5)}) rotate(${n(sway*2)})">
    <path d="M-14 -4 Q-2 0 15 -4 L10 2 Q-1 6 -10 1Z" fill="#805e43"/>
    <path d="M-14 -4 Q0 -8 15 -4 Q2 2 -14 -4" fill="#c9a477"/>
    <path d="M-10 -3 Q0 -5 10 -3" stroke="#73543e" stroke-width="1" fill="none"/>
    <rect x="-9" y="-7" width="5" height="4" rx=".7" fill="#b88355"/><path d="M-7 -7 v4" stroke="#e9d0a3" stroke-width=".8"/>
    <path d="M0 -4 V-27" stroke="#765c44" stroke-width="1.25" stroke-linecap="round"/>
    <path d="M-1 -25 Q-10 -18 -10 -10 Q-5 -8 -1 -9Z" fill="#e6debf"/>
    <path d="M1 -25 Q12 -21 11 -10 Q5 -8 1 -10Z" fill="#fff6dd"/>
    <path d="M2 -24 Q7 -18 6 -11" fill="none" stroke="#e7dbbc" stroke-width=".7"/>
    <path d="M0 -27 6 -25 0 -23" fill="#b97855"/>
    <path d="M-8 1 Q1 4 10 0" stroke="#c29b6b" stroke-width=".8" fill="none"/>
   </g>`;
 }
 // Build one uniform-speed journey across any number of buildings and road segments.
 function journey(parts){
  const samples=[];let length=0,last=null;
  for(const part of parts)for(let i=0;i<=24;i++){
   const p=part.edge.at(part.forward?i/24:1-i/24);
   if(last)length+=Math.hypot(p[0]-last[0],p[1]-last[1]);
   samples.push({p,length,water:part.edge.water});last=p;
  }
  function locate(t){const distance=Math.max(0,Math.min(1,t))*length;let lo=0,hi=samples.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].length<distance)lo=mid+1;else hi=mid;}return {distance,index:lo};}
  const at=t=>{const {distance,index}=locate(t),b=samples[index],a=samples[Math.max(0,index-1)];return mix(a.p,b.p,b.length===a.length?0:(distance-a.length)/(b.length-a.length));};
  return {id:JSON.stringify(parts.map(p=>[p.edge.id,p.forward])),parts,length,at,waterAt:t=>samples[locate(t).index].water,direction:1,duration:Math.max(3,length/12)};
 }
 function routes(layout,flow){
  const remaining=new Map();
  for(const edge of layout.roads.values()){
   const direction=flow.get(edge.id)?.direction;if(edge.removing||!direction)continue;
   const part={edge,forward:direction>0,from:direction>0?edge.a:edge.b,to:direction>0?edge.b:edge.a};
   part.length=journey([part]).length;remaining.set(edge.id,part);
  }
  const result=[];
  while(remaining.size){
   const outgoing=new Map();for(const p of remaining.values()){if(!outgoing.has(p.from))outgoing.set(p.from,[]);outgoing.get(p.from).push(p);}
   for(const list of outgoing.values())list.sort((a,b)=>b.length-a.length||String(a.edge.id).localeCompare(String(b.edge.id)));
   let best=[],bestLength=-1,budget=20000;
   function visit(part,path,used,length){
    if(budget--<=0)return;
    path.push(part);used.add(part.edge.id);length+=part.length;
    if(length>bestLength){best=path.slice();bestLength=length;}
    for(const next of outgoing.get(part.to)||[])if(!used.has(next.edge.id)&&(!part.edge.road||!next.edge.road||part.edge.road===next.edge.road||layout.tiles[part.to]?.building))visit(next,path,used,length);
    used.delete(part.edge.id);path.pop();
   }
   // Source-first search follows the longest whole line through junctions; cycles are bounded.
   const targets=new Set([...remaining.values()].map(p=>p.to));
   const starts=[...remaining.values()].sort((a,b)=>Number(targets.has(a.from))-Number(targets.has(b.from))||String(a.edge.id).localeCompare(String(b.edge.id)));
   for(const part of starts){if(budget<=0)break;visit(part,[],new Set(),0);}
   result.push(journey(best));for(const p of best)remaining.delete(p.edge.id);
  }
  return result.sort((a,b)=>b.length-a.length||a.id.localeCompare(b.id));
 }
 function traffic(layout,shipments,time,previous,pathTo=()=>null){
  const counts=new Map();
  const record=(edge,from)=>counts.set(edge.id,(counts.get(edge.id)||0)+(from===edge.a?1:-1));
  // Include each shipment's remaining destination path, so the first parcel lights up the whole line.
  for(const s of shipments){
   const edge=layout.roads.get(s.edge);if(edge&&!edge.removing)record(edge,s.from);
   const start=edge?(s.to||(s.from===edge.a?edge.b:edge.a)):s.node;
   if(!start||!s.destination||start===s.destination)continue;
   let node=start;for(const id of pathTo(start,s.destination)||[]){const e=layout.roads.get(id);if(!e||e.removing)break;record(e,node);node=e.a===node?e.b:e.a;}
  }
  const retained=new Set();
  for(const route of previous?.planned||[]){
   const active=previous.routes.find(r=>r.id===route.id),last=previous.history.get(route.id)??-Infinity;
   if((active&&time-active.started<active.duration+.8)||route.parts.some(p=>(previous.flow.get(p.edge.id)?.seen??-Infinity)>last))for(const p of route.parts)retained.add(p.edge.id);
  }
  const flow=new Map();
  for(const [id,old]of previous?.flow||[])if(layout.roads.has(id)&&!layout.roads.get(id).removing&&(time-old.seen<8||retained.has(id)))flow.set(id,old);
  for(const [id,count]of counts){const direction=Math.sign(count)||flow.get(id)?.direction||1;flow.set(id,{direction,seen:time});}

  const signature=JSON.stringify([...flow].map(([id,f])=>[id,f.direction,layout.roads.get(id).d||'',layout.roads.get(id).water]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const planned=previous?.signature===signature?previous.planned:routes(layout,flow);
  const history=new Map(previous?.history||[]),old=new Map((previous?.routes||[]).map(r=>[r.id,r]));
  const active=[],waiting=[];
  for(const route of planned){
   const prior=old.get(route.id),last=history.get(route.id)??-Infinity;
   const live=route.parts.some(p=>counts.has(p.edge.id)||(flow.get(p.edge.id)?.seen??-Infinity)>last);
   if(prior&&time-prior.started<route.duration+.8)active.push({...route,started:prior.started});
   else if(live)waiting.push(route);
  }
  // Fair rotation keeps every branch visible eventually without flooding the map.
  waiting.sort((a,b)=>(history.get(a.id)??-Infinity)-(history.get(b.id)??-Infinity)||b.length-a.length||a.id.localeCompare(b.id));
  for(const route of waiting.slice(0,Math.max(0,6-active.length))){history.set(route.id,time);active.push({...route,started:time});}
  const valid=new Set(planned.map(r=>r.id));for(const id of history.keys())if(!valid.has(id))history.delete(id);
  return {routes:active,planned,flow,signature,history};
 }
 function travelers(traffic,time,{reduced=false}={}){
  return (traffic?.routes||[]).map(r=>{
   const seed=[...String(r.id)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7);
   const phase=reduced?.5:Math.max(0,Math.min(1,(time-r.started)/r.duration));
   const reverse=r.direction<0,t=reverse?1-phase:phase;
   const [x,y]=r.at(t),a=r.at(Math.max(0,t-.01)),b=r.at(Math.min(1,t+.01));
   const facing=(b[0]-a[0])*(reverse?-1:1)<0?-1:1;
   const opacity=reduced?1:Math.min(1,phase*10,(1-phase)*10);
   const water=r.waterAt(t);
   return `<g class="freight freight-${water?'boat':'donkey'}" aria-hidden="true" pointer-events="none" opacity="${n(opacity)}" transform="translate(${n(x)} ${n(y)})"><g transform="scale(${facing*.85} .85)">${water?boat(reduced?0:time):donkey(reduced?0:time+seed)}</g></g>`;
  }).join('');
 }
 root.RoadTiles={layout,routes,traffic,travelers};
})(typeof window==='undefined'?globalThis:window);
