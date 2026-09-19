import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps { content: string }

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        pre: ({ children, ...props }) => <pre {...props}><span className="code-language">código</span>{children}</pre>,
      }}
    >
      {content}
    </Markdown>
  );
}
