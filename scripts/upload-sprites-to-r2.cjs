#!/usr/bin/env node
"use strict";
/**
 * 迁移所有地图图片到 Cloudflare R2
 *
 * 用法: node scripts/upload-sprites-to-r2.cjs
 *
 * 上传清单:
 *   frontend/public/hand-drawn-map-v1.jpg    → map/hand-drawn-map-v1.jpg
 *   frontend/public/placeholder-map.svg     → map/placeholder-map.svg
 *   frontend/public/buildings/sprites/*.png → sprites/*.png
 */
const { readFileSync } = require('fs');
const { join, relative } = require('path');
const { readdir } = require('fs/promises');
const { createHash, createHmac } = require('crypto');

const ENDPOINT = 'https://dd4e32d8d75f86ffafa61a30836ab510.r2.cloudflarestorage.com';
const BUCKET = 'nuaamap-buildings';
const ACCESS_KEY = 'a4e2fee404a223e4526af0d432ac32d5';
const SECRET_KEY = 'c3b0726e2da5ed2f5720dc3c708c0bbc60c0ee8b80279c123e5f17b9c596bbbb';
const PROJECT_ROOT = join(__dirname, '..');

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
function sign(key, msg) { return createHmac('sha256', key).update(msg).digest('hex'); }

function getSignatureKey(key, dateStamp, region) {
  const kDate = createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

/** AWS SIGV4 规范：路径段逐段 URL 编码 */
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function uploadFile(filePath, objectKey) {
  const fileBuffer = readFileSync(filePath);
  const contentHash = sha256(fileBuffer);
  const ext = filePath.split('.').pop().toLowerCase();
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
  const ct = mimeMap[ext] || 'application/octet-stream';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const host = new URL(ENDPOINT).host;

  const encodedKey = encodePath(objectKey);  // 签名中用编码后的路径
  const canonicalReq = [
    'PUT', '/' + BUCKET + '/' + encodedKey, '',
    'content-type:' + ct, 'host:' + host,
    'x-amz-content-sha256:' + contentHash, 'x-amz-date:' + amzDate,
    '', 'content-type;host;x-amz-content-sha256;x-amz-date', contentHash
  ].join('\n');

  const scope = dateStamp + '/' + region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalReq)].join('\n');
  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, region);
  const signature = sign(signingKey, stringToSign);
  const auth = 'AWS4-HMAC-SHA256 Credential=' + ACCESS_KEY + '/' + scope + ', SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=' + signature;

  // 实际 HTTP 请求中使用编码后的 URL
  const resp = await fetch(ENDPOINT + '/' + BUCKET + '/' + encodedKey, {
    method: 'PUT',
    headers: { 'Content-Type': ct, 'Host': host, 'x-amz-content-sha256': contentHash, 'x-amz-date': amzDate, 'Authorization': auth },
    body: fileBuffer,
  });
  return resp.status;
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

  console.log('R2 图片上传\n');
  let ok = 0, bad = 0;
  const errs = [];

  // 1. 上传底图
  const mapFiles = [
    { local: join(publicDir, 'hand-drawn-map-v1.jpg'), key: 'map/hand-drawn-map-v1.jpg' },
    { local: join(publicDir, 'placeholder-map.svg'), key: 'map/placeholder-map.svg' },
  ];

  for (const { local, key } of mapFiles) {
    try {
      const st = await uploadFile(local, key);
      if (st === 200) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + key); }
      else { bad++; console.log('  \x1b[31m✗\x1b[0m ' + key + ' HTTP ' + st); errs.push(key); }
    } catch (e) { bad++; console.log('  \x1b[31m✗\x1b[0m ' + key + ' ' + e.message); errs.push(key); }
  }

  // 2. 上传精灵图
  for await (const fp of walk(spritesDir)) {
    const basename = relative(spritesDir, fp).replace(/\\/g, '/');
    const key = 'sprites/' + basename;
    try {
      const st = await uploadFile(fp, key);
      if (st === 200) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + key); }
      else { bad++; console.log('  \x1b[31m✗\x1b[0m ' + key + ' HTTP ' + st); errs.push(key); }
    } catch (e) { bad++; console.log('  \x1b[31m✗\x1b[0m ' + key + ' ' + e.message); errs.push(key); }
  }

  console.log('\n成功: ' + ok + '  失败: ' + bad);
  if (errs.length) { console.log('失败文件:'); errs.forEach(f => console.log('  - ' + f)); }
}

main().catch(e => { console.error(e); process.exit(1); });
