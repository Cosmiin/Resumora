import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {GlobalFonts,createCanvas} from '@napi-rs/canvas';
import {PDFDocument} from '@cantoo/pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {LocalPageOcr,locateOcrQuote,ocrSourceBox} from '../../web/src/base/local-ocr.ts';
const root=new URL('../../../',import.meta.url);
const core=fileURLToPath(new URL('node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',root));
const worker=fileURLToPath(new URL('node_modules/tesseract.js/dist/worker.min.js',root));
const models=async(signal)=>Promise.all(['ron','eng'].map(async code=>({code,data:new Uint8Array(await readFile(new URL(`node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`,root),{signal}))})));
function session(observe=()=>{}) {
  return new LocalPageOcr({corePath:core,models,createPort:()=>{
    const raw=new Worker(new URL('./ocr-browser-worker.cjs',import.meta.url),{workerData:{core,worker},env:{}});
    const port={send:packet=>raw.postMessage(packet),onMessage:receive=>raw.on('message',receive),onError:receive=>raw.on('error',receive),terminate:()=>{void raw.terminate();}};
    observe(raw,port);return port;
  }});
}
async function scannedPage() {
  GlobalFonts.registerFromPath(fileURLToPath(new URL('node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',root)),'Synthetic Source');
  const image=createCanvas(1200,1600),ctx=image.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,1200,1600);ctx.fillStyle='black';ctx.font='48px "Synthetic Source"';
  ctx.fillText('Synthetic Engineer',100,170);ctx.fillText('Inginer automatizări',100,270);
  ctx.fillText('Record',100,400);ctx.fillText('Record',100,500);
  const pdf=await PDFDocument.create(),page=pdf.addPage([600,800]);
  page.drawImage(await pdf.embedPng(image.toBuffer('image/png')),{x:0,y:0,width:600,height:800});
  const doc=await getDocument({data:Uint8Array.from(await pdf.save()),isEvalSupported:false}).promise;
  const original=await doc.getPage(1),viewport=original.getViewport({scale:2});
  assert.equal((await original.getTextContent()).items.length,0,'Fixture really is image-only PDF');
  const raster=doc.canvasFactory.create(viewport.width,viewport.height);
  await original.render({canvas:raster.canvas,canvasContext:raster.context,viewport}).promise;
  return {doc,original,viewport,context:raster.context,bytes:new Uint8Array(raster.canvas.toBuffer('image/png')),width:raster.canvas.width,height:raster.canvas.height,scale:2};
}
test('actual shipped OCR engine locates synthetic English/Romanian scan tokens and transforms only their pixel boxes',async()=>{
  const input=await scannedPage();let created=0;
  const engine=session(()=>created++);
  try {
    const result=await engine.recognize(1,input,new AbortController().signal);
    const english=locateOcrQuote(result.words,'Synthetic Engineer');
    const romanian=locateOcrQuote(result.words,'Inginer automatizări');
    assert.equal(english.length,2,'English quote has high-confidence OCR-derived word boxes');
    assert.equal(romanian.length,2,'Romanian accents survive local OCR');
    assert.deepEqual(locateOcrQuote(result.words,'Record'),[],'Duplicate quote has no fabricated first match');
    assert.deepEqual(locateOcrQuote(result.words,'Invented achievement'),[]);
    for(const word of [...english,...romanian]) {
      const {x0,y0,x1,y1}=word.bbox;
      assert.ok(x0>=95 && x1<=600 && y0>=100 && y1<=280,'Located words lie on their source lines');
      const pixels=input.context.getImageData(x0,y0,x1-x0,y1-y0).data;
      assert.ok(pixels.some((v,i)=>i%4!==3&&v<128),'OCR box contains real source ink');
      for(const rotation of [0,90,180,270]) for(const scale of [.5,1,2]) {
        const viewport=input.original.getViewport({scale,rotation});
        const box=ocrSourceBox(word,(x,y)=>input.viewport.convertToPdfPoint(x,y),(x,y)=>viewport.convertToViewportPoint(x,y));
        assert.ok(box.x>=0 && box.y>=0 && box.width>0 && box.height>0);
        assert.ok(box.x+box.width<=viewport.width+.01 && box.y+box.height<=viewport.height+.01);
        assert.ok(Math.abs(box.width*box.height-(x1-x0)*(y1-y0)*(scale/2)**2)<.01,'Transform preserves actual OCR pixel area');
      }
    }
    assert.equal(await engine.recognize(1,input,new AbortController().signal),result,'Same source/page reuses bounded memory result');
    assert.equal(created,1,'No second OCR worker on cache hit');
    await engine.recognize(2,input,new AbortController().signal);
    await engine.recognize(3,input,new AbortController().signal);
    assert.equal(engine.get(1),undefined,'Only two page results retained');
    engine.dispose();assert.equal(engine.get(3),undefined,'Logout/source disposal clears results');
    await assert.rejects(()=>engine.recognize(1,input,new AbortController().signal),/OCR_CANCELLED/);
  } finally {engine.dispose();await input.doc.destroy();}
});
test('actual browser OCR worker can be cancelled during initialization without late result or cross-source cache',async()=>{
  const input=await scannedPage();const controller=new AbortController();let exited;
  const engine=session(raw=>{exited=new Promise(resolve=>raw.once('exit',resolve));});
  const pending=engine.recognize(1,input,controller.signal);
  controller.abort();
  await assert.rejects(pending,/OCR_CANCELLED/);await exited;
  assert.equal(engine.get(1),undefined);
  engine.dispose();
  const fresh=session();assert.equal(fresh.get(1),undefined);fresh.dispose();
  await input.doc.destroy();
});

test('actual worker is terminated on source/account disposal while recognition is outstanding',async()=>{
  const input=await scannedPage();let exited,engine;
  engine=session((raw,port)=>{
    exited=new Promise(resolve=>raw.once('exit',resolve));
    const send=port.send;
    port.send=packet=>{send(packet);if(packet.action==='recognize') setImmediate(()=>engine.dispose());};
  });
  try {
    await assert.rejects(()=>engine.recognize(1,input,new AbortController().signal),/OCR_CANCELLED/);
    await exited;assert.equal(engine.get(1),undefined);
  } finally {engine.dispose();await input.doc.destroy();}
});
