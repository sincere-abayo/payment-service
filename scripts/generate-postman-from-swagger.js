#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const baseUrl = (process.argv.find((arg) => arg.startsWith('--base-url='))?.split('=')[1] || process.env.SWAGGER_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const outputCollectionPath = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1] || path.join('postman', 'payment-service.postman_collection.json');
const outputEnvironmentPath = process.argv.find((arg) => arg.startsWith('--env-output='))?.split('=')[1] || path.join('postman', 'payment-service.local.postman_environment.json');

function stringifyJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function commandGroupFor(code) {
  if (/^ADM_(LOGIN|VERIFY2FA|SETUP2FA|CONFIRM2FA)/.test(code)) return 'Auth';
  if (/^ADM_(REGTNT|GETTNT|UPDTNT|APPROV|SUSPTNT|REVTNT|GENKEY|REVKEY|REGKEY)/.test(code)) return 'Admin';
  if (/^DSB_/.test(code)) return 'Disbursement';
  if (/^TNT_/.test(code)) return 'Tenant';
  return 'Commands';
}

function requestHeadersFor(commandCode) {
  const headers = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'x-command', value: commandCode },
    { key: 'x-api-key', value: '{{serviceApiKey}}' },
  ];

  const publicCommands = new Set(['ADM_LOGIN_1A2B', 'ADM_VERIFY2FA_2C3D']);
  if (commandCode.startsWith('ADM_') && !publicCommands.has(commandCode)) {
    headers.push({ key: 'Authorization', value: 'Bearer {{adminAccessToken}}' });
  }

  return headers;
}

function postmanTestsFor(commandCode) {
  const shared = [
    'const json = pm.response.json();',
    "pm.test('request succeeded', function () {",
    '  pm.expect(json.success).to.eql(true);',
    '});',
  ];

  const scripts = {
    ADM_LOGIN_1A2B: [
      ...shared,
      'if (json?.data?.accessToken) {',
      "  pm.collectionVariables.set('adminAccessToken', json.data.accessToken);",
      '}',
      'if (json?.data?.preAuthToken) {',
      "  pm.collectionVariables.set('preAuthToken', json.data.preAuthToken);",
      '}',
    ],
    ADM_VERIFY2FA_2C3D: [
      ...shared,
      'if (json?.data?.accessToken) {',
      "  pm.collectionVariables.set('adminAccessToken', json.data.accessToken);",
      '}',
    ],
    ADM_REGTNT_5I6J: [
      ...shared,
      'if (json?.data?.id) {',
      "  pm.collectionVariables.set('tenantId', json.data.id);",
      '}',
    ],
    ADM_GENKEY_9Q0R: [
      ...shared,
      'if (json?.data?.apiKeyId) {',
      "  pm.collectionVariables.set('apiKeyId', json.data.apiKeyId);",
      '}',
      'if (json?.data?.rawApiKey) {',
      "  pm.collectionVariables.set('tenantApiKey', json.data.rawApiKey);",
      '}',
    ],
    DSB_INIT_3C4D: [
      ...shared,
      'if (json?.data?.batchId) {',
      "  pm.collectionVariables.set('batchId', json.data.batchId);",
      '}',
    ],
  };

  return scripts[commandCode] || shared;
}

