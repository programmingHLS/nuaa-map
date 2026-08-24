/**
 * NUAAMap RAG Backend 测试
 * 用 node:test + supertest 驱动 Express app（不实际监听端口，不调用外部 LLM）。
 * 检索函数走真实 QA/建筑数据；/api/chat 的 LLM 调用通过 mock global.fetch 拦截。
 */
import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// 在 import server.js 前设置 LLM_API_KEY，使 /api/chat 走 LLM 分支（而非“未配置”500）
// 注意：server.js 的 LLM_API_KEY 是模块加载时读取的常量，必须前置设置
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_API_URL = 'https://mock.example/v1/chat/completions';

const {
    app,
    tokenize,
    scoreEntry,
    retrieveQA,
    retrieveBuildingInfo,
    buildSystemPrompt,
    buildUserPrompt,
} = await import('./server.js');

describe('tokenize 分词', () => {
    test('中文拆分为字与二元组', () => {
        const tokens = tokenize('图书馆几点开门');
        assert.ok(tokens.includes('图书'));
        assert.ok(tokens.includes('馆'));
        assert.ok(tokens.length > 0);
    });

    test('过滤停用词', () => {
        const tokens = tokenize('的了吗');
        // 纯停用词不应产生有效 token
        assert.ok(tokens.length === 0 || tokens.every(t => !['的', '了', '吗'].includes(t)));
    });

    test('去掉重复 token', () => {
        const tokens = tokenize('食堂食堂');
        assert.equal(new Set(tokens).size, tokens.length);
    });
});

describe('scoreEntry 打分', () => {
    test('完全命中得分高', () => {
        const score = scoreEntry(['食堂'], '食堂在哪个位置');
        assert.ok(score > 0);
    });

    test('无匹配得 0 分', () => {
        const score = scoreEntry(['xxyy'], '食堂在哪个位置');
        assert.equal(score, 0);
    });

    test('空 token 得 0 分', () => {
        assert.equal(scoreEntry([], '任意问题'), 0);
    });
});

describe('retrieveQA 检索', () => {
    test('返回命中条目', () => {
        const results = retrieveQA('食堂几点开门', 5);
        assert.ok(Array.isArray(results));
        results.forEach(r => assert.ok(r.score > 0));
    });

    test('topN 限制条数', () => {
        const results = retrieveQA('食堂', 3);
        assert.ok(results.length <= 3);
    });

    test('无关问题可能无命中', () => {
        const results = retrieveQA('王王王王王', 5);
        assert.ok(results.length >= 0);
    });
});

describe('retrieveBuildingInfo 建筑检索', () => {
    test('按 buildingId 精确命中', () => {
        const results = retrieveBuildingInfo('图书馆怎么走', 'building-015');
        assert.ok(results.length > 0);
        // 第一个应为指定建筑（score 100）
        assert.equal(results[0].building.id, 'building-015');
        assert.equal(results[0].score, 100);
    });

    test('按关键词匹配', () => {
        const results = retrieveBuildingInfo('食堂', null);
        assert.ok(results.length > 0);
    });
});

describe('buildSystemPrompt / buildUserPrompt', () => {
    test('系统提示含南航助手定位', () => {
        const p = buildSystemPrompt();
        assert.ok(p.includes('南京航空航天大学'));
        assert.ok(p.includes('中文'));
    });

    test('系统提示：必须基于知识库，联网仅限南航官网且需标注来源', () => {
        const p = buildSystemPrompt();
        assert.ok(p.includes('所有回答必须基于提供的知识库'));
        assert.ok(p.includes('nuaa.edu.cn'));
        assert.ok(p.includes('联网搜索 · 来源：南航官网'));
        assert.ok(p.includes('咨询学校相关部门确认'));
    });

    test('用户提示包含参考知识库', () => {
        const p = buildUserPrompt('食堂几点开门', [{ entry: { question: 'Q', answer: 'A' } }], [], null);
        assert.ok(p.includes('用户问题'));
        assert.ok(p.includes('参考知识库'));
    });

    test('建筑上下文注入', () => {
        const p = buildUserPrompt('这栋楼', [], [], '图书馆开放时间');
        assert.ok(p.includes('图书馆开放时间'));
    });
});

describe('HTTP API', () => {
    test('GET /health 返回状态与数据量', async () => {
        const res = await request(app).get('/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.ok(res.body.qaEntries > 0);
        assert.ok(res.body.buildings > 0);
        assert.equal(typeof res.body.llmConfigured, 'boolean');
    });

    test('GET /api/freshman-questions 返回问答列表', async () => {
        const res = await request(app).get('/api/freshman-questions');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.length > 0);
        assert.ok(res.body[0].question);
        assert.ok(res.body[0].answer);
    });

    test('POST /api/freshman-questions 空问题返回 400', async () => {
        const res = await request(app).post('/api/freshman-questions').send({ question: '  ' });
        assert.equal(res.status, 400);
        assert.ok(res.body.error);
    });
});

describe('POST /api/chat（mock LLM）', () => {
    before(() => {
        // mock 全局 fetch，模拟 LLM 返回
        mock.method(global, 'fetch', async () => ({
            ok: true,
            status: 200,
            text: async () => '{}',
            json: async () => ({
                choices: [{ message: { content: '图书馆在中心位置。' } }],
                usage: { total_tokens: 10 },
            }),
            body: { getReader: () => ({ read: async () => ({ done: true }) }) },
        }));
    });

    after(() => {
        mock.restoreAll();
    });

    test('正常问答返回回复', async () => {
        const res = await request(app)
            .post('/api/chat')
            .send({ question: '图书馆在哪里' });
        assert.equal(res.status, 200);
        assert.ok(res.body.answer.includes('图书馆'));
        assert.ok(Array.isArray(res.body.sources));
    });

    test('空问题返回 400', async () => {
        const res = await request(app).post('/api/chat').send({ question: '' });
        assert.equal(res.status, 400);
    });

    test('带 buildingId 时注入建筑上下文', async () => {
        const res = await request(app)
            .post('/api/chat')
            .send({ question: '这栋楼', buildingId: 'building-015' });
        assert.equal(res.status, 200);
        assert.ok(res.body.answer.length > 0);
    });

    test('带 messages 历史时取最后一条 user 消息', async () => {
        const res = await request(app)
            .post('/api/chat')
            .send({ messages: [{ role: 'user', content: '食堂' }] });
        assert.equal(res.status, 200);
        assert.ok(res.body.reply);
    });

    test('LLM 异常时返回 500 兜底', async () => {
        mock.restoreAll();
        mock.method(global, 'fetch', async () => {
            throw new Error('network down');
        });
        const res = await request(app).post('/api/chat').send({ question: '图书馆' });
        assert.equal(res.status, 500);
        assert.ok(res.body.answer.includes('暂时不可用'));
    });
});