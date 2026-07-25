/**
 * 分析建筑精灵图 PNG 的 alpha 通道，计算非透明像素的边界框
 * 用于精确确定锚点 (anchorX, anchorY)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function parsePNG(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not PNG');

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];

  // Collect IDAT chunks
  const idatChunks = [];
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idatChunks.push(buf.slice(offset + 8, offset + 8 + len));
    if (type === 'IEND') break;
    offset += 12 + len;
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  const hasAlpha = colorType === 6;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const bpp = channels * (bitDepth / 8);
  const stride = width * bpp;

  // Unfilter
  const pixels = Buffer.alloc(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const dstStart = y * stride;

    for (let x = 0; x < stride; x++) {
      const cur = raw[rowStart + x];
      const a = x >= bpp ? pixels[dstStart + x - bpp] : 0;
      const b = y > 0 ? pixels[dstStart - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? pixels[dstStart - stride + x - bpp] : 0;

      let val;
      switch (filterType) {
        case 0: val = cur; break;
        case 1: val = (cur + a) & 0xff; break;
        case 2: val = (cur + b) & 0xff; break;
        case 3: val = (cur + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = (cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: val = cur;
      }
      pixels[dstStart + x] = val;
    }
  }

  // Find bounding box of non-transparent pixels
  let minX = width, minY = height, maxX = 0, maxY = 0;
  if (hasAlpha) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = pixels[(y * width + x) * bpp + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  } else {
    minX = 0; minY = 0; maxX = width - 1; maxY = height - 1;
  }

  return { width, height, minX, minY, maxX, maxY };
}

const dir = path.join(__dirname, '../assets/map/buildings');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();

console.log('=== 建筑精灵图 Alpha 边界框分析 ===\n');
console.log('文件名 | 图片尺寸 | 内容边界框 | 内容尺寸 | anchorX | anchorY');
console.log('-'.repeat(100));

for (const f of files) {
  try {
    const info = parsePNG(path.join(dir, f));
    const contentW = info.maxX - info.minX + 1;
    const contentH = info.maxY - info.minY + 1;
    // 锚点 = 内容中心在整张图中的相对位置
    const anchorX = ((info.minX + info.maxX) / 2 / info.width).toFixed(3);
    // 对于等距建筑，锚点 Y 应该是内容底部（地面接触点）
    const anchorY = (info.maxY / info.height).toFixed(3);
    const name = f.replace('.png', '');
    console.log(`${name} | ${info.width}x${info.height} | (${info.minX},${info.minY})-(${info.maxX},${info.maxY}) | ${contentW}x${contentH} | ${anchorX} | ${anchorY}`);
  } catch (e) {
    console.log(`${f} | ERROR: ${e.message}`);
  }
}
