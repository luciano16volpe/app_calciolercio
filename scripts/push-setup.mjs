// Configura le notifiche push sul progetto Supabase (da lanciare UNA volta, da te):  npm run push:setup
//  1. genera le chiavi VAPID e un segreto per il promemoria;
//  2. mette chiave privata, chiave pubblica e segreto nei «Secrets» della funzione (mai nel codice né nel repository);
//  3. salva nel database la chiave PUBBLICA (la legge l'app) e il segreto del cron (illeggibile da fuori);
//  4. pubblica la funzione «push».
// Supabase chiede conferma prima di cambiare l'ambiente di produzione: rispondi sì quando te lo chiede (3 volte). Va lanciato da un terminale normale.
// I file temporanei stanno in una cartella di sistema, fuori dal progetto, e si cancellano alla fine. Non stampa nessuna chiave.
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REF = 'ivrwqpuikbnvnxgvgegd';
const run = (args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });

const dir = mkdtempSync(join(tmpdir(), 'calciolercio-push-'));
try {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const rawPublic = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');
  const cron = randomBytes(32).toString('hex');

  writeFileSync(join(dir, 'secrets.env'), `VAPID_PUBLIC_KEY=${rawPublic}\nVAPID_PRIVATE_KEY=${priv.d}\nCRON_SECRET=${cron}\n`);
  writeFileSync(
    join(dir, 'config.sql'),
    `insert into app_settings(key, value) values ('vapid_public', to_jsonb('${rawPublic}'::text)) on conflict (key) do update set value = excluded.value;\n` +
      `insert into private_config(key, value) values ('cron_secret', '${cron}') on conflict (key) do update set value = excluded.value;\n`,
  );

  console.log('1/3 Segreti della funzione…');
  run(['supabase', 'secrets', 'set', '--env-file', join(dir, 'secrets.env'), '--project-ref', REF]);
  console.log('2/3 Chiave pubblica e segreto nel database…');
  run(['supabase', 'db', 'query', '--linked', '-f', join(dir, 'config.sql')]);
  console.log('3/3 Pubblico la funzione «push»…');
  run(['supabase', 'functions', 'deploy', 'push', '--project-ref', REF, '--no-verify-jwt', '--use-api']);
  console.log('\nFatto. Le notifiche sono configurate: da Impostazioni → Notifiche si attivano e si prova la notifica di prova.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
