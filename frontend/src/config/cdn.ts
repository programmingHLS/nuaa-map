/**
 * CDN 资源基础 URL（腾讯云 COS）
 *
 * 所有静态图片（底图、精灵图、占位图等）通过 COS 分发，
 * 不在 Git 仓库中存储大体积图片文件。
 *
 * 要更新图片：直接上传到 COS bucket（覆盖同名文件），前端无需任何改动。
 * 上传脚本见：scripts/upload-to-cos.cjs
 */
export const CDN_BASE = 'https://nuaamap-1378966268.cos.ap-nanjing.myqcloud.com';
