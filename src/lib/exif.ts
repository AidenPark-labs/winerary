/**
 * 사진 파일에서 촬영 날짜를 "YYYY-MM-DD" 로 추출.
 * 1순위: JPEG EXIF DateTimeOriginal / DateTime
 * 2순위: file.lastModified (iOS 카메라 사진은 보통 촬영 날짜)
 * 실패 시 null 반환.
 */
export async function extractPhotoDate(file: File): Promise<string | null> {
  // 1) EXIF 시도
  const exifDate = await readExifDate(file);
  if (exifDate) {
    console.debug("[exif] DateTimeOriginal:", exifDate);
    return exifDate;
  }

  // 2) file.lastModified fallback
  if (file.lastModified) {
    const d = new Date(file.lastModified);
    if (!isNaN(d.getTime())) {
      const iso = d.toISOString().split("T")[0];
      console.debug("[exif] fallback lastModified:", iso);
      return iso;
    }
  }

  console.debug("[exif] no date found, type:", file.type);
  return null;
}

// ─── JPEG EXIF 파서 ───────────────────────────────────────────────────────────

function readExifDate(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(parseJpegExif(new DataView(e.target!.result as ArrayBuffer))); }
      catch (err) { console.debug("[exif] parse error:", err); resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 131072)); // 128 KB로 충분
  });
}

function parseJpegExif(view: DataView): string | null {
  // JPEG SOI 확인
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;

  let pos = 2;
  while (pos + 4 < view.byteLength) {
    const marker = view.getUint16(pos); pos += 2;

    if (marker === 0xFFE1) {                                // APP1
      const segLen = view.getUint16(pos);
      if (
        view.getUint32(pos + 2) === 0x45786966 &&          // "Exif"
        view.getUint16(pos + 6) === 0x0000                 // null pad
      ) {
        const result = parseTiffDate(view, pos + 8, segLen - 8);
        if (result) return result;
      }
      pos += segLen;

    } else if (marker === 0xFFDA) {                         // SOS: 이미지 데이터 시작
      break;

    } else if ((marker & 0xFF00) === 0xFF00 && pos + 2 <= view.byteLength) {
      pos += view.getUint16(pos);                           // 다른 세그먼트 건너뜀

    } else {
      break;
    }
  }
  return null;
}

function parseTiffDate(view: DataView, base: number, maxLen: number): string | null {
  if (base + 8 > view.byteLength) return null;

  const le = view.getUint16(base) === 0x4949;              // "II" = little-endian
  const r16 = (o: number) => view.getUint16(base + o, le);
  const r32 = (o: number) => view.getUint32(base + o, le);

  if (r16(2) !== 0x002A) return null;                      // TIFF magic

  const ifd0Offset = r32(4);
  const entryCount = r16(ifd0Offset);
  let dateTime: string | null = null;
  let exifIFDOffset = 0;

  for (let i = 0; i < entryCount; i++) {
    const e = ifd0Offset + 2 + i * 12;
    if (e + 12 > maxLen) break;
    const tag = r16(e);
    if (tag === 0x8769) exifIFDOffset = r32(e + 8);        // ExifIFD 포인터
    if (tag === 0x0132) dateTime = readAscii(view, base + r32(e + 8)); // DateTime
  }

  // DateTimeOriginal (ExifIFD) 우선
  if (exifIFDOffset) {
    const ec = r16(exifIFDOffset);
    for (let i = 0; i < ec; i++) {
      const e = exifIFDOffset + 2 + i * 12;
      if (e + 12 > maxLen) break;
      if (r16(e) === 0x9003) {                             // DateTimeOriginal
        dateTime = readAscii(view, base + r32(e + 8));
        break;
      }
    }
  }

  if (!dateTime) return null;
  // "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DD"
  const m = dateTime.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function readAscii(view: DataView, offset: number): string | null {
  let s = "";
  for (let i = 0; i < 25 && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s || null;
}
