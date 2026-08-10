import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { highlightMatch } from './highlight';

/** 渲染 highlightMatch 结果，返回 mark 文本列表 */
function renderHighlight(text: string, query: string) {
  const node = highlightMatch(text, query);
  render(<div data-testid="hl">{node}</div>);
  const container = screen.getByTestId('hl');
  const marks = Array.from(container.querySelectorAll('mark')).map(m => m.textContent);
  return { container, marks, text: container.textContent };
}

describe('highlightMatch', () => {
  it('query 为空时原样返回文本', () => {
    const node = highlightMatch('巡天楼', '  ');
    expect(node).toBe('巡天楼');
  });

  it('text 为空时返回空', () => {
    expect(highlightMatch('', '图书馆')).toBe('');
  });

  it('命中关键词包上 <mark>', () => {
    const { marks } = renderHighlight('图书馆几点关门', '图书馆');
    expect(marks).toEqual(['图书馆']);
  });

  it('大小写不敏感', () => {
    const { marks } = renderHighlight('NUAA Map', 'nuaa');
    expect(marks).toEqual(['NUAA']);
  });

  it('多处命中全部高亮，且保留中间文本', () => {
    const { marks, text } = renderHighlight('图书馆和体育馆', '馆');
    expect(marks).toEqual(['馆', '馆']);
    expect(text).toBe('图书馆和体育馆');
  });

  it('无命中返回原文（不含 mark）', () => {
    const { container, marks } = renderHighlight('巡天楼', '图书馆');
    expect(marks).toEqual([]);
    expect(container.textContent).toBe('巡天楼');
  });

  it('正则特殊字符被转义，不会崩溃', () => {
    const { marks, text } = renderHighlight('A.B+C', 'B+C');
    expect(marks).toEqual(['B+C']);
    expect(text).toBe('A.B+C');
  });

  it('query 带括号等字符正常匹配', () => {
    const { marks } = renderHighlight('明慧楼（A栋）', '（A栋）');
    expect(marks).toEqual(['（A栋）']);
  });

  it('连续命中时每个命中独立成 mark', () => {
    const { marks } = renderHighlight('aaaa', 'aa');
    // 正则 lastIndex 连续匹配：index 0 和 2 各命中一次
    expect(marks).toEqual(['aa', 'aa']);
  });

  it('中文问号结尾的完整问题也能命中', () => {
    const { marks } = renderHighlight('图书馆几点关门？', '几点关门');
    expect(marks).toEqual(['几点关门']);
  });

  it('mock 验证 render 无 React key 警告', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHighlight('图书馆和体育馆', '馆');
    const warnings = spy.mock.calls.filter(c => String(c[0]).includes('key'));
    expect(warnings).toHaveLength(0);
    spy.mockRestore();
  });
});
