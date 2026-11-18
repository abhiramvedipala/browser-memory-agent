#!/usr/bin/env node
// Thin launcher: registers tsx so the TypeScript sources run directly, then starts the CLI.
import { register } from 'tsx/esm/api';

register();
const { main } = await import('../src/cli.ts');
process.exitCode = await main(process.argv.slice(2));
process.exit(process.exitCode);
