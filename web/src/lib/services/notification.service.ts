import type { Prisma } from "../../generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

export interface InAppNotificationInput {
  userId: string;
  category: string;
  title: string;
  content: string;
  actionPath?: string | null;
}

export async function createInAppNotification(tx: TransactionClient, input: InAppNotificationInput): Promise<void> {
  await tx.notification.create({
    data: {
      userId: input.userId,
      category: input.category,
      title: input.title,
      content: input.content,
      actionPath: input.actionPath ?? null,
      status: "UNREAD",
    },
    select: { id: true },
  });
}
