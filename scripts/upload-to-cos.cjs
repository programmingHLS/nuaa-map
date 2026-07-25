#!/usr/bin/env node
"use strict";
/**
 * 批量上传所有地图图片到腾讯云 COS
 *
 * 用法: COS_SECRET_ID=xxx COS_SECRET_KEY=xxx node scripts/upload-to-cos.cjs
 *
 * 上传清单:
 *   frontend/public/hand-drawn-map-v1.jpg    → map/hand-drawn-map-v1.jpg
 *   frontend/public/placeholder-map.svg     → map/placeholder-map.svg
 *   frontend/public/buildings/sprites/*.png → sprites/*.png
 *
 * 注意：新克隆仓库没有 public/ 下的图片文件（已由 .gitignore 排除），
 * 图片来源：assets/map/buildings/ 下为美工源文件，需复制到 public/ 后再运行本脚本。
 */
const COS = require('cos-nodejs-sdk-v5');
const { readFileSync, existsSync } = require('fs');
const { join, extname, relative } = require('path');
const { readdir } = require('fs/promises');

// 优先用环境变量，其次从项目根目录的 .env 文件读取
function loadEnv() {
  if (process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY) return;
  const envFile = join(__dirname, '..', '.env');
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(COS_SECRET_\w+)\s*=\s*(.+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const SECRET_ID = process.env.COS_SECRET_ID;
const SECRET_KEY = process.env.COS_SECRET_KEY;
if (!SECRET_ID || !SECRET_KEY) {
  console.error('请设置环境变量 COS_SECRET_ID 和 COS_SECRET_KEY，或在项目根目录创建 .env 文件');
  process.exit(1);
}
const BUCKET = 'nuaamap-1378966268';
const REGION = 'ap-nanjing';
const PROJECT_ROOT = join(__dirname, '..');

const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY });

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function uploadFile(localPath, key) {
  return new Promise((resolve, reject) => {
    const buf = readFileSync(localPath);
    const ct = MIME_MAP[extname(localPath).toLowerCase()] || 'application/octet-stream';
    cos.putObject({
      Bucket: BUCKET, Region: REGION, Key: key, Body: buf, ContentType: ct,
      CacheControl: 'public, max-age=604800',  // 1 周 CDN 缓存，更新后需 Ctrl+Shift+R 刷新
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(fp); }
    else if (/\.(jpg|jpeg|png|webp|svg)$/i.test(entry.name)) { yield fp; }
  }
}

async function main() {
  const publicDir = join(PROJECT_ROOT, 'frontend', 'public');
  const spritesDir = join(publicDir, 'buildings', 'sprites');

  console.log('COS 上传');
  console.log(`Bucket: ${BUCKET}  Region: ${REGION}\n`);

  let ok = 0, bad = 0;
  const errs = [];

  // 1. 底图
  const mapFiles = [
    { local: join(publicDir, 'hand-drawn-map-v1.jpg'), key: 'map/hand-drawn-map-v1.jpg' },
    { local: join(publicDir, 'placeholder-map.svg'), key: 'map/placeholder-map.svg' },
  ];
  for (const { local, key } of mapFiles) {
    try {
      await uploadFile(local, key);
      ok++;
      console.log(`  \x1b[32m✓\x1b[0m ${key}`);
    } catch (e) {
      bad++;
      console.log(`  \x1b[31m✗\x1b[0m ${key} ${e.message}`);
      errs.push(key);
    }
  }

  // 2. 精灵图
  for await (const fp of walk(spritesDir)) {
    const basename = relative(spritesDir, fp).replace(/\\/g, '/');  // 跨平台安全路径
    const key = 'sprites/' + basename;
    try {
      await uploadFile(fp, key);
      ok++;
      console.log(`  \x1b[32m✓\x1b[0m ${key}`);
    } catch (e) {
      bad++;
      console.log(`  \x1b[31m✗\x1b[0m ${key} ${e.message}`);
      errs.push(key);
    }
  }

  console.log(`\n成功: ${ok}  失败: ${bad}`);
  if (errs.length) { console.log('失败文件:'); errs.forEach(f => console.log(`  - ${f}`)); }
}

main().catch(e => { console.error(e); process.exit(1); });
