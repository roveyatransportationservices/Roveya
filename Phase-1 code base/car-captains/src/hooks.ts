import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { service } from "./service";

// Loads on focus, reloads on realtime changes, and keeps the last good data while refreshing.
export function useLive<T>(load: () => Promise<T>, watchTrip: string | null | false = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      setData(await loader.current());
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    if (watchTrip === false) return;
    return service.watch(watchTrip, () => void reload());
  }, [watchTrip, reload]);

  return { data, error, refreshing, reload, setData };
}
