/**
 * A deadline with a strongly retained controller, safe across garbage collection.
 * Native AbortSignal.any(timeout(...)) can lose its weakly held timeout source.
 * @param {number} milliseconds
 * @param {readonly (AbortSignal | null | undefined)[]} [parents]
 * @returns {{signal: AbortSignal, dispose: () => void}}
 */
export function createDeadline(milliseconds,parents = []) {
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 0x7fffffff) throw new RangeError("Use a finite deadline between 0 and 2147483647 milliseconds.");
  const controller = new AbortController();
  /** @type {ReturnType<typeof globalThis.setTimeout> | undefined} */
  let timer;
  /** @type {{parent: AbortSignal, listener: () => void}[]} */
  const links = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) globalThis.clearTimeout(timer);
    for (const {parent,listener} of links) parent.removeEventListener("abort",listener);
    links.length = 0;
    controller.signal.removeEventListener("abort",dispose);
  };
  controller.signal.addEventListener("abort",dispose,{once:true});
  try {
    for (const parent of parents) {
      if (!parent) continue;
      if (parent.aborted) { controller.abort(parent.reason); break; }
      const listener = () => controller.abort(parent.reason);
      links.push({parent,listener}); parent.addEventListener("abort",listener,{once:true});
      if (parent.aborted) { listener(); break; }
    }
    if (!controller.signal.aborted) {
      // The timer closes over controller directly; no weakly held timeout source.
      timer = globalThis.setTimeout(() => controller.abort(new DOMException("The operation was aborted due to timeout","TimeoutError")),milliseconds);
      timer.unref?.();
    }
  } catch (error) { dispose(); throw error; }
  return {signal:controller.signal,dispose};
}

/**
 * The callback should honour its signal to release resources after cancellation.
 * Late callback results cannot escape the deadline.
 * @template T
 * @param {number} milliseconds
 * @param {readonly (AbortSignal | null | undefined)[]} parents
 * @param {(signal: AbortSignal) => Promise<T> | T} operation
 * @returns {Promise<T>}
 */
export async function withDeadline(milliseconds,parents,operation) {
  const deadline = createDeadline(milliseconds,parents);
  /** @type {(() => void) | undefined} */
  let abort;
  try {
    deadline.signal.throwIfAborted();
    /** @type {Promise<never>} */
    const cancelled = new Promise((_resolve,reject) => {
      abort = () => reject(deadline.signal.reason);
      deadline.signal.addEventListener("abort",abort,{once:true});
    });
    return await Promise.race([Promise.resolve().then(() => {
      deadline.signal.throwIfAborted(); return operation(deadline.signal);
    }),cancelled]);
  } finally {
    if (abort) deadline.signal.removeEventListener("abort",abort);
    deadline.dispose();
  }
}
