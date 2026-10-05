export const DAY = 86_400_000;
export const STALE_AFTER = DAY * 2;
export type MoneyInput = {
  price: number;
  shippingPrice: number | null;
  points?: number;
  couponDiscount?: number;
};
export function calculatePrice(input: MoneyInput) {
  for (const value of [
    input.price,
    input.shippingPrice,
    input.points ?? 0,
    input.couponDiscount ?? 0,
  ]) {
    if (
      value !== null &&
      (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
    )
      throw new Error('金額は0〜10億の整数で指定してください');
  }
  const discount = Math.min(input.price, input.couponDiscount ?? 0);
  const paymentPrice =
    input.shippingPrice === null
      ? null
      : input.price - discount + input.shippingPrice;
  return {
    paymentPrice,
    effectivePrice:
      paymentPrice === null
        ? null
        : Math.max(0, paymentPrice - (input.points ?? 0)),
  };
}
export function discountRate(price: number, regular: number | null) {
  return regular && regular > 0
    ? Math.max(0, Math.round(((regular - price) * 100) / regular))
    : 0;
}
export type CouponInput = {
  discountType: string;
  discountValue: number;
  minimumPurchase: number;
  startAt: Date;
  endAt: Date;
};
export function couponValue(price: number, coupon: CouponInput, now: Date) {
  if (
    now < coupon.startAt ||
    now >= coupon.endAt ||
    price < coupon.minimumPurchase
  )
    return 0;
  const value =
    coupon.discountType === 'percent'
      ? Number((BigInt(price) * BigInt(coupon.discountValue)) / 100n)
      : coupon.discountValue;
  return Math.min(price, value);
}
export type Observation = {
  recordedAt: Date;
  paymentPrice: number | null;
  currency: string;
  stockStatus: string;
};
export function averagePrice(
  history: Observation[],
  days: number,
  now: Date,
  currency = 'JPY',
) {
  const start = now.getTime() - days * DAY;
  const rows = history
    .filter((h) => h.currency === currency && h.recordedAt <= now)
    .sort((a, b) => +a.recordedAt - +b.recordedAt);
  let total = 0n;
  let duration = 0;
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i];
    if (h.paymentPrice === null || h.stockStatus !== 'in_stock') continue;
    const from = Math.max(start, +h.recordedAt);
    const to = Math.min(
      +now,
      rows[i + 1] ? +rows[i + 1].recordedAt : +now,
      +h.recordedAt + STALE_AFTER,
    );
    if (to > from) {
      total += BigInt(h.paymentPrice) * BigInt(to - from);
      duration += to - from;
    }
  }
  return {
    value: duration
      ? Number((total + BigInt(Math.floor(duration / 2))) / BigInt(duration))
      : null,
    coverage: Math.round((duration / (days * DAY)) * 100),
  };
}
export function historicalMinimum(
  history: Observation[],
  before: Date,
  currency = 'JPY',
) {
  const prices = history
    .filter(
      (h) =>
        h.currency === currency &&
        h.recordedAt < before &&
        h.paymentPrice !== null &&
        h.stockStatus === 'in_stock',
    )
    .map((h) => h.paymentPrice!);
  return prices.length ? Math.min(...prices) : null;
}
export function dealScore(input: {
  paymentPrice: number | null;
  average90: number | null;
  historicalLow: number | null;
  regularPrice: number | null;
  otherPrice: number | null;
  shippingPrice: number | null;
}) {
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;
  const p = input.paymentPrice;
  if (p === null)
    return {
      score: 0,
      reasons: ['送料不明のため評価保留'],
      missing: ['支払価格'],
    };
  if (input.average90 !== null && input.average90 > 0) {
    const rate = Math.max(0, (input.average90 - p) / input.average90);
    score += Math.min(40, Math.round(rate * 200));
    if (rate > 0) reasons.push(`90日平均より${Math.round(rate * 100)}%安い`);
  } else missing.push('90日平均');
  if (input.historicalLow !== null) {
    if (p <= input.historicalLow) {
      score += 30;
      reasons.push('記録開始以来の最安');
    }
  } else missing.push('過去価格');
  const discount = discountRate(p, input.regularPrice);
  score += Math.min(20, Math.round((discount * 2) / 3));
  if (discount) reasons.push(`通常価格比${discount}%引き`);
  if (input.otherPrice !== null && p < input.otherPrice) {
    score += 5;
    reasons.push('他ショップより安い');
  }
  if (input.shippingPrice === 0) {
    score += 5;
    reasons.push('送料無料');
  }
  return { score: Math.min(100, score), reasons, missing };
}
export function shouldRecord(
  previous:
    | (Observation & {
        price: number;
        shippingPrice: number | null;
        points: number;
        couponDiscount: number;
      })
    | null,
  next: Observation & {
    price: number;
    shippingPrice: number | null;
    points: number;
    couponDiscount: number;
  },
) {
  if (!previous) return true;
  const jstDay = (date: Date) =>
    new Date(+date + 9 * 3_600_000).toISOString().slice(0, 10);
  return (
    jstDay(previous.recordedAt) !== jstDay(next.recordedAt) ||
    (
      [
        'price',
        'shippingPrice',
        'points',
        'couponDiscount',
        'stockStatus',
        'currency',
      ] as const
    ).some((k) => previous[k] !== next[k])
  );
}
