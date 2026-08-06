#!/usr/bin/env node
"use strict";
/**
 * 一次性上传：两架飞机精灵图 → COS sprites/
 * 用法: node scripts/upload-airplane-sprites.cjs
 */
const COS = require('cos-nodejs-sdk-v5');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

// 从 .env 读取
const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*(COS_SECRET_\w+)\s*=\s*(.+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const SECRET_ID = process.env.COS_SECRET_ID;
const SECRET_KEY = process.env.COS_SECRET_KEY;
if (!SECRET_ID || !SECRET_KEY) { console.error('缺少 COS_SECRET_ID/KEY'); process.exit(1); }

const BUCKET = 'nuaamap-1378966268';
const REGION = 'ap-nanjing';
const cos = new COS({ SecretId: SECRET_ID, SecretKey: SECRET_KEY });

const files = [
  { local: 'C:/Users/34774/Desktop/airplane/B737-500.png', key: 'sprites/B737-500.png' },
  { local: 'C:/Users/34774/Desktop/airplane/BAe146-300.png', key: 'sprites/BAe146-300.png' },
];

function upload(localPath, key) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET, Region: REGION, Key: key, Body: readFileSync(localPath),
      ContentType: 'image/png', CacheControl: 'public, max-age=604800',
    }, (err, data) => err ? reject(err) : resolve(data));
  });
}

(async () => {
  for (const { local, key } of files) {
    try {
      const r = await upload(local, key);
      console.log(`\u2713 ${key}  ETag=${r.ETag}`);
    } catch (e) {
      console.error(`\u2717 ${key}  ${e.message}`);
      process.exitCode = 1;
    }
  }
})();