function buildCollection(doc) {
  const operation = doc.paths?.['/']?.post;
  if (!operation) {
    throw new Error('Swagger document does not contain POST /');
  }

  const requestExamples = operation.requestBody?.content?.['application/json']?.examples || {};
  const responseExamples = operation.responses?.['200']?.content?.['application/json']?.examples || {};

  const commands = Object.entries(requestExamples)
    .map(([commandCode, requestExample]) => ({
      commandCode,
      operation,
      summary:
        requestExample?.summary ||
        responseExamples[commandCode]?.summary ||
        `Execute ${commandCode}`,
      requestExample: requestExample?.value ?? {},
      responseExample: responseExamples[commandCode]?.value ?? {
        success: true,
        command: commandCode,
        data: {},
        timestamp: new Date().toISOString(),
      },
      folder: commandGroupFor(commandCode),
    }))
    .sort((a, b) => a.commandCode.localeCompare(b.commandCode));

  const folderMap = new Map();
  for (const command of commands) {
    if (!folderMap.has(command.folder)) {
      folderMap.set(command.folder, []);
    }
    folderMap.get(command.folder).push(command);
  }

  const items = Array.from(folderMap.entries()).map(([folderName, folderCommands]) => ({
    name: folderName,
    item: folderCommands.map((command) => ({
      name: command.commandCode,
      request: {
        description: command.summary,
        method: 'POST',
          header: requestHeadersFor(command.commandCode),
        url: {
          raw: `{{baseUrl}}/`,
          host: ['{{baseUrl}}'],
          path: [],
        },
        body: {
          mode: 'raw',
          raw: stringifyJson(command.requestExample),
          options: {
            raw: {
              language: 'json',
            },
          },
        },
      },
      response: [{
        name: '200 OK',
        originalRequest: {
          method: 'POST',
          header: requestHeadersFor(command.commandCode),
          url: {
          raw: `{{baseUrl}}/`,
            host: ['{{baseUrl}}'],
          path: [],
          },
        },
        status: 'OK',
        code: 200,
        header: [
          { key: 'Content-Type', value: 'application/json' },
        ],
        body: stringifyJson(command.responseExample),
      }],
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: postmanTestsFor(command.commandCode),
          },
        },
      ],
    })),
  }));

  return {
    info: {
      name: 'Payment Service Commands',
      description: 'Generated from Swagger/OpenAPI. Each command path is a distinct request in Postman.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: '8d7a3f8f-7a2a-4c7b-8aa6-7b5a4f6d1f91',
    },
    variable: [
      { key: 'baseUrl', value: baseUrl },
      { key: 'serviceApiKey', value: '1223qwe123' },
      { key: 'adminEmail', value: 'admin@example.com' },
      { key: 'adminPassword', value: 'StrongPassword123!' },
      { key: 'adminAccessToken', value: '' },
      { key: 'tenantId', value: '' },
      { key: 'apiKeyId', value: '' },
      { key: 'tenantApiKey', value: '' },
      { key: 'batchId', value: '' },
      { key: 'preAuthToken', value: '' },
    ],
    item: items,
  };
}

async function main() {
  const docsUrl = `${baseUrl}/docs-json`;
  const response = await fetch(docsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Swagger document from ${docsUrl}: ${response.status} ${response.statusText}`);
  }

  const doc = await response.json();
  const collection = buildCollection(doc);

  const environment = {
    name: 'Payment Service Local',
    values: [
      { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
      { key: 'serviceApiKey', value: '1223qwe123', type: 'default', enabled: true },
      { key: 'adminEmail', value: 'admin@example.com', type: 'default', enabled: true },
      { key: 'adminPassword', value: 'StrongPassword123!', type: 'default', enabled: true },
      { key: 'adminAccessToken', value: '', type: 'default', enabled: true },
      { key: 'tenantId', value: '', type: 'default', enabled: true },
      { key: 'apiKeyId', value: '', type: 'default', enabled: true },
      { key: 'tenantApiKey', value: '', type: 'default', enabled: true },
      { key: 'batchId', value: '', type: 'default', enabled: true },
      { key: 'preAuthToken', value: '', type: 'default', enabled: true },
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'swagger-postman-generator',
  };

  await fs.mkdir(path.dirname(outputCollectionPath), { recursive: true });
  await fs.writeFile(outputCollectionPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
  await fs.writeFile(outputEnvironmentPath, `${JSON.stringify(environment, null, 2)}\n`, 'utf8');

  console.log(`Wrote collection to ${outputCollectionPath}`);
  console.log(`Wrote environment to ${outputEnvironmentPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
