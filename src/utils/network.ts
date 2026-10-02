/**
 * network.ts
 * HTTP requests with a time limit, so a slow API never leaves the game stuck
 * on the loading screen.
 */

/** Default time limit of a request (ms). */
const DEFAULT_TIMEOUT = 8000;

/**
 * Downloads a URL and parses the body as JSON.
 * Throws if the response is not 2xx or the time limit is exceeded.
 * @param url Address to download.
 * @param timeout Milliseconds before giving up.
 */
export async function fetchJson<T>(url: string, timeout = DEFAULT_TIMEOUT): Promise<T> {
    const response = await fetchWithTimeout(url, timeout);
    return (await response.json()) as T;
}

/**
 * Fetch that aborts itself after the time limit.
 * @param url Address to download.
 * @param timeout Milliseconds before giving up.
 */
async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        return response;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Waits for a promise for at most the given time; if it takes longer, rejects.
 * (The original promise keeps running, it just isn't awaited any more.)
 * @param promise Promise to wait for.
 * @param milliseconds Maximum time.
 */
export function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out")), milliseconds);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}
