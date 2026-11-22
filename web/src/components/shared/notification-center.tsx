"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ExternalLink, RefreshCw } from "lucide-react";
import { ApiClientError } from "../../lib/client/api-client";
import { listNotifications, markNotificationRead, type UserNotification } from "../../lib/client/notifications";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "success"; items: UserNotification[]; unreadCount: number };

function loadErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.status === 401) return "Sign in again to view your notifications.";
  return error instanceof ApiClientError ? error.message : "Notifications could not be loaded. Check your connection and retry.";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function NotificationCenter({ roles }: { roles: string[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "UNREAD">("ALL");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (requestId: number) => {
    try {
      const result = await listNotifications();
      if (requestId === requestSequence.current) setState({ status: "success", items: result.data.items, unreadCount: result.data.unreadCount });
    } catch (error) {
      if (requestId === requestSequence.current) setState({ status: "error", message: loadErrorMessage(error) });
    }
  }, []);

  const refresh = useCallback(() => {
    const requestId = ++requestSequence.current;
    setState({ status: "loading" });
    void load(requestId);
  }, [load]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    void load(requestId);
    return () => {
      if (requestSequence.current === requestId) requestSequence.current += 1;
    };
  }, [load]);

  const visibleItems = useMemo(() => state.status !== "success" ? [] :
    (filter === "UNREAD" ? state.items.filter((item) => item.status === "UNREAD") : state.items), [filter, state]);

  async function markRead(notification: UserNotification) {
    if (notification.status === "READ" || markingId) return;
    setMarkingId(notification.id);
    setActionError(null);
    try {
      await markNotificationRead(notification.id);
      setState((current) => current.status !== "success" ? current : {
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((item) => item.id === notification.id ? { ...item, status: "READ" } : item),
      });
    } catch (error) {
      setActionError(loadErrorMessage(error));
    } finally {
      setMarkingId(null);
    }
  }

  const count = state.status === "success" && state.unreadCount > 0 ? state.unreadCount : null;

  return <div className="nexus-notification-center relative">
    <Button type="button" variant="ghost" size="icon" className="relative" aria-label={count ? `Notifications, ${count} unread` : "Notifications"} aria-expanded={open} aria-controls="nexus-notification-panel" onClick={() => setOpen((current) => !current)}>
      <Bell aria-hidden="true" className="size-5" />
      {count !== null ? <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{count > 99 ? "99+" : count}</span> : null}
    </Button>
    {open ? <section id="nexus-notification-panel" aria-label="Notifications" className="nexus-notification-panel fixed right-3 top-[5.25rem] z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div><h2 className="font-semibold">Notifications</h2><p className="mt-1 text-xs text-muted-foreground">Account updates and next steps</p></div>
        {count !== null ? <Badge variant="secondary">{count} unread</Badge> : null}
      </header>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex gap-1" aria-label="Filter notifications">
          <Button size="sm" variant={filter === "ALL" ? "secondary" : "ghost"} onClick={() => setFilter("ALL")}>All</Button>
          <Button size="sm" variant={filter === "UNREAD" ? "secondary" : "ghost"} onClick={() => setFilter("UNREAD")}>Unread</Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} aria-label="Refresh notifications"><RefreshCw className="size-4" /></Button>
      </div>
      <div className="max-h-[min(65vh,32rem)] overflow-y-auto p-2" aria-live="polite" aria-busy={state.status === "loading"}>
        {actionError ? <p className="m-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">{actionError}</p> : null}
        {state.status === "loading" ? <p className="p-5 text-center text-sm text-muted-foreground" role="status">Loading notifications…</p> : null}
        {state.status === "error" ? <div className="grid justify-items-start gap-3 p-4" role="alert"><p className="text-sm text-destructive">{state.message}</p><Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button></div> : null}
        {state.status === "success" && visibleItems.length === 0 ? <div className="p-6 text-center"><p className="font-medium">{filter === "UNREAD" ? "You’re all caught up" : "No notifications yet"}</p><p className="mt-1 text-sm text-muted-foreground">Updates will appear here when your account has something new.</p></div> : null}
        {state.status === "success" && visibleItems.length > 0 ? <ul className="grid gap-1">{visibleItems.map((notification) => {
          const destination = notification.actionPath && roles.some((role) => notification.actionPath?.startsWith(`/${role.toLowerCase()}/`) || notification.actionPath === `/${role.toLowerCase()}`) ? notification.actionPath : null;
          return <li key={notification.id} className={`rounded-lg border p-3 ${notification.status === "UNREAD" ? "bg-primary/5" : "bg-background"}`}>
            <div className="flex items-start gap-2"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.status === "UNREAD" ? "bg-primary" : "bg-muted-foreground/35"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-semibold">{notification.title}</p><Badge variant="outline">{notification.category.replaceAll("_", " ")}</Badge></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">{notification.content}</p><p className="mt-2 text-xs text-muted-foreground">{dateLabel(notification.createdAt)} · {notification.status === "UNREAD" ? "Unread" : "Read"}</p><div className="mt-2 flex flex-wrap gap-2">{destination ? <Link className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={destination}>Open update <ExternalLink aria-hidden="true" className="size-3.5" /></Link> : null}{notification.status === "UNREAD" ? <Button size="sm" variant="ghost" disabled={markingId === notification.id} onClick={() => void markRead(notification)}><Check aria-hidden="true" className="size-3.5" />{markingId === notification.id ? "Saving…" : "Mark read"}</Button> : null}</div></div></div>
          </li>;
        })}</ul> : null}
      </div>
    </section> : null}
  </div>;
}
