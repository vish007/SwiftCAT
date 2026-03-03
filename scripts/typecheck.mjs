import { parseMessage } from '../src/core.mjs';

parseMessage({ type: 'MT103', amount: 1, account: 'TYPE', reference: 'CHK' });
console.log('typecheck shim ok');
