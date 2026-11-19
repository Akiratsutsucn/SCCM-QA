/** 旧地址兼容：/a/:slug → 单页 /?a=:slug */
import { redirect } from 'next/navigation';

export default async function LegacyArticle({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/?a=${encodeURIComponent((await params).slug)}`);
}
