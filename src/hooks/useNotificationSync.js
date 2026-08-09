import { useEffect, useRef } from "react";

const NOTIFICATION_SYNC_INTERVAL_MS = 30_000;

export function isNotificationSyncVisible(documentState = {}) {
  return documentState.hidden !== true && documentState.visibilityState !== "hidden";
}

export async function syncNotificationBatch({
  notifyPlugin,
  isStopped = () => false,
  isVisible = () => true,
  getCategories = () => [],
  getMerchantHistory = () => [],
  normalizeItems,
  onEntries
}) {
  if (isStopped() || !isVisible()) return [];

  const status = await notifyPlugin.isEnabled();
  if (isStopped() || !isVisible() || !status?.enabled) return [];
  if (!status.connected) await notifyPlugin.reconnect();
  if (isStopped() || !isVisible()) return [];

  const result = await notifyPlugin.drainNotifications();
  if (isStopped()) return [];
  const entries = normalizeItems(
    (result?.items || []).filter((item) => !item?.test),
    getCategories(),
    getMerchantHistory()
  );
  if (entries.length) onEntries?.(entries, { navigate: false });
  return entries;
}

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
    let syncAgainWhenVisible = false;
    const isVisible = () => isNotificationSyncVisible(document);
    const syncNotifications = async () => {
      if (stopped || !isVisible()) return;
      if (syncing) {
        syncAgainWhenVisible = true;
        return;
      }
      syncing = true;
      syncAgainWhenVisible = false;
      try {
        await syncNotificationBatch({
          notifyPlugin,
          isStopped: () => stopped,
          isVisible,
          getCategories: () => categoriesRef.current,
          getMerchantHistory: () => merchantHistoryRef.current,
          normalizeItems: (...args) => normalizeItemsRef.current(...args),
          onEntries: (...args) => onEntriesRef.current?.(...args)
        });
      } catch {
        // Notification access is optional and must never block bookkeeping.
      } finally {
        syncing = false;
        if (!stopped && syncAgainWhenVisible && isVisible()) {
          syncAgainWhenVisible = false;
          queueMicrotask(syncNotifications);
        }
      }
    };

    const syncWhenVisible = () => {
      if (!isVisible()) return;
      syncAgainWhenVisible = true;
      void syncNotifications();
    };

    void syncNotifications();
    const timer = window.setInterval(() => {
      if (isVisible()) void syncNotifications();
    }, NOTIFICATION_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [enabled, notifyPlugin]);
}
