// I link diretti (/invito/<codice>, /l/<lega>/…) devono aprire l'app: senza questa regola Vercel risponde «404 NOT_FOUND».
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vercel.json', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: Array<{ source: string; destination: string }> };

  it('ogni indirizzo che non è un file apre index.html (link d\'invito e link delle leghe)', () => {
    const rule = cfg.rewrites?.find((r) => r.destination === '/index.html');
    expect(rule, 'manca la regola che manda tutto a /index.html').toBeTruthy();
    const re = new RegExp('^' + (rule as { source: string }).source.replace(/^\//, '/') + '$');
    for (const path of ['/invito/09eb984961c44f918eff2789ff57c46d', '/l/san-marcello/rosa', '/l/san-marcello/classifiche', '/']) {
      expect(re.test(path), path).toBe(true);
    }
  });
});
