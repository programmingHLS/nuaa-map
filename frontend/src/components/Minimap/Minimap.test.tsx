import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Minimap } from './Minimap';
import type { MapTransform } from '../../types';

const baseProps = {
  imageSrc: 'https://example.com/map.jpg',
  imageWidth: 2000,
  imageHeight: 1500,
  transform: { scale: 2, x: -100, y: -50 } as MapTransform,
  containerWidth: 800,
  containerHeight: 600,
  onNavigate: vi.fn(),
};

/** 给 canvas 设置可点击的几何信息 */
function mockCanvasRect(canvas: HTMLElement) {
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 180, height: 135, right: 180, bottom: 135, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('Minimap', () => {
  it('imageWidth 为 0 时不渲染', () => {
    const { container } = render(<Minimap {...baseProps} imageWidth={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('渲染总览标签、缩略图与视口指示器', () => {
    render(<Minimap {...baseProps} />);
    expect(screen.getByText('总览')).toBeInTheDocument();
    const img = screen.getByAltText('');
    expect(img).toHaveAttribute('src', 'https://example.com/map.jpg');
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('视口指示器位置按比例换算', () => {
    render(<Minimap {...baseProps} />);
    // transform {scale:2, x:-100, y:-50}：visX = 100/2 = 50px → 50 * (180/2000) = 4.5
    const viewport = document.querySelector('.minimap-viewport');
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveStyle({ left: '4.5px' });
  });

  it('点击缩略图触发导航（点中心 → 地图居中到该点）', () => {
    const onNavigate = vi.fn();
    render(<Minimap {...baseProps} onNavigate={onNavigate} />);
    const canvas = screen.getByRole('img');
    mockCanvasRect(canvas);
    // 点击 canvas 中心 (90, 67.5)
    fireEvent.mouseDown(canvas, { clientX: 90, clientY: 67.5 });
    fireEvent.mouseUp(canvas, { clientX: 90, clientY: 67.5 });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    const call = onNavigate.mock.calls[0][0] as MapTransform;
    expect(call.scale).toBe(2);
    // mapX = 90 / (180/2000) = 1000 → x = 800/2 - 1000*2 = -1600
    expect(call.x).toBe(400 - 1000 * 2);
    expect(call.y).toBe(300 - (67.5 / (135 / 1500)) * 2);
  });

  it('拖拽超过阈值后触发连续导航', () => {
    const onNavigate = vi.fn();
    render(<Minimap {...baseProps} onNavigate={onNavigate} />);
    const canvas = screen.getByRole('img');
    mockCanvasRect(canvas);
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 });
    // 移动超过 DRAG_THRESHOLD(3)
    fireEvent.mouseMove(document, { clientX: 60, clientY: 60 });
    expect(onNavigate).toHaveBeenCalled();
  });

  it('拖拽距离不足阈值视为点击', () => {
    const onNavigate = vi.fn();
    render(<Minimap {...baseProps} onNavigate={onNavigate} />);
    const canvas = screen.getByRole('img');
    mockCanvasRect(canvas);
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(document, { clientX: 51, clientY: 51 }); // 移动 1px < 3
    fireEvent.mouseUp(canvas, { clientX: 51, clientY: 51 });
    // 视为点击跳转：1 次调用
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
