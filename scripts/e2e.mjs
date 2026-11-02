// Avvia le prove sulle schermate chiedendo SEMPRE su quale telefono farle: iOS, Android o entrambi.
//   npm run e2e                      → chiede la scelta
//   npm run e2e -- ios               → solo iPhone
//   npm run e2e -- android           → Android e schermo piccolo (360 px, anch'esso Android)
//   npm run e2e -- entrambi          → tutti
// Dopo la scelta si possono aggiungere le opzioni di Playwright (es. un file o -g "testo").
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';

const SCELTE = {
  ios: ['iphone'],
  android: ['android', 'piccolo-360'],
  entrambi: ['iphone', 'android', 'piccolo-360'],
};
const ALIAS = { 1: 'ios', 2: 'android', 3: 'entrambi', iphone: 'ios', both: 'entrambi', tutti: 'entrambi' };

const args = process.argv.slice(2);
const given = args[0]?.toLowerCase();
let scelta = SCELTE[given] ? given : ALIAS[given];
const rest = scelta ? args.slice(1) : args;

if (!scelta) {
  if (!process.stdin.isTTY) {
    console.error('Dimmi su quale telefono provare: npm run e2e -- ios | android | entrambi');
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Su quale telefono vuoi provare?\n  1) iOS (iPhone)\n  2) Android (e schermo piccolo 360 px)\n  3) Entrambi');
  while (!scelta) {
    const r = (await rl.question('Scelta [1-3]: ')).trim().toLowerCase();
    scelta = SCELTE[r] ? r : ALIAS[r];
  }
  rl.close();
}

const progetti = SCELTE[scelta].map((p) => `--project=${p}`);
console.log(`▶ Prove su: ${scelta} (${SCELTE[scelta].join(', ')})`);
// si chiama Playwright direttamente (senza shell): le opzioni con spazi o virgolette arrivano intatte
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const r = spawnSync(process.execPath, [cli, 'test', ...progetti, ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
