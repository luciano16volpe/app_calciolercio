// Aspetto delle fasce delle figurine e degli stati di forma. GENERATO dalle costanti FUT_TIERS e FORM_STATES
// della prima versione; i test verificano le soglie attuali senza eseguire il codice storico.
import type { FutTier } from './ovr';

export interface TierStyle {
  label: string;
  /** 5 colori del metallo, dal più chiaro al più scuro (sfumatura della carta). */
  metal: [string, string, string, string, string];
  text: string;
  sub: string;
  line: string;
  glow: string;
  spark: string;
  emboss: string;
  stripe: string;
  /** carta olografica (Top player) */
  holo?: boolean;
  /** animaletto al posto delle scintille (Cacca, Marcia) */
  critter?: string;
}

export const FUT_TIERS: Record<FutTier, TierStyle> = {
  top: {
    label: "TOP PLAYER",
    metal: ["#8b6cff", "#4b2fd1", "#1c1063", "#6a4cf0", "#0b0630"],
    text: "#ffe27a",
    sub: "#ece6ff",
    line: "#ffe27a",
    glow: "#9d86ff",
    spark: "#fff1a8",
    emboss: "rgba(0,0,0,0.6)",
    stripe: "rgba(255,255,255,0.07)",
    holo: true,
  },
  gold: {
    label: "ORO",
    metal: ["#fff4c2", "#f0cc55", "#c4951c", "#f8df85", "#8a650e"],
    text: "#2a1c00",
    sub: "#4b3810",
    line: "#fff7d6",
    glow: "#f2c94c",
    spark: "#fff2a8",
    emboss: "rgba(255,250,220,0.75)",
    stripe: "rgba(255,255,255,0.10)",
  },
  silver: {
    label: "ARGENTO",
    metal: ["#ffffff", "#e1e6ee", "#a7b0be", "#eff2f7", "#6c7788"],
    text: "#111721",
    sub: "#333c4b",
    line: "#ffffff",
    glow: "#c9d4e6",
    spark: "#ffffff",
    emboss: "rgba(255,255,255,0.85)",
    stripe: "rgba(255,255,255,0.14)",
  },
  bronze: {
    label: "BRONZO",
    metal: ["#ffdcb5", "#e39f62", "#a5612d", "#ecb57f", "#66371a"],
    text: "#291304",
    sub: "#4a2a12",
    line: "#ffe6cd",
    glow: "#e39b5c",
    spark: "#ffd6ad",
    emboss: "rgba(255,232,210,0.65)",
    stripe: "rgba(255,255,255,0.10)",
  },
  cacca: {
    label: "CACCA",
    metal: ["#b8946a", "#86603a", "#55391c", "#9c7648", "#2f1e0c"],
    text: "#fff1d9",
    sub: "#f1dcbc",
    line: "#dcbc8e",
    glow: "#8a6a3a",
    spark: "#c9a578",
    emboss: "rgba(0,0,0,0.45)",
    stripe: "rgba(255,255,255,0.06)",
    critter: "💩",
  },
  marcia: {
    label: "MARCIO VOMITO",
    metal: ["#a9bd72", "#71863a", "#3f4c18", "#8ca252", "#212a0a"],
    text: "#f4ffdb",
    sub: "#e2eec2",
    line: "#c8d98c",
    glow: "#7f9a3a",
    spark: "#d3e39a",
    emboss: "rgba(0,0,0,0.45)",
    stripe: "rgba(255,255,255,0.06)",
    critter: "🪰",
  },
};

export type FormStateKey = 'up' | 'flat' | 'down';

/** Etichetta, freccia e colore dello stato di forma. */
export const FORM_STATES: Record<FormStateKey, { label: string; arrow: string; col: string }> = {
  up: { label: "In forma", arrow: "↗", col: "#3aad5e" },
  flat: { label: "Costante", arrow: "→", col: "#e0a92e" },
  down: { label: "In calo", arrow: "↘", col: "#e05c5c" },
};
