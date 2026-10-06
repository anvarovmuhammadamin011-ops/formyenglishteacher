import { prisma } from "../lib/prisma";
import type { ActivityType, NotificationType, Prisma } from "@prisma/client";

export async function logActivity(
  userId: string,
  type: ActivityType,
  meta?: Prisma.InputJsonValue,
) {
  try {
    await prisma.activityLog.create({ data: { userId, type, meta } });
  } catch (err) {
    console.error("[activity] failed to write log:", (err as Error).message);
  }
}

/**
 * Updates the learning streak. Only meaningful activity should call this —
 * never a simple login.
 */
export async function recordMeaningfulActivity(userId: string, when = new Date()) {
  const dayStart = new Date(when.getFullYear(), when.getMonth(), when.getDate());
  const yesterday = new Date(dayStart.getTime() - 86_400_000);

  try {
    const existing = await prisma.learningStreak.findUnique({ where: { userId } });

    if (!existing) {
      await prisma.learningStreak.create({
        data: { userId, currentStreak: 1, longestStreak: 1, lastActivityOn: dayStart },
      });
      return 1;
    }

    if (existing.lastActivityOn && sameDay(existing.lastActivityOn, dayStart)) {
      return existing.currentStreak;
    }

    const continues = existing.lastActivityOn && sameDay(existing.lastActivityOn, yesterday);
    const currentStreak = continues ? existing.currentStreak + 1 : 1;
    const longestStreak = Math.max(existing.longestStreak, currentStreak);

    await prisma.learningStreak.update({
      where: { userId },
      data: { currentStreak, longestStreak, lastActivityOn: dayStart },
    });
    return currentStreak;
  } catch (err) {
    console.error("[streak] failed to update:", (err as Error).message);
    return 0;
  }
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export async function notify(
  userIds: string[],
  payload: { type: NotificationType; title: string; body?: string; link?: string },
) {
  if (!userIds.length) return;
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...payload })),
    });
  } catch (err) {
    console.error("[notification] failed:", (err as Error).message);
  }
}

export async function notifyTeachers(payload: {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  await notify(teachers.map((t) => t.id), payload);
}
