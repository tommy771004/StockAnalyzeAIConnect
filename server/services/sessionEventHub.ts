export interface SessionEvent {
  type: string;
  data: unknown;
}

type SessionEventListener = (event: SessionEvent) => void;

export class SessionEventHub {
  private readonly listeners = new Map<string, Set<SessionEventListener>>();

  publish(userId: string, event: SessionEvent): void {
    for (const listener of this.listeners.get(userId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[SessionEventHub] listener failed:', error);
      }
    }
  }

  subscribe(userId: string, listener: SessionEventListener): () => void {
    const listeners = this.listeners.get(userId) ?? new Set<SessionEventListener>();
    listeners.add(listener);
    this.listeners.set(userId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(userId);
    };
  }
}

export const sessionEventHub = new SessionEventHub();
