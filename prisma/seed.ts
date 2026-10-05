import { PrismaClient } from '@prisma/client';
import { normalize } from '../src/lib/normalize';
import { calculatePrice, DAY } from '../src/lib/price';
import { ingest } from '../src/services/ingest';
const db = new PrismaClient();
const names = [
  ['MOONDROP LAN', 'MOONDROP', 'IEM', 6980],
  ['TRN Conch', 'TRN', 'IEM', 6800],
  ['7Hz ZERO 2', '7Hz', 'IEM', 3980],
  ['SONY IER-M7', 'SONY', 'IEM', 79800],
  ['Sennheiser IE 200', 'Sennheiser', 'IEM', 23800],
  ['Kiwi Ears Cadenza', 'Kiwi Ears', 'IEM', 5980],
  ['Samsung 990 PRO 2TB', 'Samsung', 'SSD', 26800],
  ['WD Black SN850X 2TB', 'Western Digital', 'SSD', 24800],
  ['Crucial T500 2TB', 'Crucial', 'SSD', 22800],
  ['KIOXIA EXCERIA 1TB', 'KIOXIA', 'SSD', 10800],
  ['Solidigm P44 Pro 2TB', 'Solidigm', 'SSD', 25800],
  ['Samsung 870 EVO 1TB', 'Samsung', 'SSD', 13800],
  ['GeForce RTX 5070', 'NVIDIA', 'GPU', 99800],
  ['Radeon RX 9070', 'AMD', 'GPU', 108000],
  ['GeForce RTX 5060', 'NVIDIA', 'GPU', 54800],
  ['Intel Arc B580', 'Intel', 'GPU', 39800],
  ['Radeon RX 9060 XT', 'AMD', 'GPU', 59800],
  ['GeForce RTX 5080', 'NVIDIA', 'GPU', 198000],
  ['Pixel 9a', 'Google', 'Smartphone', 79900],
  ['Xperia 10 VI', 'SONY', 'Smartphone', 69800],
  ['Galaxy S25', 'Samsung', 'Smartphone', 129000],
  ['Nothing Phone (3a)', 'Nothing', 'Smartphone', 59800],
  ['AQUOS sense9', 'SHARP', 'Smartphone', 64900],
  ['motorola edge 50', 'Motorola', 'Smartphone', 54800],
  ['DualSense コントローラー', 'SONY', 'Game', 11480],
  ['Xbox ワイヤレス コントローラー', 'Microsoft', 'Game', 7670],
  ['8BitDo Ultimate', '8BitDo', 'Game', 6980],
  ['Steam Deck OLED ケース', 'Valve', 'Game', 5980],
  ['Logicool G PRO X', 'Logicool', 'Game', 22800],
  ['Razer DeathAdder V3', 'Razer', 'Game', 19800],
] as const;
async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await db.source.upsert({
    where: { id: 'mock' },
    create: {
      id: 'mock',
      name: 'デモ価格（架空データ）',
      kind: 'mock',
      trust: 0,
    },
    update: {},
  });
  await db.source.upsert({
    where: { id: 'manual' },
    create: { id: 'manual', name: '手動登録', kind: 'manual', trust: 50 },
    update: {},
  });
  for (const name of [
    'オーディオ',
    'PC',
    'IEM',
    'SSD',
    'GPU',
    'Smartphone',
    'Game',
  ])
    await db.category.upsert({
      where: { id: name },
      create: {
        id: name,
        name,
        parentId:
          name === 'IEM'
            ? 'オーディオ'
            : ['SSD', 'GPU'].includes(name)
              ? 'PC'
              : null,
      },
      update: {},
    });
  const stores = [
    ['amazon', 'Amazon', 'www.amazon.co.jp'],
    ['rakuten', '楽天市場', 'www.rakuten.co.jp'],
    ['yahoo', 'Yahoo!ショッピング', 'shopping.yahoo.co.jp'],
    ['aliexpress', 'AliExpress', 'www.aliexpress.com'],
  ];
  for (const [id, name, domain] of stores)
    await db.store.upsert({
      where: { id },
      create: { id, name, domain },
      update: {},
    });
  await db.saleEvent.upsert({
    where: { id: 'demo-event' },
    create: {
      id: 'demo-event',
      name: '秋のプライスチェック',
      description:
        '動作確認用の架空セールイベントです。実店舗の開催情報ではありません。',
      startAt: new Date(+today - 7 * DAY),
      endAt: new Date(+today + 7 * DAY),
    },
    update: {},
  });
  for (const [
    index,
    [name, manufacturer, categoryId, regularPrice],
  ] of names.entries()) {
    const productId = `demo-${index + 1}`;
    await db.product.upsert({
      where: { id: productId },
      create: {
        id: productId,
        name,
        normalizedName: normalize(name),
        manufacturer,
        modelNumber: `PW-${index + 1}`,
        janCode: `49000000${String(index + 1).padStart(5, '0')}`,
        categoryId,
        description:
          '価格比較の動作確認に使用する架空のサンプルデータです。実際の販売価格・在庫・仕様を示すものではありません。',
        imageUrl: `/products/${categoryId.toLowerCase()}.svg`,
      },
      update: {},
    });
    for (let shop = 0; shop < 3; shop++) {
      const store = stores[(index + shop) % stores.length];
      const id = `${productId}-${store[0]}`;
      const base = Math.round(regularPrice * (0.69 + shop * 0.08));
      const existing = await db.listing.findUnique({ where: { id } });
      if (existing?.lastCheckedAt) continue;
      if (!existing)
        await db.listing.create({
          data: {
            id,
            productId,
            storeId: store[0],
            sourceId: 'mock',
            externalId: productId,
            title: name,
            url: `https://${store[2]}/?pricewatch_demo=${productId}`,
            currentPrice: Math.round(base * 1.12),
            paymentPrice: Math.round(base * 1.12) + (shop === 2 ? 500 : 0),
            regularPrice,
            shippingPrice: shop === 2 ? 500 : 0,
            currency: 'JPY',
          },
        });
      const histories = Array.from({ length: 100 }, (_, day) => {
        const price = Math.round(
          base *
            (1.12 + Math.sin((day + index) / 8) * 0.07 + (day < 30 ? 0.08 : 0)),
        );
        const shippingPrice = shop === 2 ? 500 : 0;
        return {
          listingId: id,
          sourceId: 'mock',
          price,
          shippingPrice,
          points: 0,
          couponDiscount: 0,
          ...calculatePrice({ price, shippingPrice }),
          currency: 'JPY',
          stockStatus: 'in_stock',
          recordedAt: new Date(+today - (100 - day) * DAY),
        };
      });
      await db.priceHistory.createMany({
        data: histories,
        skipDuplicates: true,
      });
      const price = index % 4 === 0 ? Math.round(base * 1.2) : base;
      await ingest(
        {
          name,
          manufacturer,
          modelNumber: `PW-${index + 1}`,
          janCode: `49000000${String(index + 1).padStart(5, '0')}`,
          categoryId,
          storeId: store[0],
          externalId: productId,
          url: `https://${store[2]}/?pricewatch_demo=${productId}`,
          price,
          regularPrice,
          shippingPrice: shop === 2 ? 500 : 0,
          points: shop === 1 ? Math.floor(price * 0.03) : 0,
          currency: 'JPY',
          stockStatus: index === 29 ? 'out_of_stock' : 'in_stock',
          endAt: new Date(+today + ((index % 5) + 1) * DAY).toISOString(),
          eventId: 'demo-event',
        },
        'mock',
        new Date(+today + 1),
      );
    }
  }
  for (const [id, name, domain] of stores)
    await db.coupon.upsert({
      where: { storeId_code: { storeId: id, code: 'DEMO500' } },
      create: {
        storeId: id,
        code: 'DEMO500',
        title: `${name} サンプルクーポン`,
        discountType: 'fixed',
        discountValue: 500,
        minimumPurchase: 5000,
        startAt: new Date(+today - DAY),
        endAt: new Date(+today + 14 * DAY),
        url: `https://${domain}`,
        description: '架空のコードです。実際のお買い物には利用できません。',
      },
      update: {},
    });
  console.info(
    'Seed: 30 products, 90 listings, 100 days of history. Existing records preserved.',
  );
}
main().finally(() => db.$disconnect());
