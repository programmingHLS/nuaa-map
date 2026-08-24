import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { clampTransform, useMapInteraction } from './useMapInteraction';

describe('clampTransform', () => {
  it('图片大于容器时，x/y 钳制在边界内（不留白边）', () => {
    // 图片 400x300，容器 800x600，scale=1：图片 400x300 < 容器 → 居中
    const t = clampTransform({ scale: 1, x: 500, y: 500 }, 800, 600, 400, 300);
    // 图片比容器窄 → 居中
    expect(t.x).toBe((800 - 400) / 2);
    expect(t.y).toBe((600 - 300) / 2);
  });

  it('图片比容器大时钳制在边界内', () => {
    // 图片 2000x1500，容器 800x600，scale=1 → 图片 2000x1500 > 容器
    const t = clampTransform({ scale: 1, x: 99999, y: 99999 }, 800, 600, 2000, 1500);
    expect(t.x).toBe(0); // 上限 0
    expect(t.y).toBe(0);
    const t2 = clampTransform({ scale: 1, x: -99999, y: -99999 }, 800, 600, 2000, 1500);
    expect(t2.x).toBe(800 - 2000); // 下限 = cw - iw*scale
    expect(t2.y).toBe(600 - 1500);
  });

  it('scale 保持不变', () => {
    const t = clampTransform({ scale: 2.5, x: 0, y: 0 }, 800, 600, 400, 300);
    expect(t.scale).toBe(2.5);
  });

  it('边界内的值不被修改', () => {
    // 图片 2000x1500 > 容器 800x600 → x 有效范围 [-1200, 0]，y 有效范围 [-900, 0]
    const t = clampTransform({ scale: 1, x: -100, y: -50 }, 800, 600, 2000, 1500);
    expect(t.x).toBe(-100);
    expect(t.y).toBe(-50);
  });
});

