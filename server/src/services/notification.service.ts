import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";

export async function listNotifications(
  userId: string,
  opts: { page: number; limit: number; unreadOnly?: boolean },
) {
  const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread };
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string) {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound("Notification not found.");
  if (!existing.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
  return { id, readAt: existing.readAt ?? new Date() };
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

export async function remove(userId: string, id: string) {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) throw ApiError.notFound("Notification not found.");
  await prisma.notification.delete({ where: { id } });
  return { id };
}
