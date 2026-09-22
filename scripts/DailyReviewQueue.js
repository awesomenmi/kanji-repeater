// ===================================
// DAILY REVIEW QUEUE
// ===================================


// ===================================
// 1. ПОСТОЯННЫЙ ДНЕВНОЙ ЛИМИТ
// ===================================

function getMaxDailyKanjiV1() {

  const value =
    PropertiesService
      .getScriptProperties()
      .getProperty('MAX_DAILY_KANJI');

  const limit =
    Number(value);

  if (
    value === null ||
    String(value).trim() === '' ||
    !Number.isInteger(limit) ||
    limit < 1
  ) {

    throw new Error(
      'Укажи положительное целое число ' +
      'MAX_DAILY_KANJI в Script Properties.'
    );
  }

  return limit;
}


// ===================================
// 2. СЕГОДНЯШНЯЯ ДАТА
// ===================================

function getDailyLimitDateV1() {

  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


// ===================================
// 3. ЧИТАЕМ ВРЕМЕННЫЙ БОНУС
// ===================================

function getDailyLimitBonusV1() {

  const properties =
    PropertiesService.getScriptProperties();

  const raw =
    properties.getProperty(
      'DAILY_LIMIT_BONUS_STATE'
    );

  if (!raw) {
    return 0;
  }

  const state =
    JSON.parse(raw);

  const today =
    getDailyLimitDateV1();

  // Бонус предыдущего дня не действует.

  if (state.date !== today) {
    return 0;
  }

  const bonus =
    Number(state.bonus);

  if (
    !Number.isSafeInteger(bonus) ||
    bonus < 0
  ) {

    throw new Error(
      'Некорректный DAILY_LIMIT_BONUS_STATE.'
    );
  }

  return bonus;
}


// ===================================
// 4. ЭФФЕКТИВНЫЙ ДНЕВНОЙ ЛИМИТ
// ===================================

function getEffectiveDailyLimitV1() {

  const baseLimit =
    getMaxDailyKanjiV1();

  const bonus =
    getDailyLimitBonusV1();

  return baseLimit + bonus;
}


// ===================================
// 5. УВЕЛИЧЕНИЕ ЛИМИТА
// ===================================
//
// Вызывается из Telegram webhook.
//
// amount: 5 или 10
// callbackId: ID конкретного нажатия.
//
// Повторная доставка того же callback
// не увеличивает лимит дважды.
//
// ===================================

function increaseDailyLimitV1(amount, callbackId) {

  const increment =
    Number(amount);

  if (
    increment !== 5 &&
    increment !== 10
  ) {

    throw new Error(
      'Допустимо увеличение только на 5 или 10.'
    );
  }

  if (
    callbackId === null ||
    callbackId === undefined ||
    String(callbackId).trim() === ''
  ) {

    throw new Error(
      'Не передан Telegram callback ID.'
    );
  }


  const lock =
    LockService.getScriptLock();

  lock.waitLock(10000);

  try {

    const properties =
      PropertiesService.getScriptProperties();

    const today =
      getDailyLimitDateV1();

    const baseLimit =
      getMaxDailyKanjiV1();

    const raw =
      properties.getProperty(
        'DAILY_LIMIT_BONUS_STATE'
      );


    let state = {
      date: today,
      bonus: 0,
      processedCallbacks: []
    };


    if (raw) {

      const saved =
        JSON.parse(raw);

      // Используем старое состояние
      // только в пределах того же дня.

      if (saved.date === today) {

        state = {

          date: today,

          bonus:
            Number(saved.bonus),

          processedCallbacks:
            Array.isArray(saved.processedCallbacks)
              ? saved.processedCallbacks
              : []

        };
      }
    }


    if (
      !Number.isSafeInteger(state.bonus) ||
      state.bonus < 0
    ) {

      throw new Error(
        'Некорректное значение бонуса.'
      );
    }


    const eventId =
      String(callbackId);


    // ===================================
    // ЗАЩИТА ОТ ПОВТОРНОЙ ДОСТАВКИ
    // ===================================

    if (
      state.processedCallbacks.includes(eventId)
    ) {

      return {

        status: 'DUPLICATE',

        baseLimit: baseLimit,

        bonus: state.bonus,

        maxDaily:
          baseLimit + state.bonus

      };
    }


    // ===================================
    // УВЕЛИЧИВАЕМ БОНУС
    // ===================================

    state.bonus += increment;


    // Проверяем, что результат остаётся
    // безопасным целым числом.

    if (
      !Number.isSafeInteger(
        baseLimit + state.bonus
      )
    ) {

      throw new Error(
        'Превышен допустимый размер лимита.'
      );
    }


    // ===================================
    // ЗАПОМИНАЕМ CALLBACK
    // ===================================

    state.processedCallbacks.push(
      eventId
    );


    // Храним последние 100 callback ID,
    // чтобы свойство не росло бесконечно.

    state.processedCallbacks =
      state.processedCallbacks.slice(-100);


    // ===================================
    // СОХРАНЯЕМ
    // ===================================

    properties.setProperty(
      'DAILY_LIMIT_BONUS_STATE',
      JSON.stringify(state)
    );


    return {

      status: 'OK',

      baseLimit: baseLimit,

      bonus: state.bonus,

      maxDaily:
        baseLimit + state.bonus

    };

  } finally {

    lock.releaseLock();

  }
}


// ===================================
// 6. СКОЛЬКО ПОВТОРЕНО СЕГОДНЯ
// ===================================

function getTodayProcessedCountV1() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const logSheet =
    ss.getSheetByName('LOG');

  if (
    !logSheet ||
    logSheet.getLastRow() < 2
  ) {
    return 0;
  }

  const data =
    logSheet
      .getRange(
        2,
        1,
        logSheet.getLastRow() - 1,
        11
      )
      .getValues();

  const timezone =
    Session.getScriptTimeZone();

  const today =
    Utilities.formatDate(
      new Date(),
      timezone,
      'yyyy-MM-dd'
    );

  const processedEvents =
    new Set();

  for (let i = 0; i < data.length; i++) {

    const row =
      data[i];

    const timestamp =
      row[0];

    const status =
      String(row[9]);

    const eventId =
      String(row[10]).trim();

    if (
      !(timestamp instanceof Date) ||
      isNaN(timestamp.getTime()) ||
      status !== 'OK'
    ) {
      continue;
    }

    const logDate =
      Utilities.formatDate(
        timestamp,
        timezone,
        'yyyy-MM-dd'
      );

    if (logDate !== today) {
      continue;
    }

    const uniqueKey =
      eventId || 'LOG_ROW_' + (i + 2);

    processedEvents.add(uniqueKey);
  }

  return processedEvents.size;
}


