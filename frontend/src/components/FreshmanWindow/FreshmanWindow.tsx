import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { highlightMatch } from '../../utils/highlight';
import './FreshmanWindow.css';

type FreshmanEntry = {
  id: string;
  question: string;
  answer?: string;
  createdAt: string;
  status?: 'resolved' | 'pending';
};

type FreshmanPayload = {
  question: string;
  answer?: string;
};

type PanelPhase = 'hidden' | 'entering' | 'visible' | 'exiting';

const STORAGE_KEY = 'nuaa-map-freshman-qa';
const STORAGE_VERSION = 2; // 递增以清除旧缓存，防止旧 mock 数据覆盖真实 QA
const API_URL = '/api/freshman-questions';

// 从 QA 知识库加载预设问答
import qaData from '../../data/qa-新生问答.json';

const DEFAULT_FAQS: FreshmanEntry[] = qaData.questions.map((q, i) => ({
  id: `qa-freshman-${i + 1}`,
  question: q.question,
  answer: q.answer,
  createdAt: '④组 QA 知识库',
}));

function readLocalEntries(): FreshmanEntry[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    // 版本不匹配时抛弃旧缓存
    if (parsed._v !== STORAGE_VERSION) {
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    const entries = parsed._entries ?? parsed;
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeLocalEntries(entries: FreshmanEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: STORAGE_VERSION, _entries: entries }));
}

function normalizeEntries(value: unknown): FreshmanEntry[] {
  if (!Array.isArray(value)) return [];

  const getAnswer = (item: Record<string, unknown>) => {
    const answerKeys = ['answer', 'response', 'content', 'reply', 'description', 'detail', 'text'];
    for (const key of answerKeys) {
      const candidate = item[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return undefined;
  };

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? `${Date.now()}-${Math.random()}`),
      question: String(item.question ?? ''),
      answer: getAnswer(item),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : String(item.createdAt ?? ''),
    }))
    .filter((item) => item.question);
}

