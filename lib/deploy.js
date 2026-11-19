// Deploys one project: its renderer, then its Edition contract.
import { parseEther, isAddress } from 'viem';
import { compile } from './compile.js';
import { SEED_MODES, loadDeployments, saveDeployments, publicClient, walletClient } from './config.js';

export async function deployProject(project, chainName) {
  const wallet = walletClient(chainName);
  if (!wallet) throw new Error('DEPLOYER_PRIVATE_KEY is not set');
  const payout = process.env.PAYOUT_ADDRESS;
  if (!payout || !isAddress(payout)) throw new Error('PAYOUT_ADDRESS is not set or not an address');

  const deployments = loadDeployments(chainName);
  if (deployments[project.slug]) throw new Error(`${project.slug} is already deployed on ${chainName}`);

  const client = publicClient(chainName);
  const contracts = compile();
  const deploy = async (name, args = []) => {
    const hash = await wallet.deployContract({ abi: contracts[name].abi, bytecode: contracts[name].bytecode, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${name} deployment reverted`);
    return receipt;
  };

  const renderer = (await deploy(project.renderer)).contractAddress;
  const now = Math.floor(Date.now() / 1000);
  const receipt = await deploy('Edition', [
    {
      name: project.name,
      symbol: project.symbol,
      description: project.description,
      renderer,
      payout,
      price: parseEther(project.priceEth),
      priceStep: parseEther(project.priceStepEth || '0'),
      stepEvery: project.stepEvery || 0,
      startTime: BigInt(now - 60),
      endTime: project.durationDays ? BigInt(now + project.durationDays * 86400) : 0n,
      maxSupply: project.maxSupply || 0,
      seedMode: SEED_MODES[project.seedMode],
      giftLimit: project.giftLimit || 0,
    },
  ]);

  const entry = {
    edition: receipt.contractAddress,
    renderer,
    payout,
    block: Number(receipt.blockNumber),
    deployedAt: now,
  };
  deployments[project.slug] = entry;
  saveDeployments(chainName, deployments);
  return entry;
}
