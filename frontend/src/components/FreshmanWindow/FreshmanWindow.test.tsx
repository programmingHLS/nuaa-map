import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FreshmanWindow } from './FreshmanWindow';

const fetchMock = vi.fn();

function setup(fetchImpl?: typeof fetchMock) {
  vi.stubGlobal('fetch', fetchImpl ?? fetchMock);
  const onExpandedChange = vi.fn();
  const utils = render(<FreshmanWindow onExpandedChange={onExpandedChange} />);
  return { ...utils, onExpandedChange };
}

describe('FreshmanWindow', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // 默认：/api/qa 请求失败 → 组件回退到本地/内置知识库
    fetchMock.mockResolvedValue({ ok: false } as Response);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('初始渲染折叠状态的「新生问答」开关（含条数）', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /新生问答/ });
    expect(toggle).toBeInTheDocument();
    // 等待数据加载完成（FAQ 条数随数据扩充变化，不断言固定值）
    await waitFor(() => expect(toggle.textContent).toMatch(/新生问答\d+/));
  });

  it('点击展开面板，显示提问表单与常见问题列表', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    expect(screen.getByText('提问')).toBeInTheDocument();
    expect(screen.getByText('常见问题')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('例如：图书馆几点关门？')).toBeInTheDocument();
    expect(screen.getByText(/共 \d+ 条记录/)).toBeInTheDocument();
  });

  it('提交问题：知识库命中时展示参考答案', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    const textarea = screen.getByPlaceholderText('例如：图书馆几点关门？');
    await user.type(textarea, '请问南航校园网怎么登知网并免费下载论文？');
    await user.click(screen.getByRole('button', { name: '提交问题' }));
    expect(await screen.findByText('参考答案')).toBeInTheDocument();
    // 参考答案区域包含答案（列表中也存在同一条目，故用区域元素断言）
    expect(document.querySelector('.freshman-window__reply-text')?.textContent).toContain('下载论文');
  });

  it('提交问题：知识库未命中时显示待处理文案', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    const textarea = screen.getByPlaceholderText('例如：图书馆几点关门？');
    await user.type(textarea, '完全不存在的奇葩问题xyz');
    await user.click(screen.getByRole('button', { name: '提交问题' }));
    expect(await screen.findByText(/暂时没有找到答案/)).toBeInTheDocument();
  });

  it('提交问题：知识库未命中且 AI 可用时展示 AI 回答', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes('/api/ask')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ answer: 'AI 生成的新生回答', source: 'ai' }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await user.type(screen.getByPlaceholderText('例如：图书馆几点关门？'), '完全不存在的奇葩问题xyz');
    await user.click(screen.getByRole('button', { name: '提交问题' }));
    expect(await screen.findByText('AI 生成的新生回答')).toBeInTheDocument();
    expect(screen.getByText('已通过 AI 生成回答')).toBeInTheDocument();
    // AI 回答必须标明「使用了 AI」
    expect(screen.getByText(/已使用 AI 生成/)).toBeInTheDocument();
  });

  it('提交问题：AI 超时时透传「正在思考中」提示（与不可用区分）', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes('/api/ask')) {
        return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
      }
      return Promise.resolve({ ok: false } as Response);
    });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await user.type(screen.getByPlaceholderText('例如：图书馆几点关门？'), '完全不存在的奇葩问题xyz');
    await user.click(screen.getByRole('button', { name: '提交问题' }));
    expect(await screen.findByText(/AI 正在思考中/)).toBeInTheDocument();
    expect(screen.getByText('AI 响应超时，请稍后重试')).toBeInTheDocument();
  });

  it('提交问题：LLM 判定命中知识库时返回原答案且不显示 AI 标记', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes('/api/ask')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ answer: '图书馆闭馆时间为22:00', source: 'kb' }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await user.type(screen.getByPlaceholderText('例如：图书馆几点关门？'), '图书馆几点关门');
    await user.click(screen.getByRole('button', { name: '提交问题' }));
    expect(await screen.findByText('图书馆闭馆时间为22:00')).toBeInTheDocument();
    expect(screen.getByText(/来自知识库/)).toBeInTheDocument();
    expect(screen.queryByText(/已使用 AI 生成/)).not.toBeInTheDocument();
  });

  it('关键词搜索过滤常见问题列表', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    const search = screen.getByPlaceholderText('输入宿舍、食堂、图书馆等关键词');
    await user.type(search, '知网');
    await waitFor(() => {
      expect(screen.getByText(/共 \d+ 条记录/).textContent).toContain('已过滤');
    });
    // 高亮会拆分文本，改用 textContent 断言（命中的条目 question 含「知网」）
    const article = document.querySelector('.freshman-window__item');
    expect(article?.textContent).toContain('知网');
    // 命中词被 <mark> 包裹
    const marks = Array.from(document.querySelectorAll('mark')).map(m => m.textContent);
    expect(marks.some(t => t === '知网')).toBe(true);
  });

  it('搜索无结果时显示空状态', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await user.type(screen.getByPlaceholderText('输入宿舍、食堂、图书馆等关键词'), '不存在的关键词zzz');
    expect(await screen.findByText('没有匹配的问题，试试其他关键词')).toBeInTheDocument();
  });

  it('点击「未解决」将问题保存到 localStorage', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await user.type(screen.getByPlaceholderText('例如：图书馆几点关门？'), '未知问题abc');
    await user.click(screen.getByRole('button', { name: '提交问题' }));
    await screen.findByText(/暂时没有找到答案/);
    await user.click(screen.getByRole('button', { name: '? 未解决' }));
    const saved = JSON.parse(window.localStorage.getItem('nuaa-map-freshman-qa') ?? '{}');
    expect(saved._entries.length).toBeGreaterThan(0);
    expect(saved._entries[0].question).toBe('未知问题abc');
    expect(saved._entries[0].status).toBe('pending');
  });

  it('服务端返回数据时展示服务端条目（含待审核状态）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          { id: 'srv-1', question: '服务器问题一', answer: '服务器答案', createdAt: '2026-01-01', status: 'pending' },
        ],
      }),
    } as Response);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    expect(await screen.findByText(/Q: 服务器问题一/)).toBeInTheDocument();
    expect(screen.getByText('⏳ 待审核')).toBeInTheDocument();
    // 显示补充回复按钮
    expect(screen.getByRole('button', { name: '补充回复' })).toBeInTheDocument();
  });

  it('服务端加载失败时回退到内置 FAQ', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: /新生问答/ });
    await waitFor(() => expect(toggle.textContent).toMatch(/新生问答\d+/));
    await userEvent.click(toggle);
    // 列表懒渲染：目标条目位于内置知识库第 68 条，滚动列表触发加载后续分页
    const list = document.querySelector('.freshman-window__list') as HTMLElement;
    fireEvent.scroll(list);
    expect(await screen.findByText(/南航校园网怎么登知网并免费下载论文/)).toBeInTheDocument();
  });

  it('展开状态变化通知 onExpandedChange', async () => {
    const user = userEvent.setup();
    const { onExpandedChange } = setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await waitFor(() => expect(onExpandedChange).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    await waitFor(() => expect(onExpandedChange).toHaveBeenCalledWith(false));
  });

  it('点击面板外部关闭面板（进入 exiting 阶段）', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /新生问答/ }));
    expect(screen.getByText('提问')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(document.querySelector('.freshman-window__panel--exiting')).not.toBeNull();
    });
    // 开关状态复位
    expect(screen.getByRole('button', { name: /新生问答/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
