const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(properties = {}) {
  let now = Date.parse('2026-10-03T06:00:00Z');
  let nextId = 0;
  let locked = false;
  const values = { TELEGRAM_CHAT_ID: '123', ...properties };
  const sent = [];
  const daily = { getHandlerFunction: () => 'sendDailyReviewNotificationV25' };
  let triggers = [daily];
  const state = {
    queue: { baseLimit: 10, bonus: 0, maxDaily: 10, processedToday: 0,
      reservedCount: 0, items: [{ sheetName: 'study' }] },
    sessions: [], failSend: false
  };
  const dateKey = date => new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => values[key] ?? null,
      setProperty: (key, value) => { values[key] = value; }
    }) },
    LockService: { getUserLock: () => ({
      waitLock: () => { assert.equal(locked, false); locked = true; },
      releaseLock: () => { locked = false; }
    }) },
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    Utilities: { formatDate: (date, zone) => {
      assert.equal(zone, 'Europe/Moscow'); return dateKey(date);
    } },
    getDailyLimitDateV1: () => dateKey(new Date(now)),
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: trigger => { triggers = triggers.filter(t => t !== trigger); },
      newTrigger: handler => {
        let delay;
        const builder = {
          timeBased: () => builder,
          after: value => { delay = value; return builder; },
          create: () => {
            const id = String(++nextId);
            const trigger = { getHandlerFunction: () => handler, getUniqueId: () => id,
              at: now + delay };
            triggers.push(trigger); return trigger;
          }
        };
        return builder;
      }
    },
    expireOldActiveSessionsV1: () => 0,
    getUserPreferencesV1: () => ({ language: 'ru', gender: 'female' }),
    getReviewWordsV1: () => ({ ready: 'Готова начать?' }),
    getActiveStudySheetsV1: () => ['study'],
    getDailyReviewQueueV1: () => state.queue,
    getActiveReviewSessionsV1: () => state.sessions,
    getDueItemsV18: () => ({ items: [{ kanji: '字' }] }),
    telegramSendRichMessageV1: (_chat, html) => {
      if (state.failSend) throw new Error('Telegram failed');
      sent.push(html);
    }
  });
  for (const file of ['NotificationService.js', 'ReviewReminderService.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts', file), 'utf8'), context);
  }
  const reminders = () => triggers.filter(t => t !== daily);
  return { context, values, sent, state, reminders,
    setTime: value => { now = Date.parse(value); },
    fire: () => {
      assert.equal(reminders().length, 1);
      const trigger = reminders()[0];
      now = Math.max(now, trigger.at);
      context.sendReviewReminderV1({ triggerUid: trigger.getUniqueId() });
      assert.ok(triggers.includes(daily));
    }
  };
}

test('daily trigger automatically sends at most three notifications two hours apart', () => {
  const h = setup();
  h.context.sendDailyReviewNotificationV25();
  assert.equal(h.sent.length, 1);
  assert.equal(h.reminders()[0].at, Date.parse('2026-10-03T08:00:00Z'));
  h.fire(); h.fire();
  assert.equal(h.sent.length, 3);
  assert.equal(h.reminders().length, 0);
  h.context.sendDailyReviewNotificationV25();
  assert.equal(h.sent.length, 3);
});

test('unfinished session is reminded even with no new queue items', () => {
  const h = setup();
  h.state.queue.items = [];
  h.state.queue.reservedCount = 1;
  h.state.sessions = [{ sheetName: 'study', currentIndex: 2, itemCount: 3 }];
  h.context.sendDailyReviewNotificationV25(); h.fire();
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[1], /Продолжить study/);
});

test('completion stops notifications even if there are due kanji beyond the daily limit', () => {
  const h = setup();
  h.context.sendDailyReviewNotificationV25();
  h.state.queue.items = [];
  h.state.queue.processedToday = 10;
  h.fire();
  assert.equal(h.sent.length, 1);
  assert.equal(h.reminders().length, 0);
});

test('empty daily queue does not schedule reminders', () => {
  const h = setup(); h.state.queue.items = [];
  h.context.sendDailyReviewNotificationV25();
  assert.equal(h.sent.length, 1);
  assert.equal(h.reminders().length, 0);
});

