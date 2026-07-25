import { useState, useCallback } from 'react';
import { TopBar } from './components/TopBar/TopBar';
import { MapView } from './components/MapView/MapView';
import type { MapViewState } from './components/MapView/MapView';
import { Minimap } from './components/Minimap/Minimap';
import { ChatWidget } from './components/ChatWidget/ChatWidget';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import type { Building, BuildingClickData, MapTransform } from './types';
import mockBuildings from './data/mock-buildings.json';
import './App.css';

const DEFAULT_MAP_STATE: MapViewState = {
  transform: { scale: 1, x: 0, y: 0 },
  containerWidth: 0, containerHeight: 0,
  imageWidth: 0, imageHeight: 0, imageSrc: '',
};

function App() {
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [mapState, setMapState] = useState<MapViewState>(DEFAULT_MAP_STATE);
  const buildings = mockBuildings as Building[];

  /* 点击地标 → 平移居中（偏移让弹窗有空间），保持当前缩放 */
  const handleBuildingClick = useCallback((data: BuildingClickData | null) => {
    setSelectedBuilding(data?.building ?? null);
    if (!data) return;
    const { containerWidth, containerHeight, imageWidth, imageHeight, transform } = mapState;
    if (!imageWidth || !imageHeight || !containerWidth || !containerHeight) return;
    const b = data.building;
    const cx = b.hotspot.x + b.hotspot.width / 2;
    const cy = b.hotspot.y + b.hotspot.height / 2;
    const { scale } = transform;
    // 弹窗在建筑上方 ~400px，建筑下移 200px 给弹窗留空间
    window.dispatchEvent(new CustomEvent('map-navigate', {
      detail: { scale, x: containerWidth / 2 - cx * scale, y: containerHeight / 2 - cy * scale + 200 },
    }));
  }, [mapState]);

  const handleMinimapNavigate = useCallback((t: MapTransform) => {
    window.dispatchEvent(new CustomEvent('map-navigate', { detail: t }));
  }, []);

  /* 搜索选中 → 地图飞入 + 弹出详情 */
  const handleSearchSelect = useCallback((building: Building) => {
    const { transform, containerWidth, containerHeight, imageWidth, imageHeight } = mapState;
    if (!imageWidth || !imageHeight || !containerWidth || !containerHeight) return;

    const hotspotCX = building.hotspot.x + building.hotspot.width / 2;
    const hotspotCY = building.hotspot.y + building.hotspot.height / 2;
    const scale = Math.max(transform.scale, 1.5);
    const tx = containerWidth / 2 - hotspotCX * scale;
    const ty = containerHeight / 2 - hotspotCY * scale;

    window.dispatchEvent(new CustomEvent('map-navigate', { detail: { scale, x: tx, y: ty } }));
    setSelectedBuilding(building);
  }, [mapState]);

  return (
    <div className="app">
      <ErrorBoundary name="顶部导航">
        <TopBar
          buildings={buildings}
          onSearchSelect={handleSearchSelect}
        />
      </ErrorBoundary>
      <main className="app-main">
        <ErrorBoundary name="地图">
          <MapView
            buildings={buildings}
            selectedBuilding={selectedBuilding}
            onBuildingClick={handleBuildingClick}
            onMapStateChange={setMapState}
          />
        </ErrorBoundary>
      </main>
      {!selectedBuilding && (
        <Minimap
          imageSrc={mapState.imageSrc || '/placeholder-map.svg'}
          imageWidth={mapState.imageWidth}
          imageHeight={mapState.imageHeight}
          transform={mapState.transform}
          containerWidth={mapState.containerWidth}
          containerHeight={mapState.containerHeight}
          onNavigate={handleMinimapNavigate}
        />
      )}
      {!selectedBuilding && (
        <ErrorBoundary name="AI 聊天">
          <ChatWidget
            selectedBuilding={selectedBuilding}
            onViewBuilding={(bld) => handleSearchSelect(bld)}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
