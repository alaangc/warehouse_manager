import type { Page, Request } from '@playwright/test';
import { test, expect, type Warehouse } from './support/bilingual-fixtures.js';
import { en } from '../../apps/web/src/i18n/locales/en.js';
import { es } from '../../apps/web/src/i18n/locales/es.js';

const storageKey = 'warehouse-manager-language';
type Language = 'en' | 'es';
type Role = 'admin' | 'driver' | 'preparingDriver';
function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === 'string'
        ? [[`${prefix}${key}`, item]]
        : Object.entries(flatten(item, `${prefix}${key}.`)),
    ),
  );
}
const texts = { en: flatten(en), es: flatten(es) };
const label = (key: string, language: Language = 'en') => texts[language][key]!;
const field = (page: Page, key: string, language: Language = 'en') =>
  page.getByLabel(label(key, language), { exact: true });
const button = (page: Page, key: string, language: Language = 'en') =>
  page.getByRole('button', { name: label(key, language), exact: true });
async function select(page: Page, key: string, option: string) {
  await page.getByRole('combobox', { name: label(key), exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function authenticate(page: Page, warehouse: Warehouse, role: Role) {
  const cookie = warehouse[role].cookie;
  const split = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: 'http://127.0.0.1:5173',
    },
  ]);
  await page.goto('/');
  // One-time preference setup, never an init script that would mask broken refresh persistence.
  await page.evaluate((key) => localStorage.setItem(key, 'en'), storageKey);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Hello,/ })).toBeVisible();
}
async function switchLanguage(page: Page, from: Language, to: Language) {
  await button(page, 'settings.languageSettings', from).click();
  const dialog = page.getByRole('dialog', {
    name: label('settings.languageSettings', from),
    exact: true,
  });
  await dialog
    .getByRole('combobox', { name: label('settings.language', from), exact: true })
    .click();
  await page
    .getByRole('option', {
      name: label(to === 'es' ? 'settings.spanish' : 'settings.english', from),
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog', { name: label('settings.languageSettings', to), exact: true })
    .getByRole('button', { name: label('common.close', to), exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', to);
}
async function visibleText(page: Page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const values: string[] = [];
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (
        parent &&
        !parent.closest('[aria-hidden="true"], [data-language-select]') &&
        parent.getClientRects().length &&
        getComputedStyle(parent).visibility !== 'hidden'
      ) {
        const text = walker.currentNode.textContent?.trim().replace(/\s+/g, ' ');
        if (text) values.push(text);
      }
    }
    return values;
  });
}
async function formValues(page: Page) {
  return page
    .locator(
      'main input, main textarea, main select, [role="dialog"] input, [role="dialog"] textarea',
    )
    .evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            !element.closest('[data-language-select]') &&
            element.getAttribute('aria-hidden') !== 'true',
        )
        .map((element) => {
          const input = element as HTMLInputElement;
          return { name: input.name, value: input.value, checked: input.checked };
        }),
    );
}
async function verifySwitch(
  page: Page,
  warehouse: Warehouse,
  keys: string[],
  extra?: (language: Language) => Promise<void>,
) {
  const url = page.url();
  const origin = await page.evaluate(() => performance.timeOrigin);
  const values = await formValues(page);
  const persisted = await warehouse.snapshot();
  const original = await visibleText(page);
  // Check every visible static resource string, including field labels, statuses and errors.
  // Interpolated dates/business values are checked explicitly by the populated fixtures below.
  const visibleKeys = Object.keys(texts.en).filter(
    (key) =>
      original.includes(label(key)) &&
      !label(key).includes('{{') &&
      label(key) !== label(key, 'es'),
  );
  const mutations: string[] = [];
  const record = (request: Request) => {
    if (request.url().includes('/api/v1/') && !['GET', 'HEAD'].includes(request.method()))
      mutations.push(`${request.method()} ${request.url()}`);
  };
  page.on('request', record);
  try {
    for (const [from, to] of [
      ['en', 'es'],
      ['es', 'en'],
    ] as const) {
      await switchLanguage(page, from, to);
      await expect
        .poll(async () => {
          const actual = await visibleText(page);
          return [...new Set([...visibleKeys, ...keys])].filter((key) => {
            if (keys.includes(key)) return !actual.includes(label(key, to));
            // The same English label can have distinct valid translations by context.
            return !visibleKeys
              .filter((other) => label(other) === label(key))
              .some((other) => actual.includes(label(other, to)));
          });
        })
        .toEqual([]);
      expect(await formValues(page)).toEqual(values);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
      if (extra) await extra(to);
    }
    expect(mutations).toEqual([]);
    expect(await warehouse.snapshot()).toEqual(persisted);
  } finally {
    page.off('request', record);
  }
  // Verify actual reload in both languages, with no storage-writing init script.
  await switchLanguage(page, 'en', 'es');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(button(page, 'settings.languageSettings', 'es')).toBeVisible();
  await switchLanguage(page, 'es', 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('en');
}

type ReviewPage = {
  id: string;
  role: Role;
  path: string | ((w: Warehouse) => string);
  keys: string[];
  prepare?: (p: Page, w: Warehouse) => Promise<void>;
  check?: (p: Page, w: Warehouse, l: Language) => Promise<void>;
};
const inventory: ReviewPage[] = [];
function review(
  id: string,
  role: Role,
  path: ReviewPage['path'],
  keys: string[],
  prepare?: ReviewPage['prepare'],
  check?: ReviewPage['check'],
) {
  inventory.push({
    id,
    role,
    path,
    keys,
    ...(prepare ? { prepare } : {}),
    ...(check ? { check } : {}),
  });
}
for (const role of ['admin', 'driver'] as const) {
  review(`${role}-overview`, role, '/', ['printers.availableActions', 'ui.summary'], async (p) => {
    await p
      .locator('summary')
      .filter({ hasText: label('printers.overview') })
      .click();
  });
  review(
    `${role}-inventory`,
    role,
    '/inventory',
    ['inventory.title', 'inventory.balances'],
    async (p) => {
      await field(p, 'inventory.searchInventory').fill('Carbón');
      await expect(p.getByRole('table')).toContainText('Carbón El Sol');
    },
  );
  review(`${role}-product`, role, (w) => `/inventory/products/${w.scenario.product.id}`, [
    'inventory.productData',
    'inventory.stockByLocation',
  ]);
  review(`${role}-movements`, role, '/inventory/movements', [
    'inventory.movementHistory',
    'inventory.immutableHistory',
  ]);
  review(`${role}-customers`, role, '/customers', ['customers.directory'], async (p) => {
    await field(p, 'customers.search').fill('Abarrotes Muñoz');
    await p.getByRole('button', { name: /Abarrotes Muñoz/ }).click();
    await expect(p.getByRole('heading', { name: 'Abarrotes Muñoz' })).toBeVisible();
    if (role === 'admin') {
      await field(p, 'customers.notes').fill('Borrador: José / 12.3400');
      await field(p, 'customers.exactUnitPrice').fill('17.2500');
      await button(p, 'customers.archiveCustomer').click();
      await expect(
        p.getByText(label('customers.archiveReasonRequired'), { exact: true }),
      ).toBeVisible();
    }
  });
  review(
    `${role}-sales-history`,
    role,
    '/sales',
    ['sales.title', 'common.date', 'common.status'],
    undefined,
    async (p, w, l) => {
      const row = p.getByRole('row').filter({ hasText: w.sale.saleNumber });
      await expect(row).toContainText('1,234.56');
      const date = await p.evaluate(
        ({ instant, language }) =>
          new Date(instant).toLocaleString(language === 'es' ? 'es-MX' : 'en-US'),
        { instant: w.sale.completedAt, language: l },
      );
      await expect(row).toContainText(date);
      await expect(row).toContainText(label('status.COMPLETED', l));
    },
  );
  review(`${role}-routes-active`, role, (w) => `/routes?routeId=${w.scenario.route.id}`, [
    'routes.routeInformation',
    'routes.history',
  ]);
  review(
    `${role}-documents`,
    role,
    '/documents',
    ['documents.title', 'documents.apply'],
    async (p, w) => {
      await field(p, 'documents.sourceId').fill(w.sale.id);
    },
  );
  review(
    `${role}-attempts`,
    role,
    '/documents',
    ['documents.attempts', 'documents.apply'],
    async (p, w) => {
      await p.getByRole('tab', { name: label('documents.attempts'), exact: true }).click();
      await field(p, 'documents.documentId').fill(w.document.id);
    },
  );
  review(`${role}-document-detail`, role, (w) => `/documents?documentId=${w.document.id}`, [
    'documents.download',
    'printers.print',
  ]);
  review(
    `${role}-attempt-detail`,
    role,
    '/documents',
    ['documents.attemptNumber', 'documents.actorId'],
    async (p) => {
      await p.getByRole('tab', { name: label('documents.attempts'), exact: true }).click();
      await button(p, 'documents.viewAttempt').first().click();
      await expect(p.getByRole('dialog')).toBeVisible();
    },
  );
  review(
    `${role}-settings`,
    role,
    '/settings',
    ['settings.title', 'printers.personal'],
    async (p) => {
      await field(p, 'printers.printer').selectOption({ label: 'Approved test printer' });
      if (role === 'admin') {
        await field(p, 'administration.currency').fill('USD');
        await field(p, 'administration.reason').fill('Borrador sin guardar');
      }
    },
  );
}
review(
  'admin-catalog',
  'admin',
  '/catalog',
  [
    'catalog.title',
    'catalog.locations',
    'catalog.categories',
    'catalog.units',
    'catalog.vehicles',
    'catalog.products',
  ],
  async (p) => {
    for (const kind of ['locations', 'categories', 'units', 'vehicles']) {
      const form = p.getByRole('form', { name: `${label(`catalog.${kind}`)} management form` });
      await form.getByLabel('Name', { exact: true }).fill(`Sin traducir ${kind}`);
    }
    const product = p.getByRole('form', { name: 'Product form' });
    await product.getByLabel('Name', { exact: true }).fill('Producto borrador');
    await product.getByLabel('Standard unit price', { exact: true }).fill('invalid');
    await product.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(p.getByText(label('catalog.unitPriceFormat'), { exact: true })).toBeVisible();
  },
);
review('driver-catalog', 'driver', '/catalog', ['catalog.title', 'catalog.driverReadOnly']);
review(
  'admin-inventory-draft',
  'admin',
  '/inventory/operations/new',
  ['inventory.recordOperation', 'inventory.quantityHelp'],
  async (p, w) => {
    await field(p, 'inventory.branchId').fill(w.scenario.origin.id);
    await field(p, 'common.productId').fill(w.scenario.product.id);
    await field(p, 'common.quantity').fill('invalid');
    await field(p, 'common.reason').fill('Entrega sin traducir');
    await button(p, 'inventory.confirmOperation').click();
    await expect(p.getByText(label('inventory.quantityHelp'), { exact: true })).toBeVisible();
  },
);
review(
  'admin-customer-create',
  'admin',
  '/customers',
  ['customers.newCustomer', 'customers.createCustomer'],
  async (p) => {
    await button(p, 'customers.newCustomer').click();
    await field(p, 'customers.customerName').fill('José Nuevo');
    await field(p, 'customers.city').fill('Magdalena');
  },
);
review('admin-route-create', 'admin', '/routes', ['routes.title', 'common.create'], async (p) => {
  await field(p, 'routes.routeNumber').fill('RUTA-Ñ-151');
  await field(p, 'routes.businessDate').fill('2031-09-17');
});
review(
  'driver-route-load',
  'preparingDriver',
  (w) => `/routes?routeId=${w.preparing.route.id}`,
  ['routes.myRoutes', 'routes.saveFullLoad'],
  async (p, w) => {
    await p.getByRole('combobox', { name: label('common.product'), exact: true }).click();
    await p.getByRole('option').filter({ hasText: w.preparing.product.name }).click();
    await field(p, 'routes.loadQuantity').fill('12.340');
  },
);
review(
  'admin-reconciliation',
  'admin',
  (w) => `/routes?routeId=${w.returned.route.id}`,
  ['routes.reconciliationTitle', 'routes.approveReconciliation'],
  async (p) => {
    await p.getByLabel(/Physical return/).fill('4');
    await p.getByRole('textbox', { name: /^Difference reason/ }).fill('Diferencia pendiente');
  },
);
review('admin-users', 'admin', '/users', ['nav.users', 'administration.newUser'], async (p) => {
  await button(p, 'administration.newUser').click();
  await field(p, 'administration.username').fill('nuevo.usuario');
  await field(p, 'administration.displayName').fill('José Usuario');
  await button(p, 'administration.saveUser').click();
  await expect(p.getByText(label('administration.validation'), { exact: true })).toBeVisible();
});
review(
  'admin-printer-editor',
  'admin',
  '/printer-profiles',
  ['printers.title', 'printers.validation'],
  async (p) => {
    await button(p, 'printers.new').click();
    await field(p, 'printers.name').fill('Impresora de José');
    await select(p, 'printers.writeMode', label('printers.WITHOUT_RESPONSE'));
    await button(p, 'printers.save').click();
    await expect(p.getByText(label('printers.validation'), { exact: true })).toBeVisible();
  },
  async (p, _w, language) => {
    await expect(
      p.getByRole('combobox', { name: label('printers.writeMode', language), exact: true }),
    ).toHaveText(label('printers.WITHOUT_RESPONSE', language));
  },
);
review(
  'admin-cash-close',
  'admin',
  (w) => `/cash-closes?closeId=${w.closeRow.id}`,
  ['reports.cashCloses', 'reports.gross'],
  undefined,
  async (p, w, l) => {
    const section = p.getByRole('region', { name: w.closeRow.closeNumber });
    await expect(section).toContainText('USD 1,234.56');
    const date = await p.evaluate(
      ({ instant, language }) =>
        new Date(instant).toLocaleString(language === 'es' ? 'es-MX' : 'en-US'),
      { instant: w.closeRow.createdAt, language: l },
    );
    await expect(section).toContainText(date);
  },
);
review(
  'admin-cash-correction',
  'admin',
  '/cash-closes',
  ['reports.confirmCorrection'],
  async (p, w) => {
    await p.getByRole('button', { name: `Correct ${w.closeRow.closeNumber}`, exact: true }).click();
    await p
      .getByRole('dialog')
      .getByRole('button', { name: label('reports.confirmCorrection'), exact: true })
      .click();
    await expect(p.getByText(label('reports.reasonRequired'), { exact: true })).toBeVisible();
  },
);
for (const type of [
  'SALES_BY_DRIVER',
  'BEST_SELLING_PRODUCTS',
  'INVENTORY_BY_BRANCH',
  'FINANCIAL_SUMMARY',
]) {
  review(
    `admin-report-${type}`,
    'admin',
    '/reports',
    ['reports.title', `reports.${type}`, 'workflow.printSnapshot'],
    async (p) => {
      await select(p, 'reports.reportType', label(`reports.${type}`));
      await button(p, 'reports.run').click();
      await expect(button(p, 'workflow.printSnapshot')).toBeVisible();
    },
  );
}
for (const stage of ['customer', 'products', 'review', 'result']) {
  review(
    `driver-sale-${stage}`,
    'driver',
    '/sales/new',
    [stage === 'result' ? 'sales.ticket' : 'sales.newSale'],
    async (p) => {
      await p.getByRole('combobox', { name: 'Customer', exact: true }).click();
      await p.getByRole('option', { name: /Abarrotes Muñoz/ }).click();
      if (stage === 'customer') return;
      await button(p, 'sales.nextProducts').click();
      await select(p, 'common.product', 'Carbón El Sol');
      await field(p, 'common.quantity').fill('1');
      if (stage === 'products') return;
      await button(p, 'ui.review').click();
      await expect(button(p, 'sales.confirmSale')).toBeEnabled();
      if (stage === 'result') {
        await button(p, 'sales.confirmSale').click();
        await expect(
          p.getByRole('heading', { name: label('sales.ticket'), exact: true }),
        ).toBeVisible();
      }
    },
  );
}

for (const role of ['admin', 'driver'] as const) {
  review(
    role + '-print-dialog',
    role,
    (w) => '/documents?documentId=' + w.document.id,
    ['printers.documentTitle', 'printers.documentHelp', 'printers.DISCONNECTED'],
    async (p) => {
      await button(p, 'printers.print').click();
      await p
        .getByRole('dialog')
        .getByLabel('Printer', { exact: true })
        .selectOption({ label: 'Approved test printer' });
    },
  );
  review(
    role + '-navigation',
    role,
    '/',
    ['ui.home', 'nav.settings', 'auth.signOut'],
    async (p) => {
      await p.setViewportSize({ width: 390, height: 844 });
      await button(p, 'nav.openMenu').click();
    },
  );
}
review('admin-api-error', 'admin', '/inventory/products/00000000-0000-4000-8000-999999999999', [
  'errors.RESOURCE_NOT_FOUND',
]);
review(
  'admin-api-generic-error',
  'admin',
  '/inventory/operations/new',
  ['errors.generic'],
  async (p) => {
    await field(p, 'inventory.branchId').fill('not-a-uuid');
    await field(p, 'common.productId').fill('not-a-uuid');
    await field(p, 'common.quantity').fill('1');
    await field(p, 'common.reason').fill('No se debe guardar');
    await button(p, 'inventory.confirmOperation').click();
    await expect(p.getByRole('alert')).toContainText(label('errors.generic'));
  },
);
for (const path of ['/reports', '/cash-closes', '/users', '/printer-profiles']) {
  review('driver-denied-' + path.slice(1), 'driver', path, [
    path === '/reports' || path === '/cash-closes' ? 'reports.forbidden' : 'administration.denied',
  ]);
}

for (const entry of inventory) {
  test(`BILINGUAL-1 ${entry.id}`, async ({ page, warehouse }, testInfo) => {
    test.setTimeout(60_000);
    await authenticate(page, warehouse, entry.role);
    await page.goto(typeof entry.path === 'function' ? entry.path(warehouse) : entry.path);
    if (entry.prepare) await entry.prepare(page, warehouse);
    for (const key of entry.keys)
      await expect(
        page.getByText(label(key), { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    await verifySwitch(
      page,
      warehouse,
      entry.keys,
      entry.check ? (language) => entry.check!(page, warehouse, language) : undefined,
    );
    await testInfo.attach('page-acceptance', {
      body: JSON.stringify({
        inventory: 'BILINGUAL-1',
        page: entry.id,
        role: entry.role,
        browser: testInfo.project.name,
        result: 'PASS',
        checks: [
          'en-es-en without reload',
          'visible text',
          'form values',
          'unchanged business rows',
          'es/en refresh persistence',
        ],
      }),
      contentType: 'application/json',
    });
  });
}

test('BILINGUAL-1 fresh and invalid preferences default to Spanish; login preserves input and errors', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(
    page.getByRole('heading', { name: label('auth.welcomeBack', 'es'), exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
  await page.evaluate((key) => localStorage.setItem(key, 'fr-invalid'), storageKey);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByRole('button', { name: label('settings.english', 'es'), exact: true }).click();
  await page
    .getByRole('textbox', { name: label('auth.username'), exact: true })
    .fill('bilingual-invalid-user');
  await page.locator('input[name="password"]').fill('wrong-password');
  await button(page, 'auth.signIn').click();
  await expect(page.getByRole('alert')).toHaveText(label('auth.incorrectCredentials'));
  await page.getByRole('button', { name: label('settings.spanish'), exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(label('auth.incorrectCredentials', 'es'));
  await expect(
    page.getByRole('textbox', { name: label('auth.username', 'es'), exact: true }),
  ).toHaveValue('bilingual-invalid-user');
  await expect(page.locator('input[name="password"]')).toHaveValue('wrong-password');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

for (const role of ['admin', 'driver'] as const) {
  test('BILINGUAL-1 ' + role + ' direct Settings selector', async ({ page, warehouse }) => {
    await authenticate(page, warehouse, role);
    await page.goto('/settings');
    await expect(field(page, 'printers.printer')).toBeVisible();
    if (role === 'admin') await field(page, 'administration.reason').fill('Texto conservado');
    await select(page, 'settings.language', 'Spanish');
    await expect(
      page.getByRole('heading', { name: label('settings.title', 'es'), exact: true }),
    ).toBeVisible();
    if (role === 'admin')
      await expect(field(page, 'administration.reason', 'es')).toHaveValue('Texto conservado');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
}
