/**
 * Vitest 全局测试环境初始化
 * - 注册 jest-dom 断言
 * - 补齐 jsdom 缺失的浏览器 API（ResizeObserver / scrollIntoView / matchMedia）
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/* 每个用例结束后清理挂载的 DOM */
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

/* jsdom 未实现 ResizeObserver（MapView 依赖它追踪容器尺寸） */
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

/* jsdom 未实现 scrollIntoView / scrollTo */
Element.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn();

/* matchMedia（响应式逻辑用） */
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
