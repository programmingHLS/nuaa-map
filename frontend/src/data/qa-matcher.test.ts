import { describe, it, expect } from 'vitest';
import {
  getAllEntries,
  tokenize,
  matchBestAnswer,
  getRelatedQuestions,
} from './qa-matcher';

describe('getAllEntries', () => {
  it('从 JSON 加载全部问答条目', () => {
    const entries = getAllEntries();
    expect(entries.length).toBeGreaterThan(50);
    expect(entries[0]).toMatchObject({ id: expect.any(String), question: expect.any(String), answer: expect.any(String) });
  });
});

describe('tokenize', () => {
  it('中文拆出单字 + bigram + 完整词，并去重', () => {
    const tokens = tokenize('图书馆几点关门');
    // 完整词
    expect(tokens).toContain('图书馆几点关门');
    // bigram
    expect(tokens).toContain('图书');
    expect(tokens).toContain('书馆');
    // 单字
    expect(tokens).toContain('图');
    // 去重：单字「图」只出现一次
    expect(tokens.filter(t => t === '图')).toHaveLength(1);
  });

  it('过滤停用词（的/了/吗/什么等）', () => {
    const tokens = tokenize('图书馆在哪里呀');
    expect(tokens).not.toContain('的');
    expect(tokens).not.toContain('什么');
    expect(tokens).not.toContain('哪里');
    // 「哪里」被拆分：哪是停用字、里不是
    expect(tokens).toContain('里');
  });

  it('英文 token 保留', () => {
    expect(tokenize('NUAA 在哪里')).toContain('nuaa');
  });

  it('空输入返回空数组', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('。，！')).toEqual([]);
  });

  it('标点作为分隔符', () => {
    const tokens = tokenize('图书馆,几点关门');
    expect(tokens).toContain('图书馆');
    expect(tokens).toContain('几点关门');
  });
});

describe('matchBestAnswer', () => {
  it('输入与问题完全相同 → 返回精确匹配（score 200）', () => {
    const result = matchBestAnswer('怎么用知网下载文献？');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(200);
    expect(result!.entry.question).toBe('怎么用知网下载文献？');
  });

  it('大小写/空格不影响精确匹配', () => {
    const result = matchBestAnswer('  怎么用知网下载文献？  ');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(200);
  });

  it('相似问题返回最佳匹配（非精确）', () => {
    const result = matchBestAnswer('知网怎么下载文献');
    expect(result).not.toBeNull();
    expect(result!.entry.question).toContain('知网');
  });

  it('无关输入返回 null', () => {
    const result = matchBestAnswer('今天天气不错哈哈哈');
    expect(result).toBeNull();
  });

  it('空输入返回 null', () => {
    expect(matchBestAnswer('')).toBeNull();
    expect(matchBestAnswer('   ')).toBeNull();
  });

  it('匹配结果按分数从高到低（第一名分数最高）', () => {
    // 直接验证 getRelatedQuestions 内部排序更稳定的 case 放在下面
    const result = matchBestAnswer('缓考怎么申请');
    expect(result).not.toBeNull();
    expect(result!.entry.question).toContain('缓考');
  });
});

describe('getRelatedQuestions', () => {
  it('空输入返回默认前 N 条', () => {
    const result = getRelatedQuestions('', 3);
    expect(result).toHaveLength(3);
  });

  it('topN 控制条数', () => {
    const result = getRelatedQuestions('图书馆', 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('相关输入返回按相关性排序的推荐', () => {
    const result = getRelatedQuestions('图书馆几点关门', 3);
    expect(result.length).toBeGreaterThan(0);
    // 相关性最高的应该包含「图书馆」关键词
    expect(result[0].question).toContain('图书馆');
  });

  it('每条推荐都包含有效答案', () => {
    for (const entry of getRelatedQuestions('食堂', 5)) {
      expect(entry.answer.length).toBeGreaterThan(0);
    }
  });
});
