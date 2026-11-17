// Compiles everything in contracts/ with the bundled solc. Result is cached in artifacts/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT } from './config.js';

const require = createRequire(import.meta.url);
let memo;

export function compile() {
  if (memo) return memo;
  const dir = path.join(ROOT, 'contracts');
  const sources = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sol')).sort()) {
    sources[`contracts/${f}`] = { content: fs.readFileSync(path.join(dir, f), 'utf8') };
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  const cacheFile = path.join(ROOT, 'artifacts', 'build.json');
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cached.hash === hash) return (memo = cached.contracts);
  }

  const solc = require('solc');
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const findImports = (p) => {
    try {
      return { contents: fs.readFileSync(path.join(ROOT, 'node_modules', p), 'utf8') };
    } catch {
      return { error: `not found: ${p}` };
    }
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));

  const contracts = {};
  for (const file of Object.keys(sources)) {
    for (const [name, c] of Object.entries(out.contracts[file])) {
      contracts[name] = { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
    }
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ hash, contracts }));
  return (memo = contracts);
}
