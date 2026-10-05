import { ActionForm } from '../../components/action-form';
import { authenticated } from '../../lib/auth';
import Link from 'next/link';
export default async function Login() {
  const logged = await authenticated();
  return (
    <section className="login panel">
      <p className="eyebrow accent">PERSONAL WORKSPACE</p>
      <h1>{logged ? 'ログイン中です' : 'おかえりなさい'}</h1>
      <p>自分だけのウォッチリストと価格管理。</p>
      {logged ? (
        <>
          <Link className="button" href="/admin">
            管理画面へ
          </Link>
          <ActionForm op="logout">
            <button className="text-button">ログアウト</button>
          </ActionForm>
        </>
      ) : (
        <ActionForm op="login">
          <label>
            管理パスワード
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button className="button">ログイン</button>
        </ActionForm>
      )}
    </section>
  );
}
