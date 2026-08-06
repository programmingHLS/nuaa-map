import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopBar } from './TopBar';
import type { Building } from '../../types';

const buildings: Building[] = [
  { id: 'building-006', name: '巡天楼', category: 'teaching', hotspot: { x: 100, y: 100, width: 50, height: 40 }, description: '教学楼' },
  { id: 'building-007', name: '牧星楼', category: 'teaching', hotspot: { x: 200, y: 100, width: 50, height: 40 }, description: '教学楼' },
  { id: 'building-017', name: '东篱苑餐厅', category: 'canteen', hotspot: { x: 300, y: 200, width: 60, height: 50 }, description: '食堂', openTime: '6:30-21:00' },
  { id: 'building-003', name: '图书馆', category: 'library', hotspot: { x: 500, y: 100, width: 80, height: 60 }, description: '图书馆', openTime: '7:00-22:00' },
];

function setup() {
  const onSearchSelect = vi.fn();
  const utils = render(<TopBar buildings={buildings} onSearchSelect={onSearchSelect} />);
  const input = utils.getByPlaceholderText('搜索建筑…');
  return { ...utils, input, onSearchSelect };
}

describe('TopBar', () => {
  it('渲染品牌与搜索框', () => {
    setup();
    expect(screen.getByText('NUAA')).toBeInTheDocument();
    expect(screen.getByText('天目湖校区地图')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索建筑…')).toBeInTheDocument();
  });

  it('中文搜索：按建筑名模糊匹配', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, '巡天');
    expect(screen.getByText('巡天楼')).toBeInTheDocument();
    expect(screen.queryByText('图书馆')).not.toBeInTheDocument();
  });

  it('拼音全拼搜索', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, 'xuntian');
    expect(screen.getByText('巡天楼')).toBeInTheDocument();
  });

  it('拼音首字母搜索', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, 'dlyct');
    expect(screen.getByText('东篱苑餐厅')).toBeInTheDocument();
  });

  it('分类名搜索（教学楼）', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, '教学楼');
    expect(screen.getByText('巡天楼')).toBeInTheDocument();
    expect(screen.getByText('牧星楼')).toBeInTheDocument();
    expect(screen.queryByText('图书馆')).not.toBeInTheDocument();
  });

  it('点击结果触发 onSearchSelect 并关闭面板', async () => {
    const user = userEvent.setup();
    const { input, onSearchSelect } = setup();
    await user.type(input, '图书馆');
    await user.click(screen.getAllByRole('button', { name: /图书馆/ })[0]);
    expect(onSearchSelect).toHaveBeenCalledWith(buildings[3]);
    // 面板关闭（输入被清空）
    expect(input).toHaveValue('');
  });

  it('Ctrl+K 快捷键聚焦搜索框并打开面板', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await user.type(input, '牧星');
    expect(screen.getByText('牧星楼')).toBeInTheDocument();
  });

  it('键盘上下键 + Enter 选择', async () => {
    const user = userEvent.setup();
    const { input, onSearchSelect } = setup();
    await user.type(input, '楼');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSearchSelect).toHaveBeenCalled();
  });

  it('清除按钮清空输入', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, '图书馆');
    await user.click(screen.getByLabelText('清除'));
    expect(input).toHaveValue('');
  });

  it('Escape 关闭面板并清空', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, '图书馆');
    expect(screen.getAllByText('图书馆').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input).toHaveValue('');
  });

  it('无匹配时显示空状态与智能推荐', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, '不存在的大楼');
    expect(screen.getByText('未找到匹配的建筑')).toBeInTheDocument();
    // 编辑距离推荐（相似名称）
    expect(screen.getByText('你是不是想找：')).toBeInTheDocument();
  });

  it('点击外部关闭面板', async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, '图书馆');
    expect(screen.getAllByText('图书馆').length).toBeGreaterThan(0);
    fireEvent.mouseDown(document.body);
    expect(input).toHaveValue('');
  });

  it('最多显示 8 条结果', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `building-${i}`, name: `测试楼${i}`, category: 'teaching' as const,
      hotspot: { x: i, y: i, width: 10, height: 10 }, description: '',
    }));
    const user = userEvent.setup();
    render(<TopBar buildings={many} onSearchSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText('搜索建筑…');
    await user.type(input, '测试楼');
    expect(screen.getAllByText(/测试楼/).length).toBeLessThanOrEqual(8);
  });
});
