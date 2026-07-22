import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import {
  addWatchlistItem,
  type WatchlistItem,
} from "../storage.js";
import { tickerToId, KNOWN_COINS } from "../price-api.js";

registerMainMenuItem({ label: "➕ Add Coin", data: "add_coin:start", order: 10 });

const composer = new Composer<Ctx>();

const BACK_MENU = inlineKeyboard([
  [inlineButton("⬅️ Back to menu", "menu:main")],
]);

// Entry: show common coins + custom input option
composer.callbackQuery("add_coin:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "add_coin:choose";
  ctx.session.addCoinTicker = undefined;
  ctx.session.addCoinCoinId = undefined;
  ctx.session.addCoinNickname = undefined;
  await ctx.reply("Pick a coin below, or type a custom ticker.", {
    reply_markup: inlineKeyboard([
      [
        inlineButton("BTC", "add_coin:pick:BTC"),
        inlineButton("ETH", "add_coin:pick:ETH"),
        inlineButton("TON", "add_coin:pick:TON"),
      ],
      [inlineButton("✏️ Type a ticker", "add_coin:custom")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Pick a preset coin
composer.callbackQuery(/^add_coin:pick:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match[1];
  const coinId = KNOWN_COINS[ticker] ?? ticker.toLowerCase();
  ctx.session.addCoinTicker = ticker;
  ctx.session.addCoinCoinId = coinId;
  ctx.session.step = "add_coin:nickname";
  await ctx.reply(`Got ${ticker}. Want to give it a nickname?`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Skip", "add_coin:nickname_skip")],
    ]),
  });
});

// Custom ticker — prompt text input
composer.callbackQuery("add_coin:custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "add_coin:custom_input";
  await ctx.reply("Type the ticker symbol (e.g. SOL, DOGE).", {
    reply_markup: { force_reply: true, input_field_placeholder: "Ticker symbol…" },
  });
});

// Handle custom ticker text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "add_coin:custom_input") return next();
  const text = ctx.message.text.trim().toUpperCase();
  if (text.length < 1 || text.length > 10) {
    await ctx.reply("Ticker looks off — try 1-10 characters.");
    return;
  }
  const coinId = tickerToId(text);
  if (!coinId) {
    await ctx.reply("Couldn't find that coin — check the spelling and try again.");
    return;
  }
  ctx.session.addCoinTicker = text;
  ctx.session.addCoinCoinId = coinId;
  ctx.session.step = "add_coin:nickname";
  await ctx.reply(`Got ${text}. Want to give it a nickname?`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Skip", "add_coin:nickname_skip")],
    ]),
  });
});

// Skip nickname
composer.callbackQuery("add_coin:nickname_skip", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.addCoinNickname = "";
  ctx.session.step = "add_coin:rules";
  await ctx.reply("Add alert rules for this coin?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Set price threshold", "add_coin:rule_threshold")],
      [inlineButton("Set % move rule", "add_coin:rule_percent")],
      [inlineButton("Skip rules", "add_coin:confirm")],
    ]),
  });
});

// Handle nickname text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "add_coin:nickname_input") return next();
  const text = ctx.message.text.trim();
  if (text.length > 30) {
    await ctx.reply("Keep it under 30 characters.");
    return;
  }
  ctx.session.addCoinNickname = text;
  ctx.session.step = "add_coin:rules";
  await ctx.reply("Add alert rules for this coin?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Set price threshold", "add_coin:rule_threshold")],
      [inlineButton("Set % move rule", "add_coin:rule_percent")],
      [inlineButton("Skip rules", "add_coin:confirm")],
    ]),
  });
});

// Nickname — prompt text input
composer.callbackQuery("add_coin:nickname_custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "add_coin:nickname_input";
  await ctx.reply("Type a nickname for this coin.", {
    reply_markup: { force_reply: true, input_field_placeholder: "Nickname…" },
  });
});

// Threshold rule — prompt direction
composer.callbackQuery("add_coin:rule_threshold", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.ruleType = "threshold";
  ctx.session.step = "add_coin:threshold_dir";
  await ctx.reply("Alert when the price goes…", {
    reply_markup: inlineKeyboard([
      [inlineButton("📈 Above", "add_coin:dir:above")],
      [inlineButton("📉 Below", "add_coin:dir:below")],
    ]),
  });
});

// Percent rule — prompt direction
composer.callbackQuery("add_coin:rule_percent", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.ruleType = "percent";
  ctx.session.step = "add_coin:percent_dir";
  await ctx.reply("Alert when the price moves…", {
    reply_markup: inlineKeyboard([
      [inlineButton("⬆️ Up", "add_coin:dir:up")],
      [inlineButton("⬇️ Down", "add_coin:dir:down")],
    ]),
  });
});

// Direction chosen — prompt value
composer.callbackQuery(/^add_coin:dir:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dir = ctx.match[1] as "above" | "below" | "up" | "down";
  ctx.session.ruleDirection = dir as any;
  ctx.session.step = "add_coin:value";
  const label =
    ctx.session.ruleType === "threshold"
      ? `Alert when ${ctx.session.addCoinTicker} goes ${dir}…`
      : `Alert when ${ctx.session.addCoinTicker} moves ${dir} by…`;
  await ctx.reply(label + "\nEnter a number:", {
    reply_markup: {
      force_reply: true,
      input_field_placeholder:
        ctx.session.ruleType === "threshold" ? "Price in USD…" : "Percent…",
    },
  });
});

// Handle value text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "add_coin:value") return next();
  const num = Number(ctx.message.text.trim());
  if (!isFinite(num) || num <= 0) {
    await ctx.reply("Enter a positive number.");
    return;
  }
  ctx.session.ruleValue = num;

  const ticker = ctx.session.addCoinTicker ?? "???";
  const dir = ctx.session.ruleDirection;
  const ruleLabel =
    ctx.session.ruleType === "threshold"
      ? `${dir === "above" ? "📈" : "📉"} ${ticker} ${dir} $${num}`
      : `${dir === "up" ? "⬆️" : "⬇️"} ${ticker} ${dir} ${num}%`;

  // Save the coin now with this rule
  const item: WatchlistItem = {
    ticker,
    coin_id: ctx.session.addCoinCoinId ?? ticker.toLowerCase(),
    nickname: ctx.session.addCoinNickname ?? "",
    threshold_rules:
      ctx.session.ruleType === "threshold"
        ? [{ direction: dir as "above" | "below", value: num }]
        : [],
    percent_move_rules:
      ctx.session.ruleType === "percent"
        ? [{ direction: dir as "up" | "down", threshold: num }]
        : [],
  };
  await addWatchlistItem(ctx.from!.id, item);

  ctx.session.step = undefined;
  await ctx.reply(`Added ${ticker} to your watchlist.\nRule: ${ruleLabel}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add another", "add_coin:start")],
      [inlineButton("📋 View list", "view_list:show")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Confirm — save without rules
composer.callbackQuery("add_coin:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.session.addCoinTicker;
  const coinId = ctx.session.addCoinCoinId;
  if (!ticker || !coinId) {
    await ctx.reply("Something went wrong. Try again from the menu.", {
      reply_markup: BACK_MENU,
    });
    return;
  }
  const item: WatchlistItem = {
    ticker,
    coin_id: coinId,
    nickname: ctx.session.addCoinNickname ?? "",
    threshold_rules: [],
    percent_move_rules: [],
  };
  await addWatchlistItem(ctx.from!.id, item);
  ctx.session.step = undefined;
  await ctx.reply(`Added ${ticker} to your watchlist.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add another", "add_coin:start")],
      [inlineButton("📋 View list", "view_list:show")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
