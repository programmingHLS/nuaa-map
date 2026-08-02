import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BuildingPopover, getCenterTransform, POPOVER_CENTER_OFFSET } from './BuildingPopover';
import { askRAG } from '../../services/rag';
import type { Building } from '../../types';

vi.mock('../../services/rag', () => ({
  askRAG: vi.fn(),
}));

const mockedAskRAG = vi.mocked(askRAG);

const buildings: Building[] = [
  {
    id: 'building-011', name: '明慧楼A', category: 'dormitory',
    hotspot: { x: 100, y: 100, width: 50, height: 40 },
    description: '宿舍楼 A', openTime: '全天开放', floors: 6,
    facilities: ['空调', '独立卫浴'],
  },
  {
    id: 'building-012', name: '明慧楼B', category: 'dormitory',
    hotspot: { x: 160, y: 100, width: 50, height: 40 },
    description: '宿舍楼 B', openTime: '6:00-23:00', floors: 6,
  },
  {
    id: 'building-016', name: '南山苑餐厅', category: 'canteen',
    hotspot: { x: 400, y: 300, width: 80, height: 60 },
    description: '食堂', openTime: '早餐 6:30-9:00；午餐 11:00-13:00；晚餐 17:00-20:00',
  },
];

const baseProps = {
  building: buildings[0],
  screenX: 300, screenY: 200,
  screenWidth: 50, screenHeight: 40,
  containerWidth: 1200, containerHeight: 800,
  buildings,
  onClose: vi.fn(),
  onNavigateToBuilding: vi.fn(),
};

function setup(overrides?: Partial<typeof baseProps>) {
  const props = { ...baseProps, ...overrides };
  const utils = render(<BuildingPopover {...props} />);
  return { ...utils, props };
}

describe('getCenterTransform', () => {
  it('将地图点居中到视口中心', () => {
    const t = getCenterTransform(1200, 800, 500, 400, 2);
    expect(t).toEqual({ scale: 2, x: 1200 / 2 - 500 * 2, y: 800 / 2 - 400 * 2 });
  });

  it('offsetY 正数向下偏移（给弹窗留空间）', () => {
    const t = getCenterTransform(1200, 800, 500, 400, 2, POPOVER_CENTER_OFFSET);
    expect(t.y).toBe(800 / 2 - 400 * 2 + POPOVER_CENTER_OFFSET);
  });
});

describe('BuildingPopover', () => {
  beforeEach(() => {
    mockedAskRAG.mockReset();
  });

  it('渲染建筑名称、分类、描述', () => {
    setup();
    expect(screen.getByRole('dialog', { name: '明慧楼A 详情' })).toBeInTheDocument();
    expect(screen.getByText('明慧楼A')).toBeInTheDocument();
    expect(screen.getByText('宿舍')).toBeInTheDocument();
    expect(screen.getByText('宿舍楼 A')).toBeInTheDocument();
  });

  it('渲染开放时间与楼层信息', () => {
    setup();
    expect(screen.getByText('开放时间')).toBeInTheDocument();
    expect(screen.getByText('全天开放')).toBeInTheDocument();
    expect(screen.getByText('楼层')).toBeInTheDocument();
    expect(screen.getByText('6 层')).toBeInTheDocument();
  });

  it('渲染设施标签', () => {
    setup();
    expect(screen.getByText('空调')).toBeInTheDocument();
    expect(screen.getByText('独立卫浴')).toBeInTheDocument();
  });

  it('渲染周边设施（含步行时间）', () => {
    setup();
    expect(screen.getByText('🚶 周边设施')).toBeInTheDocument();
    expect(screen.getByText('南山苑餐厅')).toBeInTheDocument();
    // 距离显示（多个卡片各有步行时间）
    expect(screen.getAllByText(/步行 \d+分钟/).length).toBeGreaterThan(0);
  });

  it('点击关闭按钮调用 onClose', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByLabelText('关闭'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('点击背景遮罩调用 onClose', () => {
    const { props } = setup();
    fireEvent.pointerDown(document.querySelector('.popover-backdrop')!);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Escape 键关闭', () => {
    const { props } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('同一精灵图建筑显示切换按钮', () => {
    // building-011 与 building-012 共用「明慧楼A+B.png」精灵图
    setup();
    expect(screen.getByLabelText('上一个')).toBeInTheDocument();
    expect(screen.getByLabelText('下一个')).toBeInTheDocument();
  });

  it('点击「下一个」切换到同精灵图的下一栋建筑', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByLabelText('下一个'));
    expect(props.onNavigateToBuilding).toHaveBeenCalledWith(buildings[1]);
  });

  it('多图片时渲染轮播并支持切换', async () => {
    const user = userEvent.setup();
    const multi = {
      ...buildings[0],
      images: ['/img/a.jpg', '/img/b.jpg', '/img/c.jpg'],
    };
    setup({ building: multi });
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    // 第一张 active
    expect(screen.getAllByRole('img')[0].classList.contains('popover-hero-img--active')).toBe(true);
    await user.click(screen.getByLabelText('下一张'));
    expect(screen.getAllByRole('img')[1].classList.contains('popover-hero-img--active')).toBe(true);
    await user.click(screen.getByLabelText('上一张'));
    expect(screen.getAllByRole('img')[0].classList.contains('popover-hero-img--active')).toBe(true);
  });

  it('图片加载失败时跳过损坏图片', () => {
    const multi = { ...buildings[0], images: ['/img/broken.jpg', '/img/ok.jpg'] };
    setup({ building: multi });
    const imgs = screen.getAllByRole('img');
    fireEvent.error(imgs[0]);
    // 损坏图片被移除，只剩 ok.jpg
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('无图片时使用分类色块（不渲染 hero 图）', () => {
    const noImg = { ...buildings[0], images: undefined, imageUrl: undefined };
    setup({ building: noImg });
    expect(document.querySelector('.popover-hero')).toBeNull();
  });

  it('内嵌问答：发送问题显示用户消息与 AI 回复', async () => {
    const user = userEvent.setup();
    mockedAskRAG.mockResolvedValue({ answer: '明慧楼开放中', fromRemote: true });
    setup();
    const input = screen.getByPlaceholderText('问问关于明慧楼A的问题…');
    await user.type(input, '几点关门');
    await user.click(screen.getByLabelText('发送'));
    expect(mockedAskRAG).toHaveBeenCalledWith('几点关门', {
      buildingId: 'building-011',
      buildingName: '明慧楼A',
      buildingDescription: '宿舍楼 A',
    });
    expect(screen.getByText('几点关门')).toBeInTheDocument();
    expect(await screen.findByText('明慧楼开放中')).toBeInTheDocument();
  });

  it('开放状态标签：全天开放 → 「开放中」', () => {
    // 状态标签渲染在轮播区，需要建筑带图片
    setup({ building: { ...buildings[0], images: ['/img/a.jpg'] } });
    expect(screen.getByText('开放中')).toBeInTheDocument();
  });

  it('周边点击跳转到另一栋建筑', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByText('南山苑餐厅'));
    expect(props.onNavigateToBuilding).toHaveBeenCalledWith(buildings[2]);
  });
});
