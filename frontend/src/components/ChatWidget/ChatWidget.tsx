import { getAiReply } from "../../api/aiChat";
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Building, ChatMessage } from '../../types';
import { matchBestAnswer, getRelatedQuestions } from '../../data/qa-matcher';
import type { QaEntry } from '../../data/qa-matcher';
import './ChatWidget.css';

interface ChatWidgetProps {
  selectedBuilding?: Building | null;
  onViewBuilding?: (building: Building) => void;
}

export function ChatWidget({ selectedBuilding, onViewBuilding }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome', role: 'assistant',
    content: '你好！我是南航校园助手 🛩️\n\n有什么关于天目湖校区的问题都可以问我～',
    timestamp: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<QaEntry[]>([]);
  const timerRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  /* 移动端聊天打开时锁定背景滚动 + 卸载时清理定时器 */
  useEffect(() => {
    if (isOpen) document.body.classList.add('body--chat-open');
    else document.body.classList.remove('body--chat-open');
    return () => {
      document.body.classList.remove('body--chat-open');
      clearTimeout(timerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isOpen]);

  /* 打开时加载默认快捷建议 */
  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      setSuggestions(getRelatedQuestions('', 3));
    }
  }, [isOpen, suggestions.length]);

  const handleSend = useCallback(async (text: string) => {
    if (!text || isLoading) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`, role: 'user', content: text, timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // 1. 优先匹配本地QA知识库
    const localMatch = matchBestAnswer(text);
    if (localMatch) {
      timerRef.current = setTimeout(() => {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: localMatch.entry.answer,
          timestamp: Date.now(),
        }]);
        setSuggestions(getRelatedQuestions(text, 3));
        setIsLoading(false);
      }, 400);
      return;
    }

    // 2. 本地无匹配，调用DeepSeek AI接口
    const history = messages.map(m => ({
      role: m.role,
      content: m.content
    }));
    // 构造系统提示词
    let systemPrompt = "你是南航天目湖校区NUAAMap专属AI助手，只回答校区、本地图项目相关问题，回答简洁清晰，拒绝无关内容。";
    if (selectedBuilding) {
      systemPrompt += ` 当前用户正在查看【${selectedBuilding.name}】，优先回答该建筑相关内容。`;
    }
    const reqMessages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: text }
    ];

    try {
      const aiAnswer = await getAiReply(reqMessages);
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: aiAnswer,
        timestamp: Date.now(),
      }]);
      setSuggestions(getRelatedQuestions(text, 3));
    } catch (err) {
      console.error("AI接口请求失败：", err);
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: "智能AI服务暂时无法连接，请稍后重试。",
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, selectedBuilding]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    handleSend(text);
  }, [input, isLoading, handleSend]);

  return (
    <div className={`chat-widget ${isOpen ? 'chat-widget--open' : ''}`} ref={chatRef}>
      {!isOpen ? (
        <button className="chat-fab" onClick={() => setIsOpen(true)} aria-label="打开智能问答">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      ) : (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-title">
              <span className="chat-header-icon">🛩️</span>
              <div>
                <h3 className="chat-header-name">校园助手</h3>
                <span className="chat-header-status">AI · 测试模式</span>
              </div>
            </div>
            <button className="chat-close" onClick={() => setIsOpen(false)} aria-label="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18"/>
              </svg>
            </button>
          </div>

          {selectedBuilding && (
            <div className="chat-context">
              <span className="chat-context-dot" />
              <span className="chat-context-text">
                当前在看 <strong>{selectedBuilding.name}</strong>
              </span>
              {onViewBuilding && (
                <button className="chat-context-action" onClick={() => onViewBuilding(selectedBuilding)}>
                  查看详情
                </button>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="chat-suggestions">
              <div className="chat-suggestions-title">猜你想问</div>
              <div className="chat-suggestions-list">
                {suggestions.map(s => (
                  <button key={s.id} className="chat-suggestion-btn"
                    disabled={isLoading}
                    onClick={() => { setInput(''); handleSend(s.question); }}
                  >
                    {s.question}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`chat-msg ${msg.role === 'user' ? 'chat-msg--user' : ''}`}>
                <div className="chat-msg-bubble">{msg.content}</div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-msg">
                <div className="chat-msg-bubble chat-msg-typing"><span/><span/><span/></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input ref={inputRef} className="chat-input" type="text"
              placeholder="输入问题…" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              disabled={isLoading}
            />
            <button className="chat-send" onClick={sendMessage}
              disabled={!input.trim() || isLoading} aria-label="发送">
              <svg width="18" height="18" viewBox="0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}