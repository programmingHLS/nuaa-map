/**
 * CDN 资源基础 URL（Cloudflare R2）
 *
 * 所有静态图片（底图、精灵图、占位图等）通过 R2 + Cloudflare CDN 分发，
 * 不在 Git 仓库中存储大体积图片文件。
 *
 * 要更新图片：直接上传到 R2 bucket（覆盖同名文件），前端无需任何改动。
 * 上传脚本见：scripts/upload-sprites-to-r2.cjs
 */
export const R2_BASE = 'https://pub-a920e4de81b549059d6d99f7077bc7e5.r2.dev';
