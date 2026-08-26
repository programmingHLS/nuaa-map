import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_DATA = path.join(PROJECT_ROOT, 'frontend', 'src', 'data');

dotenv.config({ path: path.join(__dirname, '.env') });
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

/* =============================================================
 *  数据加载
 * ============================================================= */

function loadJSON(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
}

const qaData = loadJSON(path.join(FRONTEND_DATA, 'qa-新生问答.json'));
const qaEntries = qaData.questions || [];

const buildings = loadJSON(path.join(FRONTEND_DATA, 'mock-buildings.json'));

/* =============================================================
 *  社区共建问答存储（JSON 文件持久化，容器需挂载 backend/data 卷）
 * ============================================================= */
const USER_QA_DIR = path.join(__dirname, 'data');
const USER_QA_PATH = path.join(USER_QA_DIR, 'qa-user.json');
const PENDING_PLACEHOLDER = '等待人工回复';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nuaamap';

function loadUserQA() {
    try {
        const parsed = JSON.parse(fs.readFileSync(USER_QA_PATH, 'utf-8'));
        return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
        return [];
    }
}

let userQaEntries = loadUserQA();

function saveUserQA() {
    try {
        fs.mkdirSync(USER_QA_DIR, { recursive: true });
        const tmp = `${USER_QA_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ _v: 1, entries: userQaEntries }, null, 2), 'utf-8');
        fs.renameSync(tmp, USER_QA_PATH);
    } catch (err) {
        console.error('saveUserQA failed:', err.message);
    }
}

function normalizeQuestion(q) {
    return String(q || '').trim().toLowerCase().replace(/\s+/g, '');
}

function visibleUserEntries() {
    return userQaEntries.filter(e => e.status !== 'rejected');
}

const CATEGORY_LABELS = {
    teaching: '教学楼', dormitory: '宿舍', canteen: '食堂',
    library: '图书馆', sports: '体育设施', service: '生活服务',
    gate: '校门', landscape: '景观', facility: '设施', other: '其他',
};

/* =============================================================
 *  分词 & 匹配
 * ============================================================= */

const STOP_WORDS = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不',
    '人', '都', '一', '上', '也', '很', '到',
    '说', '要', '去', '你', '会', '着', '没有', '看',
    '好', '自己', '这', '他', '她', '它', '们', '那',
    '些', '吗', '啊', '呢', '吧', '嗯', '哦',
    '怎么', '什么', '如何', '哪里', '哪个', '哪些', '何时',
    '多少', '几', '啥', '咋', '为啥', '为什么',
    '请问', '请',
    '一', '一下', '可', '也', '还', '得', '说', '要', '去',
    '很', '让', '没', '没有', '过', '次', '自己', '更', '最',
    '又', '再', '先', '后', '前', '把', '被', '叫', '让',
    '就', '才', '刚', '正', '总', '每', '各', '某',
    '但', '却', '只', '仅', '些', '仅', '吗', '呢', '吧', '啊',
    '哦', '么', '什', '为', '怎', '嗯', '噢', '哎', '呀',
    '啥', '咋',
]);

const CJK_REGEX = /[一-鿿]/;

function tokenize(text) {
    const raw = text.toLowerCase().split(/[\s,.。，！？、；：“”‘’（）()【】《》/\\|]+/);
    const tokens = [];
    for (const token of raw) {
        if (CJK_REGEX.test(token)) {
            for (const ch of token) {
                if (CJK_REGEX.test(ch) && !STOP_WORDS.has(ch)) {
                    tokens.push(ch);
                }
            }
            for (let i = 0; i < token.length - 1; i++) {
                const bigram = token.substring(i, i + 2);
                if (CJK_REGEX.test(bigram[0]) && CJK_REGEX.test(bigram[1]) && !STOP_WORDS.has(bigram)) {
                    tokens.push(bigram);
                }
            }
            if (!STOP_WORDS.has(token)) tokens.push(token);
        } else if (token.length > 0 && !STOP_WORDS.has(token)) {
            tokens.push(token);
        }
    }
    return [...new Set(tokens)];
}

function tokenWeight(token) {
    if (token.length >= 3) return 3;
    if (token.length === 2) return 2;
    return 0.5;
}

function scoreEntry(userTokens, questionText) {
    if (userTokens.length === 0) return 0;
    const qt = questionText.toLowerCase();
    let matchedWeight = 0;
    let totalWeight = 0;
    for (const token of userTokens) {
        const w = tokenWeight(token);
        totalWeight += w;
        if (qt.includes(token)) matchedWeight += w;
    }
    if (totalWeight === 0) return 0;
    return (matchedWeight / totalWeight) * 100;
}

function retrieveQA(question, topN = 5) {
    const tokens = tokenize(question);
    // 检索池 = 官方知识库 + 社区条目（含待审核，供 AI 打标说明）
    const pool = [
        ...qaEntries.map(e => ({ question: e.question, answer: e.answer, _source: 'official' })),
        ...visibleUserEntries()
            .filter(e => e.answer && e.answer !== PENDING_PLACEHOLDER)
            .map(e => ({ question: e.question, answer: e.answer, _source: 'community', _status: e.status })),
    ];
    const scored = pool.map(entry => ({
        entry,
        score: scoreEntry(tokens, entry.question),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, topN);
}

function retrieveBuildingInfo(question, buildingId) {
    const tokens = tokenize(question);
    const results = [];

    if (buildingId) {
        const b = buildings.find(x => x.id === buildingId);
        if (b) results.push({ building: b, score: 100 });
    }

    for (const b of buildings) {
        if (results.some(r => r.building.id === b.id)) continue;
        const searchText = `${b.name} ${b.description} ${b.category}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
            if (searchText.includes(t)) score += tokenWeight(t);
        }
        if (score > 0) results.push({ building: b, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 3);
}

/* =============================================================
 *  Prompt 构建
 * ============================================================= */

function buildSystemPrompt() {
    return `你是南京航空航天大学校园地图智能问答助手。
请严格遵守以下规则：
1. 所有回答必须基于提供的知识库（QA 问答、建筑信息）作答，知识库中没有的信息不得编造；
   若知识库未覆盖该问题，明确告知「知识库暂无该信息」，并建议用户咨询学校相关部门。
2. 知识库无法回答时，可进行联网搜索，但**只能从南京航空航天大学官网及其子域名
   （nuaa.edu.cn）获取信息**，不得使用其他来源的信息。
3. 只要使用了联网搜索，回答中必须明确标注「（联网搜索 · 来源：南航官网）」；
   若使用了 AI 生成内容，也必须标明「由 AI 生成」。
4. 如果知识库和联网搜索都没有相关信息，直接回答「知识库暂无该信息，建议咨询学校相关部门确认」，
   **严禁使用自身知识编造答案**。
5. 回答要简洁、准确，符合学生助手语境。
6. 使用中文回答。
7. 可以适当使用 Markdown 格式提升可读性：用 **粗体** 强调关键信息，
   用有序/无序列表展示办事流程或多个选项，
   用 > 引用块标注注意事项。但不要使用标题（#）或图片。
8. 标有【待审核】的参考内容来自社区用户提交、尚未经管理员审核，可信度较低：
   - 若你的回答用到了【待审核】内容，必须在回答末尾单独一段明确说明，格式为：
     「⚠️ 以上回答引用了 N 条待审核的社区贡献信息：<逐条简述对应问题>。该信息尚未经审核，仅供参考。」
   - 若未使用任何【待审核】内容，则完全不需要提及待审核相关字样。
   - 官方知识库与【待审核】内容冲突时，以官方知识库为准。`;
}

function buildUserPrompt(question, qaResults, buildingResults, contextText) {
    let contextSections = [];

    if (contextText && typeof contextText === 'string' && contextText.trim()) {
        contextSections.push(`用户当前正在查看的建筑信息：\n${contextText.trim()}`);
    }

    if (qaResults.length > 0) {
        const qaText = qaResults.map((r, i) => {
            const tag = r.entry._status === 'pending' ? '【待审核】' : '';
            return `${tag}参考 ${i + 1}：问：${r.entry.question}\n答：${r.entry.answer}`;
        }).join('\n\n');
        contextSections.push(`以下是从校园知识库中检索到的相关问答：\n${qaText}`);
    }

    if (buildingResults.length > 0) {
        const bText = buildingResults.map(r => {
            const b = r.building;
            const parts = [`名称：${b.name}（${CATEGORY_LABELS[b.category]}）`];
            if (b.description) parts.push(`简介：${b.description}`);
            if (b.openTime) parts.push(`开放时间：${b.openTime}`);
            if (b.floors) parts.push(`楼层：${b.floors}层`);
            if (b.facilities && b.facilities.length > 0) parts.push(`设施：${b.facilities.join('、')}`);
            return parts.join('，');
        }).join('\n\n');
        contextSections.push(`以下是相关建筑信息：\n${bText}`);
    }

    const contextBlock = contextSections.length > 0
        ? `\n\n--- 参考知识库信息 ---\n${contextSections.join('\n\n')}\n--- 结束 ---\n\n`
        : '';

    return `${contextBlock}用户问题：${question}\n\n请根据以上信息回答用户的问题。`;
}

async function searchWeb(query, maxResults = 3) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];

    try {
        const resp = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                max_results: maxResults,
                search_depth: 'basic',
                // 限定只搜南航官网及其子域名
                include_domains: ['nuaa.edu.cn'],
            }),
        });
        if (!resp.ok) return [];

        const data = await resp.json();
        return (data.results || []).map(r => ({
            title: r.title || '',
            url: r.url || '',
            content: r.content || '',
        }));
    } catch (err) {
        console.error('Tavily search error:', err);
        return [];
    }
}

