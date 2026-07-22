import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { getProfile, setProfile, type UserProfile } from "../storage.js";
import { formatTime } from "../clock.js";

registerMainMenuItem({ label: "⚙️ Settings", data: "settings:open", order: 40 });

const composer = new Composer<Ctx>();

composer.callbackQuery("settings:open", async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await getProfile(ctx.from!.id);
  const qhStart = `${String(p.quiet_hours_start).padStart(2, "0")}:00`;
  const qhEnd = `${String(p.quiet_hours_end).padStart(2, "0")}:00`;
  const msg =
    `Your settings:\n\n` +
    `🌍 Timezone: UTC${p.timezone >= 0 ? "+" : ""}${p.timezone}\n` +
    `🌙 Quiet hours: ${qhStart} – ${qhEnd}\n` +
    `💰 Currency: ${p.currency.toUpperCase()}\n` +
    `📬 Summary time: ${p.summary_time}`;
  await ctx.reply(msg, {
    reply_markup: inlineKeyboard([
      [inlineButton("🌍 Timezone", "settings:tz")],
      [inlineButton("🌙 Quiet hours", "settings:qh")],
      [inlineButton("📬 Summary time", "settings:summary")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Timezone
composer.callbackQuery("settings:tz", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "settings:tz_input";
  const p = await getProfile(ctx.from!.id);
  await ctx.reply(`Current timezone: UTC${p.timezone >= 0 ? "+" : ""}${p.timezone}\nEnter your UTC offset (e.g. +5, -3, 0):`, {
    reply_markup: { force_reply: true, input_field_placeholder: "UTC offset…" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "settings:tz_input") return next();
  const raw = ctx.message.text.trim();
  const num = Number(raw.replace(/^UTC/i, "").replace(/^\+/, ""));
  if (!isFinite(num) || num < -12 || num > 14) {
    await ctx.reply("Enter a valid UTC offset between -12 and +14.");
    return;
  }
  const p = await getProfile(ctx.from!.id);
  p.timezone = num;
  await setProfile(p);
  ctx.session.step = undefined;
  await ctx.reply(`Timezone set to UTC${num >= 0 ? "+" : ""}${num}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Settings", "settings:open")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Quiet hours
composer.callbackQuery("settings:qh", async (ctx) => {
  await ctx.answerCallbackQuery();
  const p = await getProfile(ctx.from!.id);
  const qhStart = `${String(p.quiet_hours_start).padStart(2, "0")}:00`;
  const qhEnd = `${String(p.quiet_hours_end).padStart(2, "0")}:00`;
  await ctx.reply(`Quiet hours: ${qhStart} – ${qhEnd}\nSet the start hour (0-23):`, {
    reply_markup: inlineKeyboard([
      [inlineButton("00:00", "settings:qh:0")],
      [inlineButton("22:00", "settings:qh:22")],
      [inlineButton("23:00", "settings:qh:23")],
      [inlineButton("Skip", "settings:qh_skip")],
    ]),
  });
});

composer.callbackQuery(/^settings:qh:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const start = Number(ctx.match[1]);
  ctx.session.step = "settings:qh_end";
  ctx.session.settingsField = String(start);
  const p = await getProfile(ctx.from!.id);
  p.quiet_hours_start = start;
  await setProfile(p);
  await ctx.reply(`Quiet hours start: ${String(start).padStart(2, "0")}:00\nNow set the end hour (0-23):`, {
    reply_markup: inlineKeyboard([
      [inlineButton("06:00", "settings:qh_end:6")],
      [inlineButton("07:00", "settings:qh_end:7")],
      [inlineButton("08:00", "settings:qh_end:8")],
    ]),
  });
});

composer.callbackQuery(/^settings:qh_end:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const end = Number(ctx.match[1]);
  const p = await getProfile(ctx.from!.id);
  p.quiet_hours_end = end;
  await setProfile(p);
  ctx.session.step = undefined;
  const qhStart = `${String(p.quiet_hours_start).padStart(2, "0")}:00`;
  const qhEnd = `${String(end).padStart(2, "0")}:00`;
  await ctx.reply(`Quiet hours set: ${qhStart} – ${qhEnd}`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Settings", "settings:open")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("settings:qh_skip", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  await ctx.reply("Quiet hours unchanged.", {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Settings", "settings:open")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Summary time
composer.callbackQuery("settings:summary", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "settings:summary_input";
  const p = await getProfile(ctx.from!.id);
  await ctx.reply(`Current summary time: ${p.summary_time}\nEnter a new time (HH:MM):`, {
    reply_markup: { force_reply: true, input_field_placeholder: "HH:MM…" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "settings:summary_input") return next();
  const raw = ctx.message.text.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) {
    await ctx.reply("Enter a valid time in HH:MM format (e.g. 08:00).");
    return;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    await ctx.reply("Invalid time — hours 0-23, minutes 0-59.");
    return;
  }
  const timeStr = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const p = await getProfile(ctx.from!.id);
  p.summary_time = timeStr;
  await setProfile(p);
  ctx.session.step = undefined;
  await ctx.reply(`Summary time set to ${timeStr}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Settings", "settings:open")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
