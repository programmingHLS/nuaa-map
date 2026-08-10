import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { useMapInteraction, clampTransform } from '../../hooks/useMapInteraction';
import { HotspotLayer } from './HotspotLayer';
import { BuildingSpriteLayer } from './BuildingSpriteLayer';
import { BuildingPopover } from '../BuildingPopover/BuildingPopover';
import { FreshmanWindow } from '../FreshmanWindow/FreshmanWindow';
import type { Building, BuildingClickData, MapImageMeta, MapTransform } from '../../types';
import { CDN_BASE } from '../../config/cdn';
import { getCenterTransform, POPOVER_CENTER_OFFSET } from '../BuildingPopover/BuildingPopover';
import './MapView.css';

const MAP_SRC = `${CDN_BASE}/map/hand-drawn-map-v1.jpg`;

export interface MapViewState {
  transform: MapTransform;
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  imageSrc: string;
}

interface MapViewProps {
  buildings: Building[];
  selectedBuilding: Building | null;
  onBuildingClick: (data: BuildingClickData | null) => void;
  onMapStateChange?: (state: MapViewState) => void;
  onFreshmanExpand?: (expanded: boolean) => void;
}

export function MapView({ buildings, selectedBuilding, onBuildingClick, onMapStateChange, onFreshmanExpand }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageMeta, setImageMeta] = useState<MapImageMeta>({ width: 0, height: 0, loaded: false });
  const [spritesReady, setSpritesReady] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Refs 保存最新值，供 resize 事件使用（避免闭包过期）
  const imageMetaRef = useRef(imageMeta);
  imageMetaRef.current = imageMeta;
  const containerSizeRef = useRef(containerSize);
  containerSizeRef.current = containerSize;

  const { transform, setTransform, isDragging, handlers, resetTransform } = useMapInteraction({
    containerRef,
    imageSize: imageMeta.loaded ? imageMeta : null,
  });

  /* 容器尺寸追踪 */
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 向上报告状态（供 Minimap 使用） */
  useEffect(() => {
    onMapStateChange?.({
      transform,
      containerWidth: containerSize.w,
      containerHeight: containerSize.h,
      imageWidth: imageMeta.width,
      imageHeight: imageMeta.height,
      imageSrc: MAP_SRC,
    });
  }, [transform, containerSize, imageMeta, onMapStateChange]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (img) setImageMeta({ width: img.naturalWidth, height: img.naturalHeight, loaded: true });
  }, []);

  /* 图片 + 容器就绪后宽度适配（左右对齐窗口） */
  useEffect(() => {
    if (!imageMeta.loaded || containerSize.w === 0 || containerSize.h === 0) return;
    resetTransform();
  }, [imageMeta.loaded, containerSize.w, containerSize.h, resetTransform]);

  /* 窗口缩放时保持当前视野中心，不再重置视角 */
  useEffect(() => {
    const onResize = () => {
      const meta = imageMetaRef.current;
      if (!meta.loaded || !containerRef.current) return;
      const el = containerRef.current;
      const newCw = el.clientWidth;
      const newCh = el.clientHeight;
      if (newCw === 0 || newCh === 0) return;
      const oldSize = containerSizeRef.current;
      setTransform(prev => {
        // 缩放前视口中心对应的地图坐标
        const oldCw = oldSize.w || newCw;
        const oldCh = oldSize.h || newCh;
        const mx = (oldCw / 2 - prev.x) / prev.scale;
        const my = (oldCh / 2 - prev.y) / prev.scale;
        // 新缩放比例适配宽度
        const newScale = newCw / meta.width;
        return clampTransform(
          { scale: newScale, x: newCw / 2 - mx * newScale, y: newCh / 2 - my * newScale },
          newCw, newCh, meta.width, meta.height,
        );
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setTransform]);

  /* 响应 Minimap 导航事件 / App 居中放大事件（钳制边界） */
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as MapTransform;
      if (!detail || !imageMeta.loaded || !containerRef.current) return;
      const el = containerRef.current;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw === 0 || ch === 0) return;
      setTransform(clampTransform(detail, cw, ch, imageMeta.width, imageMeta.height));
    };
    window.addEventListener('map-navigate', onNav);
    return () => window.removeEventListener('map-navigate', onNav);
  }, [setTransform, imageMeta]);

  /* 计算选中建筑的当前屏幕坐标（用于气泡定位） */
  const selectedPopoverState = selectedBuilding
    ? {
        screenX: transform.x + selectedBuilding.hotspot.x * transform.scale,
        screenY: transform.y + selectedBuilding.hotspot.y * transform.scale,
        screenW: selectedBuilding.hotspot.width * transform.scale,
        screenH: selectedBuilding.hotspot.height * transform.scale,
      }
    : null;

  return (
    <div
      className={`map-container ${isDragging ? 'map-container--dragging' : ''}`}
      ref={containerRef}
      {...handlers}
    >
      {(!imageMeta.loaded || !spritesReady) && (
        <div className="map-loading">
          <div className="map-loading-card">
            <div className="map-loading-icon">
              <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
                <rect x="12" y="16" width="40" height="32" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                <path d="M12 28h40" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
                <path d="M18 36h14" stroke="currentColor" strokeWidth="2" opacity="0.15"/>
                <circle cx="32" cy="40" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="56.5" className="map-loading-pin"/>
              </svg>
            </div>
            <div className="map-loading-bar-track">
              <div className="map-loading-bar-fill" />
            </div>
            <p className="map-loading-text">地图加载中…</p>
            <p className="map-loading-sub">
              {!imageMeta.loaded ? '正在加载天目湖校区手绘地图' : '正在加载建筑详情…'}
            </p>
          </div>
        </div>
      )}

      <div
        className="map-layer"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          opacity: imageMeta.loaded ? 1 : 0,
        }}
      >
        <img ref={imageRef} className="map-image" src={MAP_SRC}
          alt="南航天目湖校区地图" onLoad={handleImageLoad} draggable={false} />

        {imageMeta.loaded && (
          <BuildingSpriteLayer
            buildings={buildings}
            transform={transform}
            containerRef={containerRef}
            onBuildingClick={onBuildingClick}
            selectedBuildingId={selectedBuilding?.id}
            disabled={!!selectedBuilding}
            onReady={() => setSpritesReady(true)}
          />
        )}

        {imageMeta.loaded && (
          <HotspotLayer
            buildings={buildings}
            disabled={true}
            imageWidth={imageMeta.width}
            imageHeight={imageMeta.height}
            transform={transform}
            onBuildingClick={onBuildingClick}
            selectedBuildingId={selectedBuilding?.id}
          />
        )}
      </div>

      {/* 建筑气泡弹窗（渲染在变换层之外，不随地图缩放） */}
      {selectedBuilding && selectedPopoverState && (
        <BuildingPopover
          building={selectedBuilding}
          screenX={selectedPopoverState.screenX}
          screenY={selectedPopoverState.screenY}
          screenWidth={selectedPopoverState.screenW}
          screenHeight={selectedPopoverState.screenH}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
          buildings={buildings}
          onClose={() => onBuildingClick(null)}
          onNavigateToBuilding={(bld) => {
            const cx = bld.hotspot.x + bld.hotspot.width / 2;
            const cy = bld.hotspot.y + bld.hotspot.height / 2;
            const scale = transform.scale;
            window.dispatchEvent(new CustomEvent('map-navigate', {
              detail: getCenterTransform(containerSize.w, containerSize.h, cx, cy, scale, POPOVER_CENTER_OFFSET),
            }));
            // 用居中后的预期坐标，避免旧 transform 快照导致弹窗错位
            const sx = containerSize.w / 2 - bld.hotspot.width * scale / 2;
            const sy = containerSize.h / 2 + POPOVER_CENTER_OFFSET - bld.hotspot.height * scale / 2;
            const sw = bld.hotspot.width * scale;
            const sh = bld.hotspot.height * scale;
            onBuildingClick({ building: bld, screenX: sx, screenY: sy, screenWidth: sw, screenHeight: sh });
          }}
        />
      )}

      {!selectedBuilding && <FreshmanWindow onExpandedChange={onFreshmanExpand} />}

      {/* 缩放控件 */}
      <div className="map-controls">
        <button className="map-ctrl-btn" aria-label="放大"
          onClick={() => containerRef.current?.dispatchEvent(
            new WheelEvent('wheel', { deltaY: -200, bubbles: true }))}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <button className="map-ctrl-btn" aria-label="缩小"
          onClick={() => containerRef.current?.dispatchEvent(
            new WheelEvent('wheel', { deltaY: 200, bubbles: true }))}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="8" y1="11" x2="14" y2="11"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <button className="map-ctrl-btn" onClick={resetTransform} aria-label="重置视图">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {imageMeta.loaded && (
        <p className="map-hint">滚轮缩放 · 拖拽平移 · 点击建筑查看详情</p>
      )}
    </div>
  );
}
