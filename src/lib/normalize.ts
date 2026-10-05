export function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}
export function normalizeUrl(input: string) {
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('HTTP(S)の商品URLを指定してください');
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    !host.includes('.') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    host.startsWith('[')
  )
    throw new Error('公開ショップのURLを指定してください');
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (
      /^(utm_|fbclid$|gclid$)/i.test(key) ||
      (/(^|\.)amazon\.(co\.jp|com)$/.test(host) &&
        /^(tag|ref|ref_)$/i.test(key))
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
export type MatchProduct = {
  id: string;
  name: string;
  manufacturer: string;
  modelNumber?: string | null;
  janCode?: string | null;
  upc?: string | null;
};
export function matchProduct(
  input: Omit<MatchProduct, 'id'>,
  products: MatchProduct[],
) {
  const same = (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && normalize(a) === normalize(b);
  const conflict = (p: MatchProduct) =>
    (['janCode', 'upc'] as const).some(
      (k) => !!input[k] && !!p[k] && input[k] !== p[k],
    );
  const tiers = [
    (p: MatchProduct) => same(input.janCode, p.janCode),
    (p: MatchProduct) => same(input.upc, p.upc),
    (p: MatchProduct) =>
      same(input.manufacturer, p.manufacturer) &&
      same(input.modelNumber, p.modelNumber),
    (p: MatchProduct) =>
      same(input.manufacturer, p.manufacturer) && same(input.name, p.name),
  ];
  for (const tier of tiers) {
    const candidates = products.filter(tier);
    if (candidates.length)
      return candidates.length === 1 && !conflict(candidates[0])
        ? { kind: 'matched' as const, id: candidates[0].id }
        : { kind: 'ambiguous' as const };
  }
  return { kind: 'new' as const };
}
export function keywordMatches(text: string, include: string, exclude: string) {
  const words = (s: string) =>
    s
      .split(/[,、\n]/)
      .map(normalize)
      .filter(Boolean);
  const normalized = normalize(text);
  return (
    words(include).some((k) => normalized.includes(k)) &&
    !words(exclude).some((k) => normalized.includes(k))
  );
}
