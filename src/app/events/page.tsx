import Link from 'next/link';
import { db } from '../../lib/db';
import { dateTime } from '../../lib/format';
export default async function Events() {
  const events = await db.saleEvent.findMany({
    include: { _count: { select: { deals: true } } },
    orderBy: { startAt: 'desc' },
  });
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow accent">SALE CALENDAR</p>
        <h1>セールイベント</h1>
        <p>期間限定のチャンスを、ひとつの場所で。</p>
      </div>
      {events.map((e) => (
        <Link key={e.id} className="event-card panel" href={`/events/${e.id}`}>
          <div>
            <span className="pill">
              {e.startAt > new Date()
                ? '開催予定'
                : e.endAt > new Date()
                  ? '開催中'
                  : '終了'}
            </span>
            <h2>{e.name}</h2>
            <p>{e.description}</p>
            <small>
              {dateTime(e.startAt)}〜{dateTime(e.endAt)} · {e._count.deals}
              件のセール履歴
            </small>
          </div>
          <span>→</span>
        </Link>
      ))}
      {!events.length && (
        <div className="empty">イベントはまだありません。</div>
      )}
    </>
  );
}
