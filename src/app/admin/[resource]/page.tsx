import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  resources,
  adminRows,
  templates,
  type Resource,
} from '../../../services/admin';
import { ActionForm } from '../../../components/action-form';
import { ImportForm } from '../../../components/import-form';
export default async function ResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { resource } = await params;
  if (!resources.includes(resource as Resource)) notFound();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const rows = await adminRows(resource as Resource, page);
  return (
    <section className="panel">
      <h2>{resource}</h2>
      {resource === 'import' ? (
        <>
          <p>
            登録先ショップ・カテゴリを先に作成してください。各行は独立したトランザクションで保存し、失敗行はJobsに記録します。
          </p>
          <ImportForm />
        </>
      ) : (
        <>
          {resource === 'jobs' && (
            <>
              <ActionForm op="job">
                <input type="hidden" name="sourceId" value="mock" />
                <button className="button">Mock取得をキューに追加</button>
              </ActionForm>
              <p>
                独立ワーカーが実行します。結果更新はこのページを再読み込みしてください。
              </p>
            </>
          )}
          {resource === 'listings' && (
            <p>
              価格変更は<Link href="/admin/import">Import</Link>
              から行い、履歴とスコアを同時更新します。ここでは掲載状態を変更できます。
            </p>
          )}
          {templates[resource] !== undefined && (
            <details className="admin-editor">
              <summary>＋ 新規登録</summary>
              <ActionForm op="admin">
                <input type="hidden" name="resource" value={resource} />
                <label>
                  登録内容（JSON）
                  <textarea
                    name="json"
                    rows={12}
                    defaultValue={JSON.stringify(templates[resource], null, 2)}
                  />
                </label>
                <button className="button">登録する</button>
              </ActionForm>
            </details>
          )}
          <div className="admin-records">
            {rows.map((row) => (
              <details className="admin-editor" key={row.id}>
                <summary>
                  {'name' in row
                    ? String(row.name)
                    : 'title' in row
                      ? String(row.title)
                      : 'code' in row
                        ? String(row.code)
                        : row.id}
                  {'status' in row ? ` · ${row.status}` : ''}
                </summary>
                {resource === 'jobs' ? (
                  <pre>{JSON.stringify(row, null, 2)}</pre>
                ) : (
                  <ActionForm op="admin">
                    <input type="hidden" name="resource" value={resource} />
                    <label>
                      編集内容（JSON）
                      <textarea
                        name="json"
                        rows={14}
                        defaultValue={JSON.stringify(row, null, 2)}
                      />
                    </label>
                    <button className="button">変更を保存</button>
                  </ActionForm>
                )}
              </details>
            ))}
          </div>
          {!rows.length && (
            <div className="empty">登録データはありません。</div>
          )}
          <nav className="pagination">
            {page > 1 && (
              <Link href={`/admin/${resource}?page=${page - 1}`}>← 前へ</Link>
            )}
            <span>{page}ページ</span>
            {rows.length === 25 && (
              <Link href={`/admin/${resource}?page=${page + 1}`}>次へ →</Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
