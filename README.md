# BRICS Trading Bot

Quick start:
1. Create repo and push files.
2. Add these secrets in GitHub (Repository -> Settings -> Secrets):
   - BSC_RPC_URL
   - PRIVATE_KEY (only for LIVE; don't put if DRY_RUN)
   - MAIN_WALLET
   - BRICS_TOKEN
   - BOT_ADDRESS
   - DRY_RUN (true/false)

3. Workflow will run every 5 minutes (or run manually via "Actions").

Local / Render:
- `npm ci`
- `npm start` (runs a single iteration; schedule repeats it externally)

**SAFETY**
- Test with `DRY_RUN=true` or on testnet first.
- Keep `PRIVATE_KEY` secret.
- Create file `stop.flag` in repo root or runner to stop quickly.
