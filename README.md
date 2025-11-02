# BRICS Trading Bot

## Quick start (deploy to Render)

1. Create a GitHub repo and push these files.
2. On Render, create a new **Web Service** (or Background Worker):
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Add Environment Variables (Render -> Service -> Environment):
   - BSC_RPC_URL (e.g. https://bsc-dataseed.binance.org)
   - BOT_ADDRESS (0xba5aee7...)
   - MAIN_ADDRESS (0x67594e1...)
   - BRICS_TOKEN (0xAF20...)
   - DRY_RUN=true (initially)
   - BOT_PRIVATE_KEY (only when ready to go LIVE) — **secret**
   - Optional: adjust other CONFIG via env variables
4. Deploy. Check Logs for outputs.
5. After satisfactory testing (logs show expected DRY_RUN messages), set `DRY_RUN=false`, add `BOT_PRIVATE_KEY` and redeploy.

## Safety & Testing
- Always test on testnet or with DRY_RUN first.
- Keep BOT_PRIVATE_KEY secret.
- Use `stop.flag` file to stop the bot immediately (create it in repo or via Render console).
