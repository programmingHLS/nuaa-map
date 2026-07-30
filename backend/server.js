import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * 从 QA 知识库中检索最相关的 topN 条目
 */
function retrieveQA(question, topN = 5) {
    const tokens = tokenize(question);
    const scored = qaEntries.map(entry => ({
        entry,
        score: scoreEntry(tokens, entry.question),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, topN);
}

/**
 * 根据用户问题和建筑信息，进行关键词匹配建筑名称/描述
 */
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
请基于提供的知识库（QA 问答、建筑信息）回答用户关于南航天目湖校区的各种问题。
请严格遵守以下规则：
1. 优先使用提供的知识库内容回答，不要编造信息。
2. 如果知识库中没有相关信息，坦诚告知用户"该信息尚未记录，请咨询学校相关部门"。
3. 回答要简洁、准确，符合学生助手语境。
4. 回答中可以适当引导用户（如"建议你咨询师生服务大厅X号窗口办理"）。
5. 涉及时间、地点、办事流程的信息时，直接给出明确答案。
6. 使用中文回答。
7. 可以适当使用 Markdown 格式提升可读性：用 **粗体** 强调关键信息，
   用有序/无序列表展示办事流程或多个选项，
   用 > 引用块标注注意事项。但不要使用标题（#）或图片。`;
}

function buildUserPrompt(question, qaResults, buildingResults, contextText) {
    let contextSections = [];

    if (contextText && typeof contextText === 'string' && contextText.trim()) {
        contextSections.push(`用户当前正在查看的建筑信息：\n${contextText.trim()}`);
    }

    if (qaResults.length > 0) {
        const qaText = qaResults.map((r, i) =>
            `参考 ${i + 1}：问：${r.entry.question}\n答：${r.entry.answer}`
        ).join('\n\n');
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

/* =============================================================
 *  LLM 调用
 * ============================================================= */

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-pro';

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

app.post('/api/freshman-questions', async (req, res) => {
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
});

app.post('/api/chat', async (req, res) => {
    const { question, buildingId, context } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'question 不能为空' });
    }

    const trimmed = question.trim();
    const qaResults = retrieveQA(trimmed, 5);
    const buildingResults = retrieveBuildingInfo(trimmed, buildingId);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(trimmed, qaResults, buildingResults, context);

    const llmResp = await callLLM(systemPrompt, userPrompt);

    const sources = [];
    for (const r of qaResults) sources.push(r.entry.id);
    for (const r of buildingResults) sources.push(r.building.id);

    res.json({
        answer: llmResp.content,
        sources: [...new Set(sources)],
        usage: llmResp.usage || null,
    });
});

app.listen(PORT, () => {
    console.log(`[RAG Server] http://localhost:${PORT}`);
    console.log(`  QA entries: ${qaEntries.length}`);
    console.log(`  Buildings:  ${buildings.length}`);
    console.log(`  LLM:        ${LLM_API_KEY ? 'configured' : 'NOT configured (set LLM_API_KEY)'}`);
});
