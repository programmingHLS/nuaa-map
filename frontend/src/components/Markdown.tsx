import { memo } from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * 聊天消息 Markdown 渲染。
 * 仅允许安全的行内格式 + 链接 + 列表，
 * 禁止 HTML / img / heading 等破坏布局的元素。
 */
const ALLOWED = ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'br', 'code', 'pre', 'blockquote', 'hr'] as const;

interface MarkdownProps {
  content: string;
}

export const Markdown = memo(function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown allowedElements={ALLOWED as unknown as string[]} unwrapDisallowed>
      {content}
    </ReactMarkdown>
  );
});
