// Orthographic, textured OBJ renderer for Kenney's palette-textured low-poly models.
// Usage: node tools/render-icon-models.cjs [output-directory] [icon-id ...]
// Requires pngjs and sharp; the bundled Codex runtime is a fallback on this host.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function dependency(name){try{return require(name);}catch{return require(path.join('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',name));}}
const {PNG}=dependency('pngjs'),sharp=dependency('sharp');
const root=path.resolve(__dirname,'..'),library=path.join(root,'assets/Kenney Game Assets All-in-1 3.7.0');
const output=path.resolve(process.argv[2]||path.join(root,'assets/icons/v1'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/icons/v1/sources.json')));
const only=new Set(process.argv.slice(3)),RES=1024,FINAL=512;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a);return a.map(x=>x/(l||1));};
const camera=norm([6,5,8]),right=norm(cross([0,1,0],camera)),up=cross(camera,right),light=norm([-3,8,5]);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function render(asset){
 const preview=asset.originalPreviewSource||asset.source;
 const relative=preview.replace('/Previews/','/Models/OBJ format/').replace(/\.png$/,'.obj');
 const objFile=path.join(library,relative),obj=fs.readFileSync(objFile,'utf8');
 const vertices=[],uvs=[],normals=[],faces=[],materials={};let material='';
 const mtlName=obj.match(/^mtllib (.+)$/m)[1].trim(),mtlFile=path.join(path.dirname(objFile),mtlName);
 for(const line of fs.readFileSync(mtlFile,'utf8').split(/\r?\n/)){
  const [key,...parts]=line.trim().split(/\s+/);
  if(key==='newmtl'){material=parts.join(' ');materials[material]={color:[.75,.75,.75]};}
  else if(key==='Kd')materials[material].color=parts.map(Number);
  else if(key==='map_Kd'){const file=path.resolve(path.dirname(mtlFile),parts.join(' ').replaceAll('\\','/'));materials[material].texture=PNG.sync.read(fs.readFileSync(file));materials[material].textureFile=file;}
 }
 material=Object.keys(materials)[0];
 for(const line of obj.split(/\r?\n/)){
  const [key,...parts]=line.trim().split(/\s+/);
  if(key==='v')vertices.push(parts.slice(0,3).map(Number));
  else if(key==='vt')uvs.push(parts.slice(0,2).map(Number));
  else if(key==='vn')normals.push(parts.slice(0,3).map(Number));
  else if(key==='usemtl')material=parts.join(' ');
  else if(key==='f'){const refs=parts.map(p=>p.split('/').map(Number));for(let i=1;i<refs.length-1;i++)faces.push({refs:[refs[0],refs[i],refs[i+1]],material});}
 }
 const projected=vertices.map(v=>[dot(v,right),-dot(v,up),dot(v,camera)]);
 const minX=Math.min(...projected.map(p=>p[0])),maxX=Math.max(...projected.map(p=>p[0])),minY=Math.min(...projected.map(p=>p[1])),maxY=Math.max(...projected.map(p=>p[1]));
 const scale=RES*.82/Math.max(maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const screen=projected.map(p=>[(p[0]-cx)*scale+RES/2,(p[1]-cy)*scale+RES/2,p[2]]);
 const pixels=Buffer.alloc(RES*RES*4),depth=new Float32Array(RES*RES).fill(-Infinity);
 for(const face of faces){
  const v=face.refs.map(r=>vertices[r[0]-1]),n=norm(cross(sub(v[1],v[0]),sub(v[2],v[0])));
  if(dot(n,camera)<=0)continue;
  const [a,b,c]=face.refs.map(r=>screen[r[0]-1]);
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;
  const mat=materials[face.material],tex=mat.texture,uv=face.refs.map(r=>uvs[r[1]-1]||[0,0]);
  const faceNormals=face.refs.map(r=>normals[r[2]-1]||n);
  const shades=faceNormals.map(normal=>.68+.32*Math.max(0,dot(norm(normal),light)));
  for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<=Math.min(RES-1,Math.ceil(Math.max(a[1],b[1],c[1])));y++){
   for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<=Math.min(RES-1,Math.ceil(Math.max(a[0],b[0],c[0])));x++){
    const w0=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den;
    const w1=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,w2=1-w0-w1;
    if(w0<0||w1<0||w2<0)continue;
    const z=w0*a[2]+w1*b[2]+w2*c[2],idx=y*RES+x;if(z<depth[idx])continue;
    const u=w0*uv[0][0]+w1*uv[1][0]+w2*uv[2][0],v=w0*uv[0][1]+w1*uv[1][1]+w2*uv[2][1];
    const tx=tex?Math.max(0,Math.min(tex.width-1,Math.floor(u*tex.width))):0,ty=tex?Math.max(0,Math.min(tex.height-1,Math.floor((1-v)*tex.height))):0;
    const ti=tex?(ty*tex.width+tx)*4:0,alpha=tex?tex.data[ti+3]:255;if(alpha<128)continue;
    const shade=w0*shades[0]+w1*shades[1]+w2*shades[2];depth[idx]=z;
    for(let k=0;k<3;k++)pixels[idx*4+k]=Math.round((tex?tex.data[ti+k]:255*mat.color[k])*shade);
    pixels[idx*4+3]=255;
   }
  }
 }
 const dest=path.join(output,asset.file);fs.mkdirSync(path.dirname(dest),{recursive:true});
 await sharp(pixels,{raw:{width:RES,height:RES,channels:4}}).resize(FINAL,FINAL).png().toFile(dest);
 const png=PNG.sync.read(fs.readFileSync(dest));let x=FINAL,y=FINAL,r=0,b=0;
 for(let j=0;j<FINAL;j++)for(let i=0;i<FINAL;i++)if(png.data[(j*FINAL+i)*4+3]>64){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}
 Object.assign(asset,{source:relative,originalPreviewSource:preview,width:FINAL,height:FINAL,bounds:{x,y,width:r-x+1,height:b-y+1},sha256:hash(dest),modelSha256:hash(objFile),render:{tool:'tools/render-icon-models.cjs',camera:[6,5,8],light:[-3,8,5],supersampling:2},textures:Object.values(materials).filter(m=>m.textureFile).map(m=>({source:path.relative(library,m.textureFile).replaceAll('\\','/'),sha256:hash(m.textureFile)}))});
 console.log(`${asset.id}: ${faces.length} triangles → ${FINAL}×${FINAL}`);
}
(async()=>{for(const asset of manifest.assets)if(asset.file.startsWith('rendered/')&&asset.file.endsWith('.png')&&(!only.size||only.has(asset.id)))await render(asset);
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'sources.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(output,'provenance.js'),'/* Generated from sources.json for file:// compatibility. */\nwindow.TradeIconSources = '+JSON.stringify(manifest,null,2)+';\n');})().catch(error=>{console.error(error);process.exitCode=1;});
