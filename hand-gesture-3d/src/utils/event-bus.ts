type EventCallback<T = unknown> = (data: T) => void;

interface EventEntry {
  readonly callback: EventCallback;
  readonly once: boolean;
}

export class EventBus {
  private readonly listeners = new Map<string, EventEntry[]>();

  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    const entry: EventEntry = { callback: callback as EventCallback, once: false };
    const entries = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...entries, entry]);

    return () => this.off(event, callback as EventCallback);
  }

  once<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    const entry: EventEntry = { callback: callback as EventCallback, once: true };
    const entries = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...entries, entry]);

    return () => this.off(event, callback as EventCallback);
  }

  emit<T = unknown>(event: string, data: T): void {
    const entries = this.listeners.get(event);
    if (!entries) return;

    const remaining: EventEntry[] = [];
    for (const entry of entries) {
      entry.callback(data);
      if (!entry.once) {
        remaining.push(entry);
      }
    }
    this.listeners.set(event, remaining);
  }

  off(event: string, callback: EventCallback): void {
    const entries = this.listeners.get(event);
    if (!entries) return;

    const filtered = entries.filter((e) => e.callback !== callback);
    if (filtered.length === 0) {
      this.listeners.delete(event);
    } else {
      this.listeners.set(event, filtered);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const globalBus = new EventBus();
