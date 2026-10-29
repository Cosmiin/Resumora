import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { locateQuote, sourceBox } from '../../web/src/base/source-location.ts';
import { preflightPdf } from '../src/intelligence/pdf-preflight.ts';
test('synthetic digital source matches actual PDF text runs and respects rotation and zoom',async()=>{
  const input=await PDFDocument.create(),font=await input.embedFont(StandardFonts.Helvetica);
  const page=input.addPage([500,700]);page.setRotation(degrees(90));
  page.drawText('Synthetic Owner',{font,x:40,y:600,size:16});
  const bytes=await input.save();
  await preflightPdf(bytes);
  const doc=await getDocument({data:Uint8Array.from(bytes),useSystemFonts:false,isEvalSupported:false,standardFontDataUrl:new URL("../../../node_modules/pdfjs-dist/standard_fonts/",import.meta.url).pathname}).promise;
  try {
    const original=await doc.getPage(1),text=await original.getTextContent();
    const runs=text.items.filter(i=>'str' in i),matched=locateQuote(runs,'Synthetic Owner');
    const viewport=original.getViewport({scale:1,rotation:original.rotate});
    const {canvas,context}=doc.canvasFactory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await original.render({canvas,canvasContext:context,viewport}).promise;
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    assert.ok(pixels.some((v,i)=>i%4!==3&&v<100),'Original PDF text actually rendered');
    assert.equal(matched.length,1);assert.equal(matched[0].transform[4],40);assert.equal(matched[0].transform[5],600);
    for(const rotation of [0,90,180,270]) {
      const boxes=[1,2].map(scale=>{
        const viewport=original.getViewport({scale,rotation});
        const style=text.styles[matched[0].fontName];
        const box=sourceBox(matched[0],style.ascent,style.descent,(x,y)=>viewport.convertToViewportPoint(x,y));
        assert.ok(box.x>=0 && box.y>=0 && box.width>0 && box.height>0);
        assert.ok(box.x+box.width<=viewport.width && box.y+box.height<=viewport.height);
        return box;
      });
      for(const key of ['x','y','width','height']) assert.equal(boxes[1][key],boxes[0][key]*2);
    }
    assert.deepEqual(locateQuote(runs,'Owner'),[]); // Never estimate substring rectangles.
    assert.deepEqual(locateQuote([...runs,...runs],'Synthetic Owner'),[]); // Ambiguous source.
  } finally { await doc.destroy(); }
});
test('synthetic image-only scanned PDF stays admitted and renderable but has no fabricated text location',async()=>{
  const input=await PDFDocument.create(),page=input.addPage([300,400]);
  const image=await input.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NXYAAAAASUVORK5CYII=','base64'));
  page.drawImage(image,{x:30,y:30,width:200,height:300});
  const bytes=await input.save();assert.equal((await preflightPdf(bytes)).pages.length,1);
  const doc=await getDocument({data:Uint8Array.from(bytes),isEvalSupported:false}).promise;
  try {const original=await doc.getPage(1),text=await original.getTextContent();assert.equal(text.items.length,0);assert.deepEqual(locateQuote([], 'Synthetic Owner'),[]);assert.ok((await original.getOperatorList()).fnArray.length>0);} finally {await doc.destroy();}
});
