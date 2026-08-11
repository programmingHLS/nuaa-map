export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        const body = await request.json();
        const { question, buildingId, buildingName, context: buildingCtx } = body;

        if (!question) {
            return jsonResponse({ error: 'question is required' }, 400);
        }

        let answer = null;
        let sources = [];
        let qaContext = [];
        let bestScore = 0;

        if (db) {
            const keywords = tokenize(question);
            const allResults = new Map();

            if (keywords.length > 0) {
                const likeClauses = keywords.map(() => '(question LIKE ? OR answer LIKE ?)').join(' OR ');
                const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
                const { results } = await db.prepare(
                    `SELECT id, question, answer FROM qa_entries WHERE answer IS NOT NULL AND (${likeClauses}) LIMIT 10`
                ).bind(...params).all();
                for (const row of results) {
                    if (!allResults.has(row.id)) allResults.set(row.id, row);
                }
            }

            {
                const { results } = await db.prepare(
                    `SELECT id, question, answer FROM qa_entries WHERE answer IS NOT NULL AND (question LIKE ? OR answer LIKE ?) LIMIT 5`
                ).bind(`%${question}%`, `%${question}%`).all();
                for (const row of results) {
                    if (!allResults.has(row.id)) allResults.set(row.id, row);
                }
            }

            const scored = [...allResults.values()].map(row => ({
                row,
                score: scoreMatch(keywords, row.question, row.answer || ''),
            })).sort((a, b) => b.score - a.score);

            qaContext = scored
                .filter(s => s.score > 0 && s.row.answer)
                .slice(0, 5)
                .map(s => s.row);

            bestScore = scored[0]?.score || 0;
            if (scored[0] && scored[0].score >= 30 && scored[0].row.answer) {
                sources = [scored[0].row.id];
            }
        }

        if (bestScore >= 60 && qaContext.length > 0) {
            answer = qaContext[0].answer;
        } else if (env.LLM_API_KEY && env.LLM_API_URL) {
            answer = await callLLM(env, question, buildingId, buildingName, buildingCtx, qaContext);
        } else if (qaContext.length > 0) {
            answer = qaContext[0].answer;
        }

        if (!answer) {
            answer = '�����ʴ������δ���ã�����ϵ����Ա��';
        }

        if (db) {
            await db.prepare(
                'INSERT INTO chat_logs (id, question, answer, building_id, building_name) VALUES (?, ?, ?, ?, ?)'
            ).bind(
                `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                question, answer, buildingId || null, buildingName || null
            ).run();
        }

        return jsonResponse({ answer, sources });
    } catch (err) {
        return jsonResponse({
            answer: '��Ǹ�������ʴ������ʱ�����á�',
            error: err.message,
        }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

const STOP_WORDS = new Set([
    '��', '��', '��', '��', '��', '��', '��', '��', '��',
    '��', '��', 'һ', '��', 'Ҳ', '��', '��',
    '˵', 'Ҫ', 'ȥ', '��', '��', '��', 'û��', '��',
    '��', '�Լ�', '��', '��', '��', '��', '��', '��',
    'Щ', '��', '��', '��', '��', '��', 'Ŷ',
    '����', '��',
]);

function tokenize(text) {
    const raw = text.toLowerCase().split(/[\s,.��������������""''����()��������/\\|]+/);
    const tokens = [];
    for (const token of raw) {
        if (/[\u4e00-\u9fff]/.test(token)) {
            for (let i = 0; i < token.length - 1; i++) {
                const bigram = token.substring(i, i + 2);
                if (/[\u4e00-\u9fff]/.test(bigram[0]) && /[\u4e00-\u9fff]/.test(bigram[1]) && !STOP_WORDS.has(bigram)) {
                    tokens.push(bigram);
                }
            }
            for (let i = 0; i < token.length - 2; i++) {
                const trigram = token.substring(i, i + 3);
                if (/[\u4e00-\u9fff]/.test(trigram) && !STOP_WORDS.has(trigram)) {
                    tokens.push(trigram);
                }
            }
            if (!STOP_WORDS.has(token)) tokens.push(token);
        } else if (token.length > 0 && !STOP_WORDS.has(token)) {
            tokens.push(token);
        }
    }
    return [...new Set(tokens)];
}

function scoreMatch(keywords, questionText, answerText) {
    if (keywords.length === 0) return 0;
    const lower = `${questionText} ${answerText}`.toLowerCase();
    let matchedWeight = 0;
    let totalWeight = 0;
    for (const token of keywords) {
        const w = token.length >= 3 ? 3 : token.length === 2 ? 2 : 0.5;
        totalWeight += w;
        if (lower.includes(token)) matchedWeight += w;
    }
    return totalWeight === 0 ? 0 : (matchedWeight / totalWeight) * 100;
}

async function callLLM(env, question, buildingId, buildingName, buildingCtx, qaContext) {
    const systemPrompt = '你是南京航空航天大学校园地图智能问答助手。\n请基于提供的知识库信息回答用户关于南航天目湖校区的各种问题。\n请严格遵守以下规则：\n1. 优先使用提供的知识库内容回答，不要编造信息。\n2. 如果知识库中没有相关信息，坦诚告知用户"该信息尚未记录，请咨询学校相关部门"。\n3. 回答要简洁、准确，符合学生助手语境。\n4. 涉及时间、地点、办事流程的信息时，直接给出明确答案。\n5. 使用中文回答。\n6. 可以适当使用 Markdown 格式提升可读性，但不要使用标题（#）或图片。';

    const contextSections = [];

    if (buildingCtx && typeof buildingCtx === 'string' && buildingCtx.trim()) {
        contextSections.push(`用户当前正在查看的建筑信息：\n${buildingCtx.trim()}`);
    }

    if (buildingName) {
        contextSections.push(`用户当前关注的建筑：${buildingName}`);
    }

    if (qaContext && qaContext.length > 0) {
        const qaText = qaContext.map((r, i) =>
            `参考 ${i + 1}：问：${r.question}\n答：${r.answer}`
        ).join('\n\n');
        contextSections.push(`以下是从校园知识库中检索到的相关问答：\n${qaText}`);
    }

    const contextBlock = contextSections.length > 0
        ? `\n\n--- 参考知识库信息 ---\n${contextSections.join('\n\n')}\n--- 结束 ---\n\n`
        : '';

    const userPrompt = `${contextBlock}用户问题：${question}\n\n请根据以上信息回答用户的问题。`;

    const resp = await fetch(env.LLM_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
            model: env.LLM_MODEL || 'deepseek-v4-pro',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 1024,
        }),
    });

    if (!resp.ok) throw new Error(`LLM API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
}