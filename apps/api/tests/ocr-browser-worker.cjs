// Execute the actual shipped browser worker/core with a minimal worker_threads bridge.
// This exercises OCR/WASM/protocol; it does not claim browser layout/performance validation.
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),vm=require('node:vm');
global.self=global;
global.require=require;
global.__filename=workerData.core;
global.__dirname=require('node:path').dirname(workerData.core);
global.addEventListener=(type,receive)=>{if(type==='message') parentPort.on('message',data=>receive({data}));};
global.postMessage=data=>parentPort.postMessage(data);
const localDataFetch=global.fetch;
global.fetch=(url,init)=>{if(typeof url==='string' && url.startsWith('data:application/octet-stream;base64,')) return localDataFetch(url,init); throw new Error('OCR_EXTERNAL_NETWORK_DENIED');};
global.indexedDB=new Proxy({}, {get(){throw new Error('OCR_PERSISTENT_CACHE_DENIED');}});
global.importScripts=path=>{if(path!==workerData.core) throw new Error('OCR_UNEXPECTED_SCRIPT');vm.runInThisContext(fs.readFileSync(path,'utf8'),{filename:path});};
vm.runInThisContext(fs.readFileSync(workerData.worker,'utf8'),{filename:workerData.worker});
