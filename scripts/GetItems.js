/**
 * Возвращает текущий PENDING элемент
 * активной сессии.
 *
 * НИЧЕГО НЕ ИЗМЕНЯЕТ.
 */
function getCurrentReviewItemV19(sessionId) {

  if (!sessionId) {

    throw new Error(
      'Не передан Session ID.'
    );
  }


  const ss =
    SpreadsheetApp.getActiveSpreadsheet();


  // =====================================
  // 1. НАХОДИМ SESSIONS
  // =====================================

  const sessionsSheet =
    ss.getSheetByName(
      'SESSIONS'
    );


  if (!sessionsSheet) {

    throw new Error(
      'Лист SESSIONS не найден.'
    );
  }


  const sessionsData =
    sessionsSheet
      .getDataRange()
      .getValues();


  let session = null;


  for (
    let i = 1;
    i < sessionsData.length;
    i++
  ) {

    if (
      String(
        sessionsData[i][0]
      ) === String(sessionId)
    ) {

      session = {

        row: i + 1,

        sessionId:
          sessionsData[i][0],

        createdAt:
          sessionsData[i][1],

        status:
          sessionsData[i][2],

        sheetName:
          sessionsData[i][3],

        itemCount:
          Number(
            sessionsData[i][4]
          ),

        currentIndex:
          Number(
            sessionsData[i][5]
          )
      };

      break;
    }
  }


  if (!session) {

    throw new Error(
      'Сессия не найдена: ' +
      sessionId
    );
  }


  // =====================================
  // 2. ПРОВЕРЯЕМ СТАТУС СЕССИИ
  // =====================================

  if (
    session.status !== 'ACTIVE'
  ) {

    return null;
  }


  // =====================================
  // 3. НАХОДИМ SESSION_ITEMS
  // =====================================

  const itemsSheet =
    ss.getSheetByName(
      'SESSION_ITEMS'
    );


  if (!itemsSheet) {

    throw new Error(
      'Лист SESSION_ITEMS не найден.'
    );
  }


  const itemsData =
    itemsSheet
      .getDataRange()
      .getValues();


  // =====================================
  // 4. ИЩЕМ CURRENT INDEX
  // =====================================

  for (
    let i = 1;
    i < itemsData.length;
    i++
  ) {

    const row =
      itemsData[i];


    const rowSessionId =
      String(row[0]);


    const itemIndex =
      Number(row[1]);


    const status =
      String(row[8]);


    if (
      rowSessionId ===
        String(sessionId) &&

      itemIndex ===
        session.currentIndex &&

      status === 'PENDING'
    ) {

      // =====================================
      // 4.1. ПОЛУЧАЕМ УЧЕБНЫЙ ЛИСТ
      // =====================================

      const studySheet =
        ss.getSheetByName(
          row[3]
        );


      if (!studySheet) {

        throw new Error(
          'Учебный лист не найден: ' +
          row[3]
        );
      }


      // =====================================
      // 4.2. ОПРЕДЕЛЯЕМ ЯЧЕЙКУ ДАТЫ
      // =====================================

      const kanjiRow =
        Number(row[5]);


      const kanjiColumn =
        columnToNumberV21(
          row[4]
        );


      const lastReviewDate =
        studySheet
          .getRange(
            kanjiRow + 1,
            kanjiColumn
          )
          .getValue();


      // =====================================
      // 4.3. ВОЗВРАЩАЕМ CURRENT ITEM
      // =====================================

      return {

        sessionId:
          row[0],

        itemIndex:
          itemIndex,

        kanji:
          row[2],

        sheetName:
          row[3],

        column:
          row[4],

        kanjiRow:
          kanjiRow,

        score:
          Number(row[6]),

        countdown:
          Number(row[7]),

        date:
          lastReviewDate,

        status:
          row[8],

        result:
          row[9],

        eventId:
          row[10],

        processedAt:
          row[11]
      };
    }
  }


  // =====================================
  // 5. ЕСЛИ ТЕКУЩЕГО PENDING НЕТ
  // =====================================

  return null;
}

/**
 * Получает все due items.
 *
 * ВАЖНО:
 * Countdown только читается.
 * Никаких вычислений или записей Countdown.
 */
function getDueItemsV18(sheetName) {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(sheetName);


  if (!sheet) {

    throw new Error(
      'Лист не найден: ' +
      sheetName
    );
  }


  const firstColumn = 2; // B
  const blockHeight = 5;

  const dataRange =
    sheet.getDataRange();

  const dataLastColumn =
    dataRange.getLastColumn();

  const dataLastRow =
    Math.min(
      dataRange.getLastRow(),
      40
    );


  // Если в листе нет данных начиная с B
  if (dataLastColumn < firstColumn) {

    return {
      sheetName: sheetName,
      items: []
    };
  }


  const columnCount =
    dataLastColumn - firstColumn + 1;


  const rowCount =
    dataLastRow;


  const range =
    sheet.getRange(
      1,
      firstColumn,
      rowCount,
      columnCount
    );


  const displayValues =
    range.getDisplayValues();

  const values =
    range.getValues();


  const items = [];


  for (
    let kanjiRow = 1;
    kanjiRow <= dataLastRow;
    kanjiRow += blockHeight
  ) {

    const dateRow =
      kanjiRow + 1;

    const scoreRow =
      kanjiRow + 2;

    const countdownRow =
      kanjiRow + 3;


    // Если необходимые строки выходят
    // за пределы считанного диапазона
    if (
      countdownRow > dataLastRow
    ) {
      break;
    }


    for (
      let col = firstColumn;
      col <= dataLastColumn;
      col++
    ) {

      const arrayCol =
        col - firstColumn;


      const kanji =
        String(
          displayValues[
            kanjiRow - 1
          ][arrayCol]
        ).trim();


      if (!kanji) {
        continue;
      }


      if (
        kanji === '…' ||
        kanji === '...'
      ) {
        continue;
      }


      const date =
        values[
          dateRow - 1
        ][arrayCol];


      const score =
        Number(
          values[
            scoreRow - 1
          ][arrayCol]
        );


      const countdown =
        values[
          countdownRow - 1
        ][arrayCol];


      // Новый / ещё не заполненный кандзи
      if (!(date instanceof Date)) {
        continue;
      }


      if (!Number.isFinite(score)) {
        continue;
      }


      if (
        typeof countdown !== 'number' ||
        !Number.isFinite(countdown)
      ) {
        continue;
      }


      if (countdown >= 1) {
        continue;
      }


      items.push({

        kanji: kanji,

        sheetName: sheetName,

        column:
          columnNumberToLetterV18(col),

        columnNumber: col,

        kanjiRow: kanjiRow,

        dateRow: dateRow,

        scoreRow: scoreRow,

        countdownRow: countdownRow,

        date: date,

        score: score,

        countdown: countdown

      });
    }
  }


  return {
    sheetName: sheetName,
    items: items
  };
}

/**
 * Номер колонки → буква.
 */
function columnNumberToLetterV18(column) {

  let letter = '';

  while (column > 0) {

    const remainder =
      (column - 1) % 26;

    letter =
      String.fromCharCode(
        65 + remainder
      ) + letter;

    column =
      Math.floor(
        (column - 1) / 26
      );
  }

  return letter;
}