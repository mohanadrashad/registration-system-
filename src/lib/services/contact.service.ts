import { prisma } from "@/lib/prisma";
import { Contact, ContactStatus, Prisma } from "@prisma/client";

export const contactService = {
  async findByEventId(
    eventId: string,
    options?: {
      status?: ContactStatus;
      category?: string;
      search?: string;
      skip?: number;
      take?: number;
    }
  ) {
    const where: Prisma.ContactWhereInput = { eventId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.search) {
      where.OR = [
        { firstName: { contains: options.search, mode: "insensitive" } },
        { lastName: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { organization: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          registration: true,
        },
        orderBy: { createdAt: "desc" },
        skip: options?.skip,
        take: options?.take,
      }),
      prisma.contact.count({ where }),
    ]);

    return { contacts, total };
  },

  async findById(id: string) {
    return prisma.contact.findUnique({
      where: { id },
      include: {
        registration: true,
        emailLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
  },

  async findByEmail(eventId: string, email: string) {
    return prisma.contact.findUnique({
      where: {
        eventId_email: { eventId, email },
      },
    });
  },

  async create(data: Prisma.ContactCreateInput) {
    return prisma.contact.create({ data });
  },

  async createMany(data: Prisma.ContactCreateManyInput[]) {
    return prisma.contact.createMany({
      data,
      skipDuplicates: true,
    });
  },

  async update(id: string, data: Prisma.ContactUpdateInput) {
    return prisma.contact.update({ where: { id }, data });
  },

  async updateStatus(id: string, status: ContactStatus) {
    return prisma.contact.update({
      where: { id },
      data: { status },
    });
  },

  async delete(id: string) {
    return prisma.contact.delete({ where: { id } });
  },

  async deleteMany(ids: string[]) {
    return prisma.contact.deleteMany({
      where: { id: { in: ids } },
    });
  },

  /**
   * Canonical category list for an event. The source of truth is
   * `Event.categories` (not whatever happens to be on Contact rows),
   * returned in the admin-defined order, each with its live row count
   * joined from a single groupBy. A trailing `{ category: null }` entry
   * is the "Uncategorized" bucket: contacts with no category, plus any
   * stray value not in `Event.categories` (which shouldn't exist once
   * enforcement is on, but is folded in defensively rather than shown
   * as a rogue tab).
   */
  async getCategories(
    eventId: string
  ): Promise<{ category: string | null; count: number }[]> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { categories: true },
    });
    const defined = event?.categories ?? [];

    const grouped = await prisma.contact.groupBy({
      by: ["category"],
      where: { eventId },
      _count: true,
    });
    const countByCategory = new Map<string | null, number>();
    for (const g of grouped) countByCategory.set(g.category, g._count);

    const definedSet = new Set(defined);
    const list: { category: string | null; count: number }[] = defined.map(
      (category) => ({
        category,
        count: countByCategory.get(category) ?? 0,
      })
    );

    let uncategorized = countByCategory.get(null) ?? 0;
    for (const [category, count] of countByCategory) {
      if (category !== null && !definedSet.has(category)) {
        uncategorized += count;
      }
    }
    list.push({ category: null, count: uncategorized });

    return list;
  },

  async getStatusCounts(eventId: string) {
    const result = await prisma.contact.groupBy({
      by: ["status"],
      where: { eventId },
      _count: true,
    });

    return result.reduce(
      (acc, r) => ({ ...acc, [r.status]: r._count }),
      {} as Record<ContactStatus, number>
    );
  },
};
