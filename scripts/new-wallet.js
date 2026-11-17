// Creates a new wallet on THIS machine and prints it once. Nothing is saved or sent anywhere.
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

const key = generatePrivateKey();
console.log(`address:     ${privateKeyToAddress(key)}`);
console.log(`private key: ${key}`);
console.log('\nStore the private key in a password manager now. It cannot be recovered.');
