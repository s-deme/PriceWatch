import { db } from '../../lib/db';
import { dateTime, yen } from '../../lib/format';
export default async function Coupons() {
  const rows = await db.coupon.findMany({
    include: { store: true },
    orderBy: { endAt: 'asc' },
  });
  const now = new Date();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow accent">A LITTLE EXTRA SAVING</p>
        <h1>クーポンをチェック</h1>
        <p>条件まで確かめて、もっと納得できる価格へ。</p>
      </div>
      <div className="coupon-grid">
        {rows.map((c) => (
          <article key={c.id} className="coupon panel">
            <p className="eyebrow accent">{c.store.name}</p>
            <h2>{c.title}</h2>
            <strong className="coupon-value">
              {c.discountType === 'percent'
                ? `${c.discountValue}%`
                : yen(c.discountValue)}{' '}
              OFF
            </strong>
            <code>{c.code}</code>
            <p>{yen(c.minimumPurchase)}以上のお買い物</p>
            <p className="tiny">
              {dateTime(c.startAt)}〜{dateTime(c.endAt)}
            </p>
            <span className="pill">
              {now < c.startAt
                ? '開始前'
                : now >= c.endAt
                  ? '期限切れ'
                  : '有効期間中'}
            </span>
            <p>{c.description}</p>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              利用条件を確認 ↗
            </a>
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className="empty">登録済みのクーポンはありません。</div>
      )}
    </>
  );
}
