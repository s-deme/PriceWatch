import Link from 'next/link';
import { authenticated } from '../../lib/auth';
import { db } from '../../lib/db';
import { dateTime } from '../../lib/format';
import { ActionForm } from '../../components/action-form';
export default async function Notifications() {
  if (!(await authenticated()))
    return (
      <div className="empty">
        <h1>通知</h1>
        <Link href="/login">ログインして確認する</Link>
      </div>
    );
  const rows = await db.notification.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
  });
  return (
    <>
      <div className="page-heading">
        <h1>買い時のお知らせ</h1>
        <p>
          監視条件に到達した商品と、新着キーワード一致をお届けします。最新100件を表示。
        </p>
      </div>
      <ActionForm op="read">
        <button className="button secondary">すべて既読にする</button>
      </ActionForm>
      <div className="notification-list">
        {rows.length ? (
          rows.map((n) => (
            <Link key={n.id} href={n.href} className={n.read ? 'read' : ''}>
              <span>{n.read ? '✓' : '●'}</span>
              <div>
                <strong>{n.title}</strong>
                <small>
                  {dateTime(n.createdAt)} · {n.read ? '既読' : '未読'}
                </small>
              </div>
              <span>→</span>
            </Link>
          ))
        ) : (
          <div className="empty">
            <h2>まだ通知はありません</h2>
            <p>商品を監視して、次の価格更新をお待ちください。</p>
          </div>
        )}
      </div>
    </>
  );
}
