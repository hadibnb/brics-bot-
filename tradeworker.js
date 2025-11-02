// tradeworker.js
const Web3 = require('web3');
const fs = require('fs');

const RPC = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org";
const BOT_PK = process.env.PRIVATE_KEY || "";
const BOT = process.env.BOT_ADDRESS || "";
const MAIN = process.env.MAIN_WALLET || "";
const BRICS = process.env.BRICS_TOKEN || "";
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB = "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const DRY_RUN = process.env.DRY_RUN === "true";

const web3 = new Web3(RPC);
const erc20ABI = JSON.parse(fs.readFileSync('./erc20abi.json', 'utf8'));
const routerABI = JSON.parse(fs.readFileSync('./routerABI.json', 'utf8'));

const token = new web3.eth.Contract(erc20ABI, BRICS);
const router = new web3.eth.Contract(routerABI, ROUTER);

async function getBalances(addr) {
  const bnb = await web3.eth.getBalance(addr);
  const brics = await token.methods.balanceOf(addr).call();
  return { bnb, brics };
}

async function main() {
  if (fs.existsSync('./stop.flag')) {
    console.log('🚨 Stop flag found, aborting.');
    process.exit(0);
  }

  const acct = BOT_PK && !DRY_RUN ? web3.eth.accounts.privateKeyToAccount(BOT_PK) : { address: BOT };
  const { bnb, brics } = await getBalances(acct.address);
  console.log(`💰 BNB: ${web3.utils.fromWei(bnb)} | BRICS: ${brics}`);

  const action = Math.random() > 0.5 ? "BUY" : "SELL";

  if (action === "BUY") {
    console.log(`🟢 DRY_RUN=${DRY_RUN} - Would buy BRICS with 0.001 BNB`);
  } else {
    console.log(`🔴 DRY_RUN=${DRY_RUN} - Would sell small amount of BRICS`);
  }

  // simulate profit handling in DRY_RUN
  const profit = web3.utils.toWei('0.002', 'ether');
  if (!DRY_RUN) {
    console.log(`💸 Would send 50% of profit (${web3.utils.fromWei(profit) / 2} BNB) to main wallet...`);
  } else {
    console.log('💸 DRY_RUN: Simulated profit transfer');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('tradeworker error:', err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
