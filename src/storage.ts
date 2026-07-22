// Durable data storage — Redis-backed with in-memory fallback for dev/test.
// Every data entity (user_profile, watchlist_item, alert_record) is stored as
// JSON under a namespaced key. No keyspace scans — all reads go through explicit
// index keys.

import { now } from "./clock.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  telegram_id: number;
  timezone: number; // UTC offset in hours, default 0
  quiet_hours_start: number; // 0-23, default 0 (midnight)
  quiet_hours_end: number; // 0-23, default 7
  summary_time: string; // HH:MM, default "08:00"
  currency: string; // default "usd"
}

export interface WatchlistItem {
  ticker: string; // user-facing ticker (e.g. "BTC")
  coin_id: string; // CoinGecko id (e.g. "bitcoin")
  nickname: string; // optional user nickname
  threshold_rules: ThresholdRule[];
  percent_move_rules: PercentMoveRule[];
}

export interface ThresholdRule {
  direction: "above" | "below";
  value: number; // USD price
}

export interface PercentMoveRule {
  direction: "up" | "down";
  threshold: number; // percent
}

export interface AlertRecord {
  user_id: number;
  item_ticker: string;
  rule_type: string;
  trigger_time: number; // epoch ms
  old_price: number;
  new_price: number;
  percent_change: number;
}

// ─── In-memory adapter (dev / test) ─────────────────────────────────────────

class MemStore {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.data.delete(key);
  }
  async hset(key: string, field: string, value: string): Promise<void> {
    const obj = JSON.parse(this.data.get(key) ?? "{}");
    obj[field] = value;
    this.data.set(key, JSON.stringify(obj));
  }
  async hget(key: string, field: string): Promise<string | null> {
    const obj = JSON.parse(this.data.get(key) ?? "{}");
    return obj[field] ?? null;
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    return JSON.parse(this.data.get(key) ?? "{}");
  }
  async hdel(key: string, field: string): Promise<void> {
    const obj = JSON.parse(this.data.get(key) ?? "{}");
    delete obj[field];
    this.data.set(key, JSON.stringify(obj));
  }
  async keys(pattern: string): Promise<string[]> {
    const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return [...this.data.keys()].filter((k) => re.test(k));
  }
}

// ─── Redis adapter ──────────────────────────────────────────────────────────

class RedisStore {
  private client: any;

  constructor(url: string) {
    // Lazy-load ioredis (dynamic import avoids Node-only import in Workers)
    this.client = null;
    this.url = url;
  }
  private url: string;

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const ioredis = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    this.client = new Redis(this.url, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return (await this.getClient()).get(key);
  }
  async set(key: string, value: string): Promise<void> {
    await (await this.getClient()).set(key, value);
  }
  async del(key: string): Promise<void> {
    await (await this.getClient()).del(key);
  }
  async hset(key: string, field: string, value: string): Promise<void> {
    await (await this.getClient()).hset(key, field, value);
  }
  async hget(key: string, field: string): Promise<string | null> {
    return (await this.getClient()).hget(key, field);
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    return (await this.getClient()).hgetall(key);
  }
  async hdel(key: string, field: string): Promise<void> {
    await (await this.getClient()).hdel(key, field);
  }
  async keys(pattern: string): Promise<string[]> {
    return (await this.getClient()).keys(pattern);
  }
}

// ─── Storage singleton ──────────────────────────────────────────────────────

type Store = MemStore | RedisStore;

let store: Store = new MemStore();

/** Initialise the storage backend. Call once at startup (or not at all for
 *  in-memory). Idempotent — calling again replaces the backend. */
export function initStorage(redisUrl?: string): void {
  if (redisUrl) {
    store = new RedisStore(redisUrl);
  } else {
    store = new MemStore();
  }
}

/** Clear all data (test-only hook; never call from bot code). */
export function _resetStorage(): void {
  store = new MemStore();
}

// ─── User profile ───────────────────────────────────────────────────────────

const PROF_KEY = (id: number) => `user:${id}:profile`;

const DEFAULT_PROFILE: UserProfile = {
  telegram_id: 0,
  timezone: 0,
  quiet_hours_start: 0,
  quiet_hours_end: 7,
  summary_time: "08:00",
  currency: "usd",
};

export async function getProfile(userId: number): Promise<UserProfile> {
  const raw = await store.get(PROF_KEY(userId));
  if (!raw) return { ...DEFAULT_PROFILE, telegram_id: userId };
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return { ...DEFAULT_PROFILE, telegram_id: userId };
  }
}

