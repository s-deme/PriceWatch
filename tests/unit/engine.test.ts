import { describe, it, expect } from 'vitest';
import {
  calculatePrice,
  couponValue,
  discountRate,
  averagePrice,
  historicalMinimum,
  dealScore,
  shouldRecord,
  DAY,
} from '../../src/lib/price';
import {
  normalize,
  normalizeUrl,
  matchProduct,
  keywordMatches,
} from '../../src/lib/normalize';
const now = new Date('2026-10-05T00:00:00Z');
describe('money and coupons', () => {
  it('separates cash and points and unknown shipping', () => {
    expect(
      calculatePrice({
        price: 12800,
        shippingPrice: 0,
        couponDiscount: 1500,
        points: 1200,
      }),
    ).toEqual({ paymentPrice: 11300, effectivePrice: 10100 });
    expect(calculatePrice({ price: 100, shippingPrice: null })).toEqual({
      paymentPrice: null,
      effectivePrice: null,
    });
    expect(() => calculatePrice({ price: 1.5, shippingPrice: 0 })).toThrow();
    expect(() => calculatePrice({ price: -1, shippingPrice: 0 })).toThrow();
  });
  it('enforces coupon thresholds and expiration without stacking', () => {
    const c = {
      discountType: 'percent',
      discountValue: 15,
      minimumPurchase: 1000,
      startAt: new Date(+now - DAY),
      endAt: new Date(+now + DAY),
    };
    expect(couponValue(999, c, now)).toBe(0);
    expect(couponValue(1001, c, now)).toBe(150);
    expect(couponValue(1001, c, c.endAt)).toBe(0);
    expect(discountRate(10100, 12800)).toBe(21);
    expect(discountRate(100, null)).toBe(0);
    expect(discountRate(120, 100)).toBe(0);
  });
});
describe('history and scoring', () => {
  const h = (days: number, price: number | null) => ({
    recordedAt: new Date(+now - days * DAY),
    paymentPrice: price,
    currency: 'JPY',
    stockStatus: 'in_stock',
  });
  it('time weights irregular observations and exposes gaps', () => {
    expect(averagePrice([h(2, 100), h(1, 200)], 2, now)).toEqual({
      value: 150,
      coverage: 100,
    });
    expect(averagePrice([h(5, 100)], 5, now)).toEqual({
      value: 100,
      coverage: 40,
    });
    expect(
      averagePrice([{ ...h(1, 1), currency: 'USD' }], 1, now).value,
    ).toBeNull();
  });
  it('does not consider first/current observation a historical low', () => {
    expect(historicalMinimum([h(0, 50)], now)).toBeNull();
    expect(historicalMinimum([h(1, 100), h(0, 50)], now)).toBe(100);
  });
  it('scores only supported reasons and caps at 100', () => {
    expect(
      dealScore({
        paymentPrice: 50,
        average90: 100,
        historicalLow: 60,
        regularPrice: 100,
        otherPrice: 80,
        shippingPrice: 0,
      }).score,
    ).toBe(100);
    expect(
      dealScore({
        paymentPrice: null,
        average90: 100,
        historicalLow: 60,
        regularPrice: 100,
        otherPrice: 80,
        shippingPrice: null,
      }).score,
    ).toBe(0);
    expect(
      dealScore({
        paymentPrice: 100,
        average90: null,
        historicalLow: null,
        regularPrice: null,
        otherPrice: null,
        shippingPrice: 0,
      }).missing,
    ).toContain('過去価格');
  });
  it('records changes or a first observation on each JST day', () => {
    const p = {
      ...h(1, 100),
      price: 100,
      shippingPrice: 0,
      points: 0,
      couponDiscount: 0,
    };
    expect(
      shouldRecord(p, { ...p, recordedAt: new Date(+p.recordedAt + 1000) }),
    ).toBe(false);
    expect(shouldRecord(p, { ...p, points: 10 })).toBe(true);
    expect(shouldRecord(p, { ...p, recordedAt: now })).toBe(true);
  });
});
describe('matching and URLs', () => {
  it('retains identity parameters and rejects non-public URLs', () => {
    expect(
      normalizeUrl('https://shop.example.com/p?utm_source=x&sku=2&tag=y#top'),
    ).toBe('https://shop.example.com/p?sku=2&tag=y');
    expect(normalizeUrl('https://www.amazon.co.jp/p?sku=2&tag=y')).toBe(
      'https://www.amazon.co.jp/p?sku=2',
    );
    for (const url of [
      'file:///etc/passwd',
      'http://127.0.0.1/a',
      'http://localhost/',
      'http://[::1]/',
      'https://user:pass@example.com',
    ])
      expect(() => normalizeUrl(url)).toThrow();
  });
  it('matches strongest identity but blocks conflicts and ambiguity', () => {
    const p = {
      id: 'a',
      name: 'SONY WH-1000',
      manufacturer: 'Sony',
      modelNumber: 'WH1000',
      janCode: '123',
    };
    expect(matchProduct({ ...p, name: 'different' }, [p])).toEqual({
      kind: 'matched',
      id: 'a',
    });
    expect(matchProduct({ ...p, janCode: '456' }, [p])).toEqual({
      kind: 'ambiguous',
    });
    expect(matchProduct(p, [p, { ...p, id: 'b' }])).toEqual({
      kind: 'ambiguous',
    });
    expect(normalize('ＳＯＮＹ WH-1000')).toBe('sonywh1000');
  });
  it('exclusion takes priority and supports any include term', () => {
    expect(keywordMatches('ＳＳＤ 2TB', 'IEM,SSD', '')).toBe(true);
    expect(keywordMatches('MOONDROP ケーブル', 'MOONDROP', 'ケーブル')).toBe(
      false,
    );
  });
});
