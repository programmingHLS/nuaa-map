import { describe, it, expect } from 'vitest';
import { toPinyin, toPinyinAbbr } from './pinyin';

describe('toPinyin', () => {
  it('将汉字转为空格分隔的全拼', () => {
    expect(toPinyin('巡天楼')).toBe('xun tian lou');
  });

  it('多字词按顺序拼接', () => {
    expect(toPinyin('图书馆')).toBe('tu shu guan');
    expect(toPinyin('南山苑餐厅')).toBe('nan shan yuan can ting');
  });

  it('英文字母数字保持原样（小写），字库外汉字跳过', () => {
    expect(toPinyin('A1栋')).toBe('a 1');
    expect(toPinyin('NUAA')).toBe('n u a a');
  });

  it('标点等无法识别的字符跳过', () => {
    expect(toPinyin('巡天楼！？')).toBe('xun tian lou');
  });

  it('空字符串返回空串', () => {
    expect(toPinyin('')).toBe('');
  });

  it('不在字库中的汉字跳过', () => {
    expect(toPinyin('💡')).toBe('');
  });
});

describe('toPinyinAbbr', () => {
  it('返回拼音首字母', () => {
    expect(toPinyinAbbr('巡天楼')).toBe('xtl');
    expect(toPinyinAbbr('东篱苑餐厅')).toBe('dlyct');
  });

  it('字母数字小写拼接', () => {
    expect(toPinyinAbbr('NUAA')).toBe('nuaa');
  });

  it('空字符串返回空串', () => {
    expect(toPinyinAbbr('')).toBe('');
  });
});