/* =============================================================
 *  LLM 调用
 * ============================================================= */

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';

async function callLLM(systemPrompt, userPrompt) {
    if (!LLM_API_KEY) {
        return {
            content: '服务端未配置 LLM_API_KEY，请联系管理员设置。',
            error: 'LLM_API_KEY missing',
        };
    }

    try {
        const resp = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_API_KEY}`,
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${text}`);
        }

        const data = await resp.json();
        return {
            content: data.choices?.[0]?.message?.content ?? '暂无回复。',
            usage: data.usage,
        };
    } catch (err) {
        return {
            content: '抱歉，AI 服务暂时不可用，请稍后再试。',
            error: err.message,
        };
    }
}

/* =============================================================
 *  路由
 * ============================================================= */

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        qaEntries: qaEntries.length,
        communityPending: userQaEntries.filter(e => e.status === 'pending').length,
        communityApproved: userQaEntries.filter(e => e.status === 'approved').length,
        buildings: buildings.length,
        llmConfigured: !!LLM_API_KEY,
    });
});

app.get('/api/freshman-questions', (req, res) => {
    res.json(qaEntries.map(e => ({
        id: e.id,
        question: e.question,
        answer: e.answer,
        createdAt: 'RAG Knowledge Base',
    })));
});

// 兼容旧版前端端点 /api/qa（2026-08-23 新增）：老前端仍调用 /api/qa，
// 返回官方知识库 + 社区共建条目（pending/approved 均公开可见，rejected 不展示）
app.get('/api/qa', (req, res) => {
    const community = visibleUserEntries()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(e => ({
            id: e.id,
            question: e.question,
            answer: e.answer || undefined,
            status: e.status,
            createdAt: e.createdAt,
        }));
    const official = qaEntries.map((e, i) => ({
        id: `qa-official-${i + 1}`,
        question: e.question,
        answer: e.answer,
        createdAt: '官方知识库',
    }));
    res.json({ entries: [...community, ...official] });
});

