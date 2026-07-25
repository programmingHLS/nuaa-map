#!/usr/bin/env node
"use strict";
/** 上传建筑实景照片到 COS */
const COS = require('cos-nodejs-sdk-v5');
const { readFileSync, existsSync } = require('fs');
const { join, extname, relative } = require('path');
const { readdir } = require('fs/promises');

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

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const BUILDINGS_DIR = join(__dirname, '..', 'frontend', 'public', 'buildings');
const BUCKET = 'nuaamap-1378966268';
const REGION = 'ap-nanjing';

const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(fp); }
    else if (/\.(webp|jpg|jpeg|png|svg)$/i.test(entry.name)) { yield fp; }
  }
}

function uploadFile(localPath, key) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET, Region: REGION, Key: key, Body: readFileSync(localPath),
      ContentType: MIME[extname(localPath).toLowerCase()] || 'application/octet-stream',
      CacheControl: 'public, max-age=604800',
    }, (err) => err ? reject(err) : resolve());
  });
}

async function main() {
  console.log('上传建筑照片到 COS...\n');
  let ok = 0, bad = 0;
  for await (const fp of walk(BUILDINGS_DIR)) {
    const key = 'buildings/' + relative(BUILDINGS_DIR, fp).replace(/\\/g, '/');
    try { await uploadFile(fp, key); ok++; console.log(`  \x1b[32m✓\x1b[0m ${key}`); }
    catch (e) { bad++; console.log(`  \x1b[31m✗\x1b[0m ${key} ${e.message}`); }
  }
  console.log(`\n成功: ${ok}  失败: ${bad}`);
}

main().catch(e => { console.error(e); process.exit(1); });
