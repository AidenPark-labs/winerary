/**
 * JPEG EXIF에서 DateTimeOriginal (또는 DateTime) 을 추출해 "YYYY-MM-DD" 로 반환.
 * 파싱 실패 또는 EXIF가 없으면 null.
 */
export function extractPhotoDate(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(parseExifDate(new DataView(e.target!.result as ArrayBuffer))); }
      catch { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 131072)); // 128 KB로 충분
  });
}

function parseExifDate(view: DataView): string | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null; // not JPEG

  let pos = 2;
  while (pos + 4 < view.byteLength) {
    const marker = view.getUint16(pos); pos += 2;
    if (marker === 0xFFE1) {                         // APP1 segment
      const segLen = view.getUint16(pos);
      if (
        view.getUint32(pos + 2) === 0x45786966 &&   // "Exif"
        view.getUint16(pos + 6) === 0x0000          // null terminator
      ) {
        return readTiffDate(view, pos + 8, segLen - 8);
      }
      pos += segLen;
    } else if (marker === 0xFFDA) {                  // SOS: image data starts
      break;
    } else if ((marker & 0xFF00) === 0xFF00 && pos + 2 <= view.byteLength) {
      pos += view.getUint16(pos);
    } else {
      break;
    }
  }
  return null;
}

function readTiffDate(view: DataView, base: number, maxLen: number): string | null {
  if (base + 8 > view.byteLength) return null;
  const le = view.getUint16(base) === 0x4949;          // "II" = little-endian
  const r16 = (o: number) => view.getUint16(base + o, le);
  const r32 = (o: number) => view.getUint32(base + o, le);
  if (r16(2) !== 0x002A) return null;                  // TIFF magic check

  const ifd0 = r32(4);
  const n = r16(ifd0);
  let dateTime: string | null = null;
  let exifPtr = 0;

  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > maxLen) break;
    const tag = r16(e);
    if (tag === 0x8769) exifPtr = r32(e + 8);           // ExifIFD pointer
    if (tag === 0x0132) dateTime = ascii(view, base + r32(e + 8));  // DateTime
  }

  // DateTimeOriginal in ExifIFD takes priority
  if (exifPtr) {
    const en = r16(exifPtr);
    for (let i = 0; i < en; i++) {
      const e = exifPtr + 2 + i * 12;
      if (e + 12 > maxLen) break;
      if (r16(e) === 0x9003) {                          // DateTimeOriginal
        dateTime = ascii(view, base + r32(e + 8));
        break;
      }
    }
  }

  if (!dateTime) return null;
  const m = dateTime.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function ascii(view: DataView, offset: number): string | null {
  let s = "";
  for (let i = 0; i < 25 && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s || null;
}
