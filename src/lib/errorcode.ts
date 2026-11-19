/**
 * 错误码标准化：0x 十六进制、无 0x 的 8 位十六进制、十进制 HRESULT（含负数）。
 * 统一为 0x + 8 位大写十六进制（保留前导零，0xC0000005 不会变成 0xC5）。
 * 带 0x 但不足 8 位的保留原位数（如 0x40008）。
 */
const HEX_0X = /\b0x([0-9a-f]{1,8})\b/gi;
const HEX_BARE8 = /(?<![0-9a-z])([0-9a-f]{8})(?![0-9a-z])/gi;
const DEC = /(?<![0-9a-z.])(-?\d{7,10})(?![0-9a-z.])/gi;

export function normalizeCode(token: string): string | null {
  const t = token.trim();
  let m = /^0x([0-9a-f]{1,8})$/i.exec(t);
  if (m) return '0x' + m[1].toUpperCase();
  m = /^([0-9a-f]{8})$/i.exec(t);
  if (m && /[a-f]/i.test(m[1]) ) return '0x' + m[1].toUpperCase();
  if (m && /^[0-9]{8}$/.test(m[1]) && /^8/.test(m[1])) return '0x' + m[1];
  m = /^(-?\d{7,10})$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    // HRESULT 失败码在 0x80000000–0xFFFFFFFF 之间
    const u = n < 0 ? n + 0x100000000 : n;
    if (u >= 0x80000000 && u <= 0xffffffff) return '0x' + u.toString(16).toUpperCase().padStart(8, '0');
  }
  return null;
}

/** 从一段文字中抽取所有可识别错误码（去重，保持出现顺序）。 */
export function extractCodes(text: string): string[] {
  const out: string[] = [];
  const add = (c: string | null) => {
    if (c && !out.includes(c)) out.push(c);
  };
  for (const m of text.matchAll(HEX_0X)) add(normalizeCode(m[0]));
  const without0x = text.replace(HEX_0X, ' ');
  for (const m of without0x.matchAll(HEX_BARE8)) add(normalizeCode(m[1]));
  for (const m of without0x.matchAll(DEC)) add(normalizeCode(m[1]));
  return out;
}
