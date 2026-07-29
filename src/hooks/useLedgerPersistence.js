import { useCallback, useEffect, useRef, useState } from "react";
import { parseBackupPayload, saveState } from "../storage.js";

const LOCAL_SAVE_DELAY_MS = 450;
const NATIVE_BACKUP_DELAY_MS = 4_000;

/**
 * Persist the latest ledger snapshot without serializing the whole state on
 * every key stroke. Page/background transitions still flush immediately.
 */
export function useDebouncedLedgerSave(state, { enabled = true, delay = LOCAL_SAVE_DELAY_MS } = {}) {
  const latestStateRef = useRef(state);
  const enabledRef = useRef(enabled);
  const dirtyRef = useRef(false);
  const timerRef = useRef(0);

  latestStateRef.current = state;
  enabledRef.current = enabled;

  const flush = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    if (!enabledRef.current || !dirtyRef.current) return;
    saveState(latestStateRef.current);
    dirtyRef.current = false;
  }, []);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (!enabled) return undefined;
    dirtyRef.current = true;
    timerRef.current = window.setTimeout(flush, delay);
    return () => window.clearTimeout(timerRef.current);
  }, [state, enabled, delay, flush]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flush();
    };
  }, [flush]);

  return flush;
}

/**
 * Keep a second copy in Android's private files directory and restore it only
 * when WebView storage is genuinely fresh.
 */
export function useNativeLedgerBackup({
  enabled,
  startedFresh,
  state,
  backupPlugin,
  onRestore
}) {
  const [ready, setReady] = useState(() => !enabled || !startedFresh);
  const restoreCheckedRef = useRef(false);
  const backupTimerRef = useRef(0);
  const onRestoreRef = useRef(onRestore);

  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (!enabled || restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    if (!startedFresh) {
      setReady(true);
      return;
    }

    backupPlugin.load()
      .then((result) => {
        if (!result?.exists || !result?.data) return;
        const restored = parseBackupPayload(result.data);
        if (!restored || (!restored.expenses.length && !restored.pending.length)) return;
        onRestoreRef.current?.(restored);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [enabled, startedFresh, backupPlugin]);

  useEffect(() => {
    if (!enabled || !ready) return undefined;
    window.clearTimeout(backupTimerRef.current);
    backupTimerRef.current = window.setTimeout(() => {
      backupPlugin.save({ data: JSON.stringify(state) }).catch(() => {});
    }, NATIVE_BACKUP_DELAY_MS);
    return () => window.clearTimeout(backupTimerRef.current);
  }, [enabled, ready, state, backupPlugin]);

  return ready;
}

