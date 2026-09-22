const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function service(statusCode, body) {
  const logs = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'token' }) },
    UrlFetchApp: { fetch: () => ({
      getResponseCode: () => statusCode,
      getContentText: () => body
    }) },
    Logger: { log: value => logs.push(value) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/TelegramService.js'), 'utf8'), context);
  return { request: context.telegramRequestV1, logs };
}

test('Telegram API failure is reported without logging response body', () => {
  const { request, logs } = service(400, JSON.stringify({
    ok: false, description: 'private response body'
  }));
  assert.throws(() => request('sendMessage', {}), /Ошибка Telegram API/);
  assert.equal(logs.join('').includes('private response body'), false);
});

test('Telegram non-JSON response is reported', () => {
  const { request } = service(502, 'gateway error');
  assert.throws(() => request('sendMessage', {}), /некорректный ответ/);
});