export function FreshmanWindow() {
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [entries, setEntries] = useState<FreshmanEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [panelPhase, setPanelPhase] = useState<PanelPhase>('hidden');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('正在同步问答数据...');
  const [askResult, setAskResult] = useState<{ question: string; answer: string } | null>(null);

  /* ── 面板动画阶段管理 ── */
  const openPanel = () => {
    setExpanded(true);
    setPanelPhase('entering');
  };

  const closePanel = () => {
    setExpanded(false);
    setPanelPhase('exiting');
  };

  const handlePanelAnimEnd = () => {
    if (panelPhase === 'entering') {
      setPanelPhase('visible');
    } else if (panelPhase === 'exiting') {
      setPanelPhase('hidden');
    }
  };

  useEffect(() => {
    const loadEntries = async () => {
      const localEntries = readLocalEntries();
      if (localEntries.length) {
        setEntries(localEntries);
      } else {
        setEntries(DEFAULT_FAQS);
        writeLocalEntries(DEFAULT_FAQS);
      }

      try {
        const response = await fetch(API_URL, { method: 'GET' });
        if (!response.ok) throw new Error('fetch failed');
        const data = await response.json();
        const serverEntries = normalizeEntries(data);
        if (serverEntries.length) {
          setEntries(serverEntries);
          writeLocalEntries(serverEntries);
          setStatusText('已连接后端问答接口');
        } else {
          setStatusText('后端返回为空，已使用本地预设内容');
        }
      } catch {
        setStatusText('未检测到后端接口，使用本地数据');
      }
    };

    void loadEntries();
  }, []);

  const saveEntry = (entry: FreshmanEntry) => {
    setEntries((prevEntries) => {
      const nextEntries = [entry, ...prevEntries.filter((item) => item.id !== entry.id)];
      writeLocalEntries(nextEntries);
      return nextEntries;
    });
  };

  const submitQuestion = async (rawQuestion: string) => {
    const trimmedQuestion = rawQuestion.trim();
    if (!trimmedQuestion) return;

    setQuestion('');
    setSubmitting(true);
    if (!expanded) openPanel();
    setAskResult(null);
    setStatusText('正在等待后端回复...');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmedQuestion } as FreshmanPayload),
      });

      if (!response.ok) throw new Error('post failed');
      const data = await response.json();
      const serverEntry = normalizeEntries([data])[0];
      const answerText = serverEntry?.answer?.trim() || '暂时没有收到回复，请稍后再试。';
      setAskResult({ question: trimmedQuestion, answer: answerText });
      setSearchTerm(trimmedQuestion);
      setStatusText('已找到可参考答案，您可以继续查看常见问题并标记结果');
    } catch {
      setAskResult({ question: trimmedQuestion, answer: '暂时没有收到回复，已保存为待处理问题。' });
      setSearchTerm(trimmedQuestion);
      setStatusText('已保存到本地，等待后端接入');
    } finally {
      setSubmitting(false);
    }
  };

  const persistQuestion = (questionText: string, answerText: string, status: FreshmanEntry['status']) => {
    saveEntry({
      id: `${Date.now()}`,
      question: questionText,
      answer: answerText,
      createdAt: new Date().toLocaleDateString('zh-CN'),
      status,
    });
  };

  const handleMarkResolved = () => {
    if (!askResult) return;
    persistQuestion(askResult.question, askResult.answer, 'resolved');
    setAskResult(null);
    setStatusText('问题已记录到常见问题');
  };

  const handleMarkPending = () => {
    if (!askResult) return;
    persistQuestion(askResult.question, '等待人工回复', 'pending');
    setAskResult(null);
    setStatusText('问题已记录为待人工回复');
  };

  useEffect(() => {
    if (!expanded) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsidePanel = panelRef.current?.contains(target);
      const clickedToggle = toggleRef.current?.contains(target);
      if (!clickedInsidePanel && !clickedToggle) {
        closePanel();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [expanded]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const stopTouch = (e: TouchEvent) => { e.stopPropagation(); };
    el.addEventListener('touchstart', stopTouch, { passive: true });
    el.addEventListener('touchmove', stopTouch, { passive: true });
    return () => {
      el.removeEventListener('touchstart', stopTouch);
      el.removeEventListener('touchmove', stopTouch);
    };
  }, [panelPhase]);

  const handleToggleClick = () => {
    if (expanded) {
      closePanel();
    } else {
      openPanel();
    }
  };

  const filteredEntries = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return entries;

    return entries.filter((item) => {
      const haystack = `${item.question} ${item.answer ?? ''}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [entries, searchTerm]);

  const handleAskSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(question);
  };

  const handleTextareaKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion(question);
    }
  };

  return (
    <aside className={`freshman-window ${expanded ? 'freshman-window--expanded' : ''}`}>
      <button
        ref={toggleRef}
        className="freshman-window__toggle"
        type="button"
        onClick={handleToggleClick}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseMove={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
        aria-expanded={expanded}
        aria-label={expanded ? '关闭新生问答' : '打开新生问答'}
      >
        <span className="freshman-window__icon">✦</span>
        <span>新生问答</span>
        <span className="freshman-window__count">{entries.length}</span>
      </button>

      {panelPhase !== 'hidden' && (
        <div
          ref={panelRef}
          className={`freshman-window__panel ${
            panelPhase === 'entering' ? 'freshman-window__panel--entering' :
            panelPhase === 'exiting' ? 'freshman-window__panel--exiting' :
            ''
          }`}
          onAnimationEnd={handlePanelAnimEnd}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseMove={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="freshman-window__main">
            <div className="freshman-window__ask-card">
              <div className="freshman-window__section-title">提问</div>
              <p className="freshman-window__intro">输入你的问题，系统会先从知识库中检索相似内容。</p>
              <p className="freshman-window__status">{statusText}</p>

              <form className="freshman-window__form" onSubmit={handleAskSubmit}>
                <label className="freshman-window__field">
                  <span>你的问题</span>
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder="例如：图书馆几点关门？"
                    rows={2}
                  />
                </label>
                <button className="freshman-window__submit" type="submit" disabled={submitting || !question.trim()}>
                  {submitting ? '提交中...' : '提交问题'}
                </button>
              </form>

              {askResult && (
                <div className="freshman-window__reply">
                  <div className="freshman-window__section-title">参考答案</div>
                  <p className="freshman-window__reply-text">{askResult.answer}</p>
                  <div className="freshman-window__reply-actions">
                    <button className="freshman-window__submit freshman-window__submit--secondary" type="button" onClick={handleMarkResolved}>
                      ✓ 已解决
                    </button>
                    <button className="freshman-window__submit" type="button" onClick={handleMarkPending}>
                      ? 未解决
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="freshman-window__search-card">
              <div className="freshman-window__section-title">常见问题</div>
              <label className="freshman-window__field">
                <span>关键词检索</span>
                <input
                  className="freshman-window__search-input"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="输入宿舍、食堂、图书馆等关键词"
                />
              </label>

              <div className="freshman-window__search-meta">
                共 {filteredEntries.length} 条记录
                {searchTerm.trim() && entries.length !== filteredEntries.length && (
                  <span>（已过滤）</span>
                )}
              </div>

              <div
                className="freshman-window__list"
                onMouseDown={(event) => event.stopPropagation()}
                onMouseMove={(event) => event.stopPropagation()}
                onMouseUp={(event) => event.stopPropagation()}
                onWheelCapture={(event) => event.stopPropagation()}
              >
                {filteredEntries.length === 0 ? (
                  <div className="freshman-window__empty">
                    {searchTerm.trim() ? '没有匹配的问题，试试其他关键词' : '暂无常见问题'}
                  </div>
                ) : (
                  filteredEntries.map((item) => (
                    <article key={item.id} className="freshman-window__item">
                      <div className="freshman-window__item-title">Q: {highlightMatch(item.question, searchTerm)}</div>
                      <p className="freshman-window__item-answer">{highlightMatch(item.answer || '等待后续回复…', searchTerm)}</p>
                      <div className="freshman-window__item-meta">
                        <time className="freshman-window__item-time">{item.createdAt}</time>
                        {item.status === 'pending' && <span className="freshman-window__chip">待人工回复</span>}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
