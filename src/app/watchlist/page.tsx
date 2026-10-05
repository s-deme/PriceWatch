import Link from 'next/link';
import { authenticated } from '../../lib/auth';
import { db } from '../../lib/db';
import { catalog, type SearchParams } from '../../services/catalog';
import { ProductGrid, Pagination } from '../../components/catalog';
import { ActionForm } from '../../components/action-form';
export default async function Watchlist({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await authenticated()))
    return (
      <div className="empty">
        <h1>ウォッチリスト</h1>
        <p>価格監視を利用するにはログインしてください。</p>
        <Link className="button" href="/login">
          ログイン
        </Link>
      </div>
    );
  const params = await searchParams;
  const result = await catalog({ ...params, watched: '1' });
  const keywords = await db.keywordWatch.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow accent">YOUR PRICE RADAR</p>
        <h1>ウォッチリスト</h1>
        <p>気になる商品の買い時を、逃さずチェック。</p>
      </div>
      <ProductGrid products={result.products} />
      <Pagination
        page={result.page}
        pages={result.pages}
        params={params}
        base="/watchlist"
      />
      <section className="panel">
        <h2>キーワード監視</h2>
        <p>
          包含語のいずれかに一致する新着セールを通知します。除外語は優先されます。
        </p>
        <ActionForm op="keyword">
          <div className="two-cols">
            <label>
              含むキーワード（カンマ区切り）
              <input
                name="include"
                placeholder="MOONDROP, SSD"
                required
                maxLength={500}
              />
            </label>
            <label>
              除外キーワード（カンマ区切り）
              <input
                name="exclude"
                placeholder="ケーブル, イヤーピース"
                maxLength={500}
              />
            </label>
          </div>
          <button className="button">キーワードを登録</button>
        </ActionForm>
        <div className="keyword-list">
          {keywords.map((k) => (
            <div key={k.id}>
              <span>
                <strong>{k.include}</strong>
                <small>除外：{k.exclude || 'なし'}</small>
              </span>
              <ActionForm op="keyword-delete">
                <input type="hidden" name="id" value={k.id} />
                <button className="text-button">削除</button>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
