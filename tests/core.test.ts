import { describe, it, expect, beforeAll } from 'vitest';
import { normalizeCode, extractCodes } from '@/lib/errorcode';
import { redact, findSensitive } from '@/lib/redact';
import { ContentSchema, templateContent, validateForPublish } from '@/lib/content';
import { validateGuide, type GuideNode } from '@/lib/guide';
import { openDb, type Db } from '@/lib/db';
import { bootstrap, STAGES } from '@/lib/bootstrap';
import { createArticle, publishArticle, restoreVersion, saveDraft, getPublicArticle, listVersions } from '@/lib/articles';
import { search } from '@/lib/search';
import { logSearch, recordEvent, recordFeedback } from '@/lib/events';
import { safeLink, validateAnnouncement } from '@/lib/announcements';
import { sniffImage } from '@/lib/media';

describe('错误码标准化', () => {
  it('0x / 大小写 / 缺 0x / 前导零 / 十进制', () => {
    expect(normalizeCode('0xc1900101')).toBe('0xC1900101');
    expect(normalizeCode('C1900101')).toBe('0xC1900101');
    expect(normalizeCode('0xC0000005')).toBe('0xC0000005');
    expect(normalizeCode('80070002')).toBe('0x80070002');
    expect(normalizeCode('-1047526910')).toBe('0xC1900202');
    expect(normalizeCode('0x40008')).toBe('0x40008');
    expect(normalizeCode('20261119')).toBeNull();
  });
  it('从句子抽取多个码', () => {
    expect(extractCodes('报 0x80070003 / 0x40008，后来 c1900208')).toEqual(['0x80070003', '0x40008', '0xC1900208']);
  });
});

describe('脱敏', () => {
  it('IP、用户目录、域账号、邮箱被隐去，错误码保留', () => {
    const r = redact('0x80070002 在 10.1.2.3 上，C:\\Users\\zhang\\log，CORP\\li.si，a@b.com');
    expect(r.changed).toBe(true);
    expect(r.text).toContain('0x80070002');
    expect(r.text).not.toMatch(/10\.1\.2\.3|zhang|li\.si|a@b\.com/);
    expect(r.text).toBe('0x80070002 在 [IP] 上，[用户目录]\\log，[账号]，[邮箱]');
  });
  it('UNC 路径整体隐去', () => {
    expect(redact('见 \\\\fs01\\share$\\win11 目录').text).toBe('见 [网络路径] 目录');
  });
  it('发布前检测 UNC 路径', () => {
    expect(findSensitive('\\\\server\\share\\x')).toContain('UNC 路径');
  });
});

function fixture(title: string, code = '0xC1900101', applies = '测试夹具适用条件') {
  return ContentSchema.parse({
    title, summary: `测试夹具 ${title}`, stage: STAGES[0], symptoms: ['出现错误码'], codes: [code],
    appliesTo: applies, notAppliesTo: '暂未发现明确不适用情形，仍须对照步骤验证', risks: '无', verify: '升级继续',
    steps: [{ action: '查看兼容性报告', expected: '看到阻止项', success: '找到阻止项', ifFailed: '告诉管理员' }],
  });
}

describe('发布校验', () => {
  it('模板占位未替换时被拦', () => {
    const issues = validateForPublish(templateContent(), { redactionConfirmed: true, validStages: STAGES });
    expect(issues.some((i) => i.field === 'template')).toBe(true);
  });
  it('未勾选脱敏被拦', () => {
    const issues = validateForPublish(fixture('x'), { redactionConfirmed: false, validStages: STAGES });
    expect(issues.map((i) => i.field)).toEqual(['redaction']);
  });
});

describe('引导校验', () => {
  const q = (id: number, opts: Partial<GuideNode['options'][0]>[]): GuideNode => ({
    id, kind: 'question', title: `Q${id}`, articleIds: [],
    options: opts.map((o, i) => ({ id: id * 10 + i, label: o.label ?? `o${i}`, isUnsure: !!o.isUnsure, targetNodeId: o.targetNodeId ?? null, targetArticleId: o.targetArticleId ?? null })),
  });
  it('循环、缺不确定、孤岛、指向草稿', () => {
    const nodes = [q(1, [{ targetNodeId: 2 }, { isUnsure: true, targetArticleId: 9 }]), q(2, [{ targetNodeId: 1 }]), q(3, [{ isUnsure: true, targetArticleId: 1 }])];
    const msgs = validateGuide(1, nodes, new Set([1])).map((i) => i.message).join('\n');
    expect(msgs).toMatch(/循环/);
    expect(msgs).toMatch(/缺少「不确定」/);
    expect(msgs).toMatch(/孤岛/);
    expect(msgs).toMatch(/未发布文章/);
  });
});

