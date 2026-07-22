// CoinGecko free-API price fetcher. Uses the /simple/price endpoint
// (no auth key required for public endpoints). Retries once on failure.

export interface PriceData {
  usd: number;
  usd_24h_change: number | null;
}

const BASE = "https://api.coingecko.com/api/v3";

/**
 * Fetch current USD price + 24h change for one or more CoinGecko coin ids.
 * Returns a map of coinId → PriceData. Unknown ids are silently omitted.
 */
export async function fetchPrices(
  coinIds: string[],
): Promise<Map<string, PriceData>> {
  if (coinIds.length === 0) return new Map();
  const ids = coinIds.join(",");
  const url =
    `${BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 429 && attempt === 0) {
          await delay(1000);
          continue;
        }
        return new Map();
      }
      const raw = (await res.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;
      const out = new Map<string, PriceData>();
      for (const [id, v] of Object.entries(raw)) {
        if (v && typeof v.usd === "number") {
          out.set(id, {
            usd: v.usd,
            usd_24h_change: typeof v.usd_24h_change === "number" ? v.usd_24h_change : null,
          });
        }
      }
      return out;
    } catch {
      if (attempt === 0) await delay(500);
    }
  }
  return new Map();
}

/** Well-known CoinGecko coin ids (used by the add-coin preset buttons). */
export const KNOWN_COINS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  TON: "the-open-network",
};

/** Map a user ticker to its CoinGecko id. Case-insensitive. */
export function tickerToId(ticker: string): string | null {
  const upper = ticker.toUpperCase();
  if (KNOWN_COINS[upper]) return KNOWN_COINS[upper];
  // For custom tickers, try lowercased as CoinGecko id (many coins use
  // their lowercase name as id). The caller must handle the not-found case.
  return ticker.toLowerCase();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
