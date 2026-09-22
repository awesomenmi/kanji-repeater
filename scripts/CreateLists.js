function createConfigSheetV1() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let configSheet = ss.getSheetByName('CONFIG');

  if (configSheet) {
    throw new Error(
      'Лист CONFIG уже существует.'
    );
  }

  configSheet = ss.insertSheet('CONFIG');

  const data = [
    ['SHEET_NAME', 'ACTIVE'],
    ['常用漢字1-3', true],
    ['常用漢字4-6', false],
    ['常用漢字7-9', false]
  ];

  configSheet
    .getRange(1, 1, data.length, 2)
    .setValues(data);

  configSheet
    .getRange('A1:B1')
    .setFontWeight('bold');

  configSheet
    .getRange('B2:B4')
    .insertCheckboxes();

  configSheet.autoResizeColumns(1, 2);

}

function getActiveStudySheetsV1() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('CONFIG');

  if (!configSheet) {
    throw new Error('Лист CONFIG не найден.');
  }

  const data = configSheet.getDataRange().getValues();

  const activeSheets = [];

  for (let i = 1; i < data.length; i++) {

    const sheetName = String(data[i][0]).trim();
    const active = data[i][1];

    if (
      sheetName &&
      active === true
    ) {
      activeSheets.push(sheetName);
    }
  }

  return activeSheets;
}

function testGetActiveStudySheetsV1() {

  const sheets = getActiveStudySheetsV1();

  Logger.log(JSON.stringify(sheets));

}