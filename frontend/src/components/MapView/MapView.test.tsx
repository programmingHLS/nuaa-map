import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapView } from './MapView';
import type { Building, BuildingClickData } from '../../types';

const buildings: Building[] = [
  { id: 'building-006', name: '巡天楼', category: 'teaching', hotspot: { x: 100, y: 200, width: 50, height: 40 }, description: '教学楼' },
  { id: 'building-017', name: '东篱苑餐厅', category: 'canteen', hotspot: { x: 300, y: 400, width: 60, height: 50 }, description: '食堂' },
];

/** 让离屏精灵图预加载立即完成 */
function stubImage() {
  class FakeImage {
    crossOrigin = '';
    naturalWidth = 200;
    naturalHeight = 150;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 渲染 MapView 并触发底图加载完成 */
async function setup(overrides?: Partial<React.ComponentProps<typeof MapView>>) {
  const onBuildingClick = vi.fn();
  const onMapStateChange = vi.fn();
  const onFreshmanExpand = vi.fn();
  const utils = render(
    <MapView
      buildings={buildings}
      selectedBuilding={null}
      onBuildingClick={onBuildingClick}
      onMapStateChange={onMapStateChange}
      onFreshmanExpand={onFreshmanExpand}
      {...overrides}
    />,
  );
  const container = utils.container.querySelector('.map-container') as HTMLElement;
  // mock 容器几何（jsdom 默认 0）
  Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  // 触发底图加载
  const img = container.querySelector('img.map-image') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: 3840, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 3328, configurable: true });
  fireEvent.load(img);

  // 等待精灵图 onReady → 加载层消失
  await waitFor(() => {
    expect(screen.queryByText('地图加载中…')).not.toBeInTheDocument();
  });

  return { ...utils, container, onBuildingClick, onMapStateChange, onFreshmanExpand };
}

describe('MapView', () => {
  it('初始显示加载状态', () => {
    stubImage();
    render(
      <MapView buildings={buildings} selectedBuilding={null} onBuildingClick={vi.fn()} />,
    );
    expect(screen.getByText('地图加载中…')).toBeInTheDocument();
  });

  it('底图加载完成后显示热区与提示', async () => {
    stubImage();
    await setup();
    expect(screen.getByLabelText('查看 巡天楼 详情')).toBeInTheDocument();
    expect(screen.getByLabelText('查看 东篱苑餐厅 详情')).toBeInTheDocument();
    expect(screen.getByText('滚轮缩放 · 拖拽平移 · 点击建筑查看详情')).toBeInTheDocument();
  });

  it('点击热区回调携带建筑与屏幕坐标', async () => {
    stubImage();
    const { onBuildingClick } = await setup();
    fireEvent.click(screen.getByLabelText('查看 巡天楼 详情'));
    const data = onBuildingClick.mock.calls[0][0] as BuildingClickData;
    expect(data.building.id).toBe('building-006');
    expect(data.screenX).toBe(100); // transform.x(0) + x(100) * scale(1)
    expect(data.screenY).toBe(200);
  });

  it('上报地图状态（含图片尺寸与源）', async () => {
    stubImage();
    const { onMapStateChange } = await setup();
    await waitFor(() => expect(onMapStateChange).toHaveBeenCalled());
    const last = onMapStateChange.mock.calls.at(-1)![0];
    expect(last.imageWidth).toBe(3840);
    expect(last.imageHeight).toBe(3328);
    expect(last.imageSrc).toContain('hand-drawn-map-v1.jpg');
  });

  it('map-navigate 事件更新地图变换（钳制边界）', async () => {
    stubImage();
    const { container } = await setup();
    window.dispatchEvent(new CustomEvent('map-navigate', {
      detail: { scale: 2, x: -100, y: -50 },
    }));
    await waitFor(() => {
      const layer = container.querySelector('.map-layer') as HTMLElement;
      expect(layer.style.transform).toContain('translate(-100px, -50px) scale(2)');
    });
  });

  it('选中建筑时渲染 BuildingPopover', async () => {
    stubImage();
    await setup({ selectedBuilding: buildings[0] });
    expect(screen.getByRole('dialog', { name: '巡天楼 详情' })).toBeInTheDocument();
  });

  it('点击「放大」按钮触发缩放（滚轮事件）', async () => {
    stubImage();
    const { container } = await setup();
    fireEvent.click(screen.getByLabelText('放大'));
    await waitFor(() => {
      const layer = container.querySelector('.map-layer') as HTMLElement;
      expect(layer.style.transform).not.toContain('scale(1)');
    });
  });

  it('点击「重置视图」恢复宽度适配', async () => {
    stubImage();
    const { container } = await setup();
    fireEvent.click(screen.getByLabelText('放大'));
    fireEvent.click(screen.getByLabelText('重置视图'));
    await waitFor(() => {
      const layer = container.querySelector('.map-layer') as HTMLElement;
      // 宽度适配：scale = 800 / 3840，x = 0
      expect(layer.style.transform).toContain('translate(0px, ');
      expect(layer.style.transform).toContain('scale(0.20833333333333334)');
    });
  });
});
