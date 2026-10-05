'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '../lib/db';
import { authorizeWrite, login, logout } from '../lib/auth';
import { saveAdmin } from '../services/admin';
import { sourceProductSchema } from '../sources';
import { ingest } from '../services/ingest';
export type ActionState = { ok: boolean; message: string };
export async function action(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const op = String(form.get('op') || '');
    if (op === 'login') {
      await login(String(form.get('password') || ''));
      revalidatePath('/', 'layout');
      return {
        ok: true,
        message: 'ログインしました。管理画面や監視機能を利用できます。',
      };
    }
    if (op === 'logout') {
      await logout();
      revalidatePath('/', 'layout');
      return { ok: true, message: 'ログアウトしました' };
    }
    await authorizeWrite();
    const id = z.string().min(1).max(200);
    switch (op) {
      case 'watch': {
        const productId = id.parse(form.get('productId'));
        const optional = (key: string, max: number) => {
          const value = form.get(key);
          return value === null || value === ''
            ? null
            : z.coerce.number().int().min(0).max(max).parse(value);
        };
        const data = {
          targetPrice: optional('targetPrice', 1_000_000_000),
          discountThreshold: optional('discountThreshold', 100),
          notifyLowestPrice: form.get('notifyLowestPrice') === 'on',
          notifyDeal: form.get('notifyDeal') === 'on',
        };
        await db.watchlist.upsert({
          where: { productId },
          create: { productId, ...data },
          update: { ...data, lastState: '' },
        });
        break;
      }
      case 'unwatch':
        await db.watchlist.deleteMany({
          where: { productId: id.parse(form.get('productId')) },
        });
        break;
      case 'keyword': {
        const include = z.string().min(1).max(500).parse(form.get('include'));
        if (!include.split(/[,、\n]/).some((s) => s.trim()))
          throw new Error('包含キーワードを入力してください');
        await db.keywordWatch.create({
          data: {
            include,
            exclude: z
              .string()
              .max(500)
              .parse(form.get('exclude') || ''),
          },
        });
        break;
      }
      case 'keyword-delete':
        await db.keywordWatch.delete({
          where: { id: id.parse(form.get('id')) },
        });
        break;
      case 'read':
        await db.notification.updateMany({
          where: { read: false },
          data: { read: true },
        });
        break;
      case 'admin': {
        const json = String(form.get('json') || '');
        if (json.length > 100000) throw new Error('データが大きすぎます');
        await saveAdmin(String(form.get('resource')), JSON.parse(json));
        break;
      }
      case 'preview':
      case 'import': {
        const json = String(form.get('json') || '');
        if (json.length > 500000)
          throw new Error('500KB以下で投入してください');
        const rows = z
          .array(sourceProductSchema)
          .min(1)
          .max(100)
          .parse(JSON.parse(json));
        for (const row of rows) {
          await db.store.findUniqueOrThrow({ where: { id: row.storeId } });
          await db.category.findUniqueOrThrow({
            where: { id: row.categoryId },
          });
        }
        if (op === 'preview')
          return {
            ok: true,
            message: `${rows.length}件の形式・参照先を検証しました。「投入する」で保存します。商品照合の競合は投入結果で確認できます。`,
          };
        const job = await db.jobRun.create({
          data: {
            sourceId: 'manual',
            status: 'running',
            startedAt: new Date(),
          },
        });
        let fetched = 0;
        const errors: string[] = [];
        const start = Date.now();
        for (const [i, row] of rows.entries())
          try {
            await ingest(row, 'manual');
            fetched++;
          } catch (e) {
            errors.push(
              `${i + 1}行目: ${e instanceof Error ? e.message : '投入失敗'}`,
            );
          }
        await db.jobRun.update({
          where: { id: job.id },
          data: {
            status: errors.length ? 'error' : 'success',
            fetched,
            failed: errors.length,
            error: errors.join('\n') || null,
            finishedAt: new Date(),
            duration: Date.now() - start,
          },
        });
        revalidatePath('/', 'layout');
        return {
          ok: !errors.length,
          message: `${fetched}件を保存、${errors.length}件失敗。${errors.join(' / ')}`,
        };
      }
      case 'job': {
        const sourceId = z.literal('mock').parse(form.get('sourceId'));
        if (
          !(await db.jobRun.findFirst({
            where: { sourceId, status: { in: ['queued', 'running'] } },
          }))
        )
          await db.jobRun.create({ data: { sourceId } });
        break;
      }
      default:
        throw new Error('不明な操作です');
    }
    revalidatePath('/', 'layout');
    return { ok: true, message: '保存しました' };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join(' / ')
          : error instanceof Error && !error.message.includes('prisma.')
            ? error.message
            : '保存できませんでした。識別子・参照先・重複を確認してください。',
    };
  }
}
