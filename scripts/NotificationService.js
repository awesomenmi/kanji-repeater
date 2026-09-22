function sendDailyReviewNotificationV24() {

  const activeSheets =
    getActiveStudySheetsV1();

  const chatId =
    PropertiesService
      .getScriptProperties()
      .getProperty('TELEGRAM_CHAT_ID');

  if (!chatId) {
    throw new Error(
      'Не найден TELEGRAM_CHAT_ID в Script Properties.'
    );
  }

  let totalCount = 0;
  const sheetStats = [];
  const buttons = [];

  for (let i = 0; i < activeSheets.length; i++) {

    const sheetName = activeSheets[i];

    const review =
      getDueItemsV18(sheetName);

    const count =
      review.items.length;

    totalCount += count;

    sheetStats.push(
      sheetName + ': ' + count
    );

    if (count > 0) {

      buttons.push([
        {
          text:
            '▶️ ' +
            sheetName +
            ' — ' +
            count,

          callback_data:
            'review:start:' +
            encodeURIComponent(sheetName)
        }
      ]);
    }
  }

  let text;

  if (totalCount === 0) {

    text =
      '📚 Сегодня повторений нет.\n\n' +
      sheetStats.join('\n');

  } else {

    text =
      '📚 Сегодня ' +
      totalCount +
      ' повторени' +
      (totalCount === 1 ? 'е' : 'й') +
      '\n\n' +
      sheetStats.join('\n') +
      '\n\n' +
      'Готова начать?';
  }

  telegramRequestV1('sendMessage', {
    chat_id: chatId,
    text: text,
    reply_markup:
      buttons.length > 0
        ? {
            inline_keyboard: buttons
          }
        : undefined
  });
}

