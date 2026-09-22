const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(initialValue) {
  const values = {};
  if (initialValue !== undefined) values.TELEGRAM_USER_PREFERENCES = initialValue;
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => values[key],
      setProperty: (key, value) => { values[key] = value; }
    }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/UserPreferences.js'), 'utf8'), context);
  return context;
}

test('preferences use Russian feminine defaults and persist changes', () => {
  const context = fixture();
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.getUserPreferencesV1())),
    { language: 'ru', gender: 'female' }
  );
  context.setUserPreferenceV1('gender', 'male');
  assert.equal(context.getReviewWordsV1().remembered, '✅ Вспомнил');
  context.setUserPreferenceV1('language', 'en');
  assert.equal(context.getReviewWordsV1().forgotten, '❌ Forgot');
});

test('menu contains review and settings callbacks', () => {
  const html = fixture().buildTelegramMenuHtmlV1();
  assert.match(html, /menu:review/);
  assert.match(html, /menu:language:en/);
  assert.match(html, /menu:gender:male/);
});
