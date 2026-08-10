#!/usr/bin/env node
"use strict";
/** 一次性上传：两架飞机实拍照片 webp → COS buildings/ */
const COS = require('cos-nodejs-sdk-v5');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*(COS_SECRET_\w+)\s*=\s*(.+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) { console.error('缺少密钥'); process.exit(1); }

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const BUCKET = 'nuaamap-1378966268', REGION = 'ap-nanjing';

// 从 git 取文件（保证与仓库一致），写到临时文件再上传
const { execSync } = require('child_process');
const fs = require('fs');

const files = [
  { ref: 'convert/hand-drawn-map-final:frontend/public/buildings/b737/01.webp', key: 'buildings/b737/01.webp', tmp: '.tmp-b737.webp' },
  { ref: 'convert/hand-drawn-map-final:frontend/public/buildings/bae146/01.webp', key: 'buildings/bae146/01.webp', tmp: '.tmp-bae146.webp' },
];

function upload(localPath, key) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET, Region: REGION, Key: key, Body: readFileSync(localPath),
      ContentType: 'image/webp', CacheControl: 'public, max-age=604800',
    }, (err) => err ? reject(err) : resolve());
  });
}

(async () => {
  for (const { ref, key, tmp } of files) {
    try {
      execSync(`git show ${ref} > ${tmp}`, { cwd: join(__dirname, '..') });
      await upload(tmp, key);
      console.log(`\u2713 ${key}`);
    } catch (e) {
      console.error(`\u2717 ${key}  ${e.message}`);
      process.exitCode = 1;
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
})();
