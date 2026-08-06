import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary/ErrorBoundary';

/** 渲染时抛错的子组件 */
function Bomb({ shouldThrow }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('测试错误信息');
  return <div>正常内容</div>;
}

describe('ErrorBoundary', () => {
  it('子组件正常时渲染内容', () => {
    render(<ErrorBoundary name="地图"><Bomb /></ErrorBoundary>);
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('子组件抛错时显示降级 UI（含区域名与错误信息）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary name="地图"><Bomb shouldThrow /></ErrorBoundary>);
    expect(screen.getByText('地图 加载失败')).toBeInTheDocument();
    expect(screen.getByText('测试错误信息')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
    expect(screen.getByText('刷新页面')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('无 name 时使用默认文案', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb shouldThrow /></ErrorBoundary>);
    expect(screen.getByText('组件加载失败')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('点击「重试」恢复渲染', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary name="地图"><Bomb shouldThrow /></ErrorBoundary>);
    await userEvent.click(screen.getByText('重试'));
    // 重试后子组件恢复（shouldThrow 仍为 true → 再次抛错；但状态已重置为 false 则渲染正常内容）
    // 这里 Bomb 的 props 不变，重试会再次抛错 → 显示降级 UI 的原始形态
    expect(screen.getByText('地图 加载失败')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('自定义 fallback 优先展示', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary name="聊天" fallback={<div>聊天组件出错了</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('聊天组件出错了')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('重试后子组件不再抛错时恢复正常内容', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary name="地图"><Bomb shouldThrow /></ErrorBoundary>);
    expect(screen.getByText('地图 加载失败')).toBeInTheDocument();
    // 修复子组件后，错误边界保持降级态（除非点击重试）
    rerender(<ErrorBoundary name="地图"><Bomb /></ErrorBoundary>);
    expect(screen.getByText('地图 加载失败')).toBeInTheDocument();
    await userEvent.click(screen.getByText('重试'));
    expect(screen.getByText('正常内容')).toBeInTheDocument();
    spy.mockRestore();
  });
});
