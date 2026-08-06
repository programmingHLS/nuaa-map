import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import mockBuildings from './data/mock-buildings.json';
import type { Building } from './types';

const buildings = mockBuildings as Building[];

/** 让离屏精灵图预加载立即完成（jsdom 无 canvas 2d → corsBlocked 回退） */
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

/** FreshmanWindow 的 /api/qa 请求默认失败 → 走内置知识库 */
const fetchMock = vi.fn();

async function renderApp() {
  const utils = render(<App />);
  const container = document.querySelector('.map-container') as HTMLElement;
  Object.defineProperty(container, 'clientWidth', { value: 1200, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true });
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  // 触发底图加载
  const img = container.querySelector('img.map-image') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: 3840, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 3328, configurable: true });
  fireEvent.load(img);

  // 等待加载完成（热区出现）
  await waitFor(() => {
    expect(screen.queryByText('地图加载中…')).not.toBeInTheDocument();
  });
  return utils;
}

describe('App 集成', () => {
  beforeEach(() => {
    stubImage();
    fetchMock.mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal('fetch', fetchMock);
    // App 的搜索飞入依赖容器尺寸上报：覆盖为延迟读取 clientWidth 后触发
    vi.stubGlobal('ResizeObserver', class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) {
        setTimeout(() => {
          const w = (el as HTMLElement).clientWidth;
          const h = (el as HTMLElement).clientHeight;
          this.cb([{ contentRect: { width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) } } as ResizeObserverEntry], this);
        }, 0);
      }
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渲染完整页面骨架：顶部导航、地图、缩略图、聊天、新生问答', async () => {
    await renderApp();
    expect(screen.getByText('天目湖校区地图')).toBeInTheDocument();
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByLabelText('打开智能问答')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新生问答/ })).toBeInTheDocument();
  });

  it('加载完成后为全部 36 栋建筑渲染热区', async () => {
    await renderApp();
    const hotspots = document.querySelectorAll('.hotspot');
    expect(hotspots.length).toBe(buildings.length);
    expect(buildings.length).toBe(36);
  });

  it('点击建筑热区 → 弹出详情、缩略图与聊天隐藏', async () => {
    await renderApp();
    const first = buildings[0];
    fireEvent.click(screen.getByLabelText(`查看 ${first.name} 详情`));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: `${first.name} 详情` })).toBeInTheDocument();
    });
    // 弹窗打开时 Minimap 与 ChatWidget 隐藏
    expect(screen.queryByText('总览')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('打开智能问答')).not.toBeInTheDocument();
    // 新生问答开关在未选中时显示（弹窗打开后仍在地图中）
  });

  it('关闭弹窗后缩略图与聊天恢复', async () => {
    await renderApp();
    const first = buildings[0];
    fireEvent.click(screen.getByLabelText(`查看 ${first.name} 详情`));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: `${first.name} 详情` })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('关闭'));
    await waitFor(() => {
      expect(screen.queryByText('总览')).toBeInTheDocument();
      expect(screen.getByLabelText('打开智能问答')).toBeInTheDocument();
    });
  });

  it('搜索选择建筑 → 弹出详情弹窗', async () => {
    await renderApp();
    const user = await import('@testing-library/user-event').then(m => m.default.setup());
    const target = buildings.find(b => b.name === '问天图书馆')!;
    const input = screen.getByPlaceholderText('搜索建筑…');
    await user.type(input, '图书馆');
    await user.click(screen.getAllByRole('button', { name: /图书馆/ })[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: `${target.name} 详情` })).toBeInTheDocument();
    });
  });

  it('弹窗内「周边设施」可跳转到另一栋建筑', async () => {
    await renderApp();
    const first = buildings[0];
    fireEvent.click(screen.getByLabelText(`查看 ${first.name} 详情`));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: `${first.name} 详情` })).toBeInTheDocument();
    });
    // 周边设施卡片（第一个）
    const nearbyCards = document.querySelectorAll('.popover-nearby-card');
    expect(nearbyCards.length).toBeGreaterThan(0);
    const targetName = nearbyCards[0]!.querySelector('.popover-nearby-card-name')?.textContent;
    fireEvent.click(nearbyCards[0]!);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: `${targetName} 详情` })).toBeInTheDocument();
    });
  });
});
