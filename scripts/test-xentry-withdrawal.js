require('ts-node/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DisbursementProcessor } = require('../src/disbursement/disbursement.processor');
const { DisbursementService } = require('../src/disbursement/disbursement.service');
const { XentryPayHelper } = require('../src/payment/xentry-pay/xentry-pay.helper');
const { XentryPayProvider } = require('../src/payment/xentry-pay/xentry-pay.provider');

test('Xentry withdrawal uses the documented payout request and remains pending', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://merchant.test.xentripay.com/api/payment-requests');
      assert.equal(options.headers['X-XENTRIPAY-KEY'], 'test-key');
      const body = JSON.parse(options.body);
      assert.deepEqual(body, {
        customerReference: 'withdrawal-job-id',
        telecomProviderId: '63510',
        msisdn: '0781111111',
        name: 'Alice Uwase',
        transactionType: 'PAYOUT',
        currency: 'RWF',
        amount: 5000,
      });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'PENDING', internalRef: 'xtr-ref-1' }),
      };
    };

    const helper = new XentryPayHelper({
      get: async () => ({ baseUrl: 'https://merchant.test.xentripay.com', apiKey: 'test-key' }),
    });
    const result = await new XentryPayProvider(helper).transfer({
      externalId: 'withdrawal-job-id',
      phone: '0781111111',
      amount: 5000,
      recipientName: 'Alice Uwase',
      providerCode: '63510',
    });

    assert.deepEqual(result, { referenceId: 'xtr-ref-1', provider: 'xentry', pending: true });
  } finally {
    global.fetch = originalFetch;
  }
});

test('queued withdrawal resolves the withdrawal routing and schedules a status poll', async () => {
  const row = {
    id: 'withdrawal-job-id',
    status: 'QUEUED',
    mtnRef: null,
    failReason: null,
    validatedRecipientName: null,
    recipientName: 'Alice Uwase',
  };
  const statusMatches = (whereStatus) => {
    if (!whereStatus) return true;
    return typeof whereStatus === 'string' ? row.status === whereStatus : whereStatus.in.includes(row.status);
  };
  const prisma = {
    disbursementJob: {
      updateMany: async ({ where, data }) => {
        if (!statusMatches(where.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  const queuedPolls = [];
  const routedKinds = [];
  const processor = new DisbursementProcessor(
    prisma,
    {
      transfer: async (_input, kind) => {
        routedKinds.push(kind);
        return { referenceId: 'xtr-ref-1', provider: 'xentry', pending: true };
      },
    },
    {},
    { dispatchBatchWebhook: async () => undefined },
    { add: async (...args) => queuedPolls.push(args) },
  );

  await processor.process({
    name: 'process-transfer',
    data: {
      jobId: row.id,
      batchId: 'withdrawal-batch-id',
      tenantId: 'tenant-id',
      userPseudoId: 'user-1',
      phone: '0781111111',
      amount: 5000,
      jobType: 'PAYOUT',
      recipientName: 'Alice Uwase',
      telecomProviderId: '63510',
      isWithdraw: true,
    },
  });

  assert.deepEqual(routedKinds, ['withdraw']);
  assert.equal(row.status, 'PROCESSING');
  assert.equal(row.mtnRef, 'xtr-ref-1');
  assert.equal(queuedPolls[0][0], 'check-payout-status');
  assert.deepEqual(queuedPolls[0][1], {
    jobId: row.id,
    batchId: 'withdrawal-batch-id',
    attempt: 0,
  });
});

test('Xentry withdrawal rejects a missing registered recipient name before it is queued', async () => {
  const service = new DisbursementService(
    {
      disbursementBatch: {
        findUnique: async () => null,
      },
    },
    {
      assertProviderConfigured: async () => 'xentry',
    },
    { add: async () => undefined },
  );

  await assert.rejects(
    () => service.initiateWithdraw('tenant-id', {
      idempotencyKey: 'withdrawal-without-name',
      userPseudoId: 'user-1',
      phone: '0781111111',
      amount: 5000,
    }),
    /name is required for Xentry withdrawals/,
  );
});

test('Xentry withdrawal rejection becomes a terminal FAILED job with the validated name', async () => {
  const row = {
    id: 'withdrawal-job-id',
    status: 'PROCESSING',
    mtnRef: 'xtr-ref-1',
    failReason: null,
    validatedRecipientName: null,
    recipientName: 'Alice Uwase',
    createdAt: new Date(),
  };
  const prisma = {
    disbursementJob: {
      findUnique: async () => ({ ...row, batch: { provider: 'XENTRY' } }),
      updateMany: async ({ where, data }) => {
        if (where.status && !where.status.in.includes(row.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  const webhookCalls = [];
  const processor = new DisbursementProcessor(
    prisma,
    {},
    {
      checkPayoutStatus: async (customerReference) => {
        assert.equal(customerReference, row.id);
        return {
          status: 'REJECTED',
          internalRef: 'xtr-ref-1',
          statusMessage: 'Correct Registered name is : Alice UWASE',
          validatedAccountName: 'Alice UWASE',
        };
      },
    },
    { dispatchBatchWebhook: async (batchId) => webhookCalls.push(batchId) },
    { add: async () => undefined },
  );

  await processor.process({
    name: 'check-payout-status',
    data: { jobId: row.id, batchId: 'withdrawal-batch-id', attempt: 0 },
  });

  assert.equal(row.status, 'FAILED');
  assert.equal(row.validatedRecipientName, 'Alice UWASE');
  assert.match(row.failReason, /XentriPay: payout rejected/);
  assert.deepEqual(webhookCalls, ['withdrawal-batch-id']);
});
