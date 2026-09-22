/* Board-space geometry shared by the road surface, picking, preview and freight. */
(function(root){
 const mix=(a,b,t=.5)=>a.map((v,i)=>v+(b[i]-v)*t);
 const quad=(a,b,c,t)=>mix(mix(a,b,t),mix(b,c,t),t);
 const point=p=>p.map(n=>+n.toFixed(3)).join(' ');
 function layout(tiles,edges,position){
  const ports=new Map(),roads=new Map();
  for(const e of edges){
   const mid=mix(position(tiles[e.a]),position(tiles[e.b]));
   for(const id of [e.a,e.b]){
    if(!ports.has(id))ports.set(id,[]);
    ports.get(id).push({edge:e.id,mid});
   }
  }
  function half(id,edge){
   const tile=tiles[id],c=position(tile),list=ports.get(id),p=list.find(p=>p.edge===edge).mid;
   // Split a single quadratic at its midpoint: both road halves share exactly
   // the same position AND tangent, including tight 60-degree hex turns.
   if(!tile.building&&list.length===2){
    const q=list.find(p=>p.edge!==edge).mid;
    return [quad(p,c,q,.5),mix(c,p),p];
   }
   const entry=tile.building?[c[0],c[1]+12]:c;
   return [entry,mix(c,p),p];
  }
  for(const e of edges){
   const a=half(e.a,e.id),b=half(e.b,e.id);
   const d=`M${point(a[0])}Q${point(a[1])} ${point(a[2])}Q${point(b[1])} ${point(b[0])}`;
   const at=t=>t<=.5?quad(...a,t*2):quad(b[2],b[1],b[0],t*2-1);
   const hitPoints=Array.from({length:41},(_,i)=>at(i/40)).filter(p=>[e.a,e.b].every(id=>!tiles[id].building||Math.hypot(...p.map((v,i)=>v-position(tiles[id])[i]))>32));
   const hit=hitPoints.map((p,i)=>`${i?'L':'M'}${point(p)}`).join('');
   roads.set(e.id,{...e,d,hit,at,water:[tiles[e.a],tiles[e.b]].some(t=>t.terrain==='lake')});
  }
  const junctions=[];
  for(const [id,list] of ports){
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
  return {roads,ports,junctions};
 }
 root.RoadTiles={layout};
})(typeof window==='undefined'?globalThis:window);
