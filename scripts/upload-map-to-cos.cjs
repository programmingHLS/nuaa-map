#!/usr/bin/env node
"use strict";
/** 上传压缩后的渐进式底图到 COS */
const COS = require('cos-nodejs-sdk-v5');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

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
cos.putObject({
  Bucket: 'nuaamap-1378966268', Region: 'ap-nanjing', Key: 'map/hand-drawn-map-v1.jpg',
  Body: readFileSync(join(__dirname, '..', 'frontend', 'public', 'hand-drawn-map-v1.jpg')),
  ContentType: 'image/jpeg', CacheControl: 'public, max-age=86400',
}, (err) => {
  if (err) { console.error('上传失败:', err.message); process.exit(1); }
  console.log('Progressive JPEG 底图已上传到 COS ✅');
});
