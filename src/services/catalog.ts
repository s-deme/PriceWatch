import { Prisma } from '@prisma/client';
import { db } from '../lib/db';
import { STALE_AFTER } from '../lib/price';
export type SearchParams = Record<string, string | string[] | undefined>;
export const scalar = (p: SearchParams, k: string) =>
  typeof p[k] === 'string' ? (p[k] as string) : '';
const number = (p: SearchParams, k: string) => {
  const s = scalar(p, k);
  return s && Number.isFinite(Number(s)) ? Math.max(0, Number(s)) : undefined;
};
export const listingInclude = {
  store: true,
  source: true,
  deals: {
    where: { active: true },
    orderBy: { startAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.ListingInclude;
export const productInclude = {
  category: true,
  watchlist: true,
  listings: {
    include: listingInclude,
    where: { active: true, currency: 'JPY', store: { active: true } },
    orderBy: [
      { paymentPrice: { sort: 'asc' as const, nulls: 'last' as const } },
      { id: 'asc' as const },
    ],
  },
} satisfies Prisma.ProductInclude;
export type CatalogProduct = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;
export async function catalog(params: SearchParams = {}) {
  const q = scalar(params, 'q').trim().slice(0, 200);
  const category = scalar(params, 'category');
  const categoryIds = category
    ? (
        await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM "Category" WHERE id=${category}
      UNION SELECT c.id FROM "Category" c JOIN descendants d ON c."parentId"=d.id
    ) SELECT id FROM descendants
  `
      ).map((c) => c.id)
    : [];
  const manufacturer = scalar(params, 'manufacturer');
  const whereListing: Prisma.ListingWhereInput = {
    active: true,
    currency: 'JPY',
    store: { active: true },
    ...(scalar(params, 'store') ? { storeId: scalar(params, 'store') } : {}),
    ...(scalar(params, 'stock')
      ? {
          stockStatus: 'in_stock',
          lastCheckedAt: { gte: new Date(Date.now() - STALE_AFTER) },
        }
      : {}),
    ...(scalar(params, 'free') ? { shippingPrice: 0 } : {}),
    ...(scalar(params, 'lowest')
      ? {
          historicalLow: true,
          lastCheckedAt: { gte: new Date(Date.now() - STALE_AFTER) },
        }
      : {}),
    ...(number(params, 'min') !== undefined ||
    number(params, 'max') !== undefined
      ? {
          paymentPrice: {
            gte: number(params, 'min'),
            lte: number(params, 'max'),
          },
        }
      : {}),
    ...(number(params, 'discount') !== undefined
      ? { discountRate: { gte: number(params, 'discount') } }
      : {}),
    ...(number(params, 'score') !== undefined
      ? { score: { gte: number(params, 'score') } }
      : {}),
  };
  if (scalar(params, 'section') === 'drops') whereListing.priceDrop = true;
  if (scalar(params, 'section') === 'deals')
    whereListing.deals = {
      some: {
        active: true,
        startAt: { lte: new Date() },
        OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
      },
    };
  if (scalar(params, 'section')) {
    whereListing.lastCheckedAt = { gte: new Date(Date.now() - STALE_AFTER) };
    whereListing.stockStatus = 'in_stock';
  }
  if (scalar(params, 'section') === 'lowest') whereListing.historicalLow = true;
  if (scalar(params, 'section') === 'ending')
    whereListing.deals = {
      some: {
        active: true,
        endAt: { gt: new Date(), lte: new Date(Date.now() + 3 * 86400000) },
      },
    };
  const where: Prisma.ProductWhereInput = {
    listings: { some: whereListing },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { manufacturer: { contains: q, mode: 'insensitive' } },
            { modelNumber: { contains: q, mode: 'insensitive' } },
            { janCode: { contains: q } },
            {
              listings: {
                some: {
                  ...whereListing,
                  store: {
                    active: true,
                    name: { contains: q, mode: 'insensitive' },
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(category ? { categoryId: { in: categoryIds } } : {}),
    ...(manufacturer ? { manufacturer } : {}),
    ...(scalar(params, 'watched') ? { watchlist: { isNot: null } } : {}),
  };
  const sort = scalar(params, 'sort') || 'recommended';
  const page = Math.min(
    1000000,
    Math.max(1, Math.floor(number(params, 'page') ?? 1)),
  );
  const pageSize = 12;
  const now = new Date();
  const recent = new Date(+now - STALE_AFTER);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`l.active = true`,
    Prisma.sql`s.active = true`,
    Prisma.sql`l.currency = 'JPY'`,
  ];
  if (scalar(params, 'section'))
    conditions.push(
      Prisma.sql`l."stockStatus"='in_stock' AND l."lastCheckedAt">=${recent}`,
    );
  if (scalar(params, 'section') === 'deals')
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Deal" d WHERE d."listingId"=l.id AND d.active=true AND d."startAt"<=${now} AND (d."endAt" IS NULL OR d."endAt">${now}))`,
    );
  if (scalar(params, 'store'))
    conditions.push(Prisma.sql`l."storeId" = ${scalar(params, 'store')}`);
  if (scalar(params, 'stock'))
    conditions.push(
      Prisma.sql`l."stockStatus" = 'in_stock' AND l."lastCheckedAt" >= ${recent}`,
    );
  if (scalar(params, 'free'))
    conditions.push(Prisma.sql`l."shippingPrice" = 0`);
  if (scalar(params, 'lowest') || scalar(params, 'section') === 'lowest')
    conditions.push(
      Prisma.sql`l."historicalLow" = true AND l."lastCheckedAt" >= ${recent}`,
    );
  if (scalar(params, 'section') === 'drops')
    conditions.push(Prisma.sql`l."priceDrop" = true`);
  if (scalar(params, 'section') === 'ending')
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Deal" d WHERE d."listingId"=l.id AND d.active=true AND d."endAt">${now} AND d."endAt"<=${new Date(+now + 3 * 86400000)})`,
    );
  for (const [param, column, operator] of [
    ['min', 'paymentPrice', '>='],
    ['max', 'paymentPrice', '<='],
    ['discount', 'discountRate', '>='],
    ['score', 'score', '>='],
  ] as const) {
    const n = number(params, param);
    if (n !== undefined)
      conditions.push(
        Prisma.sql`${Prisma.raw(`l."${column}"`)} ${Prisma.raw(operator)} ${n}`,
      );
  }
  if (category)
    conditions.push(
      categoryIds.length
        ? Prisma.sql`p."categoryId" IN (${Prisma.join(categoryIds)})`
        : Prisma.sql`FALSE`,
    );
  if (manufacturer) conditions.push(Prisma.sql`p.manufacturer=${manufacturer}`);
  if (scalar(params, 'watched'))
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Watchlist" w WHERE w."productId"=p.id)`,
    );
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(
      Prisma.sql`(p.name ILIKE ${pattern} OR p.manufacturer ILIKE ${pattern} OR p."modelNumber" ILIKE ${pattern} OR p."janCode" LIKE ${pattern} OR s.name ILIKE ${pattern})`,
    );
  }
  const order =
    sort === 'price_asc'
      ? Prisma.sql`MIN(l."paymentPrice") ASC NULLS LAST`
      : sort === 'price_desc'
        ? Prisma.sql`MIN(l."paymentPrice") DESC NULLS LAST`
        : sort === 'new'
          ? Prisma.sql`COALESCE(MAX((SELECT MAX(d."startAt") FROM "Deal" d WHERE d."listingId"=l.id AND d."startAt"<=${now})), p."createdAt") DESC`
          : sort === 'discount'
            ? Prisma.sql`(array_agg(l."discountRate" ORDER BY l."paymentPrice" ASC NULLS LAST,l.id))[1] DESC`
            : sort === 'ending'
              ? Prisma.sql`MIN((SELECT MIN(d."endAt") FROM "Deal" d WHERE d."listingId"=l.id AND d.active=true AND d."endAt">${now})) ASC NULLS LAST`
              : Prisma.sql`(array_agg(l.score ORDER BY l."paymentPrice" ASC NULLS LAST,l.id))[1] DESC`;
  const ranked = await db.$queryRaw<{ id: string; total: bigint }[]>(
    Prisma.sql`SELECT p.id,COUNT(*) OVER() AS total FROM "Product" p JOIN "Category" c ON c.id=p."categoryId" JOIN "Listing" l ON l."productId"=p.id JOIN "Store" s ON s.id=l."storeId" WHERE ${Prisma.join(conditions, ' AND ')} GROUP BY p.id ORDER BY ${order},p.id ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  );
  const ids = ranked.map((p) => p.id);
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    include: {
      ...productInclude,
      listings: { ...productInclude.listings, where: whereListing },
    },
  });
  products.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const total = ranked.length
    ? Number(ranked[0].total)
    : await db.product.count({ where });
  return { products, total, page, pages: Math.ceil(total / pageSize) };
}
export async function facets() {
  const [categories, stores, manufacturers] = await Promise.all([
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.store.findMany({ where: { active: true } }),
    db.product.findMany({
      distinct: ['manufacturer'],
      select: { manufacturer: true },
      orderBy: { manufacturer: 'asc' },
    }),
  ]);
  return { categories, stores, manufacturers };
}
export async function productDetail(id: string) {
  return db.product.findUnique({
    where: { id },
    include: {
      category: true,
      watchlist: true,
      listings: {
        include: {
          store: true,
          source: true,
          history: { orderBy: { recordedAt: 'asc' } },
          deals: { orderBy: { startAt: 'desc' }, take: 30 },
        },
        orderBy: { paymentPrice: { sort: 'asc', nulls: 'last' } },
      },
    },
  });
}
