import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Bell, CheckCheck, Clock3, Ticket } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAccessToken } from "@/lib/app-access";
import { getAcademicYear } from "@/lib/academic-year";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  listSupportNotifications,
  markAllSupportNotificationsRead,
  markSupportNotificationRead,
} from "@/lib/support.functions";

type NotificationRow = {
  id: string;
  ticket_id: string | null;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
  ticket: {
    ticket_id: string;
    subject: string;
    creator_name: string;
    school_name: string | null;
  } | null;
};

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SupportNotificationBell() {
  const { ready, profile, can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = can("support", "view") || can("support", "manage");
  const tokenData = () => ({ token: getAccessToken(), academicYear: getAcademicYear() });
  const notifications = useQuery({
    queryKey: ["support-notifications"],
    enabled: ready && allowed,
    queryFn: () => listSupportNotifications({ data: tokenData() }),
    // Poll frequently so ticket notifications appear even if Realtime is not enabled.
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markSupportNotificationRead({ data: { ...tokenData(), id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-notifications"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const markAll = useMutation({
    mutationFn: () => markAllSupportNotificationsRead({ data: tokenData() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-notifications"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!ready || !allowed) return;
    const channel = supabase
      .channel("schoolrise-support-notifications")
      .on("broadcast", { event: "new" }, () =>
        queryClient.invalidateQueries({ queryKey: ["support-notifications"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [allowed, queryClient, ready]);

  if (!allowed) return null;
  const rows = (notifications.data?.rows ?? []) as NotificationRow[];
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? `${unread} unread support notifications` : "Support notifications"}
          className="relative rounded-full"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" /> Support notifications
          </span>
          {unread > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[min(26rem,70vh)] overflow-y-auto">
          {notifications.isLoading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Loading notifications…
            </p>
          )}
          {notifications.isError && (
            <p className="px-4 py-6 text-center text-sm text-destructive">
              Unable to load notifications.
            </p>
          )}
          {!notifications.isLoading && !notifications.isError && rows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No support notifications yet.
            </p>
          )}
          {rows.map((row) => (
            <DropdownMenuItem
              key={row.id}
              className="items-start gap-3 px-4 py-3 focus:bg-accent"
              onSelect={(event) => {
                event.preventDefault();
                if (!row.read_at) markRead.mutate(row.id);
                if (row.ticket_id)
                  void router.navigate({ to: "/support", search: { ticket: row.ticket_id } });
              }}
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${row.read_at ? "bg-muted" : "bg-destructive"}`}
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">New Support Ticket</span>
                  {!row.read_at && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      New
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-xs font-medium text-primary">
                  {row.ticket?.ticket_id ?? "Support ticket"}
                </span>
                <span className="block truncate text-sm">{row.ticket?.subject ?? row.message}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.ticket?.creator_name ?? "Support user"}
                  {row.ticket?.school_name ? ` · ${row.ticket.school_name}` : ""}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" /> {relativeTime(row.created_at)}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
