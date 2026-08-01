export async function onRequestGet(context) {
    const { env } = context;
    const db = env.DB;

    try {
        if (!db) {
            return jsonResponse({ entries: [] }, 200);
        }

        const { results } = await db.prepare(
            'SELECT id, question, answer, status, created_at FROM qa_entries ORDER BY created_at DESC'
        ).all();

        const entries = results.map(row => ({
            id: row.id,
            question: row.question,
            answer: row.answer || undefined,
            status: row.status || undefined,
            createdAt: row.created_at,
        }));

        return jsonResponse({ entries }, 200);
    } catch (err) {
        return jsonResponse({ entries: [], error: err.message }, 500);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const db = env.DB;

    try {
        const body = await request.json();
        const { question, answer, status } = body;

        if (!question) {
            return jsonResponse({ error: 'question is required' }, 400);
        }

        if (!db) {
            return jsonResponse({ error: 'database not configured' }, 503);
        }

        const id = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString().split('T')[0];

        await db.prepare(
            'INSERT INTO qa_entries (id, question, answer, status, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(
            id,
            question,
            answer || null,
            status || 'pending',
            now
        ).run();

        return jsonResponse({
            entry: {
                id,
                question,
                answer: answer || undefined,
                status: status || 'pending',
                createdAt: now,
            },
        }, 201);
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}