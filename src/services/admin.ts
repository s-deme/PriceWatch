import { z } from 'zod';
import { db } from '../lib/db';
import { normalize, normalizeUrl } from '../lib/normalize';
const text = z.string().min(1).max(200);
const amount = z.number().int().min(0).max(1_000_000_000);
const date = z.coerce.date();
const product = z.object({
  id: text.optional(),
  name: text,
  manufacturer: text,
  modelNumber: z.string().nullable().optional(),
  janCode: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable()
    .optional(),
  upc: z
    .string()
    .regex(/^\d{12}$/)
    .nullable()
    .optional(),
  categoryId: text,
  description: z.string().max(5000).default(''),
});
const store = z.object({
  id: text.optional(),
  name: text,
  domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
  currency: z.literal('JPY').default('JPY'),
  country: text.default('JP'),
  active: z.boolean().default(true),
});
const category = z.object({
  id: text.optional(),
  name: text,
  parentId: z.string().nullable().default(null),
});
const source = z.object({
  id: text,
  name: text,
  kind: z.enum(['mock', 'manual']),
  trust: z.number().int().min(0).max(100),
  active: z.boolean(),
});
const coupon = z
  .object({
    id: text.optional(),
    storeId: text,
    code: text,
    title: text,
    discountType: z.enum(['fixed', 'percent']),
    discountValue: amount,
    minimumPurchase: amount,
    startAt: date,
    endAt: date,
    url: z.string().transform(normalizeUrl),
    description: z.string().max(5000).default(''),
  })
  .refine((v) => v.endAt > v.startAt, '終了は開始より後にしてください')
  .refine(
    (v) => v.discountType !== 'percent' || v.discountValue <= 100,
    '率は100以下です',
  );
const event = z
  .object({
    id: text.optional(),
    name: text,
    description: z.string().max(5000).default(''),
    startAt: date,
    endAt: date,
  })
  .refine((v) => v.endAt > v.startAt, '終了は開始より後にしてください');
export const resources = [
  'products',
  'listings',
  'stores',
  'categories',
  'sources',
  'deals',
  'coupons',
  'events',
  'import',
  'jobs',
] as const;
export type Resource = (typeof resources)[number];
export async function saveAdmin(resource: string, raw: unknown) {
  switch (resource) {
    case 'products': {
      const v = product.parse(raw);
      const { id, ...data } = v;
      const normalizedName = normalize(v.name);
      return id
        ? db.product.update({
            where: { id },
            data: { ...data, normalizedName },
          })
        : db.product.create({ data: { ...data, normalizedName } });
    }
    case 'stores': {
      const { id, ...data } = store.parse(raw);
      return id
        ? db.store.update({ where: { id }, data })
        : db.store.create({ data });
    }
    case 'categories': {
      const { id, ...data } = category.parse(raw);
      let parent = data.parentId;
      const seen = new Set<string>(id ? [id] : []);
      while (parent) {
        if (seen.has(parent))
          throw new Error('カテゴリを循環させることはできません');
        seen.add(parent);
        parent = (
          await db.category.findUniqueOrThrow({ where: { id: parent } })
        ).parentId;
      }
      return id
        ? db.category.update({ where: { id }, data })
        : db.category.create({ data });
    }
    case 'sources': {
      const v = source.parse(raw);
      if (!['manual', 'mock'].includes(v.id) || v.id !== v.kind)
        throw new Error('MVPの取得元はmanual/mockのみです');
      return db.source.update({ where: { id: v.id }, data: v });
    }
    case 'coupons': {
      const { id, ...data } = coupon.parse(raw);
      return id
        ? db.coupon.update({ where: { id }, data })
        : db.coupon.create({ data });
    }
    case 'events': {
      const { id, ...data } = event.parse(raw);
      return id
        ? db.saleEvent.update({ where: { id }, data })
        : db.saleEvent.create({ data });
    }
    case 'listings': {
      const v = z.object({ id: text, active: z.boolean() }).parse(raw);
      return db.listing.update({
        where: { id: v.id },
        data: { active: v.active },
      });
    }
    case 'deals': {
      const v = z
        .object({
          id: text,
          active: z.boolean(),
          endAt: date.nullable(),
          eventId: z.string().nullable(),
        })
        .parse(raw);
      return db.deal.update({ where: { id: v.id }, data: v });
    }
    default:
      throw new Error('未対応の管理項目です');
  }
}
export async function adminRows(resource: Resource, page = 1) {
  const args = { take: 25, skip: (page - 1) * 25 };
  switch (resource) {
    case 'products':
      return db.product.findMany({ ...args, orderBy: { id: 'asc' } });
    case 'listings':
      return db.listing.findMany({ ...args, orderBy: { id: 'asc' } });
    case 'stores':
      return db.store.findMany({ ...args, orderBy: { id: 'asc' } });
    case 'categories':
      return db.category.findMany({ ...args, orderBy: { id: 'asc' } });
    case 'sources':
      return db.source.findMany({
        ...args,
        orderBy: { id: 'asc' },
        include: { jobs: { take: 1, orderBy: { createdAt: 'desc' } } },
      });
    case 'deals':
      return db.deal.findMany({ ...args, orderBy: { startAt: 'desc' } });
    case 'coupons':
      return db.coupon.findMany({ ...args, orderBy: { id: 'asc' } });
    case 'events':
      return db.saleEvent.findMany({ ...args, orderBy: { startAt: 'desc' } });
    case 'jobs':
      return db.jobRun.findMany({ ...args, orderBy: { createdAt: 'desc' } });
    default:
      return [];
  }
}
export const templates: Record<string, unknown> = {
  products: {
    name: '商品名',
    manufacturer: 'メーカー',
    modelNumber: '型番',
    categoryId: 'IEM',
  },
  stores: {
    name: 'ショップ名',
    domain: 'shop.example.com',
    currency: 'JPY',
    active: true,
  },
  categories: { name: '新規カテゴリ', parentId: null },
  coupons: {
    storeId: 'amazon',
    code: 'CODE',
    title: 'クーポン名',
    discountType: 'fixed',
    discountValue: 500,
    minimumPurchase: 5000,
    startAt: '2026-10-01T00:00:00Z',
    endAt: '2026-12-01T00:00:00Z',
    url: 'https://www.amazon.co.jp',
  },
  events: {
    name: 'イベント名',
    description: '',
    startAt: '2026-10-01T00:00:00Z',
    endAt: '2026-12-01T00:00:00Z',
  },
};
