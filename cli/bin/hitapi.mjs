#!/usr/bin/env node
import { main } from '../src/main.mjs';

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  console.error(`hitapi: ${e?.message || e}`);
  process.exitCode = 2;
});
