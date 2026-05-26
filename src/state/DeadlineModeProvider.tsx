import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import { createDeadlineModeCommands, deadlineModeReducer, initialDeadlineModeState } from "@/application/deadlineMode";
import type { DeadlineModeCommands, DeadlineModeState } from "@/application/deadlineMode";
import { createEventBus } from "@/application/eventBus";
import { fetchDeadlineBootstrap } from "@/adapters/deadlineFoodApi";
import type { PrototypeEvent } from "@/domain/types";

type DeadlineModeContextValue = {
  state: DeadlineModeState;
  commands: DeadlineModeCommands;
};

const DeadlineModeContext = createContext<DeadlineModeContextValue | null>(null);

export function DeadlineModeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(deadlineModeReducer, initialDeadlineModeState);
  const [eventBus] = useState(() => createEventBus<PrototypeEvent>());

  useEffect(() => {
    return eventBus.subscribe(event => dispatch(event));
  }, [eventBus]);

  useEffect(() => {
    let cancelled = false;

    fetchDeadlineBootstrap()
      .then(bootstrap => {
        if (!cancelled) {
          dispatch({ type: "bootstrap_loaded", bootstrap });
        }
      })
      .catch(error => {
        if (!cancelled) {
          dispatch({ type: "bootstrap_failed", message: error instanceof Error ? error.message : String(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const publish = useCallback((event: PrototypeEvent) => {
    eventBus.publish(event);
  }, [eventBus]);

  const commands = useMemo(
    () => createDeadlineModeCommands(() => state, publish),
    [publish, state],
  );
  const value = useMemo(() => ({ state, commands }), [state, commands]);

  return <DeadlineModeContext.Provider value={value}>{children}</DeadlineModeContext.Provider>;
}

export function useDeadlineMode() {
  const context = useContext(DeadlineModeContext);

  if (context === null) {
    throw new Error("useDeadlineMode must be used inside DeadlineModeProvider");
  }

  return context;
}
