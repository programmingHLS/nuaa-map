#!/usr/bin/env node
"use strict";
/**
 * 设置 COS Bucket 的 CORS 规则，允许跨域图片读取（像素级碰撞检测必需）
 * 用法: node scripts/setup-cos-cors.cjs
 */
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

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
});

const BUCKET = 'nuaamap-1378966268';
const REGION = 'ap-nanjing';

cos.putBucketCors({
  Bucket: BUCKET,
  Region: REGION,
  CORSRules: [{
    AllowedOrigins: ['*'],
    AllowedMethods: ['GET', 'HEAD'],
    AllowedHeaders: ['*'],
    ExposeHeaders: [],
    MaxAgeSeconds: 86400,
  }],
}, (err, data) => {
  if (err) { console.error('CORS 配置失败:', err.message); process.exit(1); }
  console.log('CORS 配置成功 ✅');
  console.log('现在 COS 上的图片可以被跨域读取像素数据了');
});
