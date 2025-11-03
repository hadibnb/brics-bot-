// bricsBot.js
// BRICS Bot: dynamic LP trading with auto-buy on external sale, liquidity growth, DRY_RUN & stop.flag

const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

// === CONFIG / ENV (Secrets) ===
const RPC_URL = process.env.BSC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MAIN_WALLET = process.env.MAIN_WALLET;
const BRICS_TOKEN = process.env.BRICS_TOKEN;
const BOT_ADDRESS = process.env.BOT_ADDRESS;
const DRY_RUN = (process.env.DRY_RUN === 'true');

const ROUTER_ADDRESS = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const FACTORY_ADDRESS = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73"; // PancakeSwap V2 Factory
const WBNB_ADDRESS  = "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const STATE_FILE = path.resolve(__dirname, 'tradeState.json');
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// --- Setup web3 ---
const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));
if (!PRIVATE_KEY && !DRY_RUN) { console.error("PRIVATE_KEY is required unless DRY_RUN=true"); process.exit(1); }
if (PRIVATE_KEY) web3.eth.accounts.wallet.add(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
const accountAddress = web3.eth.accounts.wallet.length > 0 ? web3.eth.accounts.wallet[0].address : BOT_ADDRESS;

// --- Load ABIs ---
const erc20Abi = JSON.parse(fs.readFileSync('./erc20abi.json', 'utf8'));
const routerAbi = JSON.parse(fs.readFileSync('./routerABI.json', 'utf8'));
const factoryAbi = JSON.parse(fs.readFileSync('./factoryABI.json', 'utf8'));
const pairAbi = JSON.parse(fs.readFileSync('./pairABI.json', 'utf8'));

const router = new web3.eth.Contract(routerAbi, ROUTER_ADDRESS);
const factory = new web3.eth.Contract(factoryAbi, FACTORY_ADDRESS);
const brics = new web3.eth.Contract(erc20Abi, BRICS_TOKEN);

// stop.flag
if (fs.existsSync('./stop.flag')) { console.log('Stop flag detected. Exiting.'); process.exit(0); }

// --- Load or init trade state ---
let tradeState = { lastBuyBNB: '0', lastSellTokens: '0', lastReserveBRICS: '0', lastReserveBNB: '0' };
if (fs.existsSync(STATE_FILE)) {
  try { tradeState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { console.warn('Failed to parse tradeState.json'); }
}

function saveState() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(tradeState, null, 2), 'utf8'); } catch (err) { console.error('Failed to write state:', err.message); } }

async function getPairAddress() {
  return await factory.methods.getPair(BRICS_TOKEN, WBNB_ADDRESS).call();
}

async function getLPReserves(pairAddress) {
  const pair = new web3.eth.Contract(pairAbi, pairAddress);
  const reserves = await pair.methods.getReserves().call();
  const token0 = await pair.methods.token0().call();
  const reserveBRICS = (token0.toLowerCase() === BRICS_TOKEN.toLowerCase()) ? reserves._reserve0 : reserves._reserve1;
  const reserveBNB   = (token0.toLowerCase() === BRICS_TOKEN.toLowerCase()) ? reserves._reserve1 : reserves._reserve0;
  return { reserveBRICS: web3.utils.toBN(reserveBRICS), reserveBNB: web3.utils.toBN(reserveBNB) };
}

async function getBalances() {
  const bnb = await web3.eth.getBalance(accountAddress);
  const bricsBal = await brics.methods.balanceOf(accountAddress).call();
  return { bnb, bricsBal };
}

async function safeSend(txPromise) {
  const receipt = await txPromise;
  if (!receipt || (typeof receipt.status !== 'undefined' && !receipt.status && receipt.status !== '0x1')) throw new Error('Transaction failed');
  return receipt;
}

