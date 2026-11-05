import { test as base } from '@playwright/test';
export * from '@playwright/test';

/** I test con più telefoni devono chiudere anche i contesti creati a mano. */
export const test = base.extend<{ extraContexts: void }>({
  extraContexts: [async ({ browser }, runTest) => {
    const existing = new Set(browser.contexts());
    try { await runTest(); }
    finally { await Promise.all(browser.contexts().filter((context) => !existing.has(context)).map((context) => context.close())); }
  }, { auto: true }],
});
