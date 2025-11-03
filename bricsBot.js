// bricsBot.js
import Web3 from "web3";
import fs from "fs";

const {
  BSC_RPC_URL,
  PRIVATE_KEY,
  MAIN_WALLET,
  BRICS_TOKEN,
  BOT_ADDRESS,
  DRY_RUN,
} = process.env;

if (!BSC_RPC_URL || !PRIVATE_KEY || !MAIN_WALLET || !BRICS_TOKEN || !BOT_ADDRESS) {
  console.error("❌ Missing environment variables. Check your GitHub Secrets.");
  process.exit(1);
}

const web3 = new Web3(BSC_RPC_URL);
const account = web3.eth.accounts.wallet.add(PRIVATE_KEY);
const routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // PancakeSwap V2 Router
const tokenAddress = BRICS_TOKEN;
const mainWallet = MAIN_WALLET;
const dryRun = (DRY_RUN || "false").toLowerCase() === "true";

// ✅ توابع کمکی
async function getBNBBalance() {
  const balance = await web3.eth.getBalance(mainWallet);
  return web3.utils.fromWei(balance, "ether");
}

async function getTokenBalance() {
  const abi = JSON.parse(fs.readFileSync("./abi.json", "utf8"));
  const token = new web3.eth.Contract(abi, tokenAddress);
  const bal = await token.methods.balanceOf(mainWallet).call();
  return web3.utils.fromWei(bal, "ether");
}

// ✅ شبیه‌سازی ترید
async function tradeOnce() {
  try {
    const bnbBal = await getBNBBalance();
    const brxBal = await getTokenBalance();

    console.log(`💰 BNB: ${bnbBal} | BRICS: ${brxBal}`);

    if (bnbBal < 0.002) {
      console.log("⚠️ Not enough BNB for gas.");
      return Promise.resolve();
    }

    const action = Math.random() > 0.5 ? "BUY" : "SELL";
    console.log(`🎯 Action chosen: ${action}`);

    if (dryRun) {
      console.log(`🧪 Dry run mode - would ${action}.`);
      return Promise.resolve();
    }

    const routerABI = JSON.parse(fs.readFileSync("./routerABI.json", "utf8"));
    const router = new web3.eth.Contract(routerABI, routerAddress);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 5;

    if (action === "BUY") {
      const buyAmount = web3.utils.toWei("0.001", "ether");
      const tx = router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [web3.utils.toChecksumAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"), tokenAddress],
        mainWallet,
        deadline
      );

      const gas = await tx.estimateGas({ from: mainWallet, value: buyAmount });
      const data = tx.encodeABI();
      const txData = {
        from: mainWallet,
        to: routerAddress,
        data,
        value: buyAmount,
        gas,
      };

      const signedTx = await web3.eth.accounts.signTransaction(txData, PRIVATE_KEY);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      console.log("✅ BUY completed:", receipt.transactionHash);
    } else {
      const sellAmount = web3.utils.toWei("1", "ether"); // adjust to balance later
      const tokenABI = JSON.parse(fs.readFileSync("./abi.json", "utf8"));
      const token = new web3.eth.Contract(tokenABI, tokenAddress);

      await token.methods.approve(routerAddress, sellAmount).send({ from: mainWallet });
      const tx = router.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
        sellAmount,
        0,
        [tokenAddress, web3.utils.toChecksumAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE")],
        mainWallet,
        deadline
      );

      const gas = await tx.estimateGas({ from: mainWallet });
      const data = tx.encodeABI();
      const txData = {
        from: mainWallet,
        to: routerAddress,
        data,
        gas,
      };

      const signedTx = await web3.eth.accounts.signTransaction(txData, PRIVATE_KEY);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      console.log("✅ SELL completed:", receipt.transactionHash);
    }
  } catch (err) {
    console.error("❌ Error in tradeOnce:", err.message || err);
    return Promise.resolve();
  }
}

// ✅ اجرای اصلی
async function execute() {
  console.log(`🚀 Running BRICS bot at ${new Date().toISOString()}`);
  await tradeOnce();
  console.log("✅ Cycle finished successfully.");
}

execute()
  .then(() => console.log("🎯 Execution complete."))
  .catch((e) => console.error("❌ Error in execution:", e.message || e))
  .finally(() => process.exit(0));
}

const account = web3.eth.accounts.wallet.length > 0 ? web3.eth.accounts.wallet[0].address : BOT_ADDRESS;
console.log(`👤 Active address: ${account}`);

