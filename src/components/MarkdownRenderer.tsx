import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeText = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div
      dir="ltr"
      className="my-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0F172A] text-slate-100"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-[#141D2F] text-xs text-slate-400">
        <span className="font-mono uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          aria-label="کپی کد"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-teal-300">کپی شد</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>کپی</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13.5px] leading-6 font-mono text-slate-100">
        <code>{codeText}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-[15px] leading-[1.85] text-slate-800 dark:text-slate-200 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              dir="auto"
              className="text-xl font-bold mt-6 mb-3 text-slate-950 dark:text-white"
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              dir="auto"
              className="text-lg font-semibold mt-5 mb-2.5 text-slate-950 dark:text-white"
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              dir="auto"
              className="text-base font-semibold mt-4 mb-2 text-slate-900 dark:text-slate-100"
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p dir="auto" className="my-2.5">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul dir="auto" className="my-3 space-y-1.5 list-disc ps-6">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol dir="auto" className="my-3 space-y-1.5 list-decimal ps-6">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li dir="auto" className="leading-[1.8]">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              dir="auto"
              className="my-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70 px-4 py-3 text-slate-700 dark:text-slate-300"
            >
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-700 dark:text-teal-400 underline underline-offset-4 hover:text-teal-600 dark:hover:text-teal-300"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="my-5 border-slate-200 dark:border-slate-800" />
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm border-collapse text-start">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th
              dir="auto"
              className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-start whitespace-nowrap"
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              dir="auto"
              className="px-4 py-2.5 border-b border-slate-200/70 dark:border-slate-800/70 align-top"
            >
              {children}
            </td>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock =
              Boolean(className) || String(children).includes("\n");
            if (isBlock) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return (
              <code
                dir="ltr"
                className="inline-block px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-teal-300 font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
