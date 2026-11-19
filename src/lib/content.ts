/** 文章（办法）结构化内容模型与发布校验。见规格 03 第 2 节。 */
import { z } from 'zod';
import { extractCodes, normalizeCode } from './errorcode';
import { findSensitive } from './redact';

export const StepSchema = z.object({
  action: z.string().max(4000).default(''),
  expected: z.string().max(2000).default(''),
  success: z.string().max(2000).default(''),
  ifFailed: z.string().max(2000).default(''),
  mediaIds: z.array(z.string().max(64)).max(6).default([]),
});

export const ContentSchema = z.object({
  title: z.string().max(200).default(''),
  /** 短名（排行榜、按钮里用，建议 ≤ 16 字）；空则用标题 */
  short: z.string().max(40).default(''),
  summary: z.string().max(500).default(''),
  stage: z.string().max(60).default(''),
  secondaryStage: z.string().max(60).default(''),
  symptoms: z.array(z.string().max(200)).max(20).default([]),
  codes: z.array(z.string().max(40)).max(20).default([]),
  sourceOs: z.string().max(200).default(''),
  targetOs: z.string().max(200).default(''),
  variant: z.string().max(200).default(''),
  appliesTo: z.string().max(3000).default(''),
  notAppliesTo: z.string().max(3000).default(''),
  risks: z.string().max(3000).default(''),
  stopRule: z.string().max(2000).default(''),
  steps: z.array(StepSchema).max(30).default([]),
  verify: z.string().max(3000).default(''),
  evidence: z.string().max(3000).default(''),
  internalNote: z.string().max(5000).default(''),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export type Step = z.infer<typeof StepSchema>;
export type Content = z.infer<typeof ContentSchema>;

export function emptyContent(): Content {
  return ContentSchema.parse({ steps: [{}] });
}

/** 「插入模板」：空白结构 + 占位提示。占位符未替换时发布会被拦截。 */
export function templateContent(): Content {
  return ContentSchema.parse({
    title: '（在此填写，写清现象和条件，不要只写错误码）',
    summary: '（同一错误码时，用一句话说明这篇在什么条件下才适用）',
    symptoms: ['（操作员能看见或听到的）'],
    appliesTo: '- （在此填写）',
    notAppliesTo: '- （在此填写；没有也要写「暂未发现明确不适用情形，仍须对照步骤验证」）',
    risks: '- （在此填写）',
    stopRule: '若需改系统关键配置、清理未知文件或不可逆操作：停止，并交给现场负责人。本站不会远程执行。',
    steps: [{ action: '（在此填写：做什么）', expected: '（在此填写：预期现象）', success: '（在此填写：怎样算成功）', ifFailed: '（在此填写：若无效）' }],
    verify: '- （整篇结束时如何确认）',
  });
}

const PLACEHOLDER = /在此填写|（选择）|（如有）|（操作员能看见或听到的）|（整篇结束时如何确认）|（同一错误码时/;

/** 文章中出现的所有标准化错误码（显式填写 + 标题/症状中提及）。 */
export function contentCodes(c: Content): string[] {
  const set = new Set<string>();
  for (const raw of c.codes) {
    const n = normalizeCode(raw);
    if (n) set.add(n);
  }
  for (const code of extractCodes([c.title, c.summary, ...c.symptoms].join(' '))) set.add(code);
  return [...set];
}

/** 可公开文字（不含内部备注）。用于敏感检查与检索文本。 */
export function publicText(c: Content): string {
  return [
    c.title, c.summary, c.stage, c.secondaryStage, ...c.symptoms, ...c.codes, c.sourceOs, c.targetOs, c.variant,
    c.appliesTo, c.notAppliesTo, c.risks, c.stopRule,
    ...c.steps.flatMap((s) => [s.action, s.expected, s.success, s.ifFailed]),
    c.verify, c.evidence, ...c.tags,
  ].join('\n');
}

export function searchText(c: Content): string {
  return [c.title, c.summary, ...c.symptoms, ...c.codes, ...c.tags, c.appliesTo, c.stage].join(' ').toLowerCase();
}

const DANGER = /注册表|regedit|删除|格式化|重置|解密|关闭.*(安全|防护|bitlocker)|diskpart|bcdedit|reg (add|delete)|rd \/s|del \/|format /i;

export interface PublishIssue { field: string; message: string }

/** 发布校验。返回问题列表，空数组表示可以发布。 */
export function validateForPublish(c: Content, opts: { redactionConfirmed: boolean; validStages: string[] }): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const req = (field: string, label: string, v: string) => {
    if (!v.trim()) issues.push({ field, message: `${label}为必填` });
  };
  req('title', '标题', c.title);
  req('summary', '区分句', c.summary);
  req('stage', '阶段', c.stage);
  req('appliesTo', '适用条件', c.appliesTo);
  req('notAppliesTo', '不适用条件', c.notAppliesTo);
  req('risks', '风险与权限', c.risks);
  req('verify', '验证成功', c.verify);
  if (c.stage && !opts.validStages.includes(c.stage)) issues.push({ field: 'stage', message: '阶段不在词汇表中' });
  if (c.stage === '不确定') issues.push({ field: 'stage', message: '「不确定」不能作为文章主阶段' });
  if (c.symptoms.filter((s) => s.trim()).length === 0) issues.push({ field: 'symptoms', message: '至少填写一条症状' });
  const steps = c.steps.filter((s) => s.action.trim());
  if (steps.length === 0) issues.push({ field: 'steps', message: '至少需要一个步骤' });
  for (const raw of c.codes) {
    if (raw.trim() && !normalizeCode(raw)) issues.push({ field: 'codes', message: `无法识别的错误码：${raw}` });
  }
  const text = publicText(c);
  if (PLACEHOLDER.test(text)) issues.push({ field: 'template', message: '仍有未替换的模板占位（如「在此填写」）' });
  if (DANGER.test(text) && !c.stopRule.trim()) issues.push({ field: 'stopRule', message: '步骤含高风险操作，必须填写危险止步' });
  const hits = findSensitive(text);
  if (hits.length) issues.push({ field: 'redaction', message: `公开内容疑似含敏感信息：${hits.join('、')}` });
  if (!opts.redactionConfirmed) issues.push({ field: 'redaction', message: '请勾选「已检查文字与画面脱敏」' });
  return issues;
}

/** 生成 slug：时间戳 + 随机，避免暴露递增 ID。 */
export function newSlug(): string {
  const r = crypto.getRandomValues(new Uint8Array(4));
  return Date.now().toString(36) + Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('');
}
