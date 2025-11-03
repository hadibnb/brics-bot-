// bricsBot.js
// Single-run bot suitable for cron (GitHub Actions). Use DRY_RUN=true for dry mode.

const Web3 = require('web3');
const fs = require('fs');

// === CONFIG / ENV ===
const RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const MAIN_WALLET = process.env.MAIN_WALLET || "0x67594e1d30cec8a5f906c8278a1bc694641486cf";
const BRICS_TOKEN = process.env.BRICS_TOKEN || "0xAF2009350F6ECBE22c23A505a590239c7aaA3037";
const BOT_ADDRESS = process.env.BOT_ADDRESS || "";
const DRY_RUN = (process.env.DRY_RUN === "true");

// Pancake router & WBNB
const ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB_ADDRESS  = "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// basic validation
if (!RPC_URL || !BRICS_TOKEN || !MAIN_WALLET || !BOT_ADDRESS) {
  console.error("Missing required env variables. Ensure BSC_RPC_URL, BRICS_TOKEN, MAIN_WALLET and BOT_ADDRESS are set.");
  process.exit(1);
}

const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));

// add account (do not log private key)
if (!PRIVATE_KEY && !DRY_RUN) {
  console.error("PRIVATE_KEY is required unless DRY_RUN=true");
  process.exit(1);
}
if (PRIVATE_KEY) {
  try {
    web3.eth.accounts.wallet.add(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  } catch (err) {
    console.error("Failed to add private key to wallet:", err.message);
    process.exit(1);
  }
}
const accountAddress = web3.eth.accounts.wallet.length > 0 ? web3.eth.accounts.wallet[0].address : BOT_ADDRESS;

// load ABIs
const erc20Abi = JSON.parse(fs.readFileSync('./erc20abi.json', 'utf8'));
const routerAbi = JSON.parse(fs.readFileSync('./routerABI.json', 'utf8'));

const router = new web3.eth.Contract(routerAbi, ROUTER_ADDRESS);
const brics = new web3.eth.Contract(erc20Abi, BRICS_TOKEN);

// stop flag support
if (fs.existsSync('./stop.flag')) {
  console.log('Stop flag detected. Exiting without action.');
  process.exit(0);
}

async function getBalances() {
  const bnb = await web3.eth.getBalance(accountAddress);
  const bricsBal = await brics.methods.balanceOf(accountAddress).call();
  return { bnb, bricsBal };
}

async function safeSend(txPromise) {
  // helper to send tx and return receipt or throw
  const receipt = await txPromise;
  if (!receipt || (typeof receipt.status !== 'undefined' && !receipt.status)) {
    throw new Error('Transaction failed or returned false status');
  }
  return receipt;
}

async function tradeOnce() {
  try {
    const { bnb, bricsBal } = await getBalances();
    const bnbFloat = parseFloat(web3.utils.fromWei(bnb, 'ether'));
    console.log(`Balances — BNB: ${bnbFloat} | BRICS: ${bricsBal}`);

    if (bnbFloat < 0.002) {
      console.log('Low gas balance (<0.002 BNB). Aborting this iteration.');
      return;
    }

    // decide action
    const action = Math.random() < 0.5 ? 'BUY' : 'SELL';
    const deadline = Math.floor(Date.now() / 1000) + 120;

    if (action === 'BUY') {
      const buyAmountBNB = web3.utils.toWei('0.001', 'ether'); // example
      console.log(`Action=BUY. amount (BNB): ${web3.utils.fromWei(buyAmountBNB)}. DRY_RUN=${DRY_RUN}`);

      const path = [WBNB_ADDRESS, BRICS_TOKEN];

      if (DRY_RUN) {
        console.log('DRY_RUN: would call swapExactETHForTokensSupportingFeeOnTransferTokens with path:', path);
      } else {
        const tx = router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          path,
          accountAddress,
          deadline
        ).send({ from: accountAddress, value: buyAmountBNB, gas: 400000 });

        const receipt = await safeSend(tx);
        console.log('Buy tx hash:', receipt.transactionHash);
      }

    } else { // SELL
      console.log('Action=SELL. DRY_RUN=', DRY_RUN);

      const tokenBalance = await brics.methods.balanceOf(accountAddress).call();
      const tokenBalanceBN = web3.utils.toBN(tokenBalance || '0');

      if (tokenBalanceBN.isZero()) {
        console.log('No BRICS balance to sell.');
        return;
      }

      const path = [BRICS_TOKEN, WBNB_ADDRESS];

      if (DRY_RUN) {
        console.log('DRY_RUN: would approve and call swapExactTokensForETHSupportingFeeOnTransferTokens with path:', path);
      } else {
        // approve
        const approveTx = brics.methods.approve(ROUTER_ADDRESS, tokenBalanceBN.toString()).send({ from: accountAddress, gas: 100000 });
        await safeSend(approveTx);
        // swap
        const swapTx = router.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
          tokenBalanceBN.toString(),
          0,
          path,
          accountAddress,
          deadline
        ).send({ from: accountAddress, gas: 500000 });

        const receipt = await safeSend(swapTx);
        console.log('Sell tx hash:', receipt.transactionHash);

        // send 50% profit (example fixed nominal value) — ONLY if swap succeeded
        const profitWei = web3.utils.toWei('0.0005', 'ether'); // example, change as needed
        // Double-check there is enough BNB after swap for this transfer
        const postBnb = parseFloat(web3.utils.fromWei(await web3.eth.getBalance(accountAddress), 'ether'));
        if (postBnb > 0.0006) {
          if (DRY_RUN) {
            console.log(`DRY_RUN: would send profit ${web3.utils.fromWei(profitWei)} BNB to MAIN_WALLET`);
          } else {
            const sendTx = web3.eth.sendTransaction({
              from: accountAddress,
              to: MAIN_WALLET,
              value: profitWei,
              gas: 21000
            });
            const r = await safeSend(sendTx);
            console.log('Profit sent, tx:', r.transactionHash);
          }
        } else {
          console.log('Not enough BNB after swap to send profit safely.');
        }
      }
    }

  } catch (err) {
    console.error('Error during tradeOnce:', err.message || err);
  }
}

(async () => {
  await tradeOnce();
  console.log('Iteration finished.');
  process.exit(0);
})();
