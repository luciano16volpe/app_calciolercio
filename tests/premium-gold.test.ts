// Punto 7: l'oro Premium è definito una volta sola, uguale in tutti i punti dell'app, e leggibile nei due temi.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync('src/styles/app.css', 'utf8');
const TOKENS = ['gold1', 'gold2', 'gold-text', 'gold-edge', 'gold-label', 'gold-tint', 'gold-tint-edge'] as const;

/** Valori di una variabile, nell'ordine in cui compaiono: tema chiaro, tema scuro del sistema, tema scuro scelto. */
const values = (name: string) => [...css.matchAll(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]!.toLowerCase());

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('ogni colore dell’oro è definito per tema chiaro, scuro di sistema e scuro scelto', () => {
  for (const t of TOKENS) {
    const v = values(t);
    expect(v, `--${t}`).toHaveLength(3);
    expect(v[1], `--${t}: i due temi scuri sono uguali`).toBe(v[2]);
    expect(v[0], `--${t}: chiaro e scuro sono diversi`).not.toBe(v[1]);
  }
});

test.each([0, 1])('tema %i: testo e bordi dell’oro restano leggibili', (theme) => {
  const at = (name: string) => values(name)[theme === 0 ? 0 : 1]!;
  const page = at('gray');
  // testo scuro sull'oro (pulsanti, etichette)
  expect(contrast(at('gold-text'), at('gold1'))).toBeGreaterThanOrEqual(7);
  expect(contrast(at('gold-text'), at('gold2'))).toBeGreaterThanOrEqual(7);
  // il bordo separa il pulsante dallo sfondo (elementi grafici: almeno 3:1)
  expect(contrast(at('gold-edge'), page)).toBeGreaterThanOrEqual(3);
  // avvisi: titolo e testo sul fondo dorato chiaro
  expect(contrast(at('gold-label'), at('gold-tint'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(at('text'), at('gold-tint'))).toBeGreaterThanOrEqual(7);
  expect(contrast(at('gold-tint-edge'), page)).toBeGreaterThanOrEqual(1.5);
});

test('le funzioni Premium usano le variabili dell’oro, senza dorati scritti a mano nei componenti Premium', () => {
  const rules = css.split('\n').filter((l) => /premium|formation-publish-note|formation-my-vote|vote-premium/.test(l));
  expect(rules.length).toBeGreaterThan(5);
  for (const line of rules) expect(line, line.slice(0, 60)).not.toMatch(/#(f8db80|c99422|ab7714|392706|d2a03a|fff2cd|47300b|d5a633|ac7b17|342306|fff5d4|f5df9a|513b11)/i);
  expect(readFileSync('src/styles/menu.css', 'utf8')).not.toMatch(/menu-chip\.gold\{[^}]*#f2c94c/);
});
