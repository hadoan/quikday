import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

export default function MarkdownView({ content }: { content: string }) {
  const components: Components = {
    h1: ({ children }) => (
      <h1 className="text-3xl font-semibold tracking-tight text-gray-800 dark:text-gray-200 mb-6 mt-8">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-gray-200 mb-4 mt-6">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-200 mb-3 mt-5">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="leading-relaxed mb-4 text-gray-600 dark:text-gray-400">
        {children}
      </p>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-blue-600 dark:text-blue-500 no-underline hover:underline font-medium"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="text-gray-800 dark:text-gray-200 font-semibold">
        {children}
      </strong>
    ),
    code: ({ children, className }) => {
      const isInline = !className;
      return isInline ? (
        <code className="text-rose-600 dark:text-rose-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-sm">
          {children}
        </code>
      ) : (
        <code className={className}>{children}</code>
      );
    },
    pre: ({ children }) => (
      <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-x-auto my-4">
        {children}
      </pre>
    ),
    ul: ({ children }) => (
      <ul className="my-4 space-y-2 list-disc pl-6">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-4 space-y-2 list-decimal pl-6">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-gray-600 dark:text-gray-400 leading-relaxed">
        {children}
      </li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-500 dark:text-gray-500 my-4">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-8 border-gray-200 dark:border-gray-700" />
    ),
    table: ({ children }) => (
      <table className="border-collapse w-full my-6">
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th className="bg-gray-100 dark:bg-gray-800 px-4 py-2 text-left font-semibold border border-gray-200 dark:border-gray-700">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-gray-600 dark:text-gray-400">
        {children}
      </td>
    ),
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt}
        className="rounded-lg shadow-md my-6 max-w-full h-auto"
      />
    ),
  };

  return (
    <div className="text-base leading-relaxed">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}

