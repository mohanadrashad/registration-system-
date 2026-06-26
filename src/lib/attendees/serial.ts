import { Prisma } from "@prisma/client";

/**
 * Allocate the next per-event `Contact.serialNumber` (1, 2, 3, … within an
 * event). MUST be called inside a transaction: it takes a `SELECT … FOR
 * UPDATE` lock on the Event row so two concurrent contact creations for the
 * same event can't read the same max and collide on the
 * `@@unique([eventId, serialNumber])` constraint. This is the same
 * event-row-lock pattern used for capacity decisions (approvalService).
 *
 * The public registration transaction already holds this lock, so calling
 * here is a cheap no-op re-lock; the Add and Import paths rely on it to
 * serialize.
 */
export async function allocateContactSerial(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
  const agg = await tx.contact.aggregate({
    where: { eventId },
    _max: { serialNumber: true },
  });
  return (agg._max.serialNumber ?? 0) + 1;
}
