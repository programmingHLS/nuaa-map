import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('渲染纯文本段落', () => {
    render(<Markdown content="你好，南航" />);
    expect(screen.getByText('你好，南航')).toBeInTheDocument();
  });

  it('渲染加粗与斜体', () => {
    render(<Markdown content="**加粗** 和 *斜体*" />);
    expect(screen.getByText('加粗').tagName).toBe('STRONG');
    expect(screen.getByText('斜体').tagName).toBe('EM');
  });

  it('渲染链接（含 href）', () => {
    render(<Markdown content="[官网](https://www.nuaa.edu.cn)" />);
    const link = screen.getByRole('link', { name: '官网' });
    expect(link).toHaveAttribute('href', 'https://www.nuaa.edu.cn');
  });

  it('渲染无序列表', () => {
    render(<Markdown content={'- 项目一\n- 项目二'} />);
    expect(screen.getByText('项目一')).toBeInTheDocument();
    expect(screen.getByText('项目二')).toBeInTheDocument();
  });

  it('渲染行内代码', () => {
    render(<Markdown content="运行 `npm run dev`" />);
    expect(screen.getByText('npm run dev').tagName).toBe('CODE');
  });

  it('渲染引用块', () => {
    render(<Markdown content="> 引用内容" />);
    expect(screen.getByText('引用内容')).toBeInTheDocument();
  });

  it('不允许的 HTML 标签被过滤（如标题、图片）', () => {
    render(<Markdown content={'# 大标题\n\n<img src="x" />\n\n正文'} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('正文')).toBeInTheDocument();
  });

  it('保留换行（同一段落内换行保留）', () => {
    render(<Markdown content={'第一行\n第二行'} />);
    // 单换行在同一 <p> 内（文本节点），不拆成 br
    const p = document.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.textContent).toContain('第一行');
    expect(p!.textContent).toContain('第二行');
  });

  it('多行消息（换行符）渲染不崩溃', () => {
    render(<Markdown content={'欢迎使用 🛩️\n\n有什么问题都可以问我～'} />);
    expect(screen.getByText(/有什么问题都可以问我/)).toBeInTheDocument();
  });
});
