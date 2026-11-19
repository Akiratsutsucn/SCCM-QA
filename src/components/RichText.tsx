/**
 * 管理员正文的安全渲染：只支持段落、「- 」列表、``` 代码块与 `行内代码`。
 * 全部走 React 文本节点（自动转义），不使用 dangerouslySetInnerHTML。
 */
import { Fragment } from 'react';

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul'; items: string[] } | { kind: 'pre'; text: string };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i += 1;
      blocks.push({ kind: 'pre', text: body.join('\n') });
    } else if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      blocks.push({ kind: 'ul', items });
    } else if (!line.trim()) {
      i += 1;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*[-*•]\s+/.test(lines[i]) && !lines[i].trim().startsWith('```')) para.push(lines[i++]);
      blocks.push({ kind: 'p', lines: para });
    }
  }
  return blocks;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i} className="code">{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;
  const hasCode = blocks.some((b) => b.kind === 'pre');
  return (
    <div className={`rich ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === 'pre') return <pre key={i}>{b.text}</pre>;
        if (b.kind === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
        return <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}<Inline text={l} /></Fragment>)}</p>;
      })}
      {hasCode && <p className="cmd-warn">请先确认适用条件；本站不会替你执行任何命令。</p>}
    </div>
  );
}
