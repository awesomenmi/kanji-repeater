function getOrCreateActiveSessionV22(sheetName) {

  expireOldActiveSessionsV1();

  const lock =
    LockService.getScriptLock();

  lock.waitLock(10000);

  try {

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const sessionsSheet =
      ss.getSheetByName('SESSIONS');

    if (!sessionsSheet) {

      throw new Error(
        'Лист SESSIONS не найден.'
      );
    }

    const data =
      sessionsSheet
        .getDataRange()
        .getValues();


    // =====================================
    // 1. ИЩЕМ СУЩЕСТВУЮЩУЮ СЕССИЮ
    // =====================================

    for (
      let i = 1;
      i < data.length;
      i++
    ) {

      const sessionId =
        data[i][0];

      const status =
        data[i][2];

      const sessionSheetName =
        data[i][3];

      if (
        status === 'ACTIVE' &&
        sessionSheetName === sheetName
      ) {

        return {

          sessionId: sessionId,

          status: 'ACTIVE',

          sheetName: sessionSheetName,

          itemCount: Number(data[i][4]),

          currentIndex: Number(data[i][5])

        };
      }
    }


    // =====================================
    // 2. СОЗДАЁМ НОВУЮ СЕССИЮ
    // =====================================

    const session =
      createReviewSessionV18(
        sheetName
      );


    return {

      sessionId: session.sessionId,

      status: session.status,

      sheetName: session.sheetName,

      itemCount: session.itemCount,

      currentIndex:
        session.status === 'EMPTY'
          ? 0
          : 1

    };

  } finally {

    lock.releaseLock();

  }
}

function getActiveReviewSessionsV1() {
  expireOldActiveSessionsV1();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('SESSIONS');
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return rows.filter(function(row) {
    return String(row[2]) === 'ACTIVE' &&
      Number.isSafeInteger(Number(row[4])) &&
      Number.isSafeInteger(Number(row[5])) &&
      Number(row[5]) >= 1 &&
      Number(row[5]) <= Number(row[4]);
  }).map(function(row) {
    return {
      sessionId: String(row[0]),
      sheetName: String(row[3]),
      itemCount: Number(row[4]),
      currentIndex: Number(row[5])
    };
  });
}

function expireOldActiveSessionsV1() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sessionsSheet = ss.getSheetByName('SESSIONS');
    const itemsSheet = ss.getSheetByName('SESSION_ITEMS');
    if (!sessionsSheet || sessionsSheet.getLastRow() < 2) {
      return 0;
    }

    const timeZone = Session.getScriptTimeZone();
    const todayKey = Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');
    const sessionRows = sessionsSheet
      .getRange(2, 1, sessionsSheet.getLastRow() - 1, 6).getValues();
    const expiredIds = new Set();

    sessionRows.forEach(function(row, index) {
      const createdAt = row[1];
      if (String(row[2]) !== 'ACTIVE' || !(createdAt instanceof Date) ||
          isNaN(createdAt.getTime())) {
        return;
      }
      const createdKey = Utilities.formatDate(createdAt, timeZone, 'yyyy-MM-dd');
      if (createdKey < todayKey) {
        sessionsSheet.getRange(index + 2, 3).setValue('EXPIRED');
        expiredIds.add(String(row[0]));
      }
    });

    if (itemsSheet && itemsSheet.getLastRow() >= 2 && expiredIds.size > 0) {
      const itemRange = itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, 12);
      const itemRows = itemRange.getValues();
      let changed = false;
      itemRows.forEach(function(row) {
        if (expiredIds.has(String(row[0])) && String(row[8]) === 'PENDING') {
          row[8] = 'CANCELLED';
          changed = true;
        }
      });
      if (changed) {
        itemRange.setValues(itemRows);
      }
    }
    return expiredIds.size;
  } finally {
    lock.releaseLock();
  }
}

function getSessionItemCountV22(sessionId) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName('SESSIONS');

  if (!sheet) {
    throw new Error('Лист SESSIONS не найден.');
  }

  const data =
    sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {

    if (data[i][0] === sessionId) {
      return Number(data[i][4]);
    }
  }

  throw new Error(
    'Сессия не найдена: ' + sessionId
  );
}

