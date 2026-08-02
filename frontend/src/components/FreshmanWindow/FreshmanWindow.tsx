import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { highlightMatch } from '../../utils/highlight';
import { matchBestAnswer } from '../../data/qa-matcher';
import './FreshmanWindow.css';

type FreshmanEntry = {
  id: string;
  question: string;
  answer?: string;
  createdAt: string;
  status?: 'resolved' | 'pending';
};

type PanelPhase = 'hidden' | 'entering' | 'visible' | 'exiting';

const STORAGE_KEY = 'nuaa-map-freshman-qa';
const STORAGE_VERSION = 5;
const QA_API_URL = '/api/qa';

import qaData from '../../data/qa-新生问答.json';

const DEFAULT_FAQS: FreshmanEntry[] = qaData.questions.map((q, i) => ({
  id: `qa-freshman-${i + 1}`,
  question: q.question,
  answer: q.answer,
  createdAt: '\u2460\u7ec4 QA \u77e5\u8bc6\u5e93',
}));

function readLocalEntries(): FreshmanEntry[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
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

export function FreshmanWindow({ onExpandedChange }: { onExpandedChange?: (expanded: boolean) => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [entries, setEntries] = useState<FreshmanEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [panelPhase, setPanelPhase] = useState<PanelPhase>('hidden');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('\u77e5\u8bc6\u5e93\u5df2\u5c31\u7eea');
  const [askResult, setAskResult] = useState<{ question: string; answer: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

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
      try {
        const resp = await fetch(QA_API_URL);
        if (resp.ok) {
          const data = await resp.json();
          if (data.entries && data.entries.length > 0) {
            const mapped: FreshmanEntry[] = data.entries.map((e: Record<string, unknown>) => ({
              id: String(e.id ?? ''),
              question: String(e.question ?? ''),
              answer: e.answer ? String(e.answer) : undefined,
              createdAt: String(e.createdAt ?? e.created_at ?? ''),
              status: (e.status as FreshmanEntry['status']) || undefined,
            }));
            setEntries(mapped);
            writeLocalEntries(mapped);
            setStatusText('\u77e5\u8bc6\u5e93\u5df2\u5c31\u7eea');
            return;
          }
        }
      } catch { }

      const localEntries = readLocalEntries();
      if (localEntries.length) {
        setEntries(localEntries);
      } else {
        setEntries(DEFAULT_FAQS);
        writeLocalEntries(DEFAULT_FAQS);
      }
      setStatusText('\u77e5\u8bc6\u5e93\u5df2\u5c31\u7eea');
    };

    loadEntries();
  }, []);

  const saveEntry = (entry: FreshmanEntry) => {
    setEntries((prevEntries) => {
      const existing = prevEntries.find(
        (item) => item.question === entry.question && item.answer && item.answer.trim() !== ''
      );
      if (existing) {
        return prevEntries;
      }
      const nextEntries = [entry, ...prevEntries.filter((item) => item.id !== entry.id)];
      writeLocalEntries(nextEntries);
      return nextEntries;
    });

    fetch(QA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: entry.question,
        answer: entry.answer || null,
        status: entry.status || 'pending',
      }),
    }).catch(() => { });
  };

  const submitQuestion = (rawQuestion: string) => {
    const trimmedQuestion = rawQuestion.trim();
    if (!trimmedQuestion) return;

    setQuestion('');
    setSubmitting(true);
    if (!expanded) openPanel();
    setAskResult(null);

    const match = matchBestAnswer(trimmedQuestion);
    const answerText = match
      ? match.entry.answer
      : '\u6682\u65f6\u6ca1\u6709\u627e\u5230\u7b54\u6848\uff0c\u5df2\u4fdd\u5b58\u4e3a\u5f85\u5904\u7406\u95ee\u9898\u3002';
    setAskResult({ question: trimmedQuestion, answer: answerText });
    setSearchTerm(trimmedQuestion);
    setStatusText(match ? '\u5df2\u627e\u5230\u53c2\u8003\u7b54\u6848\uff0c\u60a8\u53ef\u4ee5\u7ee7\u7eed\u67e5\u770b\u5e38\u89c1\u95ee\u9898\u5e76\u6807\u8bb0\u7ed3\u679c' : '\u5df2\u4fdd\u5b58\u5230\u672c\u5730');
    setSubmitting(false);
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
    setAskResult(null);
    setStatusText('\u77e5\u8bc6\u5e93\u5df2\u5c31\u7eea');
  };

  const handleMarkPending = () => {
    if (!askResult) return;
    persistQuestion(askResult.question, '\u7b49\u5f85\u4eba\u5de5\u56de\u590d', 'pending');
    setAskResult(null);
    setStatusText('\u95ee\u9898\u5df2\u8bb0\u5f55\u4e3a\u5f85\u4eba\u5de5\u56de\u590d');
  };

  const handleSubmitReply = (entryId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    setEntries((prevEntries) => {
      const nextEntries = prevEntries.map((item) => {
        if (item.id === entryId) {
          return { ...item, answer: trimmed, status: 'resolved' as const };
        }
        return item;
      });
      writeLocalEntries(nextEntries);
      return nextEntries;
    });

    fetch(QA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: entry.question,
        answer: trimmed,
        status: 'resolved',
      }),
    }).catch(() => { });

    setReplyingTo(null);
    setReplyText('');
    setStatusText('\u56de\u590d\u5df2\u4fdd\u5b58');
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

  useEffect(() => { onExpandedChange?.(expanded); }, [expanded, onExpandedChange]);

  /* 原生事件拦截：阻止所有鼠标/触摸/滚轮事件穿透到地图 */
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const block = (e: Event) => { e.stopPropagation(); };
    el.addEventListener('mousedown', block);
    el.addEventListener('mousemove', block);
    el.addEventListener('mouseup', block);
    el.addEventListener('touchstart', block, { passive: true });
    el.addEventListener('touchmove', block, { passive: true });
    el.addEventListener('touchend', block);
    el.addEventListener('wheel', block, { passive: false });
    el.addEventListener('pointerdown', block);
    el.addEventListener('pointermove', block);
    return () => {
      el.removeEventListener('mousedown', block);
      el.removeEventListener('mousemove', block);
      el.removeEventListener('mouseup', block);
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
      el.removeEventListener('touchend', block);
      el.removeEventListener('wheel', block);
      el.removeEventListener('pointerdown', block);
      el.removeEventListener('pointermove', block);
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
        aria-label={expanded ? '\u5173\u95ed\u65b0\u751f\u95ee\u7b54' : '\u6253\u5f00\u65b0\u751f\u95ee\u7b54'}
      >
        <span className="freshman-window__icon">✦</span>
        <span>新生问答</span>
        <span className="freshman-window__count">{entries.length}</span>
      </button>

      {panelPhase !== 'hidden' && (
        <div
          ref={panelRef}
          className={`freshman-window__panel ${panelPhase === 'entering' ? 'freshman-window__panel--entering' :
            panelPhase === 'exiting' ? 'freshman-window__panel--exiting' :
              ''
            }`}
          onAnimationEnd={handlePanelAnimEnd}
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
                        {item.status === 'pending' && (
                          <button
                            className="freshman-window__submit freshman-window__submit--secondary"
                            type="button"
                            style={{ fontSize: '12px', padding: '2px 8px', marginLeft: 'auto' }}
                            onClick={() => {
                              setReplyingTo(replyingTo === item.id ? null : item.id);
                              setReplyText('');
                            }}
                          >
                            {replyingTo === item.id ? '\u53d6\u6d88' : '\u8865\u5145\u56de\u590d'}
                          </button>
                        )}
                      </div>
                      {item.status === 'pending' && replyingTo === item.id && (
                        <div style={{ marginTop: '8px' }}>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={'\u8f93\u5165\u56de\u590d\u5185\u5bb9...'}
                            rows={2}
                            style={{ width: '100%', resize: 'vertical', fontSize: '13px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                          />
                          <button
                            className="freshman-window__submit"
                            type="button"
                            style={{ marginTop: '4px', fontSize: '12px', padding: '4px 12px' }}
                            disabled={!replyText.trim()}
                            onClick={() => handleSubmitReply(item.id)}
                          >
                            {'\u63d0\u4ea4\u56de\u590d'}
                          </button>
                        </div>
                      )}
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