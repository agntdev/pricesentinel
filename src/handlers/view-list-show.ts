import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { getWatchlist, removeWatchlistItem } from "../storage.js";

registerMainMenuItem({ label: "📋 View List", data: "view_list:show", order: 20 });

const composer = new Composer<Ctx>();

composer.callbackQuery("view_list:show", async (ctx) => {
  await ctx.answerCallbackQuery();
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
  const lines = items.map((item) => {
    const label = item.nickname ? `${item.ticker} (${item.nickname})` : item.ticker;
    const rules: string[] = [];
    for (const r of item.threshold_rules) {
      rules.push(`${r.direction === "above" ? "📈" : "📉"} ${r.direction} $${r.value}`);
    }
    for (const r of item.percent_move_rules) {
      rules.push(`${r.direction === "up" ? "⬆️" : "⬇️"} ${r.direction} ${r.threshold}%`);
    }
    return rules.length > 0 ? `${label}\n  ${rules.join(", ")}` : label;
  });
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const item of items) {
    rows.push([inlineButton(`🗑 Remove ${item.ticker}`, `view_list:remove:${item.ticker}`)]);
  }
  rows.push([inlineButton("➕ Add Coin", "add_coin:start")]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.reply(`Your watchlist:\n\n${lines.join("\n\n")}`, {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^view_list:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match[1];
  const removed = await removeWatchlistItem(ctx.from!.id, ticker);
  if (removed) {
    const items = await getWatchlist(ctx.from!.id);
    if (items.length === 0) {
      await ctx.reply(`Removed ${ticker}. Your watchlist is empty — tap ➕ Add Coin to start over.`, {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add Coin", "add_coin:start")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      });
    } else {
      const lines = items.map((item) => {
        const label = item.nickname ? `${item.ticker} (${item.nickname})` : item.ticker;
        const rules: string[] = [];
        for (const r of item.threshold_rules) {
          rules.push(`${r.direction === "above" ? "📈" : "📉"} ${r.direction} $${r.value}`);
        }
        for (const r of item.percent_move_rules) {
          rules.push(`${r.direction === "up" ? "⬆️" : "⬇️"} ${r.direction} ${r.threshold}%`);
        }
        return rules.length > 0 ? `${label}\n  ${rules.join(", ")}` : label;
      });
      const rows: Array<Array<{ text: string; callback_data: string }>> = [];
      for (const item of items) {
        rows.push([inlineButton(`🗑 Remove ${item.ticker}`, `view_list:remove:${item.ticker}`)]);
      }
      rows.push([inlineButton("➕ Add Coin", "add_coin:start")]);
      rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
      await ctx.reply(`Removed ${ticker}. Your watchlist:\n\n${lines.join("\n\n")}`, {
        reply_markup: inlineKeyboard(rows),
      });
    }
  } else {
    await ctx.reply(`${ticker} wasn't on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  }
});

export default composer;
