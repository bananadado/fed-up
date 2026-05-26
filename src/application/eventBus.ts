export type EventBus<TEvent> = {
  publish: (event: TEvent) => void;
  subscribe: (handler: (event: TEvent) => void) => () => void;
};

export function createEventBus<TEvent>(): EventBus<TEvent> {
  const handlers = new Set<(event: TEvent) => void>();

  return {
    publish(event) {
      handlers.forEach(handler => handler(event));
    },
    subscribe(handler) {
      handlers.add(handler);

      return () => {
        handlers.delete(handler);
      };
    },
  };
}
