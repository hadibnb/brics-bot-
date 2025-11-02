const Web3 = require('web3');
const fs = require('fs');

// ENV
const RPC = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org";
const BOT_PK = process.env.BOT_PRIVATE_KEY || "";
const BOT = process.env.BOT_ADDRESS || "";
const MAIN = process.env.MAIN_ADDRESS || "";
const BRICS = process.env.BRICS_TOKEN || "";
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB = "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const DRY_RUN = process.env.DRY_RUN === "true";

const web3 = new Web3(RPC);
const erc20ABI = JSON.parse(fs.readFileSync('./erc20abi.json'));
const routerABI = JSON.parse(fs.readFileSync('./routerABI.json'));

const token = new web3.eth.Contract(erc20ABI, BRICS);
const router = new web3.eth.Contract(routerABI, ROUTER);

async function getBalances() {
  const bnb = await web3.eth.getBalance(BOT);
  const brics = await token.methods.balanceOf(BOT).call();
  return { bnb, brics };
}

async function main() {
  if (fs.existsSync('./stop.flag')) {
    console.log('🚨 Stop flag found, aborting.');
    process.exit(0);
  }

  const { bnb, brics } = await getBalances();
  console.log(`💰 BNB: ${web3.utils.fromWei(bnb)} | BRICS: ${brics}`);

  const action = Math.random() > 0.5 ? "BUY" : "SELL";

  if (action === "BUY") {
    console.log(`🟢 DRY_RUN=${DRY_RUN} - Would buy BRICS with 0.001 BNB`);
  } else {
    console.log(`🔴 DRY_RUN=${DRY_RUN} - Would sell small amount of BRICS`);
  }

  // 50% profit return simulation
  const profit = web3.utils.toWei('0.002', 'ether');
  if (!DRY_RUN) {
    console.log(`💸 Sending 50% of profit (${web3.utils.fromWei(profit)/2} BNB) to main wallet...`);
  } else {
    console.log('💸 DRY_RUN: Simulated profit transfer');
  }
}

main().catch(console.error);
