import Link from 'next/link';
import Image from 'next/image';
import type { CatalogProduct, SearchParams } from '../services/catalog';
import { scalar, facets } from '../services/catalog';
import { dateTime, yen } from '../lib/format';
import { STALE_AFTER } from '../lib/price';
export function ProductCard({ product }: { product: CatalogProduct }) {
  const now = +new Date();
  const listing = product.listings[0];
  if (!listing) return null;
  const stale =
    !listing.lastCheckedAt || now - +listing.lastCheckedAt > STALE_AFTER;
  const deal = listing.deals.find(
    (d) => d.active && (!d.endAt || d.endAt > new Date()),
  );
  const prices = product.listings
    .filter((l) => l.paymentPrice !== null && l.stockStatus === 'in_stock')
    .map((l) => l.paymentPrice!);
  const spread =
    prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null;
  return (
    <article className="product-card">
      <Link className="product-image" href={`/products/${product.id}`}>
        <Image
          src={
            product.imageUrl.startsWith('/') ? product.imageUrl : '/product.svg'
          }
          alt={product.name}
          width={320}
          height={210}
        />
        <span className="category-tag">{product.category.name}</span>
      </Link>
      <div className="card-content">
        <p className="eyebrow">{product.manufacturer}</p>
        <h3>
          <Link href={`/products/${product.id}`}>{product.name}</Link>
        </h3>
        <div className="price-row">
          <strong className="price">{yen(listing.paymentPrice)}</strong>
          <span className="score" title="買い時の目安・100点満点">
            {listing.score}
            <small> SCORE</small>
          </span>
        </div>
        <p className="muted">
          通常{' '}
          <del>
            {listing.regularPrice === null ? '不明' : yen(listing.regularPrice)}
          </del>{' '}
          <span className="discount">−{listing.discountRate}%</span>
        </p>
        <p className="reason">
          {listing.historicalLow && !stale
            ? '↘ 記録開始以来の最安'
            : stale
              ? '◷ 価格情報が古くなっています'
              : Array.isArray(listing.scoreReasons) &&
                  listing.scoreReasons.length
                ? String(listing.scoreReasons[0])
                : '価格履歴を蓄積中'}
        </p>
        <p className="tiny">
          {listing.stockStatus === 'in_stock'
            ? spread === null
              ? '比較価格を収集中'
              : `ショップ間価格差 ${yen(spread)}`
            : '在庫なし／在庫未確認'}
        </p>
        <div className="card-footer">
          <span>{listing.store.name}</span>
          <Link
            href={`/products/${product.id}#watch`}
            aria-label={`${product.name}を監視`}
          >
            {product.watchlist ? '♥ 登録済み' : '♡ 監視'}
          </Link>
        </div>
        <p className="tiny">
          更新 {dateTime(listing.lastCheckedAt)}
          {deal?.endAt ? ` · ${dateTime(deal.endAt)}まで` : ''}
        </p>
      </div>
    </article>
  );
}
export function ProductGrid({ products }: { products: CatalogProduct[] }) {
  return products.length ? (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  ) : (
    <div className="empty">
      <h3>条件に合う商品はありません</h3>
      <p>キーワードや絞り込み条件を変更してください。</p>
      <Link href="/products">絞り込みをリセット</Link>
    </div>
  );
}
export async function Filters({ params }: { params: SearchParams }) {
  const f = await facets();
  return (
    <form className="filters" action="/products">
      {scalar(params, 'section') && (
        <input type="hidden" name="section" value={scalar(params, 'section')} />
      )}
      <h2>絞り込み</h2>
      <label>
        キーワード
        <input
          name="q"
          defaultValue={scalar(params, 'q')}
          placeholder="商品名・型番・JAN・ショップ"
        />
      </label>
      <label>
        カテゴリ
        <select
          name="category"
          aria-label="カテゴリ"
          defaultValue={scalar(params, 'category')}
        >
          <option value="">すべて</option>
          {f.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? '　' : ''}
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        メーカー
        <select
          name="manufacturer"
          aria-label="メーカー"
          defaultValue={scalar(params, 'manufacturer')}
        >
          <option value="">すべて</option>
          {f.manufacturers.map((m) => (
            <option key={m.manufacturer}>{m.manufacturer}</option>
          ))}
        </select>
      </label>
      <label>
        ショップ
        <select
          name="store"
          aria-label="ショップ"
          defaultValue={scalar(params, 'store')}
        >
          <option value="">すべて</option>
          {f.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="two-cols">
        <label>
          下限（円）
          <input
            name="min"
            type="number"
            min="0"
            defaultValue={scalar(params, 'min')}
          />
        </label>
        <label>
          上限（円）
          <input
            name="max"
            type="number"
            min="0"
            defaultValue={scalar(params, 'max')}
          />
        </label>
      </div>
      <label>
        割引率（%以上）
        <input
          name="discount"
          type="number"
          min="0"
          max="100"
          defaultValue={scalar(params, 'discount')}
        />
      </label>
      <label>
        Deal Score（以上）
        <input
          name="score"
          type="number"
          min="0"
          max="100"
          defaultValue={scalar(params, 'score')}
        />
      </label>
      {[
        ['lowest', '過去最安のみ'],
        ['stock', '在庫あり'],
        ['free', '送料無料'],
      ].map(([name, label]) => (
        <label key={name} className="checkbox">
          <input
            type="checkbox"
            name={name}
            value="1"
            defaultChecked={!!scalar(params, name)}
          />
          {label}
        </label>
      ))}
      <label>
        並び順
        <select
          name="sort"
          aria-label="並び順"
          defaultValue={scalar(params, 'sort') || 'recommended'}
        >
          {[
            ['recommended', 'おすすめ'],
            ['new', '新着'],
            ['price_asc', '価格が安い'],
            ['price_desc', '価格が高い'],
            ['discount', '割引率'],
            ['score', 'Deal Score'],
            ['ending', '終了間近'],
          ].map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button className="button">条件を適用</button>
      <Link href="/products" className="reset">
        リセット
      </Link>
    </form>
  );
}
export function Pagination({
  page,
  pages,
  params,
  base = '/products',
}: {
  page: number;
  pages: number;
  params: SearchParams;
  base?: string;
}) {
  return (
    <nav className="pagination" aria-label="ページ切替">
      {Array.from({ length: pages }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === pages || Math.abs(page - p) < 3)
        .map((p) => {
          const query = new URLSearchParams();
          for (const [k, v] of Object.entries(params))
            if (typeof v === 'string') query.set(k, v);
          query.set('page', String(p));
          return (
            <Link
              key={p}
              href={`${base}?${query}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Link>
          );
        })}
    </nav>
  );
}
