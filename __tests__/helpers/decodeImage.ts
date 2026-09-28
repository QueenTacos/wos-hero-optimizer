// Test-only image decoding (Node): PNG via pngjs, JPEG via jpeg-js.
import fs from "fs";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import type { RGBAImage } from "../../imageRecognition/pixels";

export function decodeImageFile(file: string): RGBAImage {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    // Some supplied PNGs have trailing bytes after IEND (browsers ignore them; pngjs doesn't).
    const iend = buf.indexOf("IEND");
    const png = PNG.sync.read(iend > 0 ? buf.subarray(0, iend + 8) : buf);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  }
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}
