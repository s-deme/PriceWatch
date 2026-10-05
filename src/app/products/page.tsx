import { catalog, type SearchParams } from '../../services/catalog';
import { Filters, Pagination, ProductGrid } from '../../components/catalog';
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const result = await catalog(params);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow accent">EXPLORE & COMPARE</p>
        <h1>商品を探す</h1>
        <p>過去の価格と比べて、納得できる一品を。</p>
      </div>
      <div className="catalog-layout">
        <aside>
          <Filters params={params} />
        </aside>
        <section>
          <div className="result-bar">
            <strong>{result.total} 件の商品</strong>
            <span>税込・送料込みの支払価格で比較</span>
          </div>
          <ProductGrid products={result.products} />
          <Pagination page={result.page} pages={result.pages} params={params} />
        </section>
      </div>
    </>
  );
}
