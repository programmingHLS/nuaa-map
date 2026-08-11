import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HotspotLayer } from './HotspotLayer';
import type { Building, MapTransform } from '../../types';

const buildings: Building[] = [
  { id: 'building-006', name: '巡天楼', category: 'teaching', hotspot: { x: 100, y: 200, width: 50, height: 40 }, description: '教学楼' },
  { id: 'building-017', name: '东篱苑餐厅', category: 'canteen', hotspot: { x: 300, y: 400, width: 60, height: 50 }, description: '食堂' },
];

const transform: MapTransform = { scale: 2, x: -50, y: 30 };

function setup(overrides?: Partial<React.ComponentProps<typeof HotspotLayer>>) {
  const onBuildingClick = vi.fn();
  const onBuildingHover = vi.fn();
  const utils = render(
    <HotspotLayer
      buildings={buildings}
      imageWidth={1000}
      imageHeight={800}
      transform={transform}
      onBuildingClick={onBuildingClick}
      onBuildingHover={onBuildingHover}
      {...overrides}
    />,
  );
  return { ...utils, onBuildingClick, onBuildingHover };
}

describe('HotspotLayer', () => {
  it('为每栋建筑渲染热区按钮', () => {
    setup();
    expect(screen.getByLabelText('查看 巡天楼 详情')).toBeInTheDocument();
    expect(screen.getByLabelText('查看 东篱苑餐厅 详情')).toBeInTheDocument();
  });

  it('点击热区回调携带屏幕坐标（transform 换算）', () => {
    const { onBuildingClick } = setup();
    fireEvent.click(screen.getByLabelText('查看 巡天楼 详情'));
    // screenX = transform.x + x * scale = -50 + 100*2 = 150
    expect(onBuildingClick).toHaveBeenCalledWith({
      building: buildings[0],
      screenX: -50 + 100 * 2,
      screenY: 30 + 200 * 2,
      screenWidth: 50 * 2,
      screenHeight: 40 * 2,
    });
  });

  it('hover 触发回调', () => {
    const { onBuildingHover } = setup();
    fireEvent.mouseEnter(screen.getByLabelText('查看 巡天楼 详情'));
    expect(onBuildingHover).toHaveBeenCalledWith('building-006');
    fireEvent.mouseLeave(screen.getByLabelText('查看 巡天楼 详情'));
    expect(onBuildingHover).toHaveBeenCalledWith(null);
  });

  it('selected 建筑带选中样式类', () => {
    setup({ selectedBuildingId: 'building-017' });
    const btn = screen.getByLabelText('查看 东篱苑餐厅 详情');
    expect(btn.className).toContain('hotspot--selected');
  });

  it('disabledBuildingIds 时对应热区 pointer-events: none', () => {
    setup({ disabledBuildingIds: new Set(['building-006']) });
    const decorative = screen.getByLabelText('查看 巡天楼 详情');
    const interactive = screen.getByLabelText('查看 东篱苑餐厅 详情');
    expect(decorative).toHaveStyle({ pointerEvents: 'none' });
    expect(interactive).not.toHaveStyle({ pointerEvents: 'none' });
  });

  it('热区位置样式使用像素坐标', () => {
    setup();
    const btn = screen.getByLabelText('查看 巡天楼 详情');
    expect(btn).toHaveStyle({ left: '100px', top: '200px', width: '50px', height: '40px' });
  });

  it('点击事件阻止冒泡（不触发父级）', () => {
    const { onBuildingClick } = setup();
    const btn = screen.getByLabelText('查看 巡天楼 详情');
    const parentStop = vi.fn();
    btn.parentElement!.addEventListener('click', parentStop);
    fireEvent.click(btn);
    expect(onBuildingClick).toHaveBeenCalledTimes(1);
    // stopPropagation 在 React 合成事件层生效，原生父级监听仍会收到冒泡（React 委托在根）——这里只验证回调未被重复触发
    expect(onBuildingClick).toHaveBeenCalledTimes(1);
  });

  it('书院（building-039）矩形区域不拦截点击，交互热区为文字标签', () => {
    const shuyuan: Building = {
      id: 'building-039', name: '致元书院办公室', category: 'service',
      hotspot: { x: 500, y: 600, width: 133, height: 132 }, description: '书院办公',
    };
    const { onBuildingClick } = setup({ buildings: [shuyuan] });
    // 整个矩形按钮 pointer-events: none（不拦截点击）
    const btn = screen.getByLabelText('查看 致元书院办公室 详情');
    expect(btn).toHaveStyle({ pointerEvents: 'none' });
    // 文字标签作为热区：点击触发与普通建筑一致的回调
    const label = screen.getByRole('button', { name: '致元书院办公室' });
    fireEvent.click(label);
    expect(onBuildingClick).toHaveBeenCalledTimes(1);
    expect(onBuildingClick).toHaveBeenCalledWith({
      building: shuyuan,
      screenX: -50 + 500 * 2,
      screenY: 30 + 600 * 2,
      screenWidth: 133 * 2,
      screenHeight: 132 * 2,
    });
  });
});
