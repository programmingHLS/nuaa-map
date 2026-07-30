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

const MSG_TIMEOUT = 'AI \u6b63\u5728\u601d\u8003\u4e2d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
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

/**
 * \u6240\u6709\u95ee\u7b54\u7edf\u4e00\u8d70\u540e\u7aef RAG \u7ba1\u9053\uff1a\u540e\u7aef\u7528 QA \u77e5\u8bc6\u5e93 + \u5efa\u7b51\u4fe1\u606f\u4f5c\u4e3a\u4e0a\u4e0b\u6587\uff0c
 * \u4ea4\u7ed9 AI \u751f\u6210\u56de\u7b54\u3002AI \u4f1a\u57fa\u4e8e\u63d0\u4f9b\u7684\u77e5\u8bc6\u5e93\u7ec4\u7ec7\u8bed\u8a00\uff0c
 * \u77e5\u8bc6\u5e93\u6ca1\u6709\u8986\u76d6\u7684\u5185\u5bb9\u4f1a\u5982\u5b9e\u544a\u77e5\u3002
 */
export async function askRAG(
    question: string,
    context?: RagContext,
): Promise<RagResponse> {
    return callRemoteRAG(question, context);
}