const erc20Abi = JSON.parse(fs.readFileSync("./erc20abi.json", "utf8"));
const routerAbi = JSON.parse(fs.readFileSync("./routerABI.json", "utf8"));
const router = new web3.eth.Contract(routerAbi, ROUTER_ADDRESS);
const brics = new web3.eth.Contract(erc20Abi, BRICS_TOKEN);

async function getBalances() {
  const bnb = await web3.eth.getBalance(account);
  const brx = await brics.methods.balanceOf(account).call();
  return {
    bnb: parseFloat(web3.utils.fromWei(bnb, "ether")),
    brx: parseFloat(web3.utils.fromWei(brx, "ether")),
  };
}

async function execute() {
  console.log("🔁 Starting trade cycle...");

  const { bnb, brx } = await getBalances();
  console.log(`💰 Balances | BNB: ${bnb.toFixed(6)} | BRICS: ${brx.toFixed(2)}`);

  if (bnb < 0.002) {
    console.log("⚠️ Insufficient gas balance (<0.002 BNB). Skipping.");
    return;
  }

  const action = brx < 1 ? "BUY" : "SELL";
  const deadline = Math.floor(Date.now() / 1000) + 120;
  const pathBuy = [WBNB_ADDRESS, BRICS_TOKEN];
  const pathSell = [BRICS_TOKEN, WBNB_ADDRESS];

  if (action === "BUY") {
    const amountBNB = web3.utils.toWei("0.001", "ether");
    console.log(`🟢 BUY mode | amount: ${web3.utils.fromWei(amountBNB)} BNB | DRY_RUN=${DRY_RUN}`);

    if (!DRY_RUN) {
      const tx = router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0, pathBuy, account, deadline
      ).send({ from: account, value: amountBNB, gas: 400000 });
      const receipt = await tx;
      console.log(`✅ BUY tx hash: ${receipt.transactionHash}`);
    } else {
      console.log("💡 DRY_RUN active - simulated BUY");
    }
  } else {
    console.log("🔴 SELL mode | DRY_RUN=" + DRY_RUN);
    if (brx < 0.5) {
      console.log("📉 Not enough BRICS to sell.");
      return;
    }

    const amountSell = web3.utils.toWei(brx.toString(), "ether");
    if (!DRY_RUN) {
      await brics.methods.approve(ROUTER_ADDRESS, amountSell).send({ from: account, gas: 100000 });
      const tx = router.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
        amountSell, 0, pathSell, account, deadline
      ).send({ from: account, gas: 400000 });
      const receipt = await tx;
      console.log(`✅ SELL tx hash: ${receipt.transactionHash}`);
    } else {
      console.log("💡 DRY_RUN active - simulated SELL");
    }
  }
}

execute()
  .then(() => console.log("✅ Cycle completed."))
  .catch((e) => {
    console.error("❌ Error:", e.message || e);
  })
  .finally(() => process.exit(0));
  // decide based on BRICS/BNB ratio instead of pure random
  const action = brx < 1 ? "BUY" : "SELL";
  const deadline = Math.floor(Date.now() / 1000) + 120;
  const pathBuy = [WBNB_ADDRESS, BRICS_TOKEN];
  const pathSell = [BRICS_TOKEN, WBNB_ADDRESS];

  if (action === "BUY") {
    const amountBNB = web3.utils.toWei("0.001", "ether");
    console.log(`🟢 BUY mode | amount: ${web3.utils.fromWei(amountBNB)} BNB | DRY_RUN=${DRY_RUN}`);

    if (!DRY_RUN) {
      const tx = router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0, pathBuy, account, deadline
      ).send({ from: account, value: amountBNB, gas: 400000 });
      const receipt = await tx;
      console.log(`✅ BUY tx hash: ${receipt.transactionHash}`);
    } else {
      console.log("💡 DRY_RUN active - simulated BUY");
    }
  } else {
    console.log("🔴 SELL mode | DRY_RUN=" + DRY_RUN);
    if (brx < 0.5) {
      console.log("📉 Not enough BRICS to sell.");
      return;
    }

    const amountSell = web3.utils.toWei(brx.toString(), "ether");
    if (!DRY_RUN) {
      await brics.methods.approve(ROUTER_ADDRESS, amountSell).send({ from: account, gas: 100000 });
      const tx = router.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
        amountSell, 0, pathSell, account, deadline
      ).send({ from: account, gas: 400000 });
      const receipt = await tx;
      console.log(`✅ SELL tx hash: ${receipt.transactionHash}`);
    } else {
      console.log("💡 DRY_RUN active - simulated SELL");
    }
  }
}

execute()
execute()
  .then(() => console.log("✅ Cycle completed."))
  .catch((e) => {
    console.error("❌ Error:", e.message || e);
  })
  .finally(() => process.exit(0));

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
