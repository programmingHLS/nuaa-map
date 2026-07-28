import { useRef, useEffect, useState, useCallback } from 'react';
import type { Building, BuildingClickData, MapTransform } from '../../types';
import { buildingSprites } from '../../data/building-sprites';
import './BuildingSpriteLayer.css';

interface BuildingSpriteLayerProps {
  buildings: Building[];
  transform: MapTransform;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onBuildingClick: (data: BuildingClickData) => void;
  selectedBuildingId?: string;
  disabled?: boolean;
  onReady?: () => void;
}

/** 离屏 canvas 缓存：降采样后的 alpha 数据 */
interface SpriteCache {
  /** 降采样后的宽度 */
  sw: number;
  /** 降采样后的高度 */
  sh: number;
  /** alpha 通道数据 (Uint8Array, 长度 = sw * sh) */
  alpha: Uint8Array;
  /** 自然宽高 */
  naturalW: number;
  naturalH: number;
  /** CORS 受限时 alpha 数据全为 0，回退到包围盒命中 */
  corsBlocked: boolean;
}

/** 降采样因子（每 N 像素取一个样本，平衡精度与性能） */
const DOWNSAMPLE = 4;
/** alpha 阈值：大于此值视为"有色" */
const ALPHA_THRESHOLD = 30;

