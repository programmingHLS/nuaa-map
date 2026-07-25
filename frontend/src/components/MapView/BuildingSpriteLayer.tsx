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
}: BuildingSpriteLayerProps) {
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const cacheRef = useRef<(SpriteCache | null)[]>([]);
  const rafRef = useRef<number>(0);
  const layerRef = useRef<HTMLDivElement>(null);

  /* 预加载所有精灵图到离屏 canvas */
  useEffect(() => {
    cacheRef.current = buildingSprites.map(() => null);

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

          cacheRef.current[idx] = { sw, sh, alpha, naturalW: nw, naturalH: nh };
        } catch (e) {
          console.error(`精灵图加载失败（可能是 CDN 跨域问题）：${sprite.image}`, e);
        }
      };
      img.onerror = () => {
        console.error(`精灵图加载失败：${sprite.image}`);
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

  /* 检测地图坐标命中哪个精灵图 */
  const hitTest = useCallback(
    (mx: number, my: number): number => {
      for (let i = 0; i < buildingSprites.length; i++) {
        const cache = cacheRef.current[i];
        if (!cache) continue;

        const sprite = buildingSprites[i];
        const aspect = cache.naturalH / cache.naturalW;
        const dispW = sprite.displayWidth;
        const dispH = dispW * aspect;

        // 包围盒检测
        const left = sprite.centerX - dispW / 2;
        const top = sprite.centerY - dispH / 2;
        if (mx < left || mx > left + dispW || my < top || my > top + dispH) continue;

        // 转换到精灵图像素坐标（降采样空间）
        const relX = (mx - left) / dispW; // 0-1
        const relY = (my - top) / dispH; // 0-1
        const px = Math.floor(relX * cache.sw);
        const py = Math.floor(relY * cache.sh);

        if (px < 0 || px >= cache.sw || py < 0 || py >= cache.sh) continue;

        // 查询 alpha
        if (cache.alpha[py * cache.sw + px] > ALPHA_THRESHOLD) {
          return i;
        }
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

  /* 点击处理（通过 container 的 click 事件触发） */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      if (disabled || activeIdx < 0) return;
      const sprite = buildingSprites[activeIdx];
      const targetBuilding = buildings.find((b) => b.id === sprite.buildingIds[0]);
      if (!targetBuilding) return;

      const screenX = transform.x + targetBuilding.hotspot.x * transform.scale;
      const screenY = transform.y + targetBuilding.hotspot.y * transform.scale;
      const screenWidth = targetBuilding.hotspot.width * transform.scale;
      const screenHeight = targetBuilding.hotspot.height * transform.scale;
      onBuildingClick({ building: targetBuilding, screenX, screenY, screenWidth, screenHeight });
    };

    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [containerRef, activeIdx, buildings, transform, onBuildingClick, disabled]);

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
