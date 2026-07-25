#!/usr/bin/env node
"use strict";
/**
 * 压缩建筑实景照片为 WebP，底图转为渐进式 JPEG
 *
 * 用法: node scripts/compress-images.cjs
 *
 * 压缩策略:
 *   建筑照片 → WebP quality=80, max 800px 宽
 *   底图     → 渐进式 JPEG quality=85
 */
const sharp = require('sharp');
const { readdir, stat, writeFile } = require('fs/promises');
const { join, extname, relative } = require('path');
const { existsSync } = require('fs');

const PROJECT_ROOT = join(__dirname, '..');
const BUILDINGS_DIR = join(PROJECT_ROOT, 'frontend', 'public', 'buildings');
const MAP_SRC = join(PROJECT_ROOT, 'frontend', 'public', 'hand-drawn-map-v1.jpg');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(fp); }
    else if (/\.(jpg|jpeg|png)$/i.test(entry.name)) { yield fp; }
  }
}

async function compressBuildings() {
  console.log('=== 压缩建筑照片 ===\n');
  let ok = 0, bad = 0, savedTotal = 0;
  const errs = [];

  for await (const fp of walk(BUILDINGS_DIR)) {
    const ext = extname(fp).toLowerCase();
    if (ext === '.svg') continue;
    const rel = relative(BUILDINGS_DIR, fp);

    try {
      const inputStat = await stat(fp);
      const img = sharp(fp);
      const meta = await img.metadata();
      const newWidth = Math.min(meta.width || 800, 800);

      const buf = await img
        .resize(newWidth, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const outPath = fp.replace(/\.(jpg|jpeg|png)$/i, '.webp');
      await writeFile(outPath, buf);
      const saved = inputStat.size - buf.length;
      savedTotal += saved;
      ok++;
      if (saved > 100 * 1024) {
        console.log(`  \x1b[32m✓\x1b[0m ${rel}  ${(inputStat.size/1024/1024).toFixed(1)}MB → ${(buf.length/1024/1024).toFixed(1)}MB (${(saved/1024).toFixed(0)}KB)`);
      } else {
        console.log(`  \x1b[32m✓\x1b[0m ${rel}  ${(inputStat.size/1024).toFixed(0)}KB → ${(buf.length/1024).toFixed(0)}KB`);
      }
    } catch (e) {
      bad++;
      console.log(`  \x1b[31m✗\x1b[0m ${rel} ${e.message}`);
      errs.push(fp);
    }
  }

  console.log(`\n建筑照片: 成功 ${ok}  失败 ${bad}  节省 ${(savedTotal/1024/1024).toFixed(0)}MB`);
  if (errs.length) { console.log('失败文件:'); errs.forEach(f => console.log(`  - ${f}`)); }
}

async function compressMap() {
  console.log('\n=== 压缩底图（渐进式 JPEG）===\n');
  if (!existsSync(MAP_SRC)) {
    console.log('  底图不存在，跳过');
    return;
  }

  try {
    const inputStat = await stat(MAP_SRC);
    const buf = await sharp(MAP_SRC)
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    await writeFile(MAP_SRC, buf);
    const saved = inputStat.size - buf.length;
    console.log(`  \x1b[32m✓\x1b[0m hand-drawn-map-v1.jpg  ${(inputStat.size/1024/1024).toFixed(1)}MB → ${(buf.length/1024/1024).toFixed(1)}MB (${(saved/1024/1024).toFixed(0)}MB)`);
  } catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m ${e.message}`);
  }
}

async function main() {
  await compressBuildings();
  await compressMap();
  console.log('\n✅ 压缩完成');
}

main().catch(e => { console.error(e); process.exit(1); });
