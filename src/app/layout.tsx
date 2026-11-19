import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Windows 11 升级排障助手', template: '%s · Windows 11 升级排障助手' },
  description: '按错误码、报错画面或分步排查，查找已收录的 Windows 11 升级处理办法。',
  robots: { index: false, follow: false },
};

// 不设 maximum-scale / user-scalable=no，允许用户缩放
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f6f5f2',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
