/** Real minimal synthetic PDF bytes, including xref/trailer and image-only pages. */
export function pdfFixture(pages=['Mara Ionescu operations coordinator weekly Excel reporting'],imageBytes=1){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(const text of pages){
    const id=objects.length+1;kids.push(`${id} 0 R`);
    const content=text===null?'q 50 0 0 50 10 10 cm /Scan Do Q':`BT /F1 12 Tf 20 750 Td (${text.replace(/[()\\]/g,'')}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Scan ${id+2} 0 R >> >> /Contents ${id+1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    objects.push(`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imageBytes} >>\nstream\n${'X'.repeat(imageBytes)}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
  let out='%PDF-1.7\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const n of offsets.slice(1))out+=`${String(n).padStart(10,'0')} 00000 n \n`;
  return Buffer.from(out+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