export async function setProfile(profile: UserProfile): Promise<void> {
  await store.set(PROF_KEY(profile.telegram_id), JSON.stringify(profile));
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

const WL_KEY = (id: number) => `user:${id}:watchlist`;
const WL_IDX = `idx:watchlists`; // set of user ids with watchlists

async function addToIndex(userId: number): Promise<void> {
  await store.hset(WL_IDX, String(userId), "1");
}

export async function getWatchlist(userId: number): Promise<WatchlistItem[]> {
  const raw = await store.get(WL_KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WatchlistItem[];
  } catch {
    return [];
  }
}

export async function setWatchlist(
  userId: number,
  items: WatchlistItem[],
): Promise<void> {
  if (items.length > 0) {
    await store.set(WL_KEY(userId), JSON.stringify(items));
    await addToIndex(userId);
  } else {
    await store.del(WL_KEY(userId));
    await store.hdel(WL_IDX, String(userId));
  }
}

export async function addWatchlistItem(
  userId: number,
  item: WatchlistItem,
): Promise<void> {
  const list = await getWatchlist(userId);
  // Replace if same ticker already exists
  const idx = list.findIndex(
    (i) => i.ticker.toUpperCase() === item.ticker.toUpperCase(),
  );
  if (idx >= 0) list[idx] = item;
  else list.push(item);
  await setWatchlist(userId, list);
}

export async function removeWatchlistItem(
  userId: number,
  ticker: string,
): Promise<boolean> {
  const list = await getWatchlist(userId);
  const before = list.length;
  const filtered = list.filter(
    (i) => i.ticker.toUpperCase() !== ticker.toUpperCase(),
  );
  if (filtered.length === before) return false;
  await setWatchlist(userId, filtered);
  return true;
}

// ─── Alert records ──────────────────────────────────────────────────────────

const ALERT_KEY = (userId: number) => `user:${userId}:alerts`;
// Note: we keep per-user alert lists and an owner-level aggregate

export async function addAlertRecord(record: AlertRecord): Promise<void> {
  const key = ALERT_KEY(record.user_id);
  const raw = await store.get(key);
  const list: AlertRecord[] = raw ? JSON.parse(raw) : [];
  list.push(record);
  // Keep only last 100 alerts per user
  const trimmed = list.slice(-100);
  await store.set(key, JSON.stringify(trimmed));
}

export async function getAlertRecords(userId: number): Promise<AlertRecord[]> {
  const raw = await store.get(ALERT_KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AlertRecord[];
  } catch {
    return [];
  }
}

// ─── Owner metrics ──────────────────────────────────────────────────────────

const OWNER_KEY = "owner:metrics";

export async function getOwnerMetrics(): Promise<{
  activeUserCount: number;
  topAlerts: Array<{ ticker: string; count: number }>;
}> {
  const raw = await store.get(OWNER_KEY);
  if (!raw) return { activeUserCount: 0, topAlerts: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { activeUserCount: 0, topAlerts: [] };
  }
}

export async function setOwnerMetrics(m: {
  activeUserCount: number;
  topAlerts: Array<{ ticker: string; count: number }>;
}): Promise<void> {
  await store.set(OWNER_KEY, JSON.stringify(m));
}

export async function incrementAlertCount(ticker: string): Promise<void> {
  const m = await getOwnerMetrics();
  const existing = m.topAlerts.find(
    (a) => a.ticker.toUpperCase() === ticker.toUpperCase(),
  );
  if (existing) existing.count++;
  else m.topAlerts.push({ ticker: ticker.toUpperCase(), count: 1 });
  m.topAlerts.sort((a, b) => b.count - a.count);
  m.topAlerts = m.topAlerts.slice(0, 10);
  await setOwnerMetrics(m);
}

export async function setActiveUserCount(count: number): Promise<void> {
  const m = await getOwnerMetrics();
  m.activeUserCount = count;
  await setOwnerMetrics(m);
}

// ─── Cooldown tracking ──────────────────────────────────────────────────────

const COOLDOWN_KEY = (userId: number, ticker: string, ruleType: string) =>
  `user:${userId}:cooldown:${ticker.toUpperCase()}:${ruleType}`;
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

export async function isInCooldown(
  userId: number,
  ticker: string,
  ruleType: string,
): Promise<boolean> {
  const raw = await store.get(COOLDOWN_KEY(userId, ticker, ruleType));
  if (!raw) return false;
  const lastAlert = Number(raw);
  return now() - lastAlert < COOLDOWN_MS;
}

export async function setCooldown(
  userId: number,
  ticker: string,
  ruleType: string,
): Promise<void> {
  await store.set(COOLDOWN_KEY(userId, ticker, ruleType), String(now()));
}

// ─── Quiet hours check ──────────────────────────────────────────────────────

export function isQuietHours(profile: UserProfile): boolean {
  const currentHour = new Date(
    now() + profile.timezone * 3600_000,
  ).getUTCHours();
  const start = profile.quiet_hours_start;
  const end = profile.quiet_hours_end;
  if (start <= end) {
    return currentHour >= start && currentHour < end;
  }
  // Wraps midnight (e.g. 22-7)
  return currentHour >= start || currentHour < end;
}
