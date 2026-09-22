// ===================================
// PROJECT SETUP
// ===================================

function setupProjectSheetsV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const existing = [];

  if (!ss.getSheetByName('CONFIG')) {
    createConfigSheetV1();
    created.push('CONFIG');
  } else {
    existing.push('CONFIG');
  }

  if (!ss.getSheetByName('SESSIONS')) {
    getOrCreateSessionsSheetV18(ss);
    created.push('SESSIONS');
  } else {
    existing.push('SESSIONS');
  }

  if (!ss.getSheetByName('SESSION_ITEMS')) {
    getOrCreateSessionItemsSheetV18(ss);
    created.push('SESSION_ITEMS');
  } else {
    existing.push('SESSION_ITEMS');
  }

  if (!ss.getSheetByName('LOG')) {
    const logSheet = ss.insertSheet('LOG');
    logSheet.getRange(1, 1, 1, 11).setValues([[
      'Timestamp', 'Kanji', 'Sheet', 'Column', 'Result',
      'Old Score', 'New Score', 'Old Date', 'New Date', 'Status', 'Event ID'
    ]]);
    logSheet.getRange(1, 1, 1, 11).setFontWeight('bold');
    created.push('LOG');
  } else {
    existing.push('LOG');
  }

  const result = {
    created: created,
    existing: existing,
    functionSheetFound: Boolean(ss.getSheetByName('FUNCTION'))
  };

  Logger.log(JSON.stringify(result));
  if (!result.functionSheetFound) {
    throw new Error(
      'Служебные листы созданы, но лист FUNCTION не найден. ' +
      'Скопируйте его из совместимой таблицы Kanji Reader.'
    );
  }

  return result;
}
