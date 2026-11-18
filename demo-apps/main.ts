// `npm run demo` starts every demo app on 127.0.0.1 (see DEMO_PORT).
import { startDemoServer } from './server.ts';
import { allApps } from './apps/index.ts';
import { mutate } from './mutate.ts';

const srv = await startDemoServer({ apps: allApps, mutator: mutate, verbose: true });
console.log(`demo apps on ${srv.url}  (Ctrl-C to stop)`);
const stop = () => void srv.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
