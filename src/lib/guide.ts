/** 分支引导：快照结构与发布校验（规格 03 第 7 节）。 */
export interface GuideOption {
  id: number;
  label: string;
  isUnsure: boolean;
  targetNodeId: number | null;
  targetArticleId: number | null;
}
export interface GuideNode {
  id: number;
  kind: 'question' | 'terminal';
  title: string;
  articleIds: number[];
  options: GuideOption[];
}
export interface GuideSnapshot {
  treeId: number;
  name: string;
  rootId: number;
  nodes: Record<string, GuideNode>;
}

export interface GuideIssue {
  level: 'error' | 'warning';
  nodeId?: number;
  message: string;
}

export const TARGET_DEPTH = 3;
export const MAX_TERMINAL_ARTICLES = 5;

function checkNode(n: GuideNode, byId: Map<number, GuideNode>, published: Set<number>): GuideIssue[] {
  const issues: GuideIssue[] = [];
  const err = (message: string) => issues.push({ level: 'error', nodeId: n.id, message });
  if (n.kind === 'terminal') {
    for (const a of n.articleIds) if (!published.has(a)) err(`终端「${n.title}」含未发布文章 #${a}`);
    if (n.articleIds.length > MAX_TERMINAL_ARTICLES) {
      issues.push({ level: 'warning', nodeId: n.id, message: `终端「${n.title}」文章超过 ${MAX_TERMINAL_ARTICLES} 篇` });
    }
    return issues;
  }
  if (n.options.length === 0) err(`「${n.title}」没有选项`);
  if (!n.options.some((o) => o.isUnsure)) err(`「${n.title}」缺少「不确定」选项`);
  for (const o of n.options) {
    if (o.targetNodeId == null && o.targetArticleId == null) err(`选项「${o.label}」没有指向`);
    if (o.targetNodeId != null && !byId.has(o.targetNodeId)) err(`选项「${o.label}」指向不存在的节点（死链）`);
    if (o.targetArticleId != null && !published.has(o.targetArticleId)) err(`选项「${o.label}」指向未发布文章（死链）`);
  }
  return issues;
}

/** 校验：缺「不确定」、死链、指向草稿、循环、孤岛；深度与终端篇数只警告。 */
export function validateGuide(rootId: number | null, nodes: GuideNode[], published: Set<number>): GuideIssue[] {
  if (!rootId || !nodes.some((n) => n.id === rootId)) return [{ level: 'error', message: '未设置根问题' }];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues = nodes.flatMap((n) => checkNode(n, byId, published));

  const reached = new Set<number>();
  let maxDepth = 0;
  const visit = (id: number, stack: number[]) => {
    const n = byId.get(id);
    if (!n) return;
    reached.add(id);
    maxDepth = Math.max(maxDepth, stack.length + 1);
    for (const o of n.options) {
      if (o.targetNodeId == null || !byId.has(o.targetNodeId)) continue;
      if (o.targetNodeId === id || stack.includes(o.targetNodeId)) {
        issues.push({ level: 'error', nodeId: id, message: `选项「${o.label}」形成循环` });
        continue;
      }
      visit(o.targetNodeId, [...stack, id]);
    }
  };
  visit(rootId, []);
  for (const n of nodes) {
    if (!reached.has(n.id)) issues.push({ level: 'error', nodeId: n.id, message: `「${n.title}」从根无法到达（孤岛）` });
  }
  const questionDepth = maxDepth - 1;
  if (questionDepth > TARGET_DEPTH) {
    issues.push({ level: 'warning', message: `主路径约需 ${questionDepth} 次点选，超过设计目标 ${TARGET_DEPTH}` });
  }
  return issues;
}
