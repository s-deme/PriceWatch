import { test, expect } from '@playwright/test';
import { db } from '../../src/lib/db';
const name = `E2E-import-${Date.now()}`;
test.afterAll(async () => {
  const products = await db.product.findMany({ where: { manufacturer: name } });
  await db.listing.deleteMany({
    where: { productId: { in: products.map((p) => p.id) } },
  });
  await db.product.deleteMany({ where: { manufacturer: name } });
  await db.$disconnect();
});
test('manual import previews, persists and rejects invalid input', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('管理パスワード').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'ログイン中です' }),
  ).toBeVisible();
  await page.goto('/admin/import');
  const input = page.getByLabel('商品データ（JSON配列・最大100件）');
  await input.fill(
    JSON.stringify([
      {
        name,
        manufacturer: name,
        categoryId: 'IEM',
        storeId: 'amazon',
        externalId: name,
        url: `https://www.amazon.co.jp/?item=${name}`,
        price: 4980,
        regularPrice: 6980,
        shippingPrice: 0,
      },
    ]),
  );
  await expect(
    page.getByRole('button', { name: '投入する', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '事前検証' }).click();
  await expect(page.getByRole('status')).toContainText('1件の形式');
  await page.getByRole('button', { name: '投入する', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1件を保存、0件失敗');
  await page.goto(`/products?q=${name}`);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.locator('.product-card h3 a').click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto('/admin/import');
  await page
    .getByLabel('商品データ（JSON配列・最大100件）')
    .fill('[{"price":-1}]');
  await page.getByRole('button', { name: '事前検証' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '投入する', exact: true }),
  ).toBeDisabled();
});
