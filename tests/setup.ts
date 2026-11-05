// I test usano fixture con ultima partita al 28/10/2026: l'«oggi» è fermo al giorno dopo,
// così la regola «niente stato di forma se l'ultima pagella ha più di un mese» non cambia i risultati col passare del tempo.
import { vi } from 'vitest';
import { TEST_TODAY } from './today';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(`${TEST_TODAY}T12:00:00Z`));
