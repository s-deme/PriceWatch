import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { db } from '../../src/lib/db';
import { ingest } from '../../src/services/ingest';
import { catalog } from '../../src/services/catalog';
import { maintenance, runNextJob } from '../../src/services/jobs';
import type { SourceProduct } from '../../src/sources';
process.loadEnvFile?.('.env');
const prefix = `test-${Date.now()}`;
const row: SourceProduct = {
  name: prefix,
  manufacturer: prefix,
  modelNumber: prefix,
  categoryId: prefix,
  storeId: prefix,
  externalId: prefix,
  url: `https://test.example.com/${prefix}`,
  price: 1000,
  regularPrice: 2000,
  shippingPrice: 0,
  points: 100,
  currency: 'JPY',
  stockStatus: 'in_stock',
};
beforeAll(async () => {
  await db.category.create({ data: { id: prefix, name: prefix } });
  await db.store.create({
    data: { id: prefix, name: prefix, domain: `${prefix}.example.com` },
  });
  await db.store.create({
    data: {
      id: `${prefix}-other`,
      name: `${prefix}-other`,
      domain: `${prefix}-other.example.com`,
    },
  });
  await db.source.create({
    data: { id: prefix, name: prefix, kind: 'manual' },
  });
});
afterAll(async () => {
  const products = await db.product.findMany({
    where: { manufacturer: prefix },
  });
  await db.notification.deleteMany({
    where: { href: { in: products.map((p) => `/products/${p.id}`) } },
  });
  await db.keywordWatch.deleteMany({ where: { include: prefix } });
  await db.jobRun.deleteMany({ where: { sourceId: prefix } });
  await db.listing.deleteMany({
    where: { productId: { in: products.map((p) => p.id) } },
  });
  await db.product.deleteMany({ where: { manufacturer: prefix } });
  await db.category.delete({ where: { id: prefix } });
  await db.category.deleteMany({
    where: { id: { in: [`${prefix}-branch`, `${prefix}-root`] } },
  });
  await db.store.delete({ where: { id: prefix } });
  await db.store.delete({ where: { id: `${prefix}-other` } });
  await db.source.delete({ where: { id: prefix } });
  await db.$disconnect();
});
describe('PostgreSQL pipeline', () => {
  it('preserves unknown shipping and excludes it from historical-low claims', async () => {
    const unknown = await ingest(
      {
        ...row,
        name: `${prefix}-unknown`,
        modelNumber: `${prefix}-unknown`,
        externalId: `${prefix}-unknown`,
        url: `https://test.example.com/${prefix}-unknown`,
        shippingPrice: null,
      },
      prefix,
    );
    expect(unknown.paymentPrice).toBeNull();
    expect(unknown.effectivePrice).toBeNull();
    expect(unknown.historicalLow).toBe(false);
    expect(unknown.score).toBe(0);
  });
  it('is idempotent and serializes concurrent updates', async () => {
    const at = new Date();
    const results = await Promise.allSettled([
      ingest(row, prefix, at),
      ingest(row, prefix, at),
    ]);
    const [a, b] = results.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    expect(a.id).toBe(b.id);
    expect(await db.priceHistory.count({ where: { listingId: a.id } })).toBe(1);
    expect(await db.deal.count({ where: { listingId: a.id } })).toBe(1);
  });
  it('rolls back invalid references and rejects ambiguous matching', async () => {
    const count = await db.product.count({ where: { manufacturer: prefix } });
    await expect(
      ingest(
        {
          ...row,
          name: `${prefix}-invalid`,
          modelNumber: 'bad',
          categoryId: 'missing',
        },
        prefix,
      ),
    ).rejects.toThrow();
    expect(await db.product.count({ where: { manufacturer: prefix } })).toBe(
      count,
    );
  });
  it('compares all stores for product lows and preserves a drop on unchanged polls', async () => {
    const now = new Date();
    const input = {
      ...row,
      name: `${prefix}-low`,
      modelNumber: `${prefix}-low`,
      externalId: `${prefix}-low`,
      url: `https://test.example.com/${prefix}-low`,
    };
    await ingest(input, prefix, new Date(+now - 2000));
    await ingest(
      { ...input, storeId: `${prefix}-other`, price: 500 },
      prefix,
      new Date(+now - 1000),
    );
    const lowered = await ingest({ ...input, price: 700 }, prefix, now);
    expect(lowered.historicalLow).toBe(false);
    expect(lowered.priceDrop).toBe(true);
    const repeated = await ingest(
      { ...input, price: 700 },
      prefix,
      new Date(+now + 1000),
    );
    expect(repeated.priceDrop).toBe(true);
  });
  it('filters descendant categories and orders the displayed offer by price', async () => {
    await db.category.create({
      data: { id: `${prefix}-root`, name: `${prefix}-root` },
    });
    await db.category.create({
      data: {
        id: `${prefix}-branch`,
        name: `${prefix}-branch`,
        parentId: `${prefix}-root`,
      },
    });
    await db.category.update({
      where: { id: prefix },
      data: { parentId: `${prefix}-branch` },
    });
    const result = await catalog({
      q: prefix,
      category: `${prefix}-root`,
      sort: 'price_asc',
    });
    expect(result.total).toBe(3);
    expect(result.products.map((p) => p.listings[0].paymentPrice)).toEqual([
      500,
      1000,
      null,
    ]);
    expect((await catalog({ category: `${prefix}-missing` })).total).toBe(0);
  });
  it('creates watch and keyword notifications once', async () => {
    const listing = await db.listing.findUniqueOrThrow({
      where: { storeId_externalId: { storeId: prefix, externalId: prefix } },
    });
    await db.watchlist.create({
      data: {
        productId: listing.productId,
        targetPrice: 900,
        notifyDeal: false,
      },
    });
    await db.keywordWatch.create({
      data: { include: prefix, exclude: 'cable' },
    });
    const now = new Date(Date.now() + 1000);
    await ingest({ ...row, price: 800 }, prefix, now);
    await ingest({ ...row, price: 800 }, prefix, new Date(+now + 1000));
    expect(
      await db.notification.count({
        where: { href: `/products/${listing.productId}` },
      }),
    ).toBe(2);
  });
  it('expires deals and records unsupported source failures', async () => {
    const l = await db.listing.findUniqueOrThrow({
      where: { storeId_externalId: { storeId: prefix, externalId: prefix } },
    });
    await db.deal.updateMany({
      where: { listingId: l.id },
      data: { endAt: new Date(0) },
    });
    await maintenance();
    expect(
      await db.deal.count({ where: { listingId: l.id, active: true } }),
    ).toBe(0);
    const job = await db.jobRun.create({ data: { sourceId: prefix } });
    await runNextJob();
    const result = await db.jobRun.findUniqueOrThrow({ where: { id: job.id } });
    expect(result.status).toBe('error');
    expect(result.failed).toBe(1);
  });
});