test('count and interval are configurable and zero disables automated notifications', () => {
  const h = setup({ DAILY_REVIEW_NOTIFICATION_COUNT: '2', REVIEW_NOTIFICATION_INTERVAL_MINUTES: '60' });
  h.context.sendDailyReviewNotificationV25();
  assert.equal(h.reminders()[0].at, Date.parse('2026-10-03T07:00:00Z'));
  h.fire();
  assert.equal(h.sent.length, 2);
  assert.equal(h.reminders().length, 0);
  const disabled = setup({ DAILY_REVIEW_NOTIFICATION_COUNT: '0' });
  disabled.context.sendDailyReviewNotificationV25();
  assert.equal(disabled.sent.length, 0);
  assert.equal(disabled.reminders().length, 0);
});

test('changing count to zero cancels an already scheduled reminder', () => {
  const h = setup(); h.context.sendDailyReviewNotificationV25();
  h.values.DAILY_REVIEW_NOTIFICATION_COUNT = '0'; h.fire();
  assert.equal(h.sent.length, 1);
  assert.equal(h.reminders().length, 0);
});

test('manual overview does not reset the chain or consume automatic quota', () => {
  const h = setup(); h.context.sendDailyReviewNotificationV25();
  const before = h.values.DAILY_REVIEW_NOTIFICATION_STATE;
  h.context.sendReviewOverviewV1();
  assert.equal(h.values.DAILY_REVIEW_NOTIFICATION_STATE, before);
  h.fire(); h.fire();
  assert.equal(h.sent.length, 4);
});

test('duplicate events and daily invocations cannot create extra messages or triggers', () => {
  const h = setup(); h.context.sendDailyReviewNotificationV25();
  const oldId = h.reminders()[0].getUniqueId();
  h.context.sendDailyReviewNotificationV25(); h.fire();
  h.context.sendReviewReminderV1({ triggerUid: oldId });
  h.context.sendReviewReminderV1();
  assert.equal(h.sent.length, 2);
  assert.equal(h.reminders().length, 1);
});

test('old reminders expire and a new daily trigger starts a fresh chain', () => {
  const h = setup(); h.context.sendDailyReviewNotificationV25();
  h.setTime('2026-10-04T06:00:00Z'); h.fire();
  assert.equal(h.sent.length, 1);
  assert.equal(h.reminders().length, 0);
  h.context.sendDailyReviewNotificationV25();
  assert.equal(h.sent.length, 2);
  assert.equal(h.reminders().length, 1);
});

test('a stale event cannot delete the new day reminder', () => {
  const h = setup(); h.context.sendDailyReviewNotificationV25();
  const oldId = h.reminders()[0].getUniqueId();
  h.setTime('2026-10-04T06:00:00Z'); h.context.sendDailyReviewNotificationV25();
  const newId = h.reminders()[0].getUniqueId();
  h.context.sendReviewReminderV1({ triggerUid: oldId });
  assert.equal(h.reminders()[0].getUniqueId(), newId);
  assert.equal(h.sent.length, 2);
});

test('chain does not cross midnight in script timezone', () => {
  const h = setup(); h.setTime('2026-10-03T20:00:00Z');
  h.context.sendDailyReviewNotificationV25();
  assert.equal(h.sent.length, 1);
  assert.equal(h.reminders().length, 0);
});

test('Telegram failure retains the next attempt without exceeding daily attempt count', () => {
  const h = setup(); h.state.failSend = true;
  assert.throws(() => h.context.sendDailyReviewNotificationV25(), /Telegram failed/);
  assert.equal(h.reminders().length, 1);
  h.state.failSend = false; h.fire(); h.fire();
  assert.equal(h.sent.length, 2);
  assert.equal(h.reminders().length, 0);
});

test('invalid settings fail before sending', () => {
  for (const properties of [
    { DAILY_REVIEW_NOTIFICATION_COUNT: '-1' },
    { DAILY_REVIEW_NOTIFICATION_COUNT: 'abc' },
    { DAILY_REVIEW_NOTIFICATION_COUNT: '1.5' },
    { REVIEW_NOTIFICATION_INTERVAL_MINUTES: '0' }
  ]) {
    const h = setup(properties);
    assert.throws(() => h.context.sendDailyReviewNotificationV25(), /Укажи целое число/);
    assert.equal(h.sent.length, 0);
    assert.equal(h.reminders().length, 0);
  }
});
