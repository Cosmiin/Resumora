import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { locateQuote, sourceBox } from '../../web/src/base/source-location.ts';
import { preflightPdf } from '../src/intelligence/pdf-preflight.ts';
const options = { useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname };
function inkBounds(context, width, height) {
  const {data}=context.getImageData(0,0,width,height);
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    if(data[i+3]>128 && Math.min(data[i],data[i+1],data[i+2])<128) {
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
  }
  assert.ok(right>=left && bottom>=top,'Original text has rendered ink');
  return {left,top,right,bottom};
}
test('digital boxes contain actual rendered source ink across crop, four rotations and two zoom levels',async()=>{
  const input=await PDFDocument.create(),font=await input.embedFont(StandardFonts.Helvetica);
  const page=input.addPage([500,700]);page.setRotation(degrees(90));page.setCropBox(20,30,450,650);
  const quote='Synthetic Owner';page.drawText(quote,{font,x:40,y:600,size:16});
  const bytes=await input.save();await preflightPdf(bytes);
  const doc=await getDocument({...options,data:Uint8Array.from(bytes)}).promise;
  try {
    const original=await doc.getPage(1),text=await original.getTextContent();
    const runs=text.items.filter(i=>'str' in i),matched=locateQuote(runs,quote);
    assert.equal(matched.length,1);assert.equal(matched[0].transform[4],40);assert.equal(matched[0].transform[5],600);
    assert.ok(Math.abs(matched[0].width-font.widthOfTextAtSize(quote,16))<.01,'Box uses source font advance, not arbitrary page width');
    for(const rotation of [0,90,180,270]) {
      const boxes=[];
      for(const scale of [1,2]) {
        const viewport=original.getViewport({scale,rotation}),style=text.styles[matched[0].fontName];
        const box=sourceBox(matched[0],style.ascent,style.descent,(x,y)=>viewport.convertToViewportPoint(x,y));
        const surface=doc.canvasFactory.create(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await original.render({canvas:surface.canvas,canvasContext:surface.context,viewport}).promise;
        const ink=inkBounds(surface.context,surface.canvas.width,surface.canvas.height);
        assert.ok(box.x<=ink.left+1 && box.y<=ink.top+1,'Box starts before the source glyphs');
        assert.ok(box.x+box.width>=ink.right-1 && box.y+box.height>=ink.bottom-1,'Box contains the source glyphs');
        assert.ok(box.width*box.height <= (ink.right-ink.left+1)*(ink.bottom-ink.top+1)*1.7,'Box is bounded around source text, not whole page');
        assert.ok(box.x>=0 && box.y>=0 && box.width>0 && box.height>0);
        assert.ok(box.x+box.width<=viewport.width && box.y+box.height<=viewport.height);
        boxes.push(box);doc.canvasFactory.destroy(surface);
      }
      for(const key of ['x','y','width','height']) assert.equal(boxes[1][key],boxes[0][key]*2);
    }
    assert.deepEqual(locateQuote(runs,'Owner'),[]); // Partial run: no estimated substring coordinates.
    assert.deepEqual(locateQuote([...runs,...runs],quote),[]); // Ambiguous: no arbitrary first result.
  } finally { await doc.destroy(); }
});
test('exact quote matching covers multiple native source lines and refuses missing or ambiguous evidence',async()=>{
  const input=await PDFDocument.create(),font=await input.embedFont(StandardFonts.Helvetica),page=input.addPage([500,700]);
  page.drawText('Original role',{font,x:40,y:600,size:16});page.drawText('scope',{font,x:40,y:570,size:16});
  page.drawText('Unrelated role',{font,x:40,y:450,size:16});
  const doc=await getDocument({...options,data:Uint8Array.from(await input.save())}).promise;
  try {
    const original=await doc.getPage(1),text=await original.getTextContent(),runs=text.items.filter(i=>'str' in i);
    const matched=locateQuote(runs,'Original role\n scope');
    assert.deepEqual(matched.map(r=>r.str),['Original role','scope']);
    assert.deepEqual(matched.map(r=>r.transform[5]),[600,570]);
    assert.deepEqual(locateQuote(runs,'Invented role scope'),[]);
    assert.deepEqual(locateQuote([...runs,...runs],'Original role scope'),[]);
  } finally {await doc.destroy();}
});
test('scanned PDF still renders but has no native text boxes: OCR highlight coverage remains incomplete',async()=>{
  const input=await PDFDocument.create(),page=input.addPage([300,400]);
  const image=await input.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NXYAAAAASUVORK5CYII=','base64'));
  page.drawImage(image,{x:30,y:30,width:200,height:300});
  const bytes=await input.save();assert.equal((await preflightPdf(bytes)).pages.length,1);
  const doc=await getDocument({...options,data:Uint8Array.from(bytes)}).promise;
  try {
    const original=await doc.getPage(1),text=await original.getTextContent();
    assert.equal(text.items.length,0);assert.deepEqual(locateQuote([], 'Synthetic Owner'),[]);
    const viewport=original.getViewport({scale:1}),surface=doc.canvasFactory.create(viewport.width,viewport.height);
    await original.render({canvas:surface.canvas,canvasContext:surface.context,viewport}).promise;
    assert.ok((await original.getOperatorList()).fnArray.length>0);doc.canvasFactory.destroy(surface);
  } finally {await doc.destroy();}
});
