// Register the individually generated PNGs without altering their pixels/alpha.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('C:/Users/fzhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'assets/icons/v1');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const design=JSON.parse(read('assets/icons/v1/resources/design.json'));
const prompts=JSON.parse(read('assets/icons/v1/resources/prompts.json'));
const sources=JSON.parse(read('assets/icons/v1/sources.json'));
let catalog=read('assets/icons/v1/catalog.js');
for(const spec of design.resources){
 const file=`resources/${spec.id}-rounded.png`,dest=path.join(dir,file);
 const input=prompts.assets.find(a=>a.id===spec.id);
 if(!fs.existsSync(dest))fs.copyFileSync(input.source,dest);
 const bytes=fs.readFileSync(dest),png=PNG.sync.read(bytes);
 let left=png.width,top=png.height,right=-1,bottom=-1,transparent=0;
 for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
  const alpha=png.data[(y*png.width+x)*4+3];
  if(alpha===0)transparent++;
  if(alpha>16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 }
 if(!transparent||right<left)throw new Error(`Invalid alpha: ${spec.id}`);
 const bounds={x:left,y:top,width:right-left+1,height:bottom-top+1};
 Object.assign(sources.assets.find(a=>a.id===spec.id),{file,pack:'Project · Rounded miniature resources',source:`Built-in image_gen; resources/prompts.json#${spec.id}`,license:'Project generated artwork',width:png.width,height:png.height,bounds,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 const cue=spec.color+'；'+spec.shape;
 // Catalog contains both legacy JS literals and JSON literals.
 catalog=catalog.replace(new RegExp(`(id:'${spec.id}'[^\\n]*?cue:')[^']*'`),(_,prefix)=>prefix+cue+"'");
 catalog=catalog.replace(new RegExp(`("id": "${spec.id}"[^}]*?"cue": ")[^"]*"`),(_,prefix)=>prefix+cue+'"');
 console.log(`${spec.id}: ${png.width}x${png.height}, alpha bounds ${JSON.stringify(bounds)}`);
}
sources.version=design.version;
catalog=catalog.replaceAll('?v=resources4','?v=rounded5');
fs.writeFileSync(path.join(dir,'catalog.js'),catalog);
fs.writeFileSync(path.join(dir,'sources.json'),JSON.stringify(sources,null,2)+'\n');
fs.writeFileSync(path.join(dir,'provenance.js'),'window.TradeIconSources = '+JSON.stringify(sources)+';\n');
