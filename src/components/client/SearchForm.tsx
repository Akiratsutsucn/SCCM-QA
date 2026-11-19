'use client';
/**
 * 搜索表单。GET /search?q=&k= ：k 为本次提交的随机键，服务端据此幂等记录一次 search_submit。
 * 桌面（≥768px 且精确指针）自动聚焦；窄屏不自动聚焦，避免键盘挡住两个入口。不做逐键联想请求。
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from './session';

export function SearchForm({ defaultValue = '', big = false }: { defaultValue?: string; big?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    getSession();
    if (big && window.matchMedia('(min-width: 768px) and (pointer: fine)').matches) ref.current?.focus();
  }, [big]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = (ref.current?.value ?? '').trim().slice(0, 200);
    if (!q) {
      ref.current?.focus();
      return;
    }
    getSession();
    const k = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    ref.current?.blur();
    router.push(`/search?q=${encodeURIComponent(q)}&k=${k}`);
  };

  if (big) {
    return (
      <form className="search-big" role="search" action="/search" method="get" onSubmit={onSubmit}>
        <label htmlFor="q">输入错误码，或用一句话写下你看到的现象</label>
        <input ref={ref} id="q" name="q" type="search" defaultValue={defaultValue} maxLength={200} placeholder="例如 0xC1900101 或 卡在 44%" autoComplete="off" enterKeyHint="search" />
        <button className="btn btn-primary" type="submit">查找办法</button>
      </form>
    );
  }
  return (
    <form role="search" action="/search" method="get" onSubmit={onSubmit}>
      <label htmlFor="q2" className="hp">再搜一次</label>
      <input ref={ref} id="q2" name="q" type="search" defaultValue={defaultValue} maxLength={200} placeholder="错误码或现象" autoComplete="off" enterKeyHint="search" />
      <button className="btn btn-primary" type="submit">查</button>
    </form>
  );
}
