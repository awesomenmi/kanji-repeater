// ===================================
// USER PREFERENCES AND LOCALIZATION
// ===================================

function getUserPreferencesV1() {
  const properties = PropertiesService.getScriptProperties();
  let stored = {};
  try {
    stored = JSON.parse(properties.getProperty('TELEGRAM_USER_PREFERENCES') || '{}');
  } catch (error) {
    stored = {};
  }

  return {
    language: stored.language === 'en' ? 'en' : 'ru',
    gender: stored.gender === 'male' ? 'male' : 'female'
  };
}

function setUserPreferenceV1(name, value) {
  const preferences = getUserPreferencesV1();
  if (name === 'language' && (value === 'ru' || value === 'en')) {
    preferences.language = value;
  } else if (name === 'gender' && (value === 'male' || value === 'female')) {
    preferences.gender = value;
  } else {
    throw new Error('Некорректная настройка пользователя.');
  }

  PropertiesService.getScriptProperties().setProperty(
    'TELEGRAM_USER_PREFERENCES',
    JSON.stringify(preferences)
  );
  return preferences;
}

function getReviewWordsV1(preferences) {
  const settings = preferences || getUserPreferencesV1();
  if (settings.language === 'en') {
    return {
      remembered: '✅ Remembered', forgotten: '❌ Forgot', ready: 'Ready to start?'
    };
  }
  return {
    remembered: settings.gender === 'male' ? '✅ Вспомнил' : '✅ Вспомнила',
    forgotten: settings.gender === 'male' ? '❌ Забыл' : '❌ Забыла',
    ready: settings.gender === 'male' ? 'Готов начать?' : 'Готова начать?'
  };
}

function buildTelegramMenuHtmlV1() {
  const settings = getUserPreferencesV1();
  const isEnglish = settings.language === 'en';
  const language = isEnglish ? 'English' : 'Русский';
  const gender = settings.gender === 'male' ? 'Мужской' : 'Женский';
  const title = isEnglish ? '⚙️ Bot menu' : '⚙️ Меню бота';
  const review = isEnglish ? '📚 Start or continue review' : '📚 Начать или продолжить повторение';
  const settingsTitle = isEnglish ? 'Interface settings' : 'Настройки интерфейса';

  return '<h2>' + title + '</h2>' +
    '<tg-button-row><tg-button type="callback_data" data="menu:review">' +
      review + '</tg-button></tg-button-row>' +
    '<p><b>' + settingsTitle + '</b><br>' +
      (isEnglish ? 'Language: ' : 'Язык: ') + language + '<br>' +
      (isEnglish ? 'Russian wording: ' : 'Форма обращения: ') + gender + '</p>' +
    '<tg-button-row>' +
      '<tg-button type="callback_data" data="menu:language:ru">🇷🇺 Русский</tg-button>' +
      '<tg-button type="callback_data" data="menu:language:en">🇬🇧 English</tg-button>' +
    '</tg-button-row>' +
    '<tg-button-row>' +
      '<tg-button type="callback_data" data="menu:gender:female">Вспомнила</tg-button>' +
      '<tg-button type="callback_data" data="menu:gender:male">Вспомнил</tg-button>' +
    '</tg-button-row>';
}

function sendTelegramMenuV1(chatId) {
  return telegramSendRichMessageV1(chatId, buildTelegramMenuHtmlV1());
}

function setupTelegramCommandsV1() {
  const isEnglish = getUserPreferencesV1().language === 'en';
  return telegramRequestV1('setMyCommands', {
    commands: [
      { command: 'start', description: isEnglish ? 'Start or continue review' : 'Начать или продолжить повторение' },
      { command: 'menu', description: isEnglish ? 'Menu and settings' : 'Меню и настройки' }
    ]
  });
}
