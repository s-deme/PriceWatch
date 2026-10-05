import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="empty">
      <h1>ページが見つかりません</h1>
      <Link href="/products">商品一覧へ</Link>
    </div>
  );
}
