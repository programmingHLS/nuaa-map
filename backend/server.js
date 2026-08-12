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
    const scored = qaEntries.map(entry => ({
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
请基于提供的知识库（QA 问答、建筑信息）回答用户关于南航天目湖校区的各种问题。
请严格遵守以下规则：
1. 优先使用提供的知识库内容回答，不要编造信息。
2. 如果知识库中没有相关信息，可以结合自身知识和联网搜索结果回答，
   并注明信息来源；涉及报到、缴费、考试、报销等关键流程时，
   建议用户咨询学校相关部门确认。
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
    if ((qaResults.length === 0 || bestScore < 30) && process.env.TAVILY_API_KEY) {
        const webResults = await searchWeb(trimmed, 3);
        if (webResults.length > 0) {
            const webText = webResults.map((r, i) =>
                `来源 ${i + 1}：${r.title}\n链接：${r.url}\n内容：${r.content}`
            ).join('\n\n');
            userPrompt += `\n\n--- 联网搜索结果 ---\n${webText}\n--- 结束 ---`;
        }
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