export function BuildingSpriteLayer({
  buildings,
  transform,
  containerRef,
  onBuildingClick,
  selectedBuildingId,
  disabled,
  onReady,
}: BuildingSpriteLayerProps) {
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const cacheRef = useRef<(SpriteCache | null)[]>([]);
  const rafRef = useRef<number>(0);
  const lastTouchRef = useRef(0);
  const layerRef = useRef<HTMLDivElement>(null);

  /* disabled 时重置 hover 状态 */
  useEffect(() => { if (disabled) setActiveIdx(-1); }, [disabled]);

  /* 预加载所有精灵图到离屏 canvas */
  useEffect(() => {
    let loaded = 0;
    const total = buildingSprites.length;
    cacheRef.current = new Array(total).fill(null);

    buildingSprites.forEach((sprite, idx) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const nw = img.naturalWidth;
          const nh = img.naturalHeight;
          const sw = Math.ceil(nw / DOWNSAMPLE);
          const sh = Math.ceil(nh / DOWNSAMPLE);

          const cvs = document.createElement('canvas');
          cvs.width = sw;
          cvs.height = sh;
          const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, sw, sh);
          const data = ctx.getImageData(0, 0, sw, sh).data;

          // 提取 alpha 通道
          const alpha = new Uint8Array(sw * sh);
          for (let i = 0; i < sw * sh; i++) {
            alpha[i] = data[i * 4 + 3];
          }

          cacheRef.current[idx] = { sw, sh, alpha, naturalW: nw, naturalH: nh, corsBlocked: false };
        } catch (e) {
          // CDN 跨域导致 getImageData 失败，回退到包围盒命中
          cacheRef.current[idx] = { sw: 1, sh: 1, alpha: new Uint8Array(1), naturalW: img.naturalWidth, naturalH: img.naturalHeight, corsBlocked: true };
        }
        loaded++;
        if (loaded >= total) onReady?.();
      };
      img.onerror = () => {
        // 图片 404 或网络错误，建占位缓存保证包围盒命中可用
        cacheRef.current[idx] = { sw: 1, sh: 1, alpha: new Uint8Array(1), naturalW: sprite.displayWidth, naturalH: sprite.displayWidth * 0.75, corsBlocked: true };
        loaded++;
        if (loaded >= total) onReady?.();
      };
      img.src = sprite.image;
    });
  }, []);

  /* 屏幕坐标 → 地图坐标 */
  const screenToMap = useCallback(
    (clientX: number, clientY: number): { mx: number; my: number } | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const mx = (sx - transform.x) / transform.scale;
      const my = (sy - transform.y) / transform.scale;
      return { mx, my };
    },
    [containerRef, transform],
  );

  /* 检测地图坐标命中哪个精灵图（倒序遍历，返回最上层命中者） */
  const hitTest = useCallback(
    (mx: number, my: number): number => {
      for (let i = buildingSprites.length - 1; i >= 0; i--) {
        const cache = cacheRef.current[i];
        if (!cache) continue;

        const sprite = buildingSprites[i];
        const aspect = cache.naturalH / cache.naturalW;
        const dispW = sprite.displayWidth;
        const dispH = dispW * aspect;

        // 包围盒检测（CORS 回退时缩小 15% 避免误触相邻建筑）
        const margin = cache.corsBlocked ? 0.15 : 0;
        const left = sprite.centerX - dispW * (0.5 - margin);
        const top = sprite.centerY - dispH * (0.5 - margin);
        const right = sprite.centerX + dispW * (0.5 - margin);
        const bottom = sprite.centerY + dispH * (0.5 - margin);
        if (mx < left || mx > right || my < top || my > bottom) continue;

        // alpha 检测（CORS 不可用则包围盒命中即算；倒序遍历，首命中即最上层）
        if (!cache.corsBlocked) {
          const relX = (mx - left) / dispW;
          const relY = (my - top) / dispH;
          const px = Math.floor(relX * cache.sw);
          const py = Math.floor(relY * cache.sh);
          if (px < 0 || px >= cache.sw || py < 0 || py >= cache.sh) continue;
          if (cache.alpha[py * cache.sw + px] <= ALPHA_THRESHOLD) continue;
        }
        return i;
      }
      return -1;
    },
    [],
  );

  /* mousemove 处理（rAF 节流） */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      if (disabled) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const pos = screenToMap(e.clientX, e.clientY);
        if (!pos) return;
        const hit = hitTest(pos.mx, pos.my);
        setActiveIdx((prev) => (prev === hit ? prev : hit));
        // 动态设置 cursor
        if (el) el.style.cursor = hit >= 0 ? 'pointer' : '';
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(rafRef.current);
      setActiveIdx(-1);
      if (el) el.style.cursor = '';
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, screenToMap, hitTest, disabled]);

  /* 触发建筑点击 */
  const doBuildingClick = useCallback((spriteIdx: number) => {
    if (disabled || spriteIdx < 0) return;
    const sprite = buildingSprites[spriteIdx];
    const ids = sprite.buildingIds;
    let pickId = ids[0];
    if (selectedBuildingId && ids.includes(selectedBuildingId)) {
      const curIdx = ids.indexOf(selectedBuildingId);
      pickId = ids[(curIdx + 1) % ids.length];
    }
    const targetBuilding = buildings.find((b) => b.id === pickId);
    if (!targetBuilding) return;
    const screenX = transform.x + targetBuilding.hotspot.x * transform.scale;
    const screenY = transform.y + targetBuilding.hotspot.y * transform.scale;
    const screenWidth = targetBuilding.hotspot.width * transform.scale;
    const screenHeight = targetBuilding.hotspot.height * transform.scale;
    onBuildingClick({ building: targetBuilding, screenX, screenY, screenWidth, screenHeight });
  }, [disabled, selectedBuildingId, buildings, transform, onBuildingClick]);

  /* 点击处理：多建筑精灵图点击时循环切换 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onClick = () => {
      if (Date.now() - lastTouchRef.current < 500) return; // touchend 已处理
      doBuildingClick(activeIdxRef.current);
    };

    el.addEventListener('click', onClick);
    // 移动端：touch-action:none 可能阻止合成 click，用 touchend 兜底
    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const pos = screenToMap(touch.clientX, touch.clientY);
      if (!pos) return;
      const hit = hitTest(pos.mx, pos.my);
      if (hit < 0) return;
      // 同步更新 activeIdx 并触发 click，记录时间防双击
      lastTouchRef.current = Date.now();
      activeIdxRef.current = hit;
      setActiveIdx(hit);
      doBuildingClick(hit);
    };
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef, doBuildingClick, screenToMap, hitTest]);

  return (
    <div
      ref={layerRef}
      className="sprite-layer"
    >
      {buildingSprites.map((sprite, idx) => {
        const isActive = idx === activeIdx;
        const isSelected = sprite.buildingIds.includes(selectedBuildingId ?? '');

        return (
          <div
            key={sprite.image}
            className={[
              'building-sprite',
              isActive ? 'building-sprite--active' : '',
              isSelected ? 'building-sprite--selected' : '',
            ].filter(Boolean).join(' ')}
            style={{
              left: sprite.centerX,
              top: sprite.centerY,
              width: sprite.displayWidth,
            }}
          >
            <img
              src={sprite.image}
              alt={sprite.buildingIds
                .map((id) => buildings.find((b) => b.id === id)?.name)
                .filter(Boolean)
                .join(' / ')}
              draggable={false}
              className="building-sprite-img"
            />
          </div>
        );
      })}
    </div>
  );
}