// ===================================
// 7. ЗАРЕЗЕРВИРОВАННЫЕ КАНДЗИ
// ===================================

function getReservedReviewItemsV1() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sessionsSheet =
    ss.getSheetByName('SESSIONS');

  const itemsSheet =
    ss.getSheetByName('SESSION_ITEMS');

  const reserved =
    new Set();

  if (
    !sessionsSheet ||
    !itemsSheet ||
    sessionsSheet.getLastRow() < 2 ||
    itemsSheet.getLastRow() < 2
  ) {

    return reserved;
  }

  const sessionsData =
    sessionsSheet
      .getDataRange()
      .getValues();

  const itemsData =
    itemsSheet
      .getDataRange()
      .getValues();

  const activeSessionIds =
    new Set();

  const timeZone = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');

  for (
    let i = 1;
    i < sessionsData.length;
    i++
  ) {

    const createdAt = sessionsData[i][1];
    const isToday = createdAt instanceof Date && !isNaN(createdAt.getTime()) &&
      Utilities.formatDate(createdAt, timeZone, 'yyyy-MM-dd') === todayKey;

    if (String(sessionsData[i][2]) === 'ACTIVE' && isToday) {

      activeSessionIds.add(
        String(sessionsData[i][0])
      );
    }
  }

  for (
    let i = 1;
    i < itemsData.length;
    i++
  ) {

    const row =
      itemsData[i];

    const sessionId =
      String(row[0]);

    const status =
      String(row[8]);

    if (
      !activeSessionIds.has(sessionId) ||
      status !== 'PENDING'
    ) {
      continue;
    }

    const key =
      String(row[3]) + '|' +
      String(row[4]) + '|' +
      String(row[5]);

    reserved.add(key);
  }

  return reserved;
}


