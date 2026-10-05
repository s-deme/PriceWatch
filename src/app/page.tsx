import Link from 'next/link';
import { catalog } from '../services/catalog';
import { ProductGrid } from '../components/catalog';
import { db } from '../lib/db';
export default async function Home() {
  const [hot, fresh, low, drops, ending, count, stores] = await Promise.all([
    catalog({ section: 'deals' }),
    catalog({ section: 'deals', sort: 'new' }),
    catalog({ section: 'lowest' }),
    catalog({ section: 'drops' }),
    catalog({ section: 'ending', sort: 'ending' }),
    db.product.count(),
    db.store.count({ where: { active: true } }),
  ]);
  const sections = [
    [
      '新着セール',
      '新しく見つかった買い時をチェック。',
      fresh,
      'section=deals&sort=new',
    ],
    [
      '記録開始以来の最安',
      '過去の価格と比べても、お得な商品。',
      low,
      'lowest=1',
    ],
    [
      '値下げをキャッチ',
      '前回の観測から価格が下がった商品。',
      drops,
      'section=drops',
    ],
    [
      'まもなく終了',
      '気になるセールを見逃さずに。',
      ending,
      'section=ending&sort=ending',
    ],
  ] as const;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow accent">SMARTER SHOPPING, EVERY DAY</p>
          <h1>
            本当に安い、
            <br />
            <span>その瞬間を。</span>
          </h1>
          <p className="hero-copy">
            過去の価格も、ほかのお店も。
            <br />
            比べてわかる、納得の買い時を見つけよう。
          </p>
          <form className="hero-search" action="/products">
            <span aria-hidden>⌕</span>
            <input
              name="q"
              aria-label="商品を検索"
              placeholder="気になる商品、メーカー、型番を検索"
            />
            <button className="button">
              検索する <span aria-hidden>→</span>
            </button>
          </form>
          <div className="suggestions">
            <span>注目ワード</span>
            {['MOONDROP', 'SSD', 'RTX', 'SONY'].map((s) => (
              <Link key={s} href={`/products?q=${s}`}>
                {s} ↗
              </Link>
            ))}
          </div>
        </div>
        <aside className="hero-note">
          <svg className="note-chart" viewBox="0 0 320 90" aria-hidden="true">
            <path d="M0 75H320" stroke="#cad8c7" />
            <path
              d="M4 17 51 24 92 13 135 43 178 32 223 58 267 49 312 76"
              fill="none"
              stroke="#497554"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="312" cy="76" r="5" fill="#17654e" />
          </svg>
          <p>
            「安そう」から、
            <br />
            <strong>「ちゃんと安い」へ。</strong>
          </p>
          <span>価格履歴 × 他店比較 × Deal Score</span>
          <div className="hero-stats">
            <div>
              <strong>{count}</strong>
              <span>比較できる商品</span>
            </div>
            <div>
              <strong>{stores}</strong>
              <span>掲載ショップ</span>
            </div>
          </div>
        </aside>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow accent">TODAY&apos;S PICKS</p>
            <h2>
              HOT DEALS <span className="pill">買い時を発見</span>
            </h2>
            <p>価格履歴とショップ比較から選ぶ、注目のプライス。</p>
          </div>
          <Link href="/products">すべて見る →</Link>
        </div>
        <ProductGrid products={hot.products.slice(0, 4)} />
      </section>
      <div className="explain-strip">
        <span className="explain-icon">✓</span>
        <div>
          <h3>割引率だけでは、わからないから。</h3>
          <p>
            Deal
            Scoreは過去の価格や他店価格をもとに算出。商品詳細で評価の理由を確認できます。
          </p>
        </div>
        <Link href="/products">比較をはじめる →</Link>
      </div>
      {sections.map(([title, description, result, query]) => (
        <section className="section" key={title}>
          <div className="section-heading">
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <Link href={`/products?${query}`}>すべて見る →</Link>
          </div>
          <ProductGrid products={result.products.slice(0, 4)} />
        </section>
      ))}
    </>
  );
}
