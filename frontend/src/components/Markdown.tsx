import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * 聊天消息 Markdown 渲染。
 * 允许安全的行内格式 + 链接 + 列表 + 标题 + 表格 + 引用，
 * 禁止 HTML / img 等破坏布局或存在安全风险的元素。
 * 统一挂载 .markdown-body class，由全局样式统一控制排版（见 index.css）。
 */
const ALLOWED = [
  'p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'br', 'code', 'pre', 'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
] as const;

interface MarkdownProps {
  content: string;
  /** 额外 className，追加到 .markdown-body 上 */
  className?: string;
}

export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  const cls = ['markdown-body', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED as unknown as string[]} unwrapDisallowed>
        {content}
      </ReactMarkdown>
    </div>
  );
});
