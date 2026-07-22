import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { getWatchlist, addAlertRecord, isInCooldown, setCooldown } from "../storage.js";
import { fetchPrices, type PriceData } from "../price-api.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "💰 Price", data: "price:check_all", order: 30 });

const composer = new Composer<Ctx>();

// Button: check all
composer.callbackQuery("price:check_all", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendPriceCheck(ctx);
});

// /price command — optional ticker argument
composer.command("price", async (ctx) => {
  const arg = ctx.match?.trim().toUpperCase();
  if (arg) {
    await sendSinglePrice(ctx, arg);
  } else {
    await sendPriceCheck(ctx);
  }
});

async function sendPriceCheck(ctx: any): Promise<void> {
  const items = await getWatchlist(ctx.from!.id);
  if (items.length === 0) {
    await ctx.reply("No coins on your watchlist yet — tap ➕ Add Coin to add one.", {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add Coin", "add_coin:start")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  const coinIds = items.map((i) => i.coin_id);
  const prices = await fetchPrices(coinIds);
  if (prices.size === 0) {
    await ctx.reply("Couldn't fetch prices right now — try again in a moment.", {
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Retry", "price:check_all")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  const lines: string[] = [];
  for (const item of items) {
    const p = prices.get(item.coin_id);
    if (!p) {
      lines.push(`${item.ticker}: price unavailable`);
      continue;
    }
    const change = p.usd_24h_change;
    const changeStr =
      change != null
        ? ` (${change >= 0 ? "+" : ""}${change.toFixed(1)}% 24h)`
        : "";
    lines.push(`${item.ticker}: $${formatPrice(p.usd)}${changeStr}`);
    // Check alert rules
    await checkAlertRules(ctx.from!.id, item, p);
  }
  await ctx.reply(`Current prices:\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "price:check_all")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

async function sendSinglePrice(ctx: any, ticker: string): Promise<void> {
  const items = await getWatchlist(ctx.from!.id);
  const item = items.find((i) => i.ticker.toUpperCase() === ticker);
  if (!item) {
    await ctx.reply(`${ticker} isn't on your watchlist. Add it first with ➕ Add Coin.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add Coin", "add_coin:start")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  const prices = await fetchPrices([item.coin_id]);
  const p = prices.get(item.coin_id);
  if (!p) {
    await ctx.reply(`Couldn't fetch ${ticker} price — try again in a moment.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  const change = p.usd_24h_change;
  const changeStr =
    change != null ? ` (${change >= 0 ? "+" : ""}${change.toFixed(1)}% 24h)` : "";
  await ctx.reply(`${item.ticker}: $${formatPrice(p.usd)}${changeStr}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", `price:refresh:${ticker}`)],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
  await checkAlertRules(ctx.from!.id, item, p);
}

async function checkAlertRules(
  userId: number,
  item: { ticker: string; coin_id: string; threshold_rules: any[]; percent_move_rules: any[] },
  price: PriceData,
): Promise<void> {
  for (const rule of item.threshold_rules) {
    const triggered =
      (rule.direction === "above" && price.usd > rule.value) ||
      (rule.direction === "below" && price.usd < rule.value);
    if (triggered) {
      const inCooldown = await isInCooldown(userId, item.ticker, `threshold:${rule.direction}`);
      if (!inCooldown) {
        await setCooldown(userId, item.ticker, `threshold:${rule.direction}`);
        await addAlertRecord({
          user_id: userId,
          item_ticker: item.ticker,
          rule_type: `threshold_${rule.direction}`,
          trigger_time: now(),
          old_price: 0,
          new_price: price.usd,
          percent_change: 0,
        });
      }
    }
  }
  for (const rule of item.percent_move_rules) {
    const change = price.usd_24h_change;
    if (change == null) continue;
    const triggered =
      (rule.direction === "up" && change >= rule.threshold) ||
      (rule.direction === "down" && change <= -rule.threshold);
    if (triggered) {
      const inCooldown = await isInCooldown(userId, item.ticker, `percent:${rule.direction}`);
      if (!inCooldown) {
        await setCooldown(userId, item.ticker, `percent:${rule.direction}`);
        await addAlertRecord({
          user_id: userId,
          item_ticker: item.ticker,
          rule_type: `percent_${rule.direction}`,
          trigger_time: now(),
          old_price: 0,
          new_price: price.usd,
          percent_change: change,
        });
      }
    }
  }
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(8);
}

export default composer;
