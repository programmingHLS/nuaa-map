import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatWidget } from './ChatWidget';
import { askRAG } from '../../services/rag';
import type { Building } from '../../types';

vi.mock('../../services/rag', () => ({
  askRAG: vi.fn(),
}));

const mockedAskRAG = vi.mocked(askRAG);

const building: Building = {
  id: 'building-017',
  name: '东篱苑餐厅',
  category: 'canteen',
  hotspot: { x: 300, y: 200, width: 60, height: 50 },
  description: '天目湖校区食堂',
};

function setup(props?: Partial<React.ComponentProps<typeof ChatWidget>>) {
  const utils = render(<ChatWidget {...props} />);
  return utils;
}

describe('ChatWidget', () => {
  beforeEach(() => {
    mockedAskRAG.mockReset();
  });

  it('初始为收起状态，显示 FAB 按钮与提示气泡', () => {
    setup();
    expect(screen.getByLabelText('打开智能问答')).toBeInTheDocument();
    expect(screen.getByLabelText('有疑问？点我问阿源吧')).toBeInTheDocument();
    expect(screen.queryByText('阿源')).not.toBeInTheDocument();
  });

  it('点击提示气泡也能打开聊天面板', () => {
    setup();
    fireEvent.click(screen.getByLabelText('有疑问？点我问阿源吧'));
    expect(screen.getByText('阿源')).toBeInTheDocument();
  });

  it('点击 FAB 打开面板，显示欢迎消息与快捷建议', () => {
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    expect(screen.getByText('阿源')).toBeInTheDocument();
    expect(screen.getByText(/有什么关于天目湖校区的问题都可以问我/)).toBeInTheDocument();
    expect(screen.getByText('猜你想问')).toBeInTheDocument();
    // 快捷建议按钮（来自知识库默认前 3 条）
    const buttons = screen.getAllByRole('button', { name: /怎么|如何|哪里|多少|什么/ });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('发送消息：添加用户消息并显示 AI 回复', async () => {
    const user = userEvent.setup();
    mockedAskRAG.mockResolvedValue({ answer: '这是 AI 回复', fromRemote: true });
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));

    const input = screen.getByPlaceholderText('输入问题…');
    await user.type(input, '图书馆几点关门');
    fireEvent.click(screen.getByLabelText('发送'));

    expect(mockedAskRAG).toHaveBeenCalledWith('图书馆几点关门', undefined);
    expect(screen.getByText('图书馆几点关门')).toBeInTheDocument();
    expect(await screen.findByText('这是 AI 回复')).toBeInTheDocument();
  });

  it('按 Enter 发送消息', async () => {
    const user = userEvent.setup();
    mockedAskRAG.mockResolvedValue({ answer: '回复内容', fromRemote: true });
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    const input = screen.getByPlaceholderText('输入问题…');
    await user.type(input, '你好吗');
    await user.keyboard('{Enter}');
    expect(mockedAskRAG).toHaveBeenCalledWith('你好吗', undefined);
    expect(await screen.findByText('回复内容')).toBeInTheDocument();
  });

  it('点击快捷建议直接发送', async () => {
    const user = userEvent.setup();
    mockedAskRAG.mockResolvedValue({ answer: '好的', fromRemote: true });
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    // 精确获取：建议按钮在 .chat-suggestion-btn
    const suggestionBtns = document.querySelectorAll('.chat-suggestion-btn');
    expect(suggestionBtns.length).toBeGreaterThan(0);
    await user.click(suggestionBtns[0] as HTMLElement);
    expect(mockedAskRAG).toHaveBeenCalled();
    expect(await screen.findByText('好的')).toBeInTheDocument();
  });

  it('selectedBuilding 时显示上下文与「查看详情」', () => {
    const onViewBuilding = vi.fn();
    setup({ selectedBuilding: building, onViewBuilding });
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    expect(screen.getByText(/当前在看/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看详情'));
    expect(onViewBuilding).toHaveBeenCalledWith(building);
  });

  it('发送时携带建筑上下文', async () => {
    const user = userEvent.setup();
    mockedAskRAG.mockResolvedValue({ answer: '建筑回复', fromRemote: true });
    setup({ selectedBuilding: building });
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    await user.type(screen.getByPlaceholderText('输入问题…'), '这里几点营业');
    await user.keyboard('{Enter}');
    expect(mockedAskRAG).toHaveBeenCalledWith('这里几点营业', {
      buildingId: 'building-017',
      buildingName: '东篱苑餐厅',
      buildingDescription: '天目湖校区食堂',
    });
  });

  it('加载中显示输入中动画，且输入框禁用', async () => {
    const user = userEvent.setup();
    let resolveFn: (v: { answer: string; fromRemote: boolean }) => void;
    mockedAskRAG.mockImplementation(() => new Promise(res => { resolveFn = res; }));
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    await user.type(screen.getByPlaceholderText('输入问题…'), '问题');
    await user.keyboard('{Enter}');
    expect(document.querySelector('.chat-msg-typing')).not.toBeNull();
    expect(screen.getByPlaceholderText('输入问题…')).toBeDisabled();
    resolveFn!({ answer: '完成', fromRemote: true });
    expect(await screen.findByText('完成')).toBeInTheDocument();
  });

  it('点击关闭按钮收起面板', () => {
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(screen.queryByText('阿源')).not.toBeInTheDocument();
  });

  it('Escape 键关闭面板', () => {
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('阿源')).not.toBeInTheDocument();
  });

  it('RAG 服务不可用时仍显示回复（错误降级文案由服务层处理）', async () => {
    const user = userEvent.setup();
    mockedAskRAG.mockResolvedValue({ answer: '抱歉，智能问答服务暂时不可用，请稍后重试。', fromRemote: false, error: 'HTTP 500' });
    setup();
    fireEvent.click(screen.getByLabelText('打开智能问答'));
    await user.type(screen.getByPlaceholderText('输入问题…'), '测试');
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/服务暂时不可用/)).toBeInTheDocument();
  });
});
