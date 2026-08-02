import { describe, it, expect } from 'vitest';
import { levenshtein, findSimilar } from './search';

describe('levenshtein', () => {
  it('空串距离为另一字符串长度', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('相同字符串距离为 0', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('经典用例 kitten → sitting 距离为 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('单个字符替换', () => {
    expect(levenshtein('图书', '图书')).toBe(0);
    expect(levenshtein('图馆', '图书馆')).toBe(1);
  });

  it('插入与删除对称', () => {
    expect(levenshtein('ab', 'abc')).toBe(1);
    expect(levenshtein('abc', 'ab')).toBe(1);
  });
});

describe('findSimilar', () => {
  const candidates = [
    { id: '1', name: '图书馆' },
    { id: '2', name: '体育馆' },
    { id: '3', name: '游泳馆' },
    { id: '4', name: '食堂' },
  ];

  it('按编辑距离升序返回', () => {
    const result = findSimilar('体育', candidates, 3, 5);
    expect(result[0].id).toBe('2'); // 体育馆
    expect(result[0].dist).toBeLessThanOrEqual(result[result.length - 1].dist);
  });

  it('limit 控制返回条数', () => {
    expect(findSimilar('馆', candidates, 2, 5)).toHaveLength(2);
    expect(findSimilar('馆', candidates, 1, 5)).toHaveLength(1);
  });

  it('超过 maxDistance 的候选被排除', () => {
    const result = findSimilar('图书馆', candidates, 10, 0);
    expect(result).toHaveLength(0);
  });

  it('距离为 0（完全相同）的候排除（防止自匹配）', () => {
    const result = findSimilar('图书馆', candidates, 10, 5);
    expect(result.find(r => r.id === '1')).toBeUndefined();
  });

  it('大小写不敏感', () => {
    const result = findSimilar('TUSHUGUAN', [{ id: '1', name: 'tushuguan' }], 10, 5);
    expect(result).toHaveLength(0); // 完全相同 → 排除
  });

  it('query 为空时：距离=候选名长度，maxDistance=0 时全部排除', () => {
    // 空 query 的编辑距离等于名称长度；maxDistance=0 排除所有
    expect(findSimilar('', candidates, 3, 0)).toHaveLength(0);
  });
});