function sendDailyReviewNotificationV25() {

  expireOldActiveSessionsV1();
  const preferences = getUserPreferencesV1();
  const words = getReviewWordsV1(preferences);
  const isEnglish = preferences.language === 'en';

  // =====================================
  // 1. НАСТРОЙКИ И АКТИВНЫЕ ЛИСТЫ
  // =====================================

  const activeSheets =
    getActiveStudySheetsV1();

  const chatId =
    PropertiesService
      .getScriptProperties()
      .getProperty('TELEGRAM_CHAT_ID');

  if (!chatId) {
    throw new Error(
      'Не найден TELEGRAM_CHAT_ID в Script Properties.'
    );
  }


  // =====================================
  // 2. ДНЕВНАЯ ОЧЕРЕДЬ
  // =====================================

  const queue =
    getDailyReviewQueueV1();

  const baseLimit =
    queue.baseLimit;

  const bonus =
    queue.bonus;

  const maxDaily =
    queue.maxDaily;

  const processedToday =
    queue.processedToday;

  const reservedCount =
    queue.reservedCount;

  const availableItems =
    queue.items;

  const activeSessions = getActiveReviewSessionsV1();
  const activeSheetNames = new Set(activeSessions.map(function(session) {
    return session.sheetName;
  }));
  const startableItems = availableItems.filter(function(item) {
    return !activeSheetNames.has(String(item.sheetName));
  });
  const availableCount = startableItems.length;


  // =====================================
  // 3. ВСЕ ПРОСРОЧЕННЫЕ КАНДЗИ
  // =====================================

  let totalDue = 0;

  for (
    let i = 0;
    i < activeSheets.length;
    i++
  ) {

    const review =
      getDueItemsV18(
        activeSheets[i]
      );

    totalDue +=
      review.items.length;
  }


  // =====================================
  // 4. КНОПКИ НАЧАЛА ПОВТОРЕНИЯ
  // =====================================

  const buttons = [];

  const continuationButtons = activeSessions.map(function(session) {
    const sheetName = session.sheetName;
    const callbackData = 'review:start:' + encodeURIComponent(sheetName);
    const label = String(sheetName)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return '<tg-button-row><tg-button type="callback_data" data="' +
      callbackData + '">▶️ ' + (isEnglish ? 'Continue ' : 'Продолжить ') + label +
      ' — ' + session.currentIndex + (isEnglish ? ' of ' : ' из ') + session.itemCount +
      '</tg-button></tg-button-row>';
  });

  for (
    let i = 0;
    i < activeSheets.length;
    i++
  ) {

    const sheetName =
      activeSheets[i];

    const count =
      startableItems.filter(function(item) {

        return (
          String(item.sheetName) ===
          String(sheetName)
        );

      }).length;

    if (count === 0) {
      continue;
    }

    const callbackData =
      'review:start:' +
      encodeURIComponent(sheetName);
    const safeSheetName = String(sheetName)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    buttons.push(

      '<tg-button-row>' +

        '<tg-button ' +
          'type="callback_data" ' +
          'data="' +
            callbackData +
          '">' +

          '▶️ ' +
          safeSheetName +
          ' — ' +
          count +

        '</tg-button>' +

      '</tg-button-row>'

    );
  }


  // =====================================
  // 5. КНОПКИ УВЕЛИЧЕНИЯ ЛИМИТА
  // =====================================

  const limitButtons =

    '<p>' + (isEnglish ? 'Want to review more?' : 'Хочешь повторить больше?') + '</p>' +

    '<tg-button-row>' +

      '<tg-button ' +
        'type="callback_data" ' +
        'data="review:limit:+5">' +
          (isEnglish ? '➕ 5 more' : '➕ Ещё 5') +
      '</tg-button>' +

      '<tg-button ' +
        'type="callback_data" ' +
        'data="review:limit:+10">' +
          (isEnglish ? '➕ 10 more' : '➕ Ещё 10') +
      '</tg-button>' +

    '</tg-button-row>';


  // =====================================
  // 6. ИНФОРМАЦИЯ О ЛИМИТЕ
  // =====================================

  let limitInfo =
    (isEnglish ? 'Reviewed today: ' : 'Повторено сегодня: ') +
    processedToday +
    ' из ' +
    maxDaily;

  if (bonus > 0) {

    limitInfo +=
      '<br>' +
      (isEnglish ? 'Base limit: ' : 'Основной лимит: ') +
      baseLimit +
      '<br>' +
      (isEnglish ? 'Extra today: +' : 'Дополнительно сегодня: +') +
      bonus;
  }


  // =====================================
  // 7. ФОРМИРУЕМ СООБЩЕНИЕ
  // =====================================

  let html = '';


  // -------------------------------------
  // НЕТ ПРОСРОЧЕННЫХ И АКТИВНЫХ
  // -------------------------------------

  if (
    totalDue === 0 &&
    reservedCount === 0 &&
    activeSessions.length === 0
  ) {

    html =
      '<h2>' + (isEnglish ? '📚 No reviews today.' : '📚 Сегодня повторений нет.') + '</h2>' +

      '<p>' +
        limitInfo +
      '</p>';

  }


  // -------------------------------------
  // ЛИМИТ ПОЛНОСТЬЮ ИСЧЕРПАН
  // -------------------------------------

  else if (
    processedToday >= maxDaily
  ) {

    html =
      '<h2>' + (isEnglish ? '📚 Daily limit reached' : '📚 Дневной лимит достигнут') + '</h2>' +

      '<p>' +
        limitInfo +
        '<br>' +
        (isEnglish ? 'Due kanji remaining: ' : 'Осталось просроченных кандзи: ') +
        totalDue +
      '</p>' +

      '<p>' +
        (isEnglish ? 'No new reviews are available today.' : 'На сегодня новые повторения недоступны.') +
      '</p>';

    html += continuationButtons.join('');

    if (totalDue > reservedCount) {
      html += limitButtons;
    }

  }


  // -------------------------------------
  // ЛИМИТ ЗАНЯТ АКТИВНЫМИ СЕССИЯМИ
  // -------------------------------------

  else if (
    availableCount === 0 &&
    reservedCount > 0
  ) {

    html =
      '<h2>' + (isEnglish ? '📚 Review already started' : '📚 Повторение уже начато') + '</h2>' +

      '<p>' +
        limitInfo +
        '<br>' +
        (isEnglish ? 'Kanji in active sessions: ' : 'Кандзи в активных сессиях: ') +
        reservedCount +
      '</p>' +

      '<p>' + (isEnglish ? 'Continue the active review.' : 'Продолжи начатое повторение.') + '</p>' +
      continuationButtons.join('');


    // Есть ли другие просроченные кандзи,
    // не занятые активными сессиями?

    if (totalDue > reservedCount) {
      html += limitButtons;
    }

  }


  // -------------------------------------
  // ЕСТЬ ДОСТУПНЫЕ ПОВТОРЕНИЯ
  // -------------------------------------

  else if (
    availableCount > 0
  ) {

    html =
      '<h2>' +
        (isEnglish ? '📚 Available today: ' : '📚 Доступно сегодня: ') +
        availableCount +
      '</h2>' +

      '<p>' +
        limitInfo +
        '<br>' +
        (isEnglish ? 'Due kanji remaining: ' : 'Осталось просроченных: ') +
        totalDue +
      '</p>' +

      '<p>' + words.ready + '</p>' +

      continuationButtons.join('') +
      buttons.join('');

  }


  // -------------------------------------
  // ДРУГИЕ СЛУЧАИ
  // -------------------------------------

  else {

    html =
      '<h2>' + (isEnglish ? '📚 No new reviews right now.' : '📚 Новых повторений сейчас нет.') + '</h2>' +

      '<p>' +
        limitInfo +
        '<br>' +
        (isEnglish ? 'Kanji in active sessions: ' : 'Кандзи в активных сессиях: ') +
        reservedCount +
      '</p>' +
      continuationButtons.join('');

  }


  // =====================================
  // 8. ОТПРАВЛЯЕМ RICH MESSAGE
  // =====================================

  telegramSendRichMessageV1(
    chatId,
    html
  );

}
