import type { Listing } from '@prisma/client';
import { z } from 'zod';
import { normalizeUrl } from '../lib/normalize';
const money = z.number().int().min(0).max(1_000_000_000);
export const sourceProductSchema = z.object({
  name: z.string().min(1).max(200),
  manufacturer: z.string().min(1).max(100),
  modelNumber: z.string().max(100).nullable().optional(),
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
  categoryId: z.string().min(1),
  storeId: z.string().min(1),
  externalId: z.string().max(200).nullable().optional(),
  url: z.string().max(2000).transform(normalizeUrl),
  price: money,
  regularPrice: money.nullable().default(null),
  shippingPrice: money.nullable().default(null),
  points: money.default(0),
  currency: z.literal('JPY').default('JPY'),
  stockStatus: z
    .enum(['in_stock', 'out_of_stock', 'unknown'])
    .default('in_stock'),
  couponId: z.string().optional(),
  endAt: z.iso.datetime().optional(),
  eventId: z.string().optional(),
});
export type SourceProduct = z.infer<typeof sourceProductSchema>;
export type PriceResult = Pick<
  SourceProduct,
  'price' | 'shippingPrice' | 'points' | 'currency' | 'stockStatus'
>;
export interface PriceSource {
  id: string;
  name: string;
  searchProducts(query: string): Promise<SourceProduct[]>;
  fetchProduct(url: string): Promise<SourceProduct>;
  fetchPrice(listing: Listing): Promise<PriceResult>;
}
export class ManualSource implements PriceSource {
  id = 'manual';
  name = '手動登録';
  constructor(private products: SourceProduct[] = []) {}
  async searchProducts(query: string) {
    return this.products.filter((p) => p.name.includes(query));
  }
  async fetchProduct(url: string) {
    const product = this.products.find((p) => p.url === normalizeUrl(url));
    if (!product) throw new Error('手動データに商品がありません');
    return product;
  }
  async fetchPrice(listing: Listing): Promise<PriceResult> {
    const p = await this.fetchProduct(listing.url);
    return p;
  }
}
export class MockSource extends ManualSource {
  id = 'mock';
  name = 'デモ価格';
  async fetchPrice(listing: Listing): Promise<PriceResult> {
    return {
      price: listing.currentPrice,
      shippingPrice: listing.shippingPrice,
      points: listing.points,
      currency: 'JPY',
      stockStatus: listing.stockStatus as PriceResult['stockStatus'],
    };
  }
}
