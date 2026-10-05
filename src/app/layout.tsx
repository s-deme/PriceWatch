import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = {
  title: {
    default: 'PriceWatch — 本当に安い、その瞬間を。',
    template: '%s | PriceWatch',
  },
  description: '価格履歴とショップ比較で、納得できる買い時を見つける。',
};
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <a className="skip" href="#main">
          本文へ移動
        </a>
        <header className="header">
          <div className="header-inner">
            <Link href="/" className="brand">
              <span className="brand-icon">↘</span>Price<span>Watch</span>
            </Link>
            <nav aria-label="メインナビゲーション">
              <Link href="/">見つける</Link>
              <Link href="/products">すべての商品</Link>
              <Link href="/watchlist">ウォッチリスト</Link>
              <Link href="/coupons">クーポン</Link>
              <Link href="/events">イベント</Link>
            </nav>
            <Link href="/notifications" className="header-action">
              通知
            </Link>
            <Link href="/admin" className="avatar" aria-label="管理画面">
              PW
            </Link>
          </div>
        </header>
        <div className="demo-banner">
          DEMO DATA{' '}
          <span>掲載価格・セール・クーポンは動作確認用の架空データです。</span>
        </div>
        <main id="main" className="main">
          {children}
        </main>
        <footer className="footer">
          <span className="brand">PriceWatch</span>
          <p>値引きの大きさより、買い時の確かさ。</p>
          <div>
            <Link href="/admin">データ管理</Link>
            <Link href="/login">ログイン</Link>
            <span>
              価格はJPY・日時は日本時間。購入前に販売店の条件をご確認ください。
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