function getSessionStatsV23(sessionId) {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const itemsSheet =
    ss.getSheetByName('SESSION_ITEMS');

  if (!itemsSheet) {
    throw new Error(
      'Лист SESSION_ITEMS не найден.'
    );
  }

  const data =
    itemsSheet
      .getDataRange()
      .getValues();

  let total = 0;
  let ok = 0;
  let half = 0;
  let fail = 0;

  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    if (
      String(row[0]) !==
      String(sessionId)
    ) {
      continue;
    }

    if (
      String(row[8]) !==
      'PROCESSED'
    ) {
      continue;
    }

    total++;

    const result =
      String(row[9]);

    if (result === 'ok') {
      ok++;
    }

    if (result === 'half') {
      half++;
    }

    if (result === 'fail') {
      fail++;
    }
  }

  return {
    total: total,
    ok: ok,
    half: half,
    fail: fail
  };
}

// ===================================
// V21 — ПРОВЕРКА ЗАВЕРШЕНИЯ СЕССИИ
// ===================================

function processSessionResultV21(sessionId, result, eventId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const sessionsSheet = ss.getSheetByName('SESSIONS');
    const itemsSheet = ss.getSheetByName('SESSION_ITEMS');

    const logSheet = ss.getSheetByName('LOG');
    if (!sessionsSheet || !itemsSheet || !logSheet) {
      throw new Error('Для обработки нужны листы SESSIONS, SESSION_ITEMS и LOG.');
    }

    const match = /^(.+):([1-9]\d*)$/.exec(String(eventId));
    if (!match || match[1] !== String(sessionId) ||
        !['ok', 'half', 'fail'].includes(result)) {
      throw new Error('Некорректный ответ или Event ID.');
    }
    const requestedIndex = Number(match[2]);

    const sessionsData = sessionsSheet.getDataRange().getValues();
    const itemsData = itemsSheet.getDataRange().getValues();

    // ===================================
    // 1. ИЩЕМ СЕССИЮ
    // ===================================

    let sessionRow = null;
    let sessionData = null;

    for (let i = 1; i < sessionsData.length; i++) {
      if (String(sessionsData[i][0]) === String(sessionId)) {
        sessionRow = i + 1;
        sessionData = sessionsData[i];
        break;
      }
    }

    if (!sessionData) {
      throw new Error('Сессия не найдена.');
    }

    const sessionStatus = String(sessionData[2]);

    // LOG служит журналом операции. PENDING означает, что запись
    // могла прерваться и её надо закончить с прежними old/new значениями.
    let logRow = null;
    let logEntry = null;
    const logData = logSheet.getDataRange().getValues();
    for (let i = 1; i < logData.length; i++) {
      if (String(logData[i][10]) === String(eventId)) {
        logRow = i + 1;
        logEntry = logData[i];
        break;
      }
    }
    if (logEntry && String(logEntry[9]) === 'OK') {
      return { status: 'DUPLICATE' };
    }
    if (logEntry && String(logEntry[9]) !== 'PENDING') {
      throw new Error('Некорректный статус записи LOG.');
    }

    // ===================================
    // 2. ЕСЛИ СЕССИЯ УЖЕ ЗАВЕРШЕНА
    // ===================================

    if (sessionStatus !== 'ACTIVE' && !logEntry) {
      return {
        status: sessionStatus,
        message: 'Сессия больше не активна.'
      };
    }

    // ===================================
    // 4. ТЕКУЩИЙ ИНДЕКС
    // ===================================

    const currentIndex = Number(sessionData[5]);

    if (!Number.isSafeInteger(currentIndex) || currentIndex < 1) {
      throw new Error('Некорректный Current Index.');
    }

    if ((!logEntry && requestedIndex !== currentIndex) ||
        (logEntry && currentIndex !== requestedIndex &&
         currentIndex !== requestedIndex + 1)) {
      return { status: 'STALE' };
    }

    // ===================================
    // 5. ИЩЕМ ТЕКУЩИЙ ITEM
    // ===================================

    let itemRow = null;
    let itemData = null;

    for (let i = 1; i < itemsData.length; i++) {
      const row = itemsData[i];

      const rowSessionId = String(row[0]);
      const rowItemIndex = Number(row[1]);

      if (
        rowSessionId === String(sessionId) &&
        rowItemIndex === requestedIndex
      ) {
        itemRow = i + 1;
        itemData = row;
        break;
      }
    }

    if (!itemData) {
      throw new Error('Текущий item не найден.');
    }

    // ===================================
    // 6. ПРОВЕРЯЕМ, ЧТО ITEM PENDING
    // ===================================

    const itemStatus = String(itemData[8]);

    if (itemStatus === 'PROCESSED' && !logEntry) {
      return {
        status: 'DUPLICATE'
      };
    }

    if (itemStatus !== 'PENDING' && itemStatus !== 'PROCESSED') {
      throw new Error(
        'Некорректный статус item: ' + itemStatus
      );
    }

    if (itemStatus === 'PROCESSED' &&
        String(itemData[9]) !== String(result)) {
      throw new Error('Результат карточки не совпадает с журналом.');
    }

    // ===================================
    // 8. ДАННЫЕ ITEM
    // ===================================

    const kanji = String(itemData[2]);
    const sheetName = String(itemData[3]);
    const column = String(itemData[4]);
    const kanjiRow = Number(itemData[5]);

    // ===================================
    // 9. ОТКРЫВАЕМ УЧЕБНЫЙ ЛИСТ
    // ===================================

    const studySheet = ss.getSheetByName(sheetName);

    if (!studySheet) {
      throw new Error(
        'Учебный лист не найден: ' + sheetName
      );
    }

    const kanjiColumn =
      columnToNumberV21(column);

    const dateCell =
      studySheet.getRange(kanjiRow + 1, kanjiColumn);

    const scoreCell =
      studySheet.getRange(kanjiRow + 2, kanjiColumn);

    // ===================================
    // 10. ЧИТАЕМ АКТУАЛЬНЫЕ ДАННЫЕ
    // ===================================

    const oldDate = logEntry ? logEntry[7] : dateCell.getValue();
    const rawScore = logEntry ? logEntry[5] : scoreCell.getValue();
    const oldScore = Number(rawScore);

    if (rawScore === '' || !Number.isFinite(oldScore)) {
      throw new Error(
        'Score не является числом.'
      );
    }

    // ===================================
    // 11. НОВЫЙ SCORE
    // ===================================

    let newScore = oldScore;

    if (oldScore < 3) {
      newScore = oldScore + 1;
    } else if (oldScore === 3) {
      if (result === 'ok') {
        newScore = 4;
      } else {
        newScore = 3;
      }
    } else {
      if (result === 'ok') newScore = oldScore + 1;
      if (result === 'fail') newScore = oldScore - 1;
    }

    newScore = Math.max(1, Math.min(22, newScore));

    if (logEntry) {
      if (String(logEntry[4]) !== String(result) ||
          String(logEntry[1]) !== kanji ||
          String(logEntry[2]) !== sheetName ||
          String(logEntry[3]) !== column) {
        throw new Error('Запись LOG не соответствует карточке.');
      }
      newScore = Number(logEntry[6]);
      if (!Number.isFinite(newScore)) {
        throw new Error('Некорректный новый Score в LOG.');
      }
    }

    // ===================================
    // 12. СЕГОДНЯ
    // ===================================

    const today = logEntry ? logEntry[8] : new Date();
    if (!(today instanceof Date) || isNaN(today.getTime())) {
      throw new Error('Некорректная дата в LOG.');
    }
    if (!logEntry) {
      today.setHours(0, 0, 0, 0);
      logSheet.appendRow([
        new Date(), kanji, sheetName, column, result,
        oldScore, newScore, oldDate, today, 'PENDING', eventId
      ]);
      logRow = logSheet.getLastRow();
    }

    // ===================================
    // 13. ЗАПИСЫВАЕМ ТОЛЬКО
    // DATE + SCORE
    // ===================================

    dateCell.setValue(today);
    dateCell.setNumberFormat('dd.MM');

    scoreCell.setValue(newScore);

    // ВАЖНО:
    // COUNTDOWN НЕ ТРОГАЕМ

    SpreadsheetApp.flush();

    // ===================================
    // 14. ЧИТАЕМ ПЕРЕСЧИТАННЫЙ COUNTDOWN
    // ===================================

    const countdownCell =
      studySheet.getRange(
        kanjiRow + 3,
        kanjiColumn
      );

    const newCountdown =
      countdownCell.getValue();

    // ===================================
    // 15. ОБНОВЛЯЕМ SESSION_ITEM
    // ===================================

    const processedAt = new Date();

    itemsSheet.getRange(itemRow, 9, 1, 4).setValues([[
      'PROCESSED', result, eventId, processedAt
    ]]);

    // ===================================
    // 16. ОПРЕДЕЛЯЕМ, ЕСТЬ ЛИ ЕЩЁ ITEM
    // ===================================

    const itemCount = Number(sessionData[4]);

    const nextIndex = requestedIndex + 1;

    let nextStatus = 'ACTIVE';
    let sessionCompleted = false;

    if (nextIndex > itemCount) {
      nextStatus = 'COMPLETED';
      sessionCompleted = true;
    }

    // ===================================
    // 17. ОБНОВЛЯЕМ SESSION
    // ===================================

    sessionsSheet
      .getRange(sessionRow, 6)
      .setValue(nextIndex);

    sessionsSheet
      .getRange(sessionRow, 3)
      .setValue(nextStatus);

    // ===================================
    // 18. LOG
    // ===================================

    SpreadsheetApp.flush();
    logSheet.getRange(logRow, 10).setValue('OK');

    // ===================================
    // 19. РЕЗУЛЬТАТ
    // ===================================

  return {
    status: 'OK',
    kanji: kanji,
    result: result,
    oldScore: oldScore,
    newScore: newScore,
    oldDate: oldDate,
    newDate: today,
    countdown: newCountdown,
    currentIndex: currentIndex,
    nextIndex: nextIndex,
    itemCount: itemCount,
    sessionCompleted: sessionCompleted
  };

  } finally {
    lock.releaseLock();
  }
}


