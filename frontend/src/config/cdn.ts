/**
 * CDN 资源基础 URL（V4 实验版：自有 NAS 直链）
 *
 * 2026-08-28 V4 改造：放弃腾讯云 COS，图片改由自家 NAS 提供。
 * 访问链路：nuaamap-data.liguiyu.com 灰云 DNS 直连公网 IP:10443 → NPM → V4 容器。
 *
 * 要更新图片：上传到 NAS V4 容器对应目录（覆盖同名文件），前端无需任何改动。
 */
export const CDN_BASE = 'https://nuaamap-data.liguiyu.com:10443';
