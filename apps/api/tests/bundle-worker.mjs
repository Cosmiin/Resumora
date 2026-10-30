// Native runtime harness only. Production Wrangler bundles the same static WASM imports.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
export async function bundleWorker(options){
 const sources=[];
 const result=await build({...options,plugins:[...(options.plugins??[]),{name:'native-wasm',setup(b){
  b.onResolve({filter:/\.wasm$/},async args=>{
   if(args.pluginData?.wasmResolved)return;
   const resolved=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{wasmResolved:true}});
   let i=sources.findIndex(s=>s.filename===resolved.path);
   if(i<0){i=sources.length;sources.push({filename:resolved.path,contents:await readFile(resolved.path)});}
   return {path:`./codec${i}.wasm`,external:true};
  });
 }}]});
 return {...result,wasm:sources.map((s,i)=>({type:'CompiledWasm',path:`codec${i}.wasm`,contents:s.contents}))};
}
