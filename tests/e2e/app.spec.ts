import { test, expect } from '@playwright/test';
test('dashboard, search, filters and detail work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /本当に安い/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: false });
  await page.getByRole('textbox', { name: '商品を検索' }).fill('MOONDROP');
  await page.getByRole('button', { name: /検索する/ }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.locator('.product-card h3 a').click();
  await expect(
    page.getByRole('heading', { name: 'MOONDROP LAN', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '7日', exact: true }).click();
  await expect(page.getByRole('img', { name: /価格履歴/ })).toBeVisible();
  await page.getByRole('button', { name: '全期間' }).click();
  await expect(page.getByText('ショップ価格を比較')).toBeVisible();
});
test('all filter inputs and sort options submit and persist', async ({
  page,
}) => {
  await page.goto('/products');
  await page.getByLabel('カテゴリ', { exact: true }).selectOption('SSD');
  await page.getByLabel('メーカー', { exact: true }).selectOption('Samsung');
  await page.getByLabel('ショップ', { exact: true }).selectOption('amazon');
  await page.getByLabel('下限（円）').fill('1');
  await page.getByLabel('上限（円）').fill('100000');
  await page.getByLabel('割引率（%以上）').fill('0');
  await page.getByLabel('Deal Score（以上）').fill('0');
  await page.getByLabel('在庫あり', { exact: true }).check();
  await page.getByLabel('送料無料', { exact: true }).check();
  await page.getByLabel('過去最安のみ').check();
  for (const sort of [
    'recommended',
    'new',
    'price_asc',
    'price_desc',
    'discount',
    'score',
    'ending',
  ]) {
    await page.getByLabel('並び順').selectOption(sort);
    await page.getByRole('button', { name: '条件を適用' }).click();
    await expect(page).toHaveURL(new RegExp(`sort=${sort}`));
    await expect(page.getByLabel('カテゴリ', { exact: true })).toHaveValue(
      'SSD',
    );
  }
  await page.getByRole('link', { name: 'リセット', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(12);
});
test('authentication, watchlist and B features persist', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/login/);
  await page.getByLabel('管理パスワード').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'ログイン中です' }),
  ).toBeVisible();
  await page.goto('/products/demo-1');
  await page.getByLabel('目標支払価格（円）').fill('5000');
  await page
    .getByRole('button', { name: /お気に入りに登録|監視条件を保存/ })
    .click();
  await expect(page.getByText('保存しました', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('目標支払価格（円）')).toHaveValue('5000');
  await page.goto('/watchlist');
  await expect(page.locator('.product-card')).not.toHaveCount(0);
  await page.getByLabel('含むキーワード（カンマ区切り）').fill('E2E-SSD');
  await page.getByLabel('除外キーワード（カンマ区切り）').fill('cable');
  await page.getByRole('button', { name: 'キーワードを登録' }).click();
  await expect(page.locator('.keyword-list')).toContainText('E2E-SSD');
  await page
    .locator('.keyword-list>div')
    .filter({ hasText: 'E2E-SSD' })
    .getByRole('button', { name: '削除' })
    .click();
  await page.goto('/coupons');
  await expect(page.locator('.coupon')).toHaveCount(4);
  await page.goto('/events');
  await page.locator('.event-card').first().click();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await page.goto('/admin/products');
  await expect(
    page.getByRole('heading', { name: 'products', exact: true }),
  ).toBeVisible();
});
test('mobile layout fits screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.product-card').first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
