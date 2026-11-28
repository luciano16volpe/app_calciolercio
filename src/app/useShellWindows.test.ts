import { expect, test } from 'vitest';
import { notificationMatch } from './useShellWindows';

const id = '123e4567-e89b-42d3-a456-426614174000';

test('il link del sondaggio apre direttamente il voto formazioni', () => {
  expect(notificationMatch('/l/lega/partite', `?formation-poll=${id}`))
    .toEqual({ kind: 'formationPoll', id });
  expect(notificationMatch('/l/lega/partite', `?match=${id}`))
    .toEqual({ kind: 'match', id });
  expect(notificationMatch('/l/lega/profilo', `?formation-poll=${id}`)).toBeNull();
  expect(notificationMatch('/l/lega/partite', '?formation-poll=non-valido')).toBeNull();
});
