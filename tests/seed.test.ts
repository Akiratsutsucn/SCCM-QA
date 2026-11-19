/** 第一批 QA 种子：可通过发布校验、不含设备名、引导树无循环/死链/孤岛。 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ContentSchema, validateForPublish } from '@/lib/content';
import { STAGES } from '@/lib/bootstrap';
import { validateGuide, type GuideNode } from '@/lib/guide';

const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../seed/known-issues.json'), 'utf8'));

describe('第一批 QA 种子', () => {
  it('每篇都能通过发布校验', () => {
    for (const a of seed.articles) {
      const { key: _k, ...fields } = a;
      const issues = validateForPublish(ContentSchema.parse(fields), { redactionConfirmed: true, validStages: STAGES });
      expect(issues, a.title).toEqual([]);
    }
  });

  it('不含设备名、站点代码、包 ID、地名', () => {
    const text = JSON.stringify(seed);
    expect(text).not.toMatch(/\bW[A-Z0-9]{6,}\b|CN\d{4}VM|SHA0\d+|Client-\d+|义乌|宁波|常州|合肥|重庆/);
  });

  it('引导树发布校验无错误', () => {
    const keys = Object.keys(seed.guide.nodes);
    const artKeys: string[] = seed.articles.map((a: { key: string }) => a.key);
    const nid = (k: string) => keys.indexOf(k) + 1;
    const aid = (k: string) => artKeys.indexOf(k) + 1;
    const nodes: GuideNode[] = keys.map((k) => {
      const n = seed.guide.nodes[k];
      return {
        id: nid(k), kind: n.kind === 'q' ? 'question' : 'terminal', title: n.title,
        articleIds: (n.articles ?? []).map(aid),
        options: (n.options ?? []).map(([label, target, unsure]: [string, string, boolean?], i: number) => {
          const [kind, ref] = target.includes(':') ? target.split(':') : ['n', target];
          return { id: nid(k) * 100 + i, label, isUnsure: !!unsure, targetNodeId: kind === 'a' ? null : nid(ref), targetArticleId: kind === 'a' ? aid(ref) : null };
        }),
      };
    });
    for (const n of nodes) for (const o of n.options) {
      if (o.targetNodeId !== null) expect(o.targetNodeId, o.label).toBeGreaterThan(0);
      if (o.targetArticleId !== null) expect(o.targetArticleId, o.label).toBeGreaterThan(0);
    }
    const issues = validateGuide(nid(seed.guide.root), nodes, new Set(artKeys.map((_, i) => i + 1)));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});
