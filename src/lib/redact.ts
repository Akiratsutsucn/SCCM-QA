/**
 * 敏感串脱敏（搜索原词、反馈）与发布前敏感检查。
 * 错误码（0x...）本身保留。
 */
const RULES: { name: string; re: RegExp; mask: string }[] = [
  { name: '口令或密钥', re: /\b(password|passwd|pwd|secret|token|apikey|api_key|口令|密码)\s*[:=：]\s*\S+/gi, mask: '[已隐去口令]' },
  { name: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, mask: '[邮箱]' },
  { name: 'UNC 路径', re: /\\[A-Za-z0-9._$-]+(\[^\s\]+)*/g, mask: '[网络路径]' },
  { name: '用户目录', re: /[A-Za-z]:\Users\[^\s\]+/gi, mask: '[用户目录]' },
  { name: '域\用户', re: /\b[A-Za-z][A-Za-z0-9-]{1,30}\[A-Za-z0-9._-]{2,40}\b/g, mask: '[账号]' },
  { name: 'IPv4', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, mask: '[IP]' },
  { name: 'IPv6', re: /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, mask: '[IP]' },
  { name: '内网 URL', re: /\bhttps?:\/\/(?:localhost|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|[A-Za-z0-9-]+(?:\/|:|$))[^\s]*/gi, mask: '[内网地址]' },
];

export function redact(input: string): { text: string; changed: boolean } {
  let text = input;
  for (const r of RULES) text = text.replace(r.re, r.mask);
  return { text, changed: text !== input };
}

/** 返回命中的敏感类型（用于发布校验）。 */
export function findSensitive(input: string): string[] {
  const hits: string[] = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    if (r.re.test(input)) hits.push(r.name);
    r.re.lastIndex = 0;
  }
  return hits;
}

/** 截断 + 去控制字符。 */
export function clip(input: unknown, max: number): string {
  const s = typeof input === 'string' ? input : '';
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
