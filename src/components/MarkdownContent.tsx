import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownContentProps { content: string }

function normalizeMathDelimiters(content: string): string {
  let insideCodeFence = false;
  let insideDisplayMath = false;

  return content.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      insideCodeFence = !insideCodeFence;
      return line;
    }
    if (insideCodeFence) return line;

    const normalized = line
      // Algunos modelos envían ((\mathbf{F})) sin delimitadores LaTeX estándar.
      .replace(/\(\((\\[^()\n]+)\)\)/g, (_match, expression: string) => `$${expression}$`)
      .replace(/\\\[/g, () => '$$')
      .replace(/\\\]/g, () => '$$')
      .replace(/\\\(/g, () => '$')
      .replace(/\\\)/g, () => '$');

    // `\\[ ... \\]` se convierte en un bloque `$$ ... $$`. No debemos
    // envolver de nuevo sus líneas internas con `$`, porque KaTeX recibiría
    // delimitadores anidados (por ejemplo, `$\\vec{F}$` dentro del bloque).
    if (/^\s*\$\$\s*$/.test(normalized)) {
      insideDisplayMath = !insideDisplayMath;
      return normalized;
    }

    if (insideDisplayMath) return normalized;

    if (normalized.includes('$')) return normalized;

    // Otros modelos omiten por completo los delimitadores al final de una línea.
    return normalized.replace(
      /^(.*?)(\\(?:mathbf|mathrm|mathit|textbf|boldsymbol|vec|overrightarrow|frac|sqrt|sum|prod|int|lim)\b.*)$/,
      (_match, prefix: string, expression: string) => `${prefix}$${expression}$`,
    );
  }).join('\n');
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        pre: ({ children, ...props }) => <pre {...props}><span className="code-language">código</span>{children}</pre>,
      }}
    >
      {normalizeMathDelimiters(content)}
    </Markdown>
  );
}
