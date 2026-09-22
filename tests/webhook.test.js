const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function webhook() {
  const sent = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({
      TELEGRAM_WEBHOOK_SECRET: 'test-secret', TELEGRAM_CHAT_ID: '123'
    })[key] }) },
    HtmlService: { createHtmlOutput: value => value },
    sendDailyReviewNotificationV25: () => sent.push('overview'),
    console: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/Webhook.js'), 'utf8'), context);
  return { doPost: context.doPost, sent };
}

function event(secret, chatId, senderId) {
  return {
    parameter: { webhook_key: secret },
    postData: { contents: JSON.stringify({ message: {
      text: '/start', chat: { id: chatId }, from: { id: senderId }
    } }) }
  };
}

test('webhook rejects missing secret and unauthorized chat or sender', () => {
  const { doPost, sent } = webhook();
  doPost(event('', 123, 123));
  doPost(event('test-secret', 999, 999));
  doPost(event('test-secret', 123, 999));
  assert.equal(sent.length, 0);
  doPost(event('test-secret', 123, 123));
  assert.equal(sent.length, 1);
  assert.equal(sent[0], 'overview');
});

test('webhook diagnostic does not expose the secret or full URL', () => {
  const logs = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({
      TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_WEBHOOK_SECRET: 'test-secret'
    })[key] }) },
    UrlFetchApp: { fetch: () => ({ getContentText: () => JSON.stringify({
      ok: true, result: {
        url: 'https://script.google.com/macros/s/deployment-id/exec?webhook_key=test-secret',
        pending_update_count: 2, last_error_message: 'Failed at https://example.com/path?webhook_key=test-secret'
      }
    }) }) },
    Logger: { log: value => logs.push(value) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/Webhook.js'), 'utf8'), context);
  const result = context.checkTelegramWebhookV1();
  assert.equal(result.deploymentId, 'deployment-id');
  assert.equal(result.secretMatches, true);
  assert.equal(result.pendingUpdateCount, 2);
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
  assert.equal(logs.join('').includes('test-secret'), false);
});

test('webhook registration uses published exec URL', () => {
  let registeredUrl;
  const values = {
    TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '123',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret'
  };
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => values[key], setProperty: (key, value) => { values[key] = value; }
    }) },
    telegramRequestV1: (method, payload) => {
      assert.equal(method, 'setWebhook');
      registeredUrl = payload.url;
      return { ok: true };
    },
    setupTelegramCommandsV1: () => ({ ok: true }),
    Logger: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/Webhook.js'), 'utf8'), context);
  context.resetTelegramWebhookV1();
  assert.match(registeredUrl, /\/exec\?webhook_key=test-secret$/);
  assert.doesNotMatch(registeredUrl, /\/dev/);
});
