/** Bounded provider-local cache with shared work and independent caller cancellation. */
interface Work<T> { promise: Promise<T>; controller: AbortController; users: number; done: boolean }
interface State<T> { hits: Map<string, { at: number; value: T }>; failures: Map<string, { until: number; error: unknown }>; pending: Map<string, Work<T>> }

export class SharedPriceCache<T> {
  readonly #states = new WeakMap<typeof fetch, State<T>>();
  readonly capacity: number;
  readonly ttlMs: number;
  readonly failureMs: number;
  constructor(capacity = 512, ttlMs = 10 * 60_000, failureMs = 30_000) { this.capacity = capacity; this.ttlMs = ttlMs; this.failureMs = failureMs; }

  async load(key: string, fetcher: typeof fetch, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<{ value: T; cached: boolean }> {
    signal?.throwIfAborted();
    let state = this.#states.get(fetcher);
    if (!state) { state = { hits: new Map(), failures: new Map(), pending: new Map() }; this.#states.set(fetcher, state); }
    const hit = state.hits.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) {
      state.hits.delete(key); state.hits.set(key, hit);
      return { value: hit.value, cached: true };
    }
    if (hit) state.hits.delete(key);
    const failed = state.failures.get(key);
    if (failed && failed.until > Date.now()) throw failed.error;
    if (failed) state.failures.delete(key);
    let work = state.pending.get(key);
    const shared = Boolean(work);
    if (!work) {
      // The provider's own slot queue imposes a lower limit; this is a final memory bound.
      if (state.pending.size >= 128) throw new Error("Price checks are busy. Planning estimates remain available; retry shortly.");
      const currentState = state;
      const controller = new AbortController();
      const created: Work<T> = { controller, users: 0, done: false, promise: Promise.resolve(undefined as T) };
      created.promise = Promise.resolve().then(() => loader(controller.signal)).then(value => {
        controller.signal.throwIfAborted();
        currentState.hits.delete(key); currentState.hits.set(key, { at: Date.now(), value });
        while (currentState.hits.size > this.capacity) currentState.hits.delete(currentState.hits.keys().next().value!);
        currentState.failures.delete(key);
        return value;
      }, error => {
        if (!controller.signal.aborted) {
          currentState.failures.delete(key); currentState.failures.set(key, { until: Date.now() + this.failureMs, error });
          while (currentState.failures.size > this.capacity) currentState.failures.delete(currentState.failures.keys().next().value!);
        }
        throw error;
      }).finally(() => { created.done = true; if (currentState.pending.get(key) === created) currentState.pending.delete(key); });
      state.pending.set(key, created); work = created;
    }
    const current = work;
    current.users++;
    return new Promise<{ value: T; cached: boolean }>((resolve, reject) => {
      let finished = false;
      const detach = () => {
        if (finished) return false;
        finished = true; signal?.removeEventListener("abort", abort); current.users--;
        if (current.users === 0 && !current.done) {
          if (state!.pending.get(key) === current) state!.pending.delete(key);
          current.controller.abort(new DOMException("No price views are waiting.", "AbortError"));
        }
        return true;
      };
      const abort = () => { if (detach()) reject(signal?.reason ?? new DOMException("Price lookup cancelled.", "AbortError")); };
      signal?.addEventListener("abort", abort, { once: true });
      current.promise.then(value => { if (detach()) resolve({ value, cached: shared }); }, error => { if (detach()) reject(error); });
      if (signal?.aborted) abort();
    });
  }
}
