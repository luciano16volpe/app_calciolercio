type Makers = typeof import('./make');

export const combosFormations = (...args: Parameters<Makers['combosFormations']>) => import('./make').then((m) => m.combosFormations(...args));
export const matchFormations = (...args: Parameters<Makers['matchFormations']>) => import('./make').then((m) => m.matchFormations(...args));
export const matchSummary = (...args: Parameters<Makers['matchSummary']>) => import('./make').then((m) => m.matchSummary(...args));
export const matchSheet = (...args: Parameters<Makers['matchSheet']>) => import('./make').then((m) => m.matchSheet(...args));
export const comboSheet = (...args: Parameters<Makers['comboSheet']>) => import('./make').then((m) => m.comboSheet(...args));
export const figurinaCanvas = (...args: Parameters<Makers['figurinaCanvas']>) => import('./make').then((m) => m.figurinaCanvas(...args));
export const compareCanvas = (...args: Parameters<Makers['compareCanvas']>) => import('./make').then((m) => m.compareCanvas(...args));
