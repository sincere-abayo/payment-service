require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { CollectionProcessor } = require('../src/collection/collection.processor');
const { XentryPayHelper, XentryHttpError } = require('../src/payment/xentry-pay/xentry-pay.helper');
const { XentryPayProvider } = require('../src/payment/xentry-pay/xentry-pay.provider');
const { WebhookService } = require('../src/webhook/webhook.service');
const { WebhookXentryController } = require('../src/webhook/webhook.xentry.controller');

function fixture(status = 'QUEUED') {
  const row = {
    id: 'collection-id',
    tenantId: 'tenant-id',
    provider: 'XENTRY',
    userPseudoId: 'customer-1',
    phone: '0781111111',
    amount: 500,
    status,
    mtnRef: null,
    failReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenant: { webhookUrl: 'https://tenant.example/webhook' },
  };
  const providerEvents = new Map();
  const webhookLogs = [];
  const webhookJobs = [];
  const collectionJobs = [];

  const matchesStatus = (whereStatus) => {
    if (!whereStatus) return true;
    if (typeof whereStatus === 'string') return row.status === whereStatus;
    return whereStatus.in.includes(row.status);
  };
  const prisma = {
    collection: {
      findUnique: async () => row,
      findFirst: async () => ({ id: row.id, status: row.status }),
      updateMany: async ({ where, data }) => {
        if (!matchesStatus(where.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    providerWebhookEvent: {
      findUnique: async ({ where }) =>
        providerEvents.get(where.provider_idempotencyKey.idempotencyKey) || null,
      create: async ({ data }) => {
        const record = { id: `event-${providerEvents.size}`, processedAt: null, ...data };
        providerEvents.set(data.idempotencyKey, record);
        return record;
      },
      update: async ({ where, data }) => {
        const record = [...providerEvents.values()].find((item) => item.id === where.id);
        Object.assign(record, data);
        return record;
      },
    },
    webhookLog: {
      findFirst: async ({ where }) =>
        webhookLogs.find((log) => log.collectionId === where.collectionId) || null,
      create: async ({ data }) => {
        const log = { id: `log-${webhookLogs.length}`, ...data };
        webhookLogs.push(log);
        return log;
      },
    },
  };
  const webhooks = new WebhookService(prisma, {
    add: async (...args) => webhookJobs.push(args),
  });
  return {
    row,
    prisma,
    webhooks,
    webhookJobs,
    collectionQueue: { add: async (...args) => collectionJobs.push(args) },
    collectionJobs,
  };
}

test('Xentry collection request uses the documented endpoint and remains pending', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://merchant.test.xentripay.com/api/collections/initiate');
      assert.equal(options.headers['X-XENTRIPAY-KEY'], 'test-key');
      assert.ok(options.signal);
      const body = JSON.parse(options.body);
      assert.equal(body.customerRef, 'collection-id');
      assert.equal(body.cnumber, '0781111111');
      assert.equal(body.msisdn, '250781111111');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: 1, refid: 'Ref123', reply: 'accepted' }),
      };
    };
    const helper = new XentryPayHelper({
      get: async () => ({
        baseUrl: 'https://merchant.test.xentripay.com',
        apiKey: 'test-key',
      }),
    });
    const result = await new XentryPayProvider(helper).collect({
      externalId: 'collection-id',
      phone: '0781111111',
      amount: 500,
      customerName: 'Alice',
      customerEmail: 'alice@example.com',
    });
    assert.deepEqual(result, { referenceId: 'Ref123', provider: 'xentry', pending: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test('accepted initiation stays PROCESSING and schedules status reconciliation', async () => {
  const f = fixture();
  const processor = new CollectionProcessor(
    f.prisma,
    {
      collectWithProvider: async () => ({
        referenceId: 'Ref123',
        provider: 'xentry',
        pending: true,
      }),
    },
    {},
    f.webhooks,
    f.collectionQueue,
  );
  await processor.process({
    name: 'process-collection',
    data: {
      collectionId: f.row.id,
      tenantId: f.row.tenantId,
      provider: 'xentry',
      phone: f.row.phone,
      amount: f.row.amount,
    },
  });
  assert.equal(f.row.status, 'PROCESSING');
  assert.equal(f.row.mtnRef, 'Ref123');
  assert.equal(f.collectionJobs[0][0], 'check-collection-status');
  assert.equal(f.webhookJobs.length, 0);
});

test('polling settles only explicit SUCCESS and queues one tenant webhook', async () => {
  const f = fixture('PROCESSING');
  f.row.mtnRef = 'Ref123';
  const processor = new CollectionProcessor(
    f.prisma,
    {},
    { checkCollectionStatus: async () => ({ status: 'SUCCESS', rid: 'Ref123' }) },
    f.webhooks,
    f.collectionQueue,
  );
  await processor.process({
    name: 'check-collection-status',
    data: { collectionId: f.row.id, attempt: 0 },
  });
  assert.equal(f.row.status, 'SUCCESS');
  assert.equal(f.webhookJobs.length, 1);
  assert.equal(f.webhookJobs[0][2].attempts, 5);
});

test('signed success webhook is idempotent and late pending cannot undo success', async () => {
  const f = fixture('PROCESSING');
  f.row.mtnRef = 'Ref123';
  const controller = new WebhookXentryController(f.webhooks, {
    get: async () => ({ webhookSecret: 'test-secret' }),
  });

  const send = async (event, idempotencyKey) => {
    const payload = {
      event,
      data: {
        id: 1,
        amount: 500,
        currency: 'RWF',
        status: event === 'COLLECTION_SUCCESSFUL' ? 'SUCCESS' : 'PENDING',
        reference: 'Ref123',
        businessAccountId: 1,
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      idempotencyKey,
    };
    const rawBody = Buffer.from(JSON.stringify(payload, null, 2));
    const signature =
      'sha256=' +
      crypto.createHmac('sha256', 'test-secret').update(rawBody).digest('hex');
    return controller.receiveCallback(
      {
        rawBody,
        body: payload,
        headers: {
          'x-xentripay-signature': signature,
          'x-xentripay-event': event,
          'x-xentripay-idempotency-key': idempotencyKey,
        },
      },
      payload,
    );
  };

  await send('COLLECTION_SUCCESSFUL', 'success-1');
  await send('COLLECTION_SUCCESSFUL', 'success-1');
  await send('COLLECTION_PENDING', 'pending-late');
  assert.equal(f.row.status, 'SUCCESS');
  assert.equal(f.webhookJobs.length, 1);
});

test('status lookup URL-encodes references and preserves HTTP status', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      assert.equal(url, 'https://provider.example/api/collections/status/a%2Fb');
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: 'Collection not found' }),
      };
    };
    const helper = new XentryPayHelper({
      get: async () => ({ baseUrl: 'https://provider.example', apiKey: 'test-key' }),
    });
    await assert.rejects(
      helper.checkCollectionStatus('a/b'),
      (error) => error instanceof XentryHttpError && error.status === 404,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
