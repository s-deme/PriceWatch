import { db } from '../lib/db';
import { ingest } from './ingest';
import { MockSource } from '../sources';
import { STALE_AFTER } from '../lib/price';
export async function runNextJob() {
  const candidate = await db.jobRun.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return false;
  const claimed = await db.jobRun.updateMany({
    where: { id: candidate.id, status: 'queued' },
    data: { status: 'running', startedAt: new Date() },
  });
  if (!claimed.count) return true;
  const started = Date.now();
  let fetched = 0;
  let failed = 0;
  const errors: string[] = [];
  try {
    const source = await db.source.findUniqueOrThrow({
      where: { id: candidate.sourceId },
    });
    if (!source.active) throw new Error('取得元は停止中です');
    if (source.kind !== 'mock')
      throw new Error('ManualSourceはImport画面から価格を投入してください');
    const adapter = new MockSource();
    const listings = await db.listing.findMany({
      where: { sourceId: source.id, active: true },
      include: {
        product: true,
        deals: { orderBy: { startAt: 'desc' }, take: 1 },
      },
    });
    for (const listing of listings) {
      const time = Date.now();
      try {
        const price = await adapter.fetchPrice(listing);
        await ingest(
          {
            ...price,
            name: listing.product.name,
            manufacturer: listing.product.manufacturer,
            modelNumber: listing.product.modelNumber,
            janCode: listing.product.janCode,
            upc: listing.product.upc,
            categoryId: listing.product.categoryId,
            storeId: listing.storeId,
            externalId: listing.externalId,
            url: listing.url,
            regularPrice: listing.regularPrice,
            couponId: listing.couponId ?? undefined,
            endAt: listing.deals[0]?.endAt?.toISOString(),
            eventId: listing.deals[0]?.eventId ?? undefined,
          },
          source.id,
        );
        fetched++;
        console.info(
          JSON.stringify({
            source: source.id,
            listingId: listing.id,
            productId: listing.productId,
            operation: 'fetch',
            status: 'success',
            duration: Date.now() - time,
            error: null,
          }),
        );
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : '取得失敗';
        errors.push(`${listing.id}: ${message}`);
        await db.listing.update({
          where: { id: listing.id },
          data: { status: 'error' },
        });
        console.error(
          JSON.stringify({
            source: source.id,
            listingId: listing.id,
            productId: listing.productId,
            operation: 'fetch',
            status: 'error',
            duration: Date.now() - time,
            error: message,
          }),
        );
      }
    }
  } catch (error) {
    failed++;
    errors.push(error instanceof Error ? error.message : 'ジョブ失敗');
  }
  await db.jobRun.update({
    where: { id: candidate.id },
    data: {
      status: failed ? 'error' : 'success',
      fetched,
      failed,
      duration: Date.now() - started,
      finishedAt: new Date(),
      error: errors.length ? errors.join('\n').slice(0, 5000) : null,
    },
  });
  return true;
}
export async function maintenance() {
  const now = new Date();
  await db.deal.updateMany({
    where: { active: true, endAt: { lte: now } },
    data: { active: false },
  });
  await db.listing.updateMany({
    where: {
      lastCheckedAt: { lt: new Date(+now - STALE_AFTER) },
      status: { not: 'error' },
    },
    data: { status: 'stale', historicalLow: false },
  });
  await db.jobRun.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: new Date(+now - 30 * 60000) },
    },
    data: {
      status: 'error',
      error: 'ワーカー停止または30分の制限時間超過。再実行できます。',
      finishedAt: now,
    },
  });
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
}
