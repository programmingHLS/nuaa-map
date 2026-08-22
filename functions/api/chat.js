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
        let sourceType = null;
        let llmError = null;

        try {
            if (db) {
                const allKeywords = tokenize(question);
                const keywords = allKeywords
                    .sort((a, b) => b.length - a.length)
                    .slice(0, 8);
                if (keywords.length > 0) {
                    const likeClauses = keywords.map(() => '(question LIKE ? OR answer LIKE ?)').join(' OR ');
                    const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
                    const { results } = await db.prepare(
                        `SELECT id, question, answer FROM qa_entries WHERE answer IS NOT NULL AND (${likeClauses}) LIMIT 10`
                    ).bind(...params).all();

                    let bestMatch = null;
                    let bestScore = 0;
                    for (const row of results) {
                        const score = scoreMatch(allKeywords, row.question, row.answer || '');
                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = row;
                        }
                    }

                    if (bestMatch && bestScore >= 30 && bestMatch.answer) {
                        answer = bestMatch.answer;
                        sources = [bestMatch.id];
                        sourceType = 'd1';
                    }
                }
            }
        } catch (dbErr) {
            console.error('D1 query failed:', dbErr.message);
        }

        if (!answer) {
            if (env.LLM_API_KEY && env.LLM_API_URL) {
                try {
                    answer = await callLLM(env, question, buildingId, buildingName, buildingCtx);
                    if (answer) sourceType = 'llm';
                } catch (llmErr) {
                    console.error('LLM call failed:', llmErr.message);
                    llmError = llmErr.message;
                }
            } else {
                llmError = `LLM not configured: LLM_API_KEY=${env.LLM_API_KEY ? 'set' : 'missing'}, LLM_API_URL=${env.LLM_API_URL || 'missing'}`;
            }
        }

        if (!answer) {
            answer = '\u667a\u80fd\u95ee\u7b54\u670d\u52a1\u6682\u672a\u914d\u7f6e\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u3002';
        }

        try {
            if (db) {
                await db.prepare(
                    'INSERT INTO chat_logs (id, question, answer, building_id, building_name) VALUES (?, ?, ?, ?, ?)'
                ).bind(
                    `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    question, answer, buildingId || null, buildingName || null
                ).run();
            }
        } catch (logErr) {
            console.error('chat_logs insert failed:', logErr.message);
        }

        const resp = { answer, sources, sourceType };
        if (llmError) resp.llmError = llmError;
        return jsonResponse(resp);
    } catch (err) {
        return jsonResponse({
            answer: '\u62b1\u6b49\uff0c\u667a\u80fd\u95ee\u7b54\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\u3002',
            error: err.message,
        }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const STOP_WORDS = new Set([
    '\u7684', '\u4e86', '\u5728', '\u662f', '\u6211', '\u6709', '\u548c', '\u5c31', '\u4e0d',
    '\u4eba', '\u90fd', '\u4e00', '\u4e0a', '\u4e5f', '\u5f88', '\u5230',
    '\u8bf4', '\u8981', '\u53bb', '\u4f60', '\u4f1a', '\u7740', '\u6ca1\u6709', '\u770b',
    '\u597d', '\u81ea\u5df1', '\u8fd9', '\u4ed6', '\u5979', '\u5b83', '\u4eec', '\u90a3',
    '\u4e9b', '\u5417', '\u554a', '\u5462', '\u5427', '\u55ef', '\u54e6',
    '\u600e\u4e48', '\u4ec0\u4e48', '\u5982\u4f55', '\u54ea\u91cc', '\u54ea\u4e2a', '\u54ea\u4e9b',
    '\u4f55\u65f6', '\u591a\u5c11', '\u51e0', '\u5565', '\u548b', '\u4e3a\u5565', '\u4e3a\u4ec0\u4e48',
    '\u8bf7\u95ee', '\u8bf7',
]);

function tokenize(text) {
    const raw = text.toLowerCase().split(/[\s,.\u3002\uff0c\uff01\uff1f\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09()\u3010\u3011\u300a\u300b/\\|]+/);
    const tokens = [];
    for (const token of raw) {
        if (/[\u4e00-\u9fff]/.test(token)) {
            for (const ch of token) {
                if (/[\u4e00-\u9fff]/.test(ch) && !STOP_WORDS.has(ch)) tokens.push(ch);
            }
            for (let i = 0; i < token.length - 1; i++) {
                const bigram = token.substring(i, i + 2);
                if (/[\u4e00-\u9fff]/.test(bigram[0]) && /[\u4e00-\u9fff]/.test(bigram[1]) && !STOP_WORDS.has(bigram)) {
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

async function callLLM(env, question, buildingId, buildingName, buildingCtx) {
    const systemPrompt = '\u4f60\u662f\u5357\u4eac\u822a\u7a7a\u822a\u5929\u5927\u5b66\u6821\u56ed\u5730\u56fe\u667a\u80fd\u95ee\u7b54\u52a9\u624b\u3002\u8bf7\u57fa\u4e8e\u63d0\u4f9b\u7684\u4fe1\u606f\u56de\u7b54\u95ee\u9898\uff0c\u5982\u679c\u4e0d\u786e\u5b9a\uff0c\u8bf7\u5982\u5b9e\u8bf4\u660e\u3002';
    let userPrompt = question;
    if (buildingName) {
        userPrompt = `\u5173\u4e8e${buildingName}\uff1a${question}`;
    }
    if (buildingCtx) {
        userPrompt += `\n\n\u5efa\u7b51\u4fe1\u606f\uff1a${buildingCtx}`;
    }

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
            temperature: 0.7,
            max_tokens: 1024,
        }),
    });

    if (!resp.ok) throw new Error(`LLM API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
}