const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function render(queue, sessions, dueCount) {
  let html;
  const context = {
    expireOldActiveSessionsV1: () => 0,
    getUserPreferencesV1: () => ({ language: 'ru', gender: 'female' }),
    getReviewWordsV1: () => ({ remembered: '✅ Вспомнила', forgotten: '❌ Забыла', ready: 'Готова начать?' }),
    getActiveStudySheetsV1: () => ['study'],
    getDailyReviewQueueV1: () => queue,
    getActiveReviewSessionsV1: () => sessions,
    getDueItemsV18: () => ({ items: Array(dueCount).fill({}) }),
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '123' }) },
    telegramSendRichMessageV1: (_chatId, value) => { html = value; }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/NotificationService.js'), 'utf8'), context);
  context.sendDailyReviewNotificationV25();
  return html;
}

test('overview shows limit buttons when daily limit is reached', () => {
  const html = render({
    baseLimit: 10, bonus: 0, maxDaily: 10,
    processedToday: 10, reservedCount: 0, items: []
  }, [], 3);
  assert.match(html, /Повторено сегодня: 10 из 10/);
  assert.match(html, /review:limit:\+5/);
  assert.match(html, /review:limit:\+10/);
});

test('overview offers to continue an active session', () => {
  const html = render({
    baseLimit: 10, bonus: 0, maxDaily: 10,
    processedToday: 0, reservedCount: 1, items: []
  }, [{ sessionId: 's1', sheetName: 'study', itemCount: 3, currentIndex: 2 }], 1);
  assert.match(html, /Продолжить study — 2 из 3/);
  assert.match(html, /review:start:study/);
});
