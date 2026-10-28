export const maxPhotoBytes = 10 * 1024 * 1024;
// UI normalizes full-frame sources to 1600px before upload. Bound allocations
// before calling native codecs, including requests bypassing the browser.
export const maxPhotoDimension = 1600;
export class PhotoError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 422) { super(code); this.code=code; this.status=status; }
}
function invalid(): never { throw new PhotoError('invalidPhoto'); }
function checkDimensions(w: number, h: number, maxDimension: number, maxPixels: number) {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 256 || h < 256 ||
      w > maxDimension || h > maxDimension || w * h > maxPixels) throw new PhotoError('photoDimensions');
  return { width: w, height: h };
}
const text = (b: Uint8Array, p: number, n: number) => String.fromCharCode(...b.subarray(p, p + n));
/** Header bounds run BEFORE WASM allocation. No animation, remote or SVG input. */
export function inspectPhoto(bytes: Uint8Array, options: {maxDimension?:number;maxPixels?:number;allowMetadata?:boolean} = {}) {
  const dimensions = (width:number,height:number) => checkDimensions(width,height,options.maxDimension??maxPhotoDimension,options.maxPixels??maxPhotoDimension**2);
  if (!bytes.length || bytes.length > maxPhotoBytes) throw new PhotoError('photoSize', 413);
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 255 && bytes[1] === 216) {
    let pos = 2, size: { width: number; height: number } | undefined;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos++] !== 255) invalid();
      while (bytes[pos] === 255) pos++;
      if (pos >= bytes.length) invalid();
      const marker = bytes[pos++];
      if (marker === 218 || marker === 217) break;
      if (pos + 2 > bytes.length) invalid();
      const len = d.getUint16(pos);
      if (len < 2 || pos + len > bytes.length) invalid();
      // Reject arbitrary EXIF-bearing requests rather than risk decoder-dependent
      // double orientation. Browser re-encodes after EXIF orientation, before upload.
      if (!options.allowMetadata && marker === 225 && text(bytes, pos + 2, 6) === 'Exif\0\0') throw new PhotoError('normalizeLocally');
      if (!options.allowMetadata && marker === 226 && text(bytes, pos + 2, 11) === 'ICC_PROFILE') throw new PhotoError('normalizeLocally');
      if ([192,193,194].includes(marker)) {
        if (len < 8 || bytes[pos + 2] !== 8) invalid();
        size = dimensions(d.getUint16(pos + 5), d.getUint16(pos + 3));
      } else if (marker >= 195 && marker <= 207 && ![196,200,204].includes(marker)) invalid();
      pos += len;
    }
    if (!size) invalid();
    return { mime: 'image/jpeg' as const, ...size };
  }
  if (text(bytes, 0, 8) === '\x89PNG\r\n\x1a\n' && bytes.length >= 33) {
    if (text(bytes,12,4) !== 'IHDR' || d.getUint32(8) !== 13) invalid();
    const size = dimensions(d.getUint32(16),d.getUint32(20));
    let pos = 8;
    while (pos + 12 <= bytes.length) {
      const len = d.getUint32(pos), type = text(bytes,pos+4,4);
      if (len > bytes.length - pos - 12) invalid();
      if (['acTL','fcTL','fdAT'].includes(type)) throw new PhotoError('animatedPhoto');
      if (!options.allowMetadata && ['eXIf','iCCP'].includes(type)) throw new PhotoError('normalizeLocally');
      pos += len + 12;
      if (type === 'IEND') break;
    }
    return { mime: 'image/png' as const, ...size };
  }
  if (bytes.length >= 30 && text(bytes,0,4)==='RIFF' && text(bytes,8,4)==='WEBP') {
    if (d.getUint32(4,true)+8 !== bytes.length) invalid();
    let size: {width:number;height:number}|undefined;
    for (let pos=12;pos+8<=bytes.length;) {
      const type=text(bytes,pos,4),len=d.getUint32(pos+4,true),at=pos+8;
      if (len>bytes.length-at) invalid();
      if (['ANIM','ANMF'].includes(type)) throw new PhotoError('animatedPhoto');
      if (!options.allowMetadata && ['EXIF','ICCP'].includes(type)) throw new PhotoError('normalizeLocally');
      if (type==='VP8X') {
        if(len<10 || bytes[at]&2) throw new PhotoError('animatedPhoto');
        size=dimensions(1+bytes[at+4]+bytes[at+5]*256+bytes[at+6]*65536,1+bytes[at+7]+bytes[at+8]*256+bytes[at+9]*65536);
      } else if (type==='VP8 ') {
        if(len<10 || text(bytes,at+3,3)!=='\x9d\x01\x2a') invalid();
        const inner=dimensions(d.getUint16(at+6,true)&16383,d.getUint16(at+8,true)&16383);
        if(size&&(size.width!==inner.width||size.height!==inner.height))invalid();size=inner;
      } else if(type==='VP8L') {
        if(len<5||bytes[at]!==47)invalid();const v=d.getUint32(at+1,true);
        const inner=dimensions((v&16383)+1,((v>>>14)&16383)+1);
        if(size&&(size.width!==inner.width||size.height!==inner.height))invalid();size=inner;
      }
      pos=at+len+(len%2);
    }
    if(!size)invalid();return {mime:'image/webp' as const,...size};
  }
  return invalid();
}
