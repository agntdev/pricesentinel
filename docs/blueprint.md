# CryptoPriceMonitorBot — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot that tracks cryptocurrency prices, manages user-specific watchlists with customizable alert rules (thresholds and percent moves), and sends notifications while respecting quiet hours and cooldown periods. Includes on-demand price checks, optional morning summaries, and an owner dashboard for usage metrics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto traders
- crypto price watchers

## Success criteria

- accurate price alerts triggered per user rules
- 95%+ uptime for price feed integration
- user retention through effective quiet hours/cooldowns
- owner dashboard showing active users and top alerts

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with quick actions
- **Add Coin** (button, actor: user, callback: add_coin:start) — Begin adding a new coin to watchlist
- **View List** (button, actor: user, callback: view_list:show) — Display current watchlist items
- **/price** (command, actor: user, command: /price) — Check price for specific coin or entire watchlist
- **Settings** (button, actor: user, callback: settings:open) — Configure quiet hours/cooldowns
- **/owner** (command, actor: owner, command: /owner) — Show admin dashboard metrics

## Flows

### setup_flow
_Trigger:_ /start

1. Display welcome message
2. Show quick action buttons: Add Coin, View List, /price, Settings

_Data touched:_ user_profile

### add_coin_flow
_Trigger:_ add_coin:start

1. Show common coin buttons (BTC, ETH, TON)
2. Allow custom ticker input
3. Prompt for nickname (optional)
4. Configure rules via guided prompts

_Data touched:_ watchlist_item, user_profile

### price_check_flow
_Trigger:_ /price

1. Parse optional ticker parameter
2. Fetch current price data
3. Display price with 1h change if 'all' requested

_Data touched:_ watchlist_item, alert_record

### alert_flow
_Trigger:_ price_rule_triggered

1. Validate against cooldown period
2. Send alert message with details
3. Record alert in history

_Data touched:_ alert_record, user_profile

### owner_dashboard_flow
_Trigger:_ /owner

1. Verify owner identity
2. Display active user count
3. Show top 10 most-fired alerts

_Data touched:_ user_profile, alert_record

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user_profile** _(retention: persistent)_ — User-specific configuration and preferences
  - fields: telegram_id, timezone, quiet_hours_start, quiet_hours_end, summary_time, currency
- **watchlist_item** _(retention: persistent)_ — Monitored cryptocurrency with rules
  - fields: ticker, nickname, threshold_rules, percent_move_rules
- **alert_record** _(retention: persistent)_ — Historical alert data for users and owner metrics
  - fields: user_id, item_ticker, rule_type, trigger_time, old_price, new_price, percent_change

## Integrations

- **Telegram** (required) — Bot API messaging and notifications
- **External Price API** (required) — Fetch cryptocurrency prices
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- /owner command to view metrics

## Notifications

- Price alert notifications
- Morning summary messages
- Owner dashboard updates

## Permissions & privacy

- Private per-user data storage
- No access to user funds
- Silent failure handling for price feed errors

## Edge cases

- Unknown/invalid ticker symbols
- Quiet hours crossing midnight
- Multiple rule triggers during cooldown
- Price API failures with retries

## Required tests

- Verify alert suppression during quiet hours
- Test 30m cooldown between identical alerts
- Validate morning summary scheduling
- Confirm owner dashboard metrics accuracy

## Assumptions

- USD as default fiat currency
- 1-hour fixed window for percent-move rules
- 30-minute fixed cooldown period
- Telegram profile timezone used if not explicitly set
