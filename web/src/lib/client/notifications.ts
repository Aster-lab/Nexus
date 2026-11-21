import { apiGet, apiPatch, type ApiPagination, type ApiSuccessEnvelope } from "./api-client";

export interface UserNotification {
  id: string;
  category: string;
  title: string;
  content: string;
  actionPath: string | null;
  status: "UNREAD" | "READ";
  createdAt: string;
}

export interface NotificationListResponse {
  items: UserNotification[];
  unreadCount: number;
  pagination: ApiPagination;
}

export function getNotificationsPath(options: { status?: "UNREAD" | "READ"; page?: number; limit?: number } = {}): string {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.page !== undefined) query.set("page", String(options.page));
  query.set("limit", String(options.limit ?? 20));
  return `/api/notifications?${query.toString()}`;
}

export function listNotifications(fetcher: typeof apiGet = apiGet) {
  return fetcher<NotificationListResponse>(getNotificationsPath());
}

export function markNotificationRead(notificationId: string, fetcher: typeof apiPatch = apiPatch) {
  return fetcher<{ id: string; status: "READ"; createdAt: string }, Record<string, never>>(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`, {},
  );
}

export type NotificationEnvelope = ApiSuccessEnvelope<NotificationListResponse>;
