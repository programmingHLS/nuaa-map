import { matchBestAnswer } from '../data/qa-matcher';
import { RAG_API_URL } from '../config/api';

export interface RagContext {
    buildingId?: string;
    buildingName?: string;
    buildingDescription?: string;
}

export interface RagResponse {
    answer: string;
    sources?: string[];
    fromRemote: boolean;
    error?: string;
}

function getChatEndpoint(): string {
    if (RAG_API_URL) return `${RAG_API_URL}/api/chat`;
    return '/api/chat';
}

const MSG_TIMEOUT = 'AI\u6b63\u5728\u601d\u8003\u4e2d\uff0c\u54cd\u5e94\u65f6\u95f4\u8f83\u957f\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
const MSG_UNAVAILABLE = '\u62b1\u6b49\uff0c\u667a\u80fd\u95ee\u7b54\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';

async function callRemoteRAG(
    question: string,
    context?: RagContext,
): Promise<RagResponse> {
    try {
        const resp = await fetch(getChatEndpoint(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question,
                context: context?.buildingDescription,
                buildingId: context?.buildingId,
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const data = (await resp.json()) as { answer: string; sources?: string[] };
        return {
            answer: data.answer,
            sources: data.sources,
            fromRemote: true,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes('Timeout') || msg.includes('timeout') || msg.includes('abort');
        return {
            answer: isTimeout ? MSG_TIMEOUT : MSG_UNAVAILABLE,
            fromRemote: false,
            error: msg,
        };
    }
}

export async function askRAG(
    question: string,
    context?: RagContext,
): Promise<RagResponse> {
    const match = matchBestAnswer(question);
    if (match) {
        return {
            answer: match.entry.answer,
            sources: [match.entry.id],
            fromRemote: false,
        };
    }

    return callRemoteRAG(question, context);
}