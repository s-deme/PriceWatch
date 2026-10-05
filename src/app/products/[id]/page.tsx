import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { productDetail } from '../../../services/catalog';
import {
  averagePrice,
  historicalMinimum,
  STALE_AFTER,
} from '../../../lib/price';
import { yen, dateTime } from '../../../lib/format';
import { authenticated } from '../../../lib/auth';
import { HistoryChart } from '../../../components/history-chart';
import { ActionForm } from '../../../components/action-form';
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await productDetail((await params).id);
  if (!p) notFound();
  const now = new Date();
  const valid = p.listings.filter(
    (l) =>
      l.active &&
      l.store.active &&
      l.currency === 'JPY' &&
      l.stockStatus === 'in_stock' &&
      l.lastCheckedAt &&
      +now - +l.lastCheckedAt < STALE_AFTER &&
      l.paymentPrice !== null,
  );
  const best = valid[0];
  const reference = best ?? p.listings[0];
  const logged = await authenticated();
  const history = p.listings
    .filter((l) => l.currency === 'JPY')
    .flatMap((l) => l.history);
  const minimum = historicalMinimum(history, now);
  const averages = [7, 30, 90].map((d) => ({
    days: d,
    ...averagePrice(reference?.history ?? [], d, now),
  }));
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/products">商品一覧</Link> / {p.category.name} / {p.name}
      </div>
      <section className="detail-hero">
        <div className="detail-image">
          <Image
            src={p.imageUrl.startsWith('/') ? p.imageUrl : '/product.svg'}
            alt={p.name}
            width={560}
            height={370}
          />
        </div>
        <div>
          <p className="eyebrow accent">
            {p.manufacturer} · {p.category.name}
          </p>
          <h1>{p.name}</h1>
          <p className="muted">
            型番 {p.modelNumber ?? '未登録'} · JAN {p.janCode ?? '未登録'}
          </p>
          <p>{p.description}</p>
          <div className="best-price">
            <span>現在の最安支払価格</span>
            <strong>
              {best ? yen(best.paymentPrice) : '確認できる在庫なし'}
            </strong>
            <span>{best?.store.name} · 税込・送料込み</span>
          </div>
          {best && (
            <p>
              ポイント考慮実質価格 <strong>{yen(best.effectivePrice)}</strong>{' '}
              <span className="tiny">（現金値引きとは異なります）</span>
            </p>
          )}
          <div className="detail-actions">
            <a className="button" href="#comparison">
              ショップを比較 ↓
            </a>
            <a className="button secondary" href="#watch">
              ♡ 価格を監視
            </a>
          </div>
        </div>
      </section>
      <div className="stats-grid">
        <div>
          <span>記録開始以来の最安</span>
          <strong>{minimum === null ? 'データ不足' : yen(minimum)}</strong>
        </div>
        {averages.map((a) => (
          <div key={a.days}>
            <span>
              {a.days}日平均（{reference?.store.name}）
            </span>
            <strong>{a.value === null ? 'データ不足' : yen(a.value)}</strong>
            <small>観測カバー率 {a.coverage}%</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow accent">PRICE HISTORY</p>
            <h2>価格の動きを知る</h2>
          </div>
          <span className="pill">支払価格で比較</span>
        </div>
        <HistoryChart
          series={p.listings
            .filter((l) => l.currency === 'JPY')
            .map((l) => ({
              name: l.store.name,
              points: l.history.map((h) => ({
                date: h.recordedAt.toISOString(),
                price: h.stockStatus === 'in_stock' ? h.paymentPrice : null,
              })),
            }))}
        />
      </section>
      <section className="panel" id="comparison">
        <h2>ショップ価格を比較</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ショップ・取得元</th>
                <th>商品価格</th>
                <th>送料・クーポン</th>
                <th>支払価格</th>
                <th>ポイント考慮</th>
                <th>状態・更新</th>
                <th>リンク</th>
              </tr>
            </thead>
            <tbody>
              {p.listings.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.store.name}</strong>
                    <small>
                      {l.source.name} · 信頼度 {l.source.trust}/100
                    </small>
                  </td>
                  <td>
                    {yen(l.currentPrice)}
                    <small>
                      通常{' '}
                      {l.regularPrice === null ? '未登録' : yen(l.regularPrice)}
                    </small>
                  </td>
                  <td>
                    {l.shippingPrice === null
                      ? '送料不明'
                      : yen(l.shippingPrice)}
                    <small>クーポン −{yen(l.couponDiscount)}</small>
                  </td>
                  <td className="table-price">
                    {l.currency === 'JPY'
                      ? yen(l.paymentPrice)
                      : `${l.paymentPrice ?? '不明'} ${l.currency}`}
                  </td>
                  <td>
                    {yen(l.effectivePrice)}
                    <small>{l.points}ポイント相当</small>
                  </td>
                  <td>
                    {!l.active
                      ? '掲載停止'
                      : l.stockStatus === 'in_stock'
                        ? '在庫あり'
                        : '在庫なし／不明'}
                    <small>
                      {!l.lastCheckedAt || +now - +l.lastCheckedAt > STALE_AFTER
                        ? 'stale'
                        : l.status}{' '}
                      · {dateTime(l.lastCheckedAt)}
                    </small>
                  </td>
                  <td>
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      販売ページ ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="detail-columns">
        <section className="panel">
          <h2>
            Deal Score{' '}
            <span className="score large">
              {best?.score ?? 0}
              <small> / 100</small>
            </span>
          </h2>
          <p>価格の安さを示す参考指標です。データ不足時は加点しません。</p>
          <ul className="reason-list">
            {Array.isArray(best?.scoreReasons) ? (
              best.scoreReasons.map((reason, i) => (
                <li key={i}>✓ {String(reason)}</li>
              ))
            ) : (
              <li>評価できるデータがありません。</li>
            )}
          </ul>
          <p className="tiny">
            90日平均比40点・過去最安30点・通常価格比20点・他店比較5点・送料無料5点。
          </p>
        </section>
        <section className="panel" id="watch">
          <h2>♡ この商品の価格を監視</h2>
          {logged ? (
            <>
              <ActionForm op="watch">
                <input type="hidden" name="productId" value={p.id} />
                <label>
                  目標支払価格（円）
                  <input
                    type="number"
                    name="targetPrice"
                    min="0"
                    defaultValue={p.watchlist?.targetPrice ?? ''}
                    placeholder="例：5000"
                  />
                </label>
                <label>
                  割引率（%以上）
                  <input
                    type="number"
                    name="discountThreshold"
                    min="0"
                    max="100"
                    defaultValue={p.watchlist?.discountThreshold ?? ''}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="notifyLowestPrice"
                    defaultChecked={p.watchlist?.notifyLowestPrice ?? false}
                  />
                  過去最安になったら通知
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="notifyDeal"
                    defaultChecked={p.watchlist?.notifyDeal ?? true}
                  />
                  セールを検出したら通知
                </label>
                <button className="button">
                  {p.watchlist ? '監視条件を保存' : 'お気に入りに登録'}
                </button>
              </ActionForm>
              {p.watchlist && (
                <ActionForm op="unwatch">
                  <input type="hidden" name="productId" value={p.id} />
                  <button className="text-button">登録を解除</button>
                </ActionForm>
              )}
            </>
          ) : (
            <p>
              <Link href="/login">ログイン</Link>
              するとお気に入り・価格監視を保存できます。
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>セール履歴</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ショップ</th>
                <th>セール価格</th>
                <th>割引率</th>
                <th>開始</th>
                <th>終了</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {p.listings.flatMap((l) =>
                l.deals.map((d) => (
                  <tr key={d.id}>
                    <td>{l.store.name}</td>
                    <td>{yen(d.salePrice)}</td>
                    <td>{d.discountRate}%</td>
                    <td>{dateTime(d.startAt)}</td>
                    <td>{d.endAt ? dateTime(d.endAt) : '未定'}</td>
                    <td>
                      {d.active && (!d.endAt || d.endAt > now)
                        ? '開催中'
                        : '終了'}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