// ===================================
// ПРЕОБРАЗОВАНИЕ БУКВЫ КОЛОНКИ
// ===================================

function columnToNumberV21(column) {
  let result = 0;

  const letters = String(column)
    .toUpperCase();

  for (let i = 0; i < letters.length; i++) {
    result =
      result * 26 +
      letters.charCodeAt(i) - 64;
  }

  return result;
}


/**
 * Создаёт новую сессию повторения.
 *
 * Создаёт/использует:
 *   SESSIONS
 *   SESSION_ITEMS
 *
 * Учебный лист НЕ изменяет.
 */
function createReviewSessionV18(sheetName) {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();


  // =====================================
  // 1. ПОЛУЧАЕМ ГЛОБАЛЬНУЮ ОЧЕРЕДЬ
  // =====================================

  const queue =
    getDailyReviewQueueV1();


  // =====================================
  // 2. ВЫБИРАЕМ ЭЛЕМЕНТЫ НУЖНОГО ЛИСТА
  // =====================================

  const items =
    queue.items.filter(function(item) {

      return (
        String(item.sheetName) ===
        String(sheetName)
      );

    });


  console.log(
    '===== DAILY REVIEW QUEUE ====='
  );

  console.log(
    JSON.stringify({
      maxDaily: queue.maxDaily,
      processedToday: queue.processedToday,
      reservedCount: queue.reservedCount,
      remaining: queue.remaining,
      selectedForSheet: items.length
    })
  );


  // =====================================
  // 3. ЕСЛИ НЕТ ДОСТУПНЫХ ЭЛЕМЕНТОВ
  // =====================================

  if (items.length === 0) {

    return {

      sessionId: null,

      status: 'EMPTY',

      sheetName: sheetName,

      itemCount: 0,

      items: [],

      sessionRow: null,

      firstItemRow: null,

      lastItemRow: null

    };
  }


  // =====================================
  // 4. СОЗДАЁМ SESSION ID
  // =====================================

  const now =
    new Date();

  const sessionId =
    createSessionIdV18(now);


  // =====================================
  // 5. ПОЛУЧАЕМ ЛИСТЫ СЕССИЙ
  // =====================================

  const sessionsSheet =
    getOrCreateSessionsSheetV18(ss);

  const itemsSheet =
    getOrCreateSessionItemsSheetV18(ss);


  // =====================================
  // 6. ЗАПИСЫВАЕМ SESSION
  // =====================================

  const sessionRow =
    sessionsSheet.getLastRow() + 1;


  sessionsSheet
    .getRange(
      sessionRow,
      1,
      1,
      6
    )
    .setValues([[

      sessionId,

      now,

      'ACTIVE',

      sheetName,

      items.length,

      1

    ]]);


  // =====================================
  // 7. ФОРМИРУЕМ SESSION_ITEMS
  // =====================================

  const itemRows =
    items.map(function(item, index) {

      const itemIndex =
        index + 1;

      item.itemIndex =
        itemIndex;

      const eventId =
        sessionId +
        ':' +
        itemIndex;


      return [

        sessionId,

        itemIndex,

        item.kanji,

        sheetName,

        item.column,

        item.kanjiRow,

        item.score,

        item.countdown,

        'PENDING',

        '',

        eventId,

        ''

      ];

    });


  // =====================================
  // 8. ЗАПИСЫВАЕМ ITEMS
  // =====================================

  const firstItemRow =
    itemsSheet.getLastRow() + 1;

  const lastItemRow =
    firstItemRow +
    itemRows.length -
    1;


  itemsSheet
    .getRange(
      firstItemRow,
      1,
      itemRows.length,
      12
    )
    .setValues(itemRows);


  // =====================================
  // 9. ФОРМАТ ДАТЫ
  // =====================================

  sessionsSheet
    .getRange(
      sessionRow,
      2
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );


  SpreadsheetApp.flush();


  // =====================================
  // 10. РЕЗУЛЬТАТ
  // =====================================

  return {

    sessionId: sessionId,

    status: 'ACTIVE',

    sheetName: sheetName,

    itemCount: items.length,

    items: items,

    sessionRow: sessionRow,

    firstItemRow: firstItemRow,

    lastItemRow: lastItemRow

  };
}




