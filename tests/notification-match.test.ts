import { expect, test } from 'vitest';
import { notificationMatch } from '../src/app/useShellWindows';

test('il link della push apre la scheda della partita indicata', () => {
  const id = '10000000-0000-4000-8000-000000000030';
  expect(notificationMatch('/l/lega/partite', `?match=${id}`)).toEqual({ kind: 'match', id });
  expect(notificationMatch('/l/lega/profilo', `?match=${id}`)).toBeNull();
  expect(notificationMatch('/l/lega/partite', '?match=non-valido')).toBeNull();
});