async function executeTrade() {
  try {
    const { bnb, bricsBal } = await getBalances();
    let bnbFloat = parseFloat(web3.utils.fromWei(bnb, 'ether'));
    console.log(`Balances — BNB: ${bnbFloat} | BRICS: ${bricsBal}`);

    if (bnbFloat < 0.002) { console.log('Low gas balance (<0.002 BNB). Skipping iteration.'); return; }

    const pairAddress = await getPairAddress();
    const { reserveBRICS, reserveBNB } = await getLPReserves(pairAddress);
    console.log(`LP reserves — BRICS: ${reserveBRICS.toString()} | BNB: ${reserveBNB.toString()}`);

    // --- Detect external sale ---
    if (reserveBRICS.lt(web3.utils.toBN(tradeState.lastReserveBRICS || '0'))) {
      const diff = web3.utils.toBN(tradeState.lastReserveBRICS).sub(reserveBRICS);
      console.log(`External sale detected: ${diff.toString()} tokens sold. Executing small buy to compensate.`);
      const smallBuyBNB = web3.utils.toWei('0.0005', 'ether'); // small buy
      if (!DRY_RUN && bnbFloat > 0.001) {
        const buyTx = router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
          0, [WBNB_ADDRESS, BRICS_TOKEN], accountAddress, Math.floor(Date.now()/1000)+300
        );
        const gasEstimate = await buyTx.estimateGas({ from: accountAddress, value: smallBuyBNB });
        await safeSend(buyTx.send({ from: accountAddress, value: smallBuyBNB, gas: gasEstimate + 10000 }));
        bnbFloat -= parseFloat(web3.utils.fromWei(smallBuyBNB));
      } else console.log('DRY_RUN or low BNB: skipped external sale buy.');
    }

    // --- Dynamic buy amount based on LP reserves ---
    const lpChangeRatio = tradeState.lastReserveBRICS > 0 ?
      reserveBRICS.sub(web3.utils.toBN(tradeState.lastReserveBRICS)).abs().mul(web3.utils.toBN(1000)).div(web3.utils.toBN(tradeState.lastReserveBRICS)) :
      web3.utils.toBN(0); // scaled *1000

    let dynamicBuyBNB = Math.min(bnbFloat * 0.05, 0.002); // default small percent
    if (lpChangeRatio.gt(web3.utils.toBN(50))) { dynamicBuyBNB *= 1.5; } // big LP change → more buy
    dynamicBuyBNB = Math.min(dynamicBuyBNB, bnbFloat - 0.001); // keep gas

    console.log(`Dynamic BUY amount: ${dynamicBuyBNB} BNB`);
    if (!DRY_RUN && dynamicBuyBNB > 0.0001) {
      const buyAmountBNB = web3.utils.toWei(dynamicBuyBNB.toString(), 'ether');
      const buyTx = router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0, [WBNB_ADDRESS, BRICS_TOKEN], accountAddress, Math.floor(Date.now()/1000)+300
      );
      const gasEstimate = await buyTx.estimateGas({ from: accountAddress, value: buyAmountBNB });
      await safeSend(buyTx.send({ from: accountAddress, value: buyAmountBNB, gas: gasEstimate + 10000 }));
      tradeState.lastBuyBNB = buyAmountBNB;
      bnbFloat -= parseFloat(web3.utils.fromWei(buyAmountBNB));
      console.log('Dynamic buy executed.');
    }

    // --- Dynamic sell amount ---
    const tokenBalanceBN = web3.utils.toBN(await brics.methods.balanceOf(accountAddress).call() || '0');
    let sellAmountBN = tokenBalanceBN;
    if (!web3.utils.toBN(tradeState.lastBuyBNB).isZero()) sellAmountBN = web3.utils.toBN(tradeState.lastSellTokens || '0');
    sellAmountBN = sellAmountBN.gt(tokenBalanceBN) ? tokenBalanceBN : sellAmountBN;

    if (!sellAmountBN.isZero()) {
      console.log(`Preparing SELL: ${web3.utils.fromWei(sellAmountBN.toString())} tokens`);
      if (!DRY_RUN) {
        const allowance = web3.utils.toBN(await brics.methods.allowance(accountAddress, ROUTER_ADDRESS).call());
        if (allowance.lt(sellAmountBN)) {
          const approveTx = brics.methods.approve(ROUTER_ADDRESS, sellAmountBN.toString());
          const gasApprove = await approveTx.estimateGas({ from: accountAddress });
          await safeSend(approveTx.send({ from: accountAddress, gas: gasApprove + 5000 }));
        }
        const swapTx = router.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
          sellAmountBN.toString(), 0, [BRICS_TOKEN, WBNB_ADDRESS], accountAddress, Math.floor(Date.now()/1000)+300
        );
        const gasSwap = await swapTx.estimateGas({ from: accountAddress });
        await safeSend(swapTx.send({ from: accountAddress, gas: gasSwap + 10000 }));
        tradeState.lastSellTokens = sellAmountBN.toString();
        console.log('Sell executed.');
      }
    }

    // --- Save latest LP reserves ---
    tradeState.lastReserveBRICS = reserveBRICS.toString();
    tradeState.lastReserveBNB = reserveBNB.toString();
    saveState();

  } catch (err) { console.error('Error in executeTrade:', err.message || err); }
}

// Run first iteration immediately
executeTrade();
// Schedule every 10 minutes
setInterval(executeTrade, INTERVAL_MS);
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
