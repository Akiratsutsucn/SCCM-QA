'use client';
/**
 * 排障会话：浏览器内随机 UUID（不做指纹），12 小时过期。
 * 「开始处理另一台」立即换新 ID。镜像到第一方 cookie w11s，供服务端记录搜索时读取。
 */
const KEY = 'w11.session';
const TTL = 12 * 3600 * 1000;
const EVT = 'w11-session-change';

interface Stored { id: string; startedAt: number; touched: boolean }

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s.id || Date.now() - s.startedAt > TTL) return null;
    return s;
  } catch {
    return null;
  }
}

function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式下无法存储：本页内仍可用 */
  }
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `w11s=${s.id}; Path=/; Max-Age=${TTL / 1000}; SameSite=Lax${secure}`;
}

export function getSession(): Stored {
  const s = read();
  if (s) {
    write(s);
    return s;
  }
  const fresh = { id: crypto.randomUUID(), startedAt: Date.now(), touched: false };
  write(fresh);
  return fresh;
}

export function getSessionId(): string {
  return getSession().id;
}

/** 记录过写入性操作后，页脚才显示「正在记录这一次排障」。 */
export function markTouched() {
  const s = getSession();
  if (!s.touched) {
    write({ ...s, touched: true });
    window.dispatchEvent(new Event(EVT));
  }
}

export function startNewSession() {
  write({ id: crypto.randomUUID(), startedAt: Date.now(), touched: false });
  for (const k of Object.keys(localStorage)) if (k.startsWith('w11.fb.') || k === 'w11.guide') localStorage.removeItem(k);
  window.dispatchEvent(new Event(EVT));
}

export function onSessionChange(fn: () => void) {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
}

/** 匿名事件上报；失败自动重试 2 次（幂等键在服务端，不会重复计数）。 */
export async function sendEvent(body: Record<string, unknown>, path = '/api/events'): Promise<boolean> {
  const payload = JSON.stringify({ sessionId: getSessionId(), ...body });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
      if (r.ok) return true;
      if (r.status < 500 && r.status !== 429) return false;
    } catch {
      /* 弱网：稍后重试 */
    }
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  return false;
}
