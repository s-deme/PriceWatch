import Link from 'next/link';
import { db } from '../../lib/db';
import { dateTime } from '../../lib/format';
export default async function Admin() {
  const [products, listings, history, jobs, sources] = await Promise.all([
    db.product.count(),
    db.listing.count(),
    db.priceHistory.count(),
    db.jobRun.findMany({ take: 5, orderBy: { createdAt: 'desc' } }),
    db.source.findMany({
      include: { jobs: { take: 1, orderBy: { createdAt: 'desc' } } },
    }),
  ]);
  return (
    <>
      <div className="stats-grid">
        <div>
          <span>商品</span>
          <strong>{products}</strong>
        </div>
        <div>
          <span>販売ページ</span>
          <strong>{listings}</strong>
        </div>
        <div>
          <span>価格履歴</span>
          <strong>{history.toLocaleString()}</strong>
        </div>
        <div>
          <span>取得元</span>
          <strong>{sources.length}</strong>
        </div>
      </div>
      <section className="panel">
        <h2>取得元の状態</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>稼働</th>
                <th>最終実行</th>
                <th>結果</th>
                <th>成功 / 失敗</th>
                <th>処理時間</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.active ? '有効' : '停止'}</td>
                  <td>{dateTime(s.jobs[0]?.startedAt ?? null)}</td>
                  <td>{s.jobs[0]?.status ?? '未実行'}</td>
                  <td>
                    {s.jobs[0]?.fetched ?? 0} / {s.jobs[0]?.failed ?? 0}
                  </td>
                  <td>{s.jobs[0]?.duration ?? 0}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/admin/jobs">ジョブを実行・確認 →</Link>
      </section>
      <section className="panel">
        <h2>最近のジョブ</h2>
        {jobs.length ? (
          jobs.map((j) => (
            <p key={j.id}>
              {dateTime(j.createdAt)} · {j.sourceId} · {j.status}{' '}
              {j.error && <span className="error">{j.error}</span>}
            </p>
          ))
        ) : (
          <p>
            まだ実行されていません。Mock取得はJobs、手動データはImportから開始できます。
          </p>
        )}
      </section>
    </>
  );
}
