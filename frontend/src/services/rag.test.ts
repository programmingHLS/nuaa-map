import { describe, it, expect, vi, afterEach } from 'vitest';
import { askRAG } from './rag';

const fetchMock = vi.fn();

describe('askRAG', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    fetchMock.mockReset();
  });

  it('请求成功：返回后端答案与来源，标记 fromRemote', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ answer: '后端回答', sources: ['qa-dorm.json'] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const resp = await askRAG('宿舍几点关门');
    expect(resp).toEqual({
      answer: '后端回答',
      sources: ['qa-dorm.json'],
      fromRemote: true,
    });
    // 请求体包含问题与上下文
    const [url, init] = fetchMock.mock.calls[0];
    // 端点 = RAG_API_URL（来自 .env）+ /api/chat
    expect(String(url)).toMatch(/\/api\/chat$/);
    expect(JSON.parse(init!.body as string)).toMatchObject({ question: '宿舍几点关门' });
  });

  it('携带建筑上下文时请求体包含 buildingId 与描述', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ answer: 'ok' }) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await askRAG('这里几点关门', {
      buildingId: 'building-017',
      buildingName: '东篱苑餐厅',
      buildingDescription: '天目湖校区食堂',
    });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.buildingId).toBe('building-017');
    expect(body.context).toBe('天目湖校区食堂');
  });

  it('HTTP 错误：返回降级文案并标记 fromRemote=false', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const resp = await askRAG('测试');
    expect(resp.fromRemote).toBe(false);
    expect(resp.answer).toContain('服务暂时不可用');
    expect(resp.error).toContain('500');
  });

  it('网络异常：返回降级文案', async () => {
    fetchMock.mockRejectedValue(new Error('NetworkError'));
    vi.stubGlobal('fetch', fetchMock);

    const resp = await askRAG('测试');
    expect(resp.fromRemote).toBe(false);
    expect(resp.answer).toContain('服务暂时不可用');
  });

  it('超时（AbortError）：返回「正在思考中」文案', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    const resp = await askRAG('测试');
    expect(resp.answer).toContain('正在思考中');
    expect(resp.fromRemote).toBe(false);
  });

  it('端点以 /api/chat 结尾（RAG_API_URL 可配置）', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ answer: 'ok' }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await askRAG('hi');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/chat$/);
  });
});
