import type { Building, BuildingClickData, MapTransform } from '../../types';
import './HotspotLayer.css';

interface HotspotLayerProps {
  buildings: Building[];
  imageWidth: number;
  imageHeight: number;
  transform: MapTransform;
  onBuildingClick: (data: BuildingClickData) => void;
  onBuildingHover?: (buildingId: string | null) => void;
  selectedBuildingId?: string;
  /** 仅对指定的建筑禁用点击（纯装饰），其余建筑保持可交互 */
  disabledBuildingIds?: ReadonlySet<string>;
}

export function HotspotLayer({
  buildings, imageWidth, imageHeight, transform,
  onBuildingClick, onBuildingHover, selectedBuildingId, disabledBuildingIds,
}: HotspotLayerProps) {
  return (
    <div className="hotspot-layer" style={{ width: imageWidth, height: imageHeight }}>
      {buildings.map((b) => {
        const { x, y, width, height } = b.hotspot;
        const isSelected = b.id === selectedBuildingId;

        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          // 计算 hotspot 在视口上的屏幕坐标
          const screenX = transform.x + x * transform.scale;
          const screenY = transform.y + y * transform.scale;
          const screenWidth = width * transform.scale;
          const screenHeight = height * transform.scale;
          onBuildingClick({ building: b, screenX, screenY, screenWidth, screenHeight });
        };

        // 反缩放但设上限，避免缩太小时标记过大
        const invScale = Math.min(1 / transform.scale, 2.5);

        const isDecorative = disabledBuildingIds?.has(b.id) ?? false;
        const isLeader = b.id === 'building-039'; // 致元书院办公室：圆点+引线+外部标签

        return (
          <button
            key={b.id}
            className={`hotspot hotspot--cat-${b.category} ${isSelected ? 'hotspot--selected' : ''} ${isLeader ? 'hotspot--leader' : ''}`}
            style={{ left: x, top: y, width, height, ...(isDecorative ? { pointerEvents: 'none' } : {}) }}
            onClick={handleClick}
            onMouseEnter={() => onBuildingHover?.(b.id)}
            onMouseLeave={() => onBuildingHover?.(null)}
            data-building-id={b.id}
            aria-label={`查看 ${b.name} 详情`}
          >
            {isLeader ? (
              <>
                <span className="hotspot-leader-dot" style={{ transform: `scale(${invScale})`, transformOrigin: 'center center' }} />
                <span className="hotspot-leader-line" style={{ transform: `scaleX(${invScale})`, transformOrigin: 'left center' }} />
                <span className="hotspot-leader-label" style={{ transform: `translateY(-50%) scale(${invScale})`, transformOrigin: 'left center' }}>{b.name}</span>
              </>
            ) : (
              <>
                <span className="hotspot-marker" style={{ transform: `scale(${invScale})`, transformOrigin: 'center center' }}>
                  <span className="hotspot-marker-outer" />
                  <span className="hotspot-marker-inner" />
                </span>
                <span className="hotspot-label" style={{ transform: `scale(${invScale})`, transformOrigin: 'center top' }}>{b.name}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
