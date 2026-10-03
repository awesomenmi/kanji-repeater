// Ежедневный триггер продолжает вызывать эту функцию.
function sendDailyReviewNotificationV25() {
  runReviewNotificationV1(null);
}

function sendReviewReminderV1(event) {
  // Только назначенный триггер может отправить повторное уведомление.
  if (!event || !event.triggerUid) return;
  runReviewNotificationV1(String(event.triggerUid));
}

function getReviewNotificationSettingsV1() {
  const properties = PropertiesService.getScriptProperties();
  function integer(name, fallback, minimum) {
    const raw = properties.getProperty(name);
    const value = raw === null || String(raw).trim() === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Error('Укажи целое число ' + name + ' не меньше ' + minimum + '.');
    }
    return value;
  }
  return {
    count: integer('DAILY_REVIEW_NOTIFICATION_COUNT', 3, 0),
    intervalMinutes: integer('REVIEW_NOTIFICATION_INTERVAL_MINUTES', 120, 1)
  };
}

function clearReviewReminderTriggersV1() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendReviewReminderV1') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function scheduleReviewReminderV1(state, settings) {
  clearReviewReminderTriggersV1();
  state.triggerId = null;
  const delay = settings.intervalMinutes * 60 * 1000;
  const nextDate = Utilities.formatDate(
    new Date(Date.now() + delay), Session.getScriptTimeZone(), 'yyyy-MM-dd'
  );
  if (!state.finished && state.attempts < settings.count && nextDate === state.date) {
    const trigger = ScriptApp.newTrigger('sendReviewReminderV1')
      .timeBased().after(delay).create();
    state.triggerId = String(trigger.getUniqueId());
  } else {
    state.finished = true;
  }
  PropertiesService.getScriptProperties()
    .setProperty('DAILY_REVIEW_NOTIFICATION_STATE', JSON.stringify(state));
}

function runReviewNotificationV1(triggerId) {
  // Отдельная блокировка: чтение сессий внутри обзора использует ScriptLock.
  // Дневной и одноразовые триггеры должны принадлежать одному владельцу.
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const settings = getReviewNotificationSettingsV1();
    const today = getDailyLimitDateV1();
    const raw = properties.getProperty('DAILY_REVIEW_NOTIFICATION_STATE');
    let state = raw ? JSON.parse(raw) : null;

    if (triggerId) {
      // Запоздавшее или повторно доставленное событие не трогает новую цепочку.
      if (!state || state.triggerId !== triggerId) return;
      if (state.date !== today || state.finished || state.attempts >= settings.count) {
        clearReviewReminderTriggersV1();
        state.triggerId = null;
        state.finished = true;
        properties.setProperty('DAILY_REVIEW_NOTIFICATION_STATE', JSON.stringify(state));
        return;
      }
    } else {
      // Повторный запуск ежедневной функции не сбрасывает дневной счётчик.
      if (state && state.date === today) return;
      state = { date: today, attempts: 0, finished: settings.count === 0, triggerId: null };
      if (state.finished) {
        scheduleReviewReminderV1(state, settings);
        return;
      }
    }

    clearReviewReminderTriggersV1();
    state.triggerId = null;
    // Резервируем попытку до обращения к Telegram: неоднозначный сетевой
    // сбой не должен приводить к превышению дневного количества сообщений.
    state.attempts += 1;
    properties.setProperty('DAILY_REVIEW_NOTIFICATION_STATE', JSON.stringify(state));
    try {
      state.finished = !sendReviewOverviewV1(Boolean(triggerId));
    } finally {
      // При ошибке отправки следующая попытка остаётся в пределах лимита.
      scheduleReviewReminderV1(state, settings);
    }
  } finally {
    lock.releaseLock();
  }
}
