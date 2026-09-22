const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(failAfterScore = false) {
  const sheets = {
    SESSIONS: [['Session ID', 'Created At', 'Status', 'Sheet', 'Item Count', 'Current Index'],
      ['s1', new Date(), 'ACTIVE', 'study', 2, 1]],
    SESSION_ITEMS: [['Session ID', 'Item #', 'Kanji', 'Sheet', 'Column', 'Kanji Row', 'Score', 'Countdown', 'Status', 'Result', 'Event ID', 'Processed At'],
      ['s1', 1, '日', 'study', 'B', 1, 3, 0, 'PENDING', '', 's1:1', ''],
      ['s1', 2, '月', 'study', 'C', 1, 3, 0, 'PENDING', '', 's1:2', '']],
    LOG: [['Timestamp', 'Kanji', 'Sheet', 'Column', 'Result', 'Old Score', 'New Score', 'Old Date', 'New Date', 'Status', 'Event ID']],
    study: [[null, '日', '月'], [null, new Date('2026-09-01'), new Date('2026-09-01')],
      [null, 3, 3], [null, 0, 0]]
  };
  let shouldFail = failAfterScore;
  function sheet(name) {
    const rows = sheets[name];
    return {
      getDataRange() { return { getValues: () => rows.map(row => row.slice()) }; },
      getLastRow() { return rows.length; },
      appendRow(row) { rows.push(row.slice()); },
      getRange(r, c, height = 1, width = 1) {
        return {
          getValue() { return rows[r - 1][c - 1]; },
          setValue(value) {
            if (shouldFail && name === 'study' && r === 3) {
              shouldFail = false;
              throw new Error('injected interruption');
            }
            rows[r - 1][c - 1] = value;
            return this;
          },
          setValues(values) {
            for (let i = 0; i < height; i++) {
              for (let j = 0; j < width; j++) rows[r - 1 + i][c - 1 + j] = values[i][j];
            }
            return this;
          },
          setNumberFormat() { return this; }
        };
      }
    };
  }
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] ? sheet(name) : null }), flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/SessionService.js'), 'utf8'), context);
  return { sheets, process: context.processSessionResultV21 };
}

test('old card cannot process the next item', () => {
  const { sheets, process } = fixture();
  assert.equal(process('s1', 'ok', 's1:1').status, 'OK');
  assert.equal(process('s1', 'fail', 's1:1').status, 'DUPLICATE');
  assert.equal(sheets.study[2][2], 3);
  assert.equal(sheets.SESSIONS[1][5], 2);
  assert.equal(sheets.LOG.length, 2);
});

test('interrupted write resumes without applying score twice', () => {
  const { sheets, process } = fixture(true);
  assert.throws(() => process('s1', 'ok', 's1:1'), /injected interruption/);
  assert.equal(sheets.LOG[1][9], 'PENDING');
  assert.equal(process('s1', 'ok', 's1:1').status, 'OK');
  assert.equal(sheets.study[2][1], 4);
  assert.equal(sheets.SESSIONS[1][5], 2);
  assert.equal(sheets.LOG[1][9], 'OK');
  assert.equal(sheets.LOG.length, 2);
});

test('future card is rejected without writing', () => {
  const { sheets, process } = fixture();
  assert.equal(process('s1', 'ok', 's1:2').status, 'STALE');
  assert.equal(sheets.LOG.length, 1);
  assert.equal(sheets.study[2][2], 3);
});

test('old active sessions expire and pending items are cancelled', () => {
  const oldDate = new Date('2026-09-21T12:00:00Z');
  const rows = {
    SESSIONS: [['header'], ['old', oldDate, 'ACTIVE', 'study', 2, 1]],
    SESSION_ITEMS: [['header'],
      ['old', 1, '日', 'study', 'B', 1, 3, 0, 'PENDING', '', 'old:1', ''],
      ['old', 2, '月', 'study', 'C', 1, 3, 0, 'PROCESSED', 'ok', 'old:2', oldDate]]
  };
  function sheet(name) {
    return {
      getLastRow: () => rows[name].length,
      getRange(r, c, h = 1, w = 1) {
        return {
          getValues: () => rows[name].slice(r - 1, r - 1 + h).map(row => row.slice(c - 1, c - 1 + w)),
          setValue(value) { rows[name][r - 1][c - 1] = value; return this; },
          setValues(values) {
            values.forEach((row, i) => row.forEach((value, j) => { rows[name][r - 1 + i][c - 1 + j] = value; }));
            return this;
          }
        };
      }
    };
  }
  const context = {
    Date,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => rows[name] ? sheet(name) : null }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/SessionService.js'), 'utf8'), context);
  assert.equal(context.expireOldActiveSessionsV1(), 1);
  assert.equal(rows.SESSIONS[1][2], 'EXPIRED');
  assert.equal(rows.SESSION_ITEMS[1][8], 'CANCELLED');
  assert.equal(rows.SESSION_ITEMS[2][8], 'PROCESSED');
});
