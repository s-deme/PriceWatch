import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticated } from '../../lib/auth';
import { resources } from '../../services/admin';
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await authenticated())) redirect('/login');
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow accent">WORKSPACE</p>
        <h1>データ管理</h1>
        <p>商品情報・取得元・価格更新を管理します。</p>
      </div>
      <nav className="admin-nav" aria-label="管理メニュー">
        <Link href="/admin">概要</Link>
        {resources.map((r) => (
          <Link key={r} href={`/admin/${r}`}>
            {r}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
