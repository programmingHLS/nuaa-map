/**
 * 建筑精灵图配置（由精灵图定位工具校准生成）
 *
 * 每张精灵图是手绘等距视角的建筑切图（透明背景 PNG）。
 * 默认渲染在底图下层（被底图遮住），hover 时浮到上层并放大。
 *
 * centerX / centerY: 精灵图中心在地图坐标系中的位置（px，相对于 7176x5382 底图）
 * displayWidth: 精灵图在地图坐标系中的显示宽度
 */

import { CDN_BASE } from '../config/cdn';

/** 对中文文件名做 URI 编码，避免浏览器/代理/CDN 兼容问题 */
function spriteUrl(filename: string): string {
  return `${CDN_BASE}/sprites/${encodeURIComponent(filename)}`;
}

export interface BuildingSprite {
  /** 精灵图 URL（COS CDN） */
  image: string;
  /** 该精灵图覆盖的建筑 ID 列表 */
  buildingIds: string[];
  /** 在地图坐标系中的显示宽度 */
  displayWidth: number;
  /** 精灵图中心 X 坐标（地图坐标系） */
  centerX: number;
  /** 精灵图中心 Y 坐标（地图坐标系） */
  centerY: number;
}

export const buildingSprites = [
  {
    image: spriteUrl('巡天楼.png'),
    buildingIds: ['building-006'],
    displayWidth: 646,
    centerX: 3583,
    centerY: 2419,
  },
  {
    image: spriteUrl('牧星楼.png'),
    buildingIds: ['building-007'],
    displayWidth: 651,
    centerX: 4450,
    centerY: 2814,
  },
  {
    image: spriteUrl('笃行楼.png'),
    buildingIds: ['building-008'],
    displayWidth: 736,
    centerX: 2276,
    centerY: 2037,
  },
  {
    image: spriteUrl('知行楼.png'),
    buildingIds: ['building-009'],
    displayWidth: 970,
    centerX: 2099,
    centerY: 2479,
  },
  {
    image: spriteUrl('尚德楼.png'),
    buildingIds: ['building-010'],
    displayWidth: 1182,
    centerX: 2744,
    centerY: 3112,
  },
  {
    image: spriteUrl('明慧楼A+B.png'),
    buildingIds: ['building-011', 'building-012'],
    displayWidth: 1356,
    centerX: 4389,
    centerY: 3360,
  },
  {
    image: spriteUrl('明慧楼C+D.png'),
    buildingIds: ['building-013', 'building-014'],
    displayWidth: 884,
    centerX: 4940,
    centerY: 3046,
  },
  {
    image: spriteUrl('问天体育馆.png'),
    buildingIds: ['building-015'],
    displayWidth: 798,
    centerX: 3768,
    centerY: 2915,
  },
  {
    image: spriteUrl('南山苑餐厅.png'),
    buildingIds: ['building-016'],
    displayWidth: 500,
    centerX: 3953,
    centerY: 2125,
  },
  {
    image: spriteUrl('东篱苑餐厅.png'),
    buildingIds: ['building-017'],
    displayWidth: 554,
    centerX: 5363,
    centerY: 2614,
  },
  {
    image: spriteUrl('南山苑1号楼+2号楼.png'),
    buildingIds: ['building-018', 'building-019'],
    displayWidth: 1063,
    centerX: 3393,
    centerY: 1853,
  },
  {
    image: spriteUrl('东篱苑6号楼（同7、8、南山苑3号楼）.png'),
    buildingIds: ['building-020'],
    displayWidth: 458,
    centerX: 4293,
    centerY: 2249,
  },
  {
    image: spriteUrl('东篱苑6号楼（同7、8、南山苑3号楼）.png'),
    buildingIds: ['building-023'],
    displayWidth: 570,
    centerX: 5717,
    centerY: 2796,
  },
  {
    image: spriteUrl('东篱苑6号楼（同7、8、南山苑3号楼）.png'),
    buildingIds: ['building-024'],
    displayWidth: 583,
    centerX: 5860,
    centerY: 3242,
  },
  {
    image: spriteUrl('东篱苑6号楼（同7、8、南山苑3号楼）.png'),
    buildingIds: ['building-025'],
    displayWidth: 554,
    centerX: 6146,
    centerY: 2951,
  },
  {
    image: spriteUrl('南山苑4号楼.png'),
    buildingIds: ['building-021'],
    displayWidth: 762,
    centerX: 4293,
    centerY: 2000,
  },
  {
    image: spriteUrl('东篱苑5号楼.png'),
    buildingIds: ['building-022'],
    displayWidth: 640,
    centerX: 5033,
    centerY: 2461,
  },
  {
    image: spriteUrl('职工公寓.png'),
    buildingIds: ['building-026'],
    displayWidth: 401,
    centerX: 3284,
    centerY: 1640,
  },
  {
    image: spriteUrl('体育馆游泳馆.png'),
    buildingIds: ['building-027'],
    displayWidth: 945,
    centerX: 4200,
    centerY: 3757,
  },
  {
    image: spriteUrl('西体育场.png'),
    buildingIds: ['building-028'],
    displayWidth: 736,
    centerX: 1802,
    centerY: 1725,
  },
  {
    image: spriteUrl('东体育场.png'),
    buildingIds: ['building-029'],
    displayWidth: 989,
    centerX: 5079,
    centerY: 3990,
  },
  {
    image: spriteUrl('风雨操场.png'),
    buildingIds: ['building-030'],
    displayWidth: 547,
    centerX: 1308,
    centerY: 1994,
  },
  {
    image: spriteUrl('师生服务大厅+综合服务楼.png'),
    buildingIds: ['building-031', 'building-032'],
    displayWidth: 389,
    centerX: 2597,
    centerY: 1678,
  },
  {
    image: spriteUrl('校医院.png'),
    buildingIds: ['building-033'],
    displayWidth: 247,
    centerX: 2705,
    centerY: 1528,
  },
  {
    image: spriteUrl('垃圾中转站开闭所.png'),
    buildingIds: ['building-035'],
    displayWidth: 393,
    centerX: 2825,
    centerY: 1441,
  },
  {
    image: spriteUrl('看台.png'),
    buildingIds: ['building-036'],
    displayWidth: 566,
    centerX: 1430,
    centerY: 1563,
  }
];


/**
 * 根据建筑 ID 查找对应的精灵图配置
 */
export function getSpriteByBuildingId(buildingId: string): BuildingSprite | undefined {
  return buildingSprites.find((s) => s.buildingIds.includes(buildingId));
}