/**
 * Создаёт лист SESSIONS,
 * если его ещё нет.
 */
function getOrCreateSessionsSheetV18(ss) {

  let sheet =
    ss.getSheetByName('SESSIONS');


  if (!sheet) {

    sheet =
      ss.insertSheet('SESSIONS');

    sheet
      .getRange(1, 1, 1, 6)
      .setValues([[
        'Session ID',
        'Created At',
        'Status',
        'Sheet',
        'Item Count',
        'Current Index'
      ]]);

    sheet
      .getRange(1, 1, 1, 6)
      .setFontWeight('bold');
  }


  return sheet;
}


/**
 * Создаёт лист SESSION_ITEMS,
 * если его ещё нет.
 */
function getOrCreateSessionItemsSheetV18(ss) {

  let sheet =
    ss.getSheetByName(
      'SESSION_ITEMS'
    );


  if (!sheet) {

    sheet =
      ss.insertSheet(
        'SESSION_ITEMS'
      );


    sheet
      .getRange(1, 1, 1, 12)
      .setValues([[
        'Session ID',
        'Item #',
        'Kanji',
        'Sheet',
        'Column',
        'Kanji Row',
        'Score',
        'Countdown',
        'Status',
        'Result',
        'Event ID',
        'Processed At'
      ]]);


    sheet
      .getRange(1, 1, 1, 12)
      .setFontWeight('bold');
  }


  return sheet;
}


/**
 * Создаёт уникальный ID сессии.
 */
function createSessionIdV18(now) {

  const timestamp =
    Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    );


  const uuid =
    Utilities
      .getUuid()
      .replace(/-/g, '')
      .substring(0, 6);


  return (
    timestamp +
    '-' +
    uuid
  );
}
