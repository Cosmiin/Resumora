import jpeg, { init as initJpeg } from '@jsquash/jpeg/decode.js';
import encode, { init as initEncode } from '@jsquash/jpeg/encode.js';
import png, { init as initPng } from '@jsquash/png/decode.js';
import webp, { init as initWebp } from '@jsquash/webp/decode.js';
import jpegWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
import encodeWasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
import pngWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm';
import webpWasm from '@jsquash/webp/codec/dec/webp_dec.wasm';

import { inspectPhoto, PhotoError, maxPhotoBytes } from './format.ts';
let initialized: Promise<void> | undefined;
let pending: Promise<unknown> = Promise.resolve();
let queued=0;
async function run(bytes: Uint8Array) {
  const info = inspectPhoto(bytes);
  initialized ??= Promise.all([initJpeg(jpegWasm),initEncode(encodeWasm),initPng(pngWasm),initWebp(webpWasm)]).then(()=>{});
  await initialized;
  try {
    const buffer = bytes.slice().buffer;
    const image = await (info.mime==='image/jpeg'?jpeg(buffer,{preserveOrientation:true}):info.mime==='image/png'?png(buffer):webp(buffer));
    if (image.width!==info.width || image.height!==info.height || image.data.length!==info.width*info.height*4) throw new PhotoError('invalidPhoto');
    // Flatten transparency to white. Never transmit original metadata/chunks.
    for(let i=0;i<image.data.length;i+=4){const alpha=image.data[i+3]/255;for(let c=0;c<3;c++)image.data[i+c]=Math.round(image.data[i+c]*alpha+255*(1-alpha));image.data[i+3]=255;}
    const normalized = new Uint8Array(await encode(image,{quality:90}));
    if (normalized.length>maxPhotoBytes) throw new PhotoError('photoSize',413);
    return { bytes:normalized,width:image.width,height:image.height,mime:'image/jpeg' as const };
  } catch(error) { if(error instanceof PhotoError)throw error; throw new PhotoError('invalidPhoto'); }
}
/** Serialize native codec use in an isolate; it is not a durable job queue. */
export function normalizePhoto(bytes: Uint8Array) {
  if(queued>=2)return Promise.reject(new PhotoError('photoBusy',429));
  queued++;
  const result=pending.then(()=>run(bytes));pending=result.then(()=>{queued--;},()=>{queued--;});return result;
}
