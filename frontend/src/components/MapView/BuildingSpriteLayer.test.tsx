import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { BuildingSpriteLayer } from './BuildingSpriteLayer';
import type { Building, MapTransform } from '../../types';

const buildings: Building[] = [
  { id: 'building-006', name: '巡天楼', category: 'teaching', hotspot: { x: 100, y: 100, width: 50, height: 40 }, description: '' },
  { id: 'building-007', name: '牧星楼', category: 'teaching', hotspot: { x: 200, y: 100, width: 50, height: 40 }, description: '' },
  { id: 'building-011', name: '明慧楼A', category: 'dormitory', hotspot: { x: 300, y: 100, width: 50, height: 40 }, description: '' },
  { id: 'building-012', name: '明慧楼B', category: 'dormitory', hotspot: { x: 360, y: 100, width: 50, height: 40 }, description: '' },
];

const transform: MapTransform = { scale: 1, x: 0, y: 0 };

/** jsdom 不支持 canvas 2d，用假 Image 构造器让离屏预加载立即完成（走 corsBlocked 回退） */
function stubImage() {
  class FakeImage {
    crossOrigin = '';
    naturalWidth = 200;
    naturalHeight = 150;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      // 同步触发 onload；canvas getContext 在 jsdom 中为 null → catch → corsBlocked 回退
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(overrides?: Partial<React.ComponentProps<typeof BuildingSpriteLayer>>) {
  const containerRef = { current: document.createElement('div') };
  const onBuildingClick = vi.fn();
  const onReady = vi.fn();
  const utils = render(
    <BuildingSpriteLayer
      buildings={buildings}
      transform={transform}
      containerRef={containerRef}
      onBuildingClick={onBuildingClick}
      onReady={onReady}
      {...overrides}
    />,
  );
  return { ...utils, containerRef, onBuildingClick, onReady };
}

describe('BuildingSpriteLayer', () => {
  it('渲染全部精灵图（27 张配置）', () => {
    stubImage();
    setup();
    expect(document.querySelectorAll('.building-sprite').length).toBe(27);
  });

  it('精灵图带建筑名 alt（多建筑精灵图拼接名称）', () => {
    stubImage();
    setup();
    const alts = Array.from(document.querySelectorAll<HTMLImageElement>('img.building-sprite-img')).map(i => i.alt);
    expect(alts.some(a => a.includes('巡天楼'))).toBe(true);
    expect(alts.some(a => a.includes('明慧楼A') && a.includes('明慧楼B'))).toBe(true);
  });

  it('图片加载完成后触发 onReady', async () => {
    stubImage();
    const { onReady } = setup();
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it('onReady 只触发一次', async () => {
    stubImage();
    const { onReady } = setup();
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 20));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('selected 精灵图带选中样式', () => {
    stubImage();
    setup({ selectedBuildingId: 'building-006' });
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.building-sprite'));
    const selected = imgs.find(el => el.className.includes('building-sprite--selected'));
    expect(selected).toBeDefined();
  });

  it('鼠标移动到精灵图上触发点击回调（包围盒命中）', async () => {
    stubImage();
    const containerRef = { current: document.createElement('div') };
    containerRef.current.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const onBuildingClick = vi.fn();
    const onReady = vi.fn();
    render(
      <BuildingSpriteLayer
        buildings={buildings}
        transform={transform}
        containerRef={containerRef}
        onBuildingClick={onBuildingClick}
        onReady={onReady}
      />,
    );
    // 等待离屏预加载完成（cache 填充后才能命中）
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const el = containerRef.current;
    // 巡天楼 sprite: displayWidth 646, centerX 3583, centerY 2419
    const x = 3583, y = 2419;
    fireEvent.mouseDown(el, { clientX: x, clientY: y });
    fireEvent.mouseMove(el, { clientX: x, clientY: y });
    // mousemove 经 rAF 节流更新 activeIdx，等待两帧 + React flush
    await new Promise<void>(res => requestAnimationFrame(() => res()));
    await new Promise<void>(res => requestAnimationFrame(() => res()));
    await waitFor(() => {
      // activeIdx 更新后再次点击
      fireEvent.click(el, { clientX: x, clientY: y });
      expect(onBuildingClick).toHaveBeenCalled();
    });
    expect(onBuildingClick.mock.calls[0][0].building.id).toBe('building-006');
  });

  it('disabled 时点击不触发回调', async () => {
    stubImage();
    const containerRef = { current: document.createElement('div') };
    containerRef.current.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const onBuildingClick = vi.fn();
    render(
      <BuildingSpriteLayer
        buildings={buildings}
        transform={transform}
        containerRef={containerRef}
        onBuildingClick={onBuildingClick}
        disabled
      />,
    );
    fireEvent.mouseMove(containerRef.current, { clientX: 3583, clientY: 2419 });
    fireEvent.click(containerRef.current, { clientX: 3583, clientY: 2419 });
    await new Promise(r => setTimeout(r, 30));
    expect(onBuildingClick).not.toHaveBeenCalled();
  });
});
