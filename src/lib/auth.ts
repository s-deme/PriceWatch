import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { db } from './db';
const COOKIE = 'pricewatch_session';
function digest(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRETは32文字以上必要です');
  return createHmac('sha256', secret).update(value).digest('hex');
}
export async function authenticated() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const session = await db.session.findUnique({ where: { id: digest(token) } });
  return !!session && session.expiresAt > new Date();
}
export async function requireAuth() {
  if (!(await authenticated())) throw new Error('ログインが必要です');
}
export async function assertOrigin() {
  const h = await headers();
  const origin = h.get('origin');
  if (
    !origin ||
    origin !== new URL(process.env.APP_ORIGIN || 'http://localhost:3000').origin
  )
    throw new Error('不正なリクエストです');
}
export async function rateLimit(key: string, limit: number, seconds = 60) {
  const now = new Date();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key},1,${new Date(+now + seconds * 1000)}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count"+1 END, "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${new Date(+now + seconds * 1000)} ELSE "RateLimit"."resetAt" END RETURNING "count"`;
  if (rows[0].count > limit)
    throw new Error('操作が多すぎます。少し待って再試行してください');
}
export async function login(password: string) {
  await assertOrigin();
  await rateLimit('login', 10, 300);
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 12)
    throw new Error('管理パスワードを12文字以上で設定してください');
  if (
    !timingSafeEqual(
      Buffer.from(digest(password)),
      Buffer.from(digest(expected)),
    )
  )
    throw new Error('パスワードが違います');
  const token = randomBytes(32).toString('hex');
  await db.session.create({
    data: { id: digest(token), expiresAt: new Date(Date.now() + 7 * 86400000) },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86400,
  });
}
export async function logout() {
  await assertOrigin();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  jar.delete(COOKIE);
}
export async function authorizeWrite() {
  await assertOrigin();
  await requireAuth();
  await rateLimit('write', 120);
}
