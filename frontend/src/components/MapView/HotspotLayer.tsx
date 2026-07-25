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
  disabled?: boolean;
}

export function HotspotLayer({
  buildings, imageWidth, imageHeight, transform,
  onBuildingClick, onBuildingHover, selectedBuildingId, disabled,
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

        return (
          <button
            key={b.id}
            className={`hotspot hotspot--cat-${b.category} ${isSelected ? 'hotspot--selected' : ''}`}
            style={{ left: x, top: y, width, height, ...(disabled ? { pointerEvents: 'none' } : {}) }}
            onClick={handleClick}
            onMouseEnter={() => onBuildingHover?.(b.id)}
            onMouseLeave={() => onBuildingHover?.(null)}
            aria-label={`查看 ${b.name} 详情`}
          >
            <span className="hotspot-marker" style={{ transform: `scale(${invScale})`, transformOrigin: 'center center' }}>
              <span className="hotspot-marker-outer" />
              <span className="hotspot-marker-inner" />
            </span>
            <span className="hotspot-label" style={{ transform: `scale(${invScale})`, transformOrigin: 'center top' }}>{b.name}</span>
          </button>
        );
      })}
    </div>
  );
}
