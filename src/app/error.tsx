'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <h1>情報を読み込めませんでした</h1>
      <p>接続状況を確認して、もう一度お試しください。</p>
      <button className="button" onClick={reset}>
        再読み込み
      </button>
    </div>
  );
}