// ===================================
// 8. ФОРМИРОВАНИЕ ДНЕВНОЙ ОЧЕРЕДИ
// ===================================

function getDailyReviewQueueV1() {

  const baseLimit =
    getMaxDailyKanjiV1();

  const bonus =
    getDailyLimitBonusV1();

  // Основное изменение:
  // лимит теперь включает бонус.

  const maxDaily =
    baseLimit + bonus;

  const processedToday =
    getTodayProcessedCountV1();

  const reserved =
    getReservedReviewItemsV1();

  const activeSheets =
    getActiveStudySheetsV1();


  // =====================================
  // 1. СОБИРАЕМ ОБЩИЙ СПИСОК
  // =====================================

  const allItems = [];

  for (
    let i = 0;
    i < activeSheets.length;
    i++
  ) {

    const sheetName =
      activeSheets[i];

    const review =
      getDueItemsV18(sheetName);

    for (
      let j = 0;
      j < review.items.length;
      j++
    ) {

      const item =
        review.items[j];

      const key =
        String(item.sheetName) + '|' +
        String(item.column) + '|' +
        String(item.kanjiRow);

      if (
        reserved.has(key)
      ) {
        continue;
      }

      allItems.push({
        ...item,
        sheetOrder: i
      });
    }
  }


  // =====================================
  // 2. СОРТИРОВКА ПО SCORE
  // =====================================

  allItems.sort(function(a, b) {

    const scoreDifference =
      Number(a.score) -
      Number(b.score);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const sheetDifference =
      a.sheetOrder -
      b.sheetOrder;

    if (sheetDifference !== 0) {
      return sheetDifference;
    }

    return 0;
  });


  // =====================================
  // 3. СВОБОДНЫЕ МЕСТА
  // =====================================

  const reservedCount =
    reserved.size;

  const remaining =
    Math.max(
      0,
      maxDaily -
      processedToday -
      reservedCount
    );


  // =====================================
  // 4. ПРИМЕНЯЕМ ЛИМИТ
  // =====================================

  const selectedItems =
    allItems.slice(
      0,
      remaining
    );


  return {

    // Постоянный лимит.

    baseLimit: baseLimit,

    // Дополнительный лимит на сегодня.

    bonus: bonus,

    // Итоговый лимит.

    maxDaily: maxDaily,

    processedToday: processedToday,

    reservedCount: reservedCount,

    remaining: remaining,

    items: selectedItems

  };
}


// ===================================
// 9. ДИАГНОСТИКА ОЧЕРЕДИ
// ===================================

function testDailyReviewQueueV1() {

  const queue =
    getDailyReviewQueueV1();

  Logger.log(
    JSON.stringify({

      baseLimit: queue.baseLimit,

      bonus: queue.bonus,

      maxDaily: queue.maxDaily,

      processedToday:
        queue.processedToday,

      reservedCount:
        queue.reservedCount,

      remaining:
        queue.remaining,

      selectedCount:
        queue.items.length,

      items:
        queue.items.map(function(item) {

          return {

            kanji: item.kanji,

            sheetName:
              item.sheetName,

            score: item.score

          };

        })

    }, null, 2)
  );
}
