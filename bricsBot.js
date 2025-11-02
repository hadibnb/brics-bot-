import Web3 from "web3";
import fs from "fs";

// بارگذاری مقادیر از محیط
const RPC_URL = process.env.BSC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MAIN_WALLET = process.env.MAIN_WALLET;
const BRICS_TOKEN = process.env.BRICS_TOKEN;
const BOT_ADDRESS = process.env.BOT_ADDRESS;

// اتصال به شبکه BSC
const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));

// ایجاد حساب از کلید خصوصی
const account = web3.eth.accounts.wallet.add(PRIVATE_KEY);

// فایل ABIها
const erc20Abi = JSON.parse(fs.readFileSync("./erc20abi.json"));
const routerAbi = JSON.parse(fs.readFileSync("./routerABI.json"));

// آدرس Pancake Router
const routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const router = new web3.eth.Contract(routerAbi, routerAddress);
const brics = new web3.eth.Contract(erc20Abi, BRICS_TOKEN);

async function tradeLoop() {
  try {
    const bnbBalance = await web3.eth.getBalance(account.address);
    const bnb = web3.utils.fromWei(bnbBalance, "ether");

    if (bnb < 0.002) {
      console.log("Low gas balance, waiting...");
      return;
    }

    const randomAction = Math.random() < 0.5 ? "buy" : "sell";

    if (randomAction === "buy") {
      console.log("Buying BRICS...");
      const value = web3.utils.toWei("0.001", "ether");

      const tx = await router.methods.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [routerAddress, BRICS_TOKEN],
        account.address,
        Math.floor(Date.now() / 1000) + 60
      ).send({ from: account.address, value });

      console.log("Buy TX:", tx.transactionHash);

    } else {
      console.log("Selling BRICS...");
      const balance = await brics.methods.balanceOf(account.address).call();
      if (balance > 0) {
        await brics.methods.approve(routerAddress, balance).send({ from: account.address });

        const tx = await router.methods.swapExactTokensForETHSupportingFeeOnTransferTokens(
          balance,
          0,
          [BRICS_TOKEN, routerAddress],
          account.address,
          Math.floor(Date.now() / 1000) + 60
        ).send({ from: account.address });

        console.log("Sell TX:", tx.transactionHash);

        // بازگشت ۵۰٪ سود
        const profit = web3.utils.toWei("0.0005", "ether");
        await web3.eth.sendTransaction({
          from: account.address,
          to: MAIN_WALLET,
          value: profit
        });
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

// اجرای حلقه هر ۳۰ ثانیه
setInterval(tradeLoop, 30000);
