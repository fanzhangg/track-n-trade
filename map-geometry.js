/* Project only the ground plane. Models and labels remain upright. */
(function(root){
 const radius=51, depth=.65;
 const position=t=>[Math.sqrt(3)*radius*(t.q+t.r/2),1.5*radius*t.r*depth];
 const vertex=(x,y,s,i)=>{
  const a=(i*60-30)*Math.PI/180;
  return [x+s*Math.cos(a),y+s*Math.sin(a)*depth];
 };
 const points=(x=0,y=0,s=radius)=>Array.from({length:6},(_,i)=>vertex(x,y,s,i).join(',')).join(' ');
 const contains=(dx,dy,s=radius)=>{
  dx=Math.abs(dx);dy=Math.abs(dy)/depth;
  return dx<=Math.sqrt(3)*s/2+1e-8 && dy<=s-dx/Math.sqrt(3)+1e-8;
 };
 root.MapGeometry={radius,depth,position,vertex,points,contains};
})(typeof window==='undefined'?globalThis:window);
