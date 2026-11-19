/** 单页状态全部在 URL：q=搜索词、a=文章、n=引导节点、p=已选路径（节点.选项,…）。返回键即可恢复。 */
export interface HomeState {
  q?: string;
  a?: string;
  n?: number;
  p?: string;
}

export function homeHref(s: HomeState): string {
  const u = new URLSearchParams();
  if (s.q) u.set('q', s.q);
  if (s.a) u.set('a', s.a);
  if (s.n) u.set('n', String(s.n));
  if (s.p) u.set('p', s.p);
  const qs = u.toString();
  return qs ? `/?${qs}` : '/';
}