describe('useMapInteraction', () => {
  const imageSize = { width: 400, height: 300 };

  /** 渲染一个测试容器，绑定 hook 返回的 handlers，并把 transform 暴露到 data 属性 */
  function setup(imageSizeOverride?: { width: number; height: number }) {
    const imgSize = imageSizeOverride ?? imageSize;
    const containerRef: React.RefObject<HTMLDivElement | null> = { current: null };

    function Harness() {
      const { transform, isDragging, handlers, resetTransform } = useMapInteraction({ containerRef, imageSize: imgSize });
      return (
        <div
          ref={containerRef}
          data-testid="container"
          {...handlers}
          data-scale={transform.scale}
          data-x={transform.x}
          data-y={transform.y}
          data-dragging={isDragging}
        >
          <button data-testid="reset" onClick={resetTransform}>重置</button>
        </div>
      );
    }

    const utils = render(<Harness />);
    const el = utils.getByTestId('container');

    // mock 容器几何信息（jsdom 中 clientWidth/clientHeight 默认 0）
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const get = () => ({
      scale: Number(el.getAttribute('data-scale')),
      x: Number(el.getAttribute('data-x')),
      y: Number(el.getAttribute('data-y')),
      dragging: el.getAttribute('data-dragging') === 'true',
    });

    return { ...utils, el, get };
  }

  it('初始状态：scale=1, x=0, y=0, 未拖拽', () => {
    const { get } = setup();
    expect(get()).toEqual({ scale: 1, x: 0, y: 0, dragging: false });
  });

  it('鼠标拖拽改变平移量，且结束后 isDragging 复位', () => {
    // 用大图（2000x1500 > 容器 800x600）让拖拽有活动空间
    const { el, get } = setup({ width: 2000, height: 1500 });

    fireEvent.mouseDown(el, { button: 0, clientX: 300, clientY: 300 });
    expect(get().dragging).toBe(true);

    // 向左上拖 100/20 → x = 0-100 = -100, y = 0-20 = -20（在 [-1200,0] / [-900,0] 内）
    fireEvent.mouseMove(el, { clientX: 200, clientY: 280 });
    expect(get().x).toBe(-100);
    expect(get().y).toBe(-20);

    fireEvent.mouseUp(el);
    expect(get().dragging).toBe(false);
  });

  it('滚轮向下（deltaY<0）放大，向上缩小，并受最大/最小缩放约束', () => {
    const { el, get } = setup();
    // 初始 scale=1，minScale = 800/400 = 2 → 首次滚轮放大被钳到 2
    fireEvent.wheel(el, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(get().scale).toBe(2);

    // 继续放大 → 2 + 0.07*2 = 2.14（约）
    fireEvent.wheel(el, { deltaY: -100, clientX: 400, clientY: 300 });
    expect(get().scale).toBeGreaterThan(2);

    // 多次放大不能超过 MAX_SCALE=3
    for (let i = 0; i < 100; i++) {
      fireEvent.wheel(el, { deltaY: -1000, clientX: 400, clientY: 300 });
    }
    expect(get().scale).toBeLessThanOrEqual(3);
  });

  it('触控板缩放（ctrlKey + 小 deltaY）系数较小', () => {
    const { el, get } = setup();
    // 先把 scale 推到 MAX_SCALE=3，脱离 minScale=2 钳制
    fireEvent.wheel(el, { deltaY: -5000, clientX: 400, clientY: 300 });
    expect(get().scale).toBe(3);

    // 触控板缩小：deltaY=5, ctrlKey → 系数 0.012 → 缩得更多
    fireEvent.wheel(el, { deltaY: 5, ctrlKey: true, clientX: 400, clientY: 300 });
    const afterTrackpad = get().scale;
    expect(afterTrackpad).toBeLessThan(4);

    // 鼠标缩小：deltaY=5 → 系数 0.0007 → 缩得少
    fireEvent.wheel(el, { deltaY: -5000, clientX: 400, clientY: 300 }); // 拉回 3
    fireEvent.wheel(el, { deltaY: 5, clientX: 400, clientY: 300 });
    const afterMouse = get().scale;

    expect(afterTrackpad).toBeLessThan(afterMouse);
  });

  it('resetTransform 宽度适配：scale = 容器宽 / 图片宽', () => {
    const { getByTestId, get } = setup();
    fireEvent.click(getByTestId('reset'));
    expect(get().scale).toBe(800 / 400); // = 2
    expect(get().x).toBe(0);
    expect(get().y).toBe((600 - 300 * 2) / 2); // 上下居中 = 0
  });

  it('卸载时移除 window mouseup 监听', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = setup();
    unmount();
    expect(spy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    spy.mockRestore();
  });

  it('双指缩放中抬起一指后，剩余单指可继续拖动（修复不跟手）', () => {
    const { el, get } = setup({ width: 2000, height: 1500 });
    const t = (x: number, y: number, identifier: number) => ({ clientX: x, clientY: y, identifier });

    // 双指按下（距离 200），进入 pinch
    fireEvent.touchStart(el, { touches: [t(100, 300, 0), t(300, 300, 1)] });
    // 双指张开到 280（ratio=1.4）→ 直写 ref：scale=1.4, x=-80, y=-120
    fireEvent.touchMove(el, { touches: [t(60, 300, 0), t(340, 300, 1)] });

    // 抬起一指（id=1），只剩 id=0 在屏幕上
    fireEvent.touchEnd(el, { touches: [t(60, 300, 0)], changedTouches: [t(340, 300, 1)] });
    // 剩余单指向左拖动 100px：跟手时 x = -80 - 100 = -180
    fireEvent.touchMove(el, { touches: [t(-40, 300, 0)] });
    // 全部抬起 → state 同步 transformRef
    fireEvent.touchEnd(el, { touches: [], changedTouches: [t(-40, 300, 0)] });

    const after = get();
    // 修复前：状态残留导致单指拖动无响应，x 停在 -80；修复后 x=-180
    expect(after.x).toBe(-180);
    expect(after.dragging).toBe(false);
  });

  it('双指缩放中距离突变（第二指重放）时重置基准，不产生缩放跳变', () => {
    const { el, get } = setup({ width: 2000, height: 1500 });
    const t = (x: number, y: number, identifier: number) => ({ clientX: x, clientY: y, identifier });

    // 双指按下：距离 200
    fireEvent.touchStart(el, { touches: [t(100, 300, 0), t(300, 300, 1)] });
    // 距离突变为 400（ratio=2 > 1.7）→ 应重置基准，scale 不应翻倍
    fireEvent.touchMove(el, { touches: [t(100, 300, 0), t(500, 300, 1)] });
    const scaleAfterJump = get().scale;
    expect(scaleAfterJump).toBe(1); // 基准重置，不放大

    // 突变后按新基准缩放：距离 400→480（ratio=1.2）→ 放大 1.2 倍
    fireEvent.touchMove(el, { touches: [t(100, 300, 0), t(580, 300, 1)] });
    fireEvent.touchEnd(el, { touches: [], changedTouches: [t(100, 300, 0), t(580, 300, 1)] });
    const scaleAfterStable = get().scale;
    expect(scaleAfterStable).toBeCloseTo(1.2, 1);
  });
});