describe('公告与图片', () => {
  it('公告链接只接受 http/https', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('https://example.com/manual.pdf')).toBe('https://example.com/manual.pdf');
    const errs = validateAnnouncement({ title: 't', body: '', linkUrl: 'ftp://x', linkLabel: '', pinned: false, startsAt: null, endsAt: null }, true, true);
    expect(errs).toContain('链接须以 http:// 或 https:// 开头');
  });
  it('图片魔数拒绝 SVG / 改后缀 exe', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00'))).toBeNull();
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
  });
});

describe('数据库集成（PGlite）', () => {
  let db: Db;
  beforeAll(async () => {
    db = await openDb('pglite:memory');
    await bootstrap(db);
  });

  it('空库：搜索零结果不报错', async () => {
    expect((await search(db, '0xC1900101')).hits).toEqual([]);
  });

  it('同一错误码两篇，前导零/大小写/缺 0x 都能命中；草稿不可见', async () => {
    const a = await createArticle(db, fixture('A 篇', '0xc1900101', '条件甲'));
    const b = await createArticle(db, fixture('B 篇', 'C1900101', '条件乙'));
    const draft = await createArticle(db, fixture('草稿篇'));
    expect((await publishArticle(db, a.id, 't', { redactionConfirmed: true, note: '' })).ok).toBe(true);
    expect((await publishArticle(db, b.id, 't', { redactionConfirmed: true, note: '' })).ok).toBe(true);
    for (const q of ['0xC1900101', 'c1900101', '0XC1900101 卡住']) {
      const r = await search(db, q);
      expect(r.hits.map((h) => h.title).sort()).toEqual(['A 篇', 'B 篇']);
    }
    expect(await getPublicArticle(db, draft.slug)).toBeNull();
  });

  it('短语命中', async () => {
    expect((await search(db, '兼容性报告')).hits.length).toBeGreaterThan(0);
  });

  it('恢复旧版成为草稿，再发布产生新版本且历史保留', async () => {
    const a = await createArticle(db, fixture('版本篇'));
    await publishArticle(db, a.id, 't', { redactionConfirmed: true, note: 'v1' });
    await saveDraft(db, a.id, fixture('版本篇改'));
    await publishArticle(db, a.id, 't', { redactionConfirmed: true, note: 'v2' });
    await restoreVersion(db, a.id, 1, 't');
    await publishArticle(db, a.id, 't', { redactionConfirmed: true, note: 'v3' });
    expect((await listVersions(db, a.id)).length).toBe(3);
    const pub = await getPublicArticle(db, a.slug);
    expect(pub && pub !== 'archived' && pub.content.title).toBe('版本篇');
  });

  it('搜索日志幂等、零结果生成线索、原词脱敏', async () => {
    await logSearch(db, { submitKey: 'k1', sessionHash: 's', query: '10.0.0.8 上报错', resultCount: 0 });
    await logSearch(db, { submitKey: 'k1', sessionHash: 's', query: '10.0.0.8 上报错', resultCount: 0 });
    const rows = await db.query('SELECT raw_redacted FROM query_log');
    expect(rows.length).toBe(1);
    expect(rows[0].raw_redacted).not.toContain('10.0.0.8');
    expect((await db.query("SELECT * FROM candidates WHERE source='zero_result'")).length).toBe(1);
  });

  it('「这台也遇到了」幂等；两个会话分开计；已解决/没解决互斥', async () => {
    await recordEvent(db, { type: 'report_encounter', sessionHash: 'S1', articleId: 1 });
    await recordEvent(db, { type: 'report_encounter', sessionHash: 'S1', articleId: 1 });
    await recordEvent(db, { type: 'report_encounter', sessionHash: 'S2', articleId: 1 });
    expect((await db.query("SELECT * FROM events WHERE type='report_encounter'")).length).toBe(2);
    await recordEvent(db, { type: 'report_unresolved', sessionHash: 'S1', articleId: 1 });
    await recordEvent(db, { type: 'report_resolved', sessionHash: 'S1', articleId: 1 });
    const out = await db.query("SELECT type, changes FROM events WHERE type IN ('report_resolved','report_unresolved')");
    expect(out).toEqual([{ type: 'report_resolved', changes: 1 }]);
  });

  it('未收录反馈幂等并形成线索', async () => {
    await recordFeedback(db, { key: 'f1', sessionHash: null, text: '0x80070005 卡住', stage: '', extra: '', context: '' });
    const d = await recordFeedback(db, { key: 'f1', sessionHash: null, text: '0x80070005 卡住', stage: '', extra: '', context: '' });
    expect(d.duplicate).toBe(true);
    expect((await db.query("SELECT * FROM candidates WHERE source='feedback'")).length).toBe(1);
  });
});
