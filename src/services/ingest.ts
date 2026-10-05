import { Prisma } from '@prisma/client';
import { db } from '../lib/db';
import {
  averagePrice,
  calculatePrice,
  couponValue,
  dealScore,
  discountRate,
  shouldRecord,
  STALE_AFTER,
} from '../lib/price';
import { keywordMatches, matchProduct, normalize } from '../lib/normalize';
import { sourceProductSchema, type SourceProduct } from '../sources';
const INGEST_LOCK_ID = 8274601;

export async function ingest(
  raw: SourceProduct,
  sourceId: string,
  now = new Date(),
) {
  const input = sourceProductSchema.parse(raw);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          // ponytail: one ingestion writer for this personal MVP; use identity-scoped locks when adding parallel workers.
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${INGEST_LOCK_ID}::bigint)`;
          const source = await tx.source.findUniqueOrThrow({
            where: { id: sourceId },
          });
          if (!source.active) throw new Error('取得元は停止中です');
          const store = await tx.store.findUniqueOrThrow({
            where: { id: input.storeId },
          });
          if (!store.active || store.currency !== input.currency)
            throw new Error('ショップまたは通貨を確認してください');
          await tx.category.findUniqueOrThrow({
            where: { id: input.categoryId },
          });
          const candidates = await tx.product.findMany({
            where: {
              OR: [
                ...(input.janCode ? [{ janCode: input.janCode }] : []),
                ...(input.upc ? [{ upc: input.upc }] : []),
                {
                  manufacturer: {
                    equals: input.manufacturer,
                    mode: 'insensitive',
                  },
                },
                { normalizedName: normalize(input.name) },
              ],
            },
          });
          const match = matchProduct(input, candidates);
          if (match.kind === 'ambiguous')
            throw new Error(
              '商品照合が曖昧です。識別子を管理画面で確認してください',
            );
          const product =
            match.kind === 'matched'
              ? await tx.product.findUniqueOrThrow({ where: { id: match.id } })
              : await tx.product.create({
                  data: {
                    name: input.name,
                    normalizedName: normalize(input.name),
                    manufacturer: input.manufacturer,
                    modelNumber: input.modelNumber,
                    janCode: input.janCode,
                    upc: input.upc,
                    categoryId: input.categoryId,
                  },
                });
          const existing = await tx.listing.findMany({
            where: {
              storeId: input.storeId,
              OR: [
                { url: input.url },
                ...(input.externalId ? [{ externalId: input.externalId }] : []),
              ],
            },
          });
          if (
            existing.length > 1 ||
            (existing[0] && existing[0].productId !== product.id)
          )
            throw new Error('販売ページの識別子が別商品と競合しています');
          const previous = existing[0];
          if (previous?.lastCheckedAt && previous.lastCheckedAt > now)
            throw new Error('古い価格更新は適用できません');
          let couponDiscount = 0;
          if (input.couponId) {
            const coupon = await tx.coupon.findUniqueOrThrow({
              where: { id: input.couponId },
            });
            if (coupon.storeId !== input.storeId)
              throw new Error('クーポンのショップが一致しません');
            couponDiscount = couponValue(input.price, coupon, now);
          }
          if (input.eventId)
            await tx.saleEvent.findUniqueOrThrow({
              where: { id: input.eventId },
            });
          const money = calculatePrice({ ...input, couponDiscount });
          if (
            previous?.lastCheckedAt &&
            +previous.lastCheckedAt === +now &&
            (previous.currentPrice !== input.price ||
              previous.shippingPrice !== input.shippingPrice ||
              previous.points !== input.points ||
              previous.couponDiscount !== couponDiscount ||
              previous.stockStatus !== input.stockStatus)
          ) {
            throw new Error(
              '同一時刻に異なる価格情報があります。観測時刻を確認してください',
            );
          }
          const history = previous
            ? await tx.priceHistory.findMany({
                where: { listingId: previous.id },
                orderBy: { recordedAt: 'asc' },
              })
            : [];
          const minimum = (
            await tx.priceHistory.aggregate({
              where: {
                listing: { productId: product.id },
                currency: input.currency,
                stockStatus: 'in_stock',
                recordedAt: { lt: now },
              },
              _min: { paymentPrice: true },
            })
          )._min.paymentPrice;
          const avg = averagePrice(history, 90, now, input.currency);
          const other = await tx.listing.findFirst({
            where: {
              productId: product.id,
              id: { not: previous?.id },
              storeId: { not: input.storeId },
              currency: input.currency,
              active: true,
              stockStatus: 'in_stock',
              paymentPrice: { not: null },
              lastCheckedAt: { gte: new Date(+now - STALE_AFTER) },
              store: { active: true },
            },
            orderBy: { paymentPrice: 'asc' },
          });
          const score = dealScore({
            paymentPrice: money.paymentPrice,
            average90: avg.value,
            historicalLow: minimum,
            regularPrice: input.regularPrice,
            otherPrice: other?.paymentPrice ?? null,
            shippingPrice: input.shippingPrice,
          });
          const historicalLow =
            money.paymentPrice !== null &&
            minimum !== null &&
            money.paymentPrice <= minimum &&
            input.stockStatus === 'in_stock';
          const rate = discountRate(
            money.paymentPrice ?? input.price,
            input.regularPrice,
          );
          const listingData = {
            productId: product.id,
            storeId: input.storeId,
            sourceId,
            externalId: input.externalId,
            title: input.name,
            url: input.url,
            currentPrice: input.price,
            regularPrice: input.regularPrice,
            shippingPrice: input.shippingPrice,
            points: input.points,
            couponDiscount,
            couponId: input.couponId ?? null,
            ...money,
            currency: input.currency,
            stockStatus: input.stockStatus,
            status: 'unverified',
            lastCheckedAt: now,
            active: true,
            score: score.score,
            scoreReasons: [
              ...score.reasons,
              ...score.missing.map((s) => `${s}のデータ不足`),
            ],
            historicalLow,
            priceDrop:
              !!previous &&
              money.paymentPrice !== null &&
              previous.paymentPrice !== null &&
              (money.paymentPrice < previous.paymentPrice ||
                (money.paymentPrice === previous.paymentPrice &&
                  previous.priceDrop)),
            discountRate: rate,
          };
          const listing = previous
            ? await tx.listing.update({
                where: { id: previous.id },
                data: listingData,
              })
            : await tx.listing.create({ data: listingData });
          const observation = {
            listingId: listing.id,
            sourceId,
            price: input.price,
            shippingPrice: input.shippingPrice,
            couponDiscount,
            points: input.points,
            ...money,
            currency: input.currency,
            stockStatus: input.stockStatus,
            recordedAt: now,
          };
          if (shouldRecord(history.at(-1) ?? null, observation))
            await tx.priceHistory.upsert({
              where: {
                listingId_recordedAt: {
                  listingId: listing.id,
                  recordedAt: now,
                },
              },
              create: observation,
              update: {},
            });
          const endAt = input.endAt ? new Date(input.endAt) : null;
          const isDeal =
            input.stockStatus === 'in_stock' &&
            money.paymentPrice !== null &&
            (rate > 0 || historicalLow) &&
            (!endAt || endAt > now);
          const activeDeal = await tx.deal.findFirst({
            where: { listingId: listing.id, active: true },
            orderBy: { startAt: 'desc' },
          });
          let newDeal: { id: string } | null = null;
          if (!isDeal)
            await tx.deal.updateMany({
              where: { listingId: listing.id, active: true },
              data: { active: false, endAt: now },
            });
          else if (
            activeDeal &&
            activeDeal.salePrice === input.price &&
            activeDeal.effectivePrice === money.effectivePrice &&
            (!activeDeal.endAt || activeDeal.endAt > now)
          )
            await tx.deal.update({
              where: { id: activeDeal.id },
              data: {
                dealScore: score.score,
                discountRate: rate,
                ...(input.endAt ? { endAt } : {}),
                ...(input.eventId ? { eventId: input.eventId } : {}),
              },
            });
          else {
            await tx.deal.updateMany({
              where: { listingId: listing.id, active: true },
              data: { active: false, endAt: now },
            });
            newDeal = await tx.deal.create({
              data: {
                listingId: listing.id,
                sourceId,
                salePrice: input.price,
                originalPrice: input.regularPrice,
                effectivePrice: money.effectivePrice,
                discountRate: rate,
                dealScore: score.score,
                startAt: now,
                endAt,
                eventId: input.eventId,
                fingerprint: `${listing.id}:${now.toISOString()}:${input.price}:${money.effectivePrice}`,
              },
            });
          }
          const watch = await tx.watchlist.findUnique({
            where: { productId: product.id },
          });
          if (watch) {
            const best = await tx.listing.findFirst({
              where: {
                productId: product.id,
                active: true,
                currency: 'JPY',
                stockStatus: 'in_stock',
                paymentPrice: { not: null },
                lastCheckedAt: { gte: new Date(+now - STALE_AFTER) },
                store: { active: true },
              },
              orderBy: { paymentPrice: 'asc' },
              include: {
                deals: {
                  where: {
                    active: true,
                    OR: [{ endAt: null }, { endAt: { gt: now } }],
                  },
                  take: 1,
                },
              },
            });
            const state = best
              ? [
                  watch.targetPrice !== null &&
                  best.paymentPrice! <= watch.targetPrice
                    ? 'target'
                    : '',
                  watch.discountThreshold !== null &&
                  best.discountRate >= watch.discountThreshold
                    ? 'discount'
                    : '',
                  watch.notifyLowestPrice && best.historicalLow ? 'lowest' : '',
                  watch.notifyDeal && best.deals.length ? 'deal' : '',
                ]
                  .filter(Boolean)
                  .join(',')
              : '';
            const entered = state
              .split(',')
              .filter(Boolean)
              .filter((s) => !watch.lastState.split(',').includes(s));
            if (entered.length)
              await tx.notification.create({
                data: {
                  dedupeKey: `watch:${watch.id}:${now.toISOString()}:${state}`,
                  title: `${product.name} が監視条件に到達しました`,
                  href: `/products/${product.id}`,
                },
              });
            await tx.watchlist.update({
              where: { id: watch.id },
              data: { lastState: state },
            });
          }
          if (newDeal)
            for (const keyword of await tx.keywordWatch.findMany({
              where: { createdAt: { lte: now } },
            })) {
              if (
                keywordMatches(
                  `${product.name} ${product.manufacturer} ${product.modelNumber ?? ''}`,
                  keyword.include,
                  keyword.exclude,
                )
              )
                await tx.notification.upsert({
                  where: { dedupeKey: `keyword:${keyword.id}:${newDeal.id}` },
                  create: {
                    dedupeKey: `keyword:${keyword.id}:${newDeal.id}`,
                    title: `キーワード一致: ${product.name}`,
                    href: `/products/${product.id}`,
                  },
                  update: {},
                });
            }
          return listing;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10000,
          timeout: 20000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code) &&
        attempt < 3
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('同時更新が競合しました');
}
