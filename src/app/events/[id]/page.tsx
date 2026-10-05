import { notFound } from 'next/navigation';
import { db } from '../../../lib/db';
import { productInclude } from '../../../services/catalog';
import { ProductGrid } from '../../../components/catalog';
import { dateTime } from '../../../lib/format';
export default async function Event({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const event = await db.saleEvent.findUnique({
    where: { id: (await params).id },
  });
  if (!event) notFound();
  const products = await db.product.findMany({
    where: { listings: { some: { deals: { some: { eventId: event.id } } } } },
    include: productInclude,
  });
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow accent">SALE EVENT</p>
        <h1>{event.name}</h1>
        <p>{event.description}</p>
        <p>
          {dateTime(event.startAt)}〜{dateTime(event.endAt)}
        </p>
      </div>
      <ProductGrid products={products} />
    </>
  );
}
