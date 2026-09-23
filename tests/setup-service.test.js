const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const sheets = {};
  function createSheet(name) {
    const sheet = {
      values: [],
      getRange() {
        return {
          setValues: values => { sheet.values = values; return this; },
          setFontWeight: () => sheet
        };
      }
    };
    sheets[name] = sheet;
    return sheet;
  }
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    insertSheet: createSheet
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    createConfigSheetV1: () => createSheet('CONFIG'),
    getOrCreateSessionsSheetV18: () => createSheet('SESSIONS'),
    getOrCreateSessionItemsSheetV18: () => createSheet('SESSION_ITEMS'),
    Logger: { log() {} }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/SetupService.js'), 'utf8'), context);
  return { context, sheets };
}

test('setup creates missing service sheets', () => {
  const { context, sheets } = fixture();
  const result = context.setupProjectSheetsV1();
  assert.deepEqual(Array.from(result.created), ['CONFIG', 'SESSIONS', 'SESSION_ITEMS', 'LOG']);
  assert.equal(sheets.LOG.values[0][0], 'Timestamp');
  assert.equal(sheets.LOG.values[0][10], 'Event ID');
});

test('setup preserves existing service sheets', () => {
  const { context, sheets } = fixture();
  context.setupProjectSheetsV1();
  const config = sheets.CONFIG;
  const result = context.setupProjectSheetsV1();
  assert.equal(sheets.CONFIG, config);
  assert.deepEqual(Array.from(result.created), []);
  assert.deepEqual(Array.from(result.existing), ['CONFIG', 'SESSIONS', 'SESSION_ITEMS', 'LOG']);
});
