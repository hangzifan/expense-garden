import { useEffect, useRef } from "react";

const NOTIFICATION_SYNC_INTERVAL_MS = 30_000;

/**
 * Own one notification poller for the lifetime of the app. Mutable parsing
 * inputs live in refs so new records/categories do not recreate the interval.
 */
export function useNotificationSync({
  enabled,
  notifyPlugin,
  categories,
  merchantHistory,
  normalizeItems,
  onEntries
}) {
  const categoriesRef = useRef(categories);
  const merchantHistoryRef = useRef(merchantHistory);
  const normalizeItemsRef = useRef(normalizeItems);
  const onEntriesRef = useRef(onEntries);

  categoriesRef.current = categories;
  merchantHistoryRef.current = merchantHistory;
  normalizeItemsRef.current = normalizeItems;
  onEntriesRef.current = onEntries;

  useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    let syncing = false;
    const syncNotifications = async () => {
      if (stopped || syncing) return;
      syncing = true;
      try {
        const status = await notifyPlugin.isEnabled();
        if (stopped || !status?.enabled) return;
        if (!status.connected) await notifyPlugin.reconnect();
        const result = await notifyPlugin.drainNotifications();
        if (stopped) return;
        const entries = normalizeItemsRef.current(
          (result?.items || []).filter((item) => !item?.test),
          categoriesRef.current,
          merchantHistoryRef.current
        );
        if (entries.length) onEntriesRef.current?.(entries, { navigate: false });
      } catch {
        // Notification access is optional and must never block bookkeeping.
      } finally {
        syncing = false;
      }
    };

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncNotifications();
    };

    syncNotifications();
    const timer = window.setInterval(syncNotifications, NOTIFICATION_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [enabled, notifyPlugin]);
}