const handleFreshmanQuestion = async (req, res) => {
    const { question } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'question 不能为空' });
    }

    const trimmed = question.trim();
    const qaResults = retrieveQA(trimmed, 5);
    const buildingResults = retrieveBuildingInfo(trimmed, null);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(trimmed, qaResults, buildingResults, null);

    const llmResp = await callLLM(systemPrompt, userPrompt);

    res.json({
        id: `freshman-${Date.now()}`,
        question: trimmed,
        answer: llmResp.content,
        createdAt: new Date().toISOString(),
    });
};

app.post('/api/freshman-questions', handleFreshmanQuestion);

// POST /api/qa：社区共建提交（无需密码，人人可填）
// - 未解决的问题（answer 为空或「等待人工回复」）→ 存为待审核问题
// - 用户补充的答案 → 存为待审核答案（审核通过前同样公开可见并打标）
app.post('/api/qa', (req, res) => {
    const body = req.body || {};
    const q = typeof body.question === 'string' ? body.question.trim() : '';
    if (!q) {
        return res.status(400).json({ error: 'question is required' });
    }

    const now = new Date().toISOString();
    const rawAnswer = typeof body.answer === 'string' ? body.answer.trim() : '';
    const cleanAnswer = rawAnswer && rawAnswer !== PENDING_PLACEHOLDER ? rawAnswer : null;

    let entry = userQaEntries.find(e => normalizeQuestion(e.question) === normalizeQuestion(q));
    if (entry) {
        if (cleanAnswer) {
            entry.answer = cleanAnswer;
            entry.status = 'pending';
            entry.updatedAt = now;
        } else {
            entry.updatedAt = now; // 重复点击「未解决」只刷新时间，不重复建条
        }
    } else {
        entry = {
            id: `uqa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            question: q,
            answer: cleanAnswer,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
        userQaEntries.unshift(entry);
    }
    saveUserQA();

    res.status(201).json({
        entry: {
            id: entry.id,
            question: entry.question,
            answer: entry.answer || undefined,
            status: entry.status,
            createdAt: entry.createdAt,
        },
    });
});

/* =============================================================
 *  管理后台 API（/admin 页面专用，密码见 ADMIN_PASSWORD）
 * ============================================================= */

function requireAdmin(req, res, next) {
    if (req.get('x-admin-password') === ADMIN_PASSWORD) return next();
    return res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/admin/check', requireAdmin, (req, res) => {
    res.json({ ok: true });
});

app.get('/api/admin/entries', requireAdmin, (req, res) => {
    const status = req.query.status;
    const entries = status
        ? userQaEntries.filter(e => e.status === status)
        : userQaEntries;
    res.json({ entries });
});

// 审核/修改：支持更新 question、answer、status（approved / pending / rejected）
app.patch('/api/admin/entries/:id', requireAdmin, (req, res) => {
    const entry = userQaEntries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'entry not found' });

    const body = req.body || {};
    if (typeof body.question === 'string' && body.question.trim()) entry.question = body.question.trim();
    if (typeof body.answer === 'string') entry.answer = body.answer.trim() || null;
    if (['pending', 'approved', 'rejected'].includes(body.status)) entry.status = body.status;
    entry.updatedAt = new Date().toISOString();
    saveUserQA();
    res.json({ entry });
});

app.delete('/api/admin/entries/:id', requireAdmin, (req, res) => {
    const idx = userQaEntries.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'entry not found' });
    const [removed] = userQaEntries.splice(idx, 1);
    saveUserQA();
    res.json({ removed: removed.id });
});

app.post('/api/chat', async (req, res) => {
    const body = req.body || {};
    const { question, buildingId, context, messages, building_id, stream } = body;

    const lastUserMsg = question
        ? question
        : (Array.isArray(messages)
            ? [...messages].reverse().find(m => m.role === 'user')?.content || ''
            : '');

    const trimmed = (lastUserMsg || '').trim();
    if (!trimmed) {
        return res.status(400).json({ error: 'question 不能为空', reply: '请输入问题。' });
    }

    const effectiveBuildingId = buildingId || building_id;
    const qaResults = retrieveQA(trimmed, 5);
    const buildingResults = retrieveBuildingInfo(trimmed, effectiveBuildingId);
    const bestScore = qaResults.length > 0 ? qaResults[0].score : 0;

    let buildingContext = context || '';
    if (effectiveBuildingId && !buildingContext) {
        const b = buildings.find(x => x.id === effectiveBuildingId);
        if (b) {
            buildingContext = `当前用户正在查看【${b.name}】。\n简介：${b.description}\n类别：${b.category}`;
            if (b.openTime) buildingContext += `\n开放时间：${b.openTime}`;
            if (b.facilities?.length) buildingContext += `\n设施：${b.facilities.join('、')}`;
        }
    }

    const systemPrompt = buildSystemPrompt();

    // 本地知识库匹配分数低或无结果，调用 Tavily 联网搜索补充上下文
    let userPrompt = buildUserPrompt(trimmed, qaResults, buildingResults, buildingContext);
    let usedWebSearch = false;
    if ((qaResults.length === 0 || bestScore < 30) && process.env.TAVILY_API_KEY) {
        const webResults = await searchWeb(trimmed, 3);
        if (webResults.length > 0) {
            usedWebSearch = true;
            const webText = webResults.map((r, i) =>
                `来源 ${i + 1}：${r.title}\n链接：${r.url}\n内容：${r.content}`
            ).join('\n\n');
            userPrompt += `\n\n--- 联网搜索结果 ---\n${webText}\n--- 结束 ---`;
        }
    }

    // 硬性约束：知识库与南航官网联网搜索均无结果时，不调用 AI 编造，直接返回固定提示
    const hasReliableQa = qaResults.length > 0 && bestScore >= 30;
    if (!hasReliableQa && !usedWebSearch) {
        return res.json({
            answer: '知识库暂无该信息，建议咨询学校相关部门确认。',
            reply: '知识库暂无该信息，建议咨询学校相关部门确认。',
            sources: [],
        });
    }

    if (!LLM_API_KEY) {
        return res.status(500).json({
            answer: '服务端未配置 API Key，请联系管理员设置。',
            reply: '服务端未配置 API Key，请联系管理员设置。',
        });
    }

    const useStream = stream === true;

    const llmMessages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(messages) && messages.length > 0) {
        const history = [...messages].slice(-4);
        if (history.length > 0 && history[history.length - 1]?.role === 'user') {
            history.pop();
        }
        llmMessages.push(...history);
    }
    llmMessages.push({ role: 'user', content: userPrompt });

    try {
        const resp = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_API_KEY}`,
            },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: llmMessages,
                stream: useStream,
                max_tokens: 1024,
            }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            return res.status(502).json({
                answer: `AI 服务返回错误 (${resp.status})`,
                reply: `AI 服务返回错误 (${resp.status})`,
            });
        }

        if (useStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let nl;
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, nl).replace(/\r$/, '');
                    buffer = buffer.slice(nl + 1);
                    if (line.startsWith('data:')) {
                        res.write(line + '\n\n');
                    }
                }
            }
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            const data = await resp.json();
            const reply = data.choices?.[0]?.message?.content ?? '暂无回复。';
            const sources = [...new Set([
                ...qaResults.map(r => r.entry.id),
                ...buildingResults.map(r => r.building.id),
            ])];
            res.json({ answer: reply, reply, sources });
        }
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({
            answer: 'AI 服务暂时不可用，请稍后重试。',
            reply: 'AI 服务暂时不可用，请稍后重试。',
        });
    }
});

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    app.listen(PORT, () => {
        console.log(`[RAG Server] http://localhost:${PORT}`);
        console.log(`  QA entries: ${qaEntries.length}`);
        console.log(`  Buildings:  ${buildings.length}`);
        console.log(`  LLM:        ${LLM_API_KEY ? 'configured' : 'NOT configured (set LLM_API_KEY)'}`);
    });
}

export { app };
export { tokenize, scoreEntry, retrieveQA, retrieveBuildingInfo, buildSystemPrompt, buildUserPrompt };
