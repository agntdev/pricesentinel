import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { getOwnerMetrics } from "../storage.js";

const OWNER_IDS = process.env.OWNER_IDS?.split(",").map(Number) ?? [];

const composer = new Composer<Ctx>();

composer.command("owner", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || (OWNER_IDS.length > 0 && !OWNER_IDS.includes(userId))) {
    await ctx.reply("This command is for the bot owner only.");
    return;
  }
  const metrics = await getOwnerMetrics();
  const lines = [
    `📊 Owner Dashboard`,
    ``,
    `👥 Active users: ${metrics.activeUserCount}`,
    ``,
    `🔥 Top alerts (last 100):`,
  ];
  if (metrics.topAlerts.length === 0) {
    lines.push(`  No alerts fired yet.`);
  } else {
    for (const a of metrics.topAlerts.slice(0, 10)) {
      lines.push(`  ${a.ticker}: ${a.count}x`);
    }
  }
  await ctx.reply(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "owner:refresh")],
    ]),
  });
});

composer.callbackQuery("owner:refresh", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId || (OWNER_IDS.length > 0 && !OWNER_IDS.includes(userId))) {
    await ctx.reply("Not authorized.");
    return;
  }
  const metrics = await getOwnerMetrics();
  const lines = [
    `📊 Owner Dashboard`,
    ``,
    `👥 Active users: ${metrics.activeUserCount}`,
    ``,
    `🔥 Top alerts (last 100):`,
  ];
  if (metrics.topAlerts.length === 0) {
    lines.push(`  No alerts fired yet.`);
  } else {
    for (const a of metrics.topAlerts.slice(0, 10)) {
      lines.push(`  ${a.ticker}: ${a.count}x`);
    }
  }
  await ctx.reply(lines.join("\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "owner:refresh")],
    ]),
  });
});

export default composer;
