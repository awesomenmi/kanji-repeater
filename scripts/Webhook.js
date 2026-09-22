// ===================================
// TELEGRAM WEBHOOK
// ===================================

function doGet(e) {
  return HtmlService.createHtmlOutput('OK');
}


function doPost(e) {

  let update = null;

  try {

    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty('TELEGRAM_WEBHOOK_SECRET');
    const allowedChatId = properties.getProperty('TELEGRAM_CHAT_ID');
    const suppliedSecret = e && e.parameter && e.parameter.webhook_key;

    if (!secret || !allowedChatId || !suppliedSecret ||
        String(suppliedSecret) !== String(secret)) {
      console.log('Rejected webhook: invalid configuration or secret.');
      return HtmlService.createHtmlOutput('OK');
    }

    update =
      JSON.parse(
        e.postData.contents
      );

    const message = update.message ||
      (update.callback_query && update.callback_query.message);
    const sender = update.message ? update.message.from :
      (update.callback_query && update.callback_query.from);

    if (!message || !message.chat || !sender ||
        String(message.chat.id) !== String(allowedChatId) ||
        String(sender.id) !== String(allowedChatId)) {
      console.log('Rejected webhook: unauthorized chat or sender.');
      return HtmlService.createHtmlOutput('OK');
    }

    console.log('DOPOST received: ' +
      (update.message ? 'message' :
       update.callback_query ? 'callback_query' : 'other'));


    // ==========================================
    // /start
    // ==========================================

    if (update.message && /^\/start(?:@\w+)?(?:\s|$)/.test(update.message.text || '')) {

      sendDailyReviewNotificationV25();

      return HtmlService
        .createHtmlOutput('OK');
    }

    if (update.message && /^\/(?:menu|settings)(?:@\w+)?(?:\s|$)/.test(update.message.text || '')) {
      sendTelegramMenuV1(message.chat.id);
      return HtmlService.createHtmlOutput('OK');
    }


    // ==========================================
    // CALLBACK
    // ==========================================

    if (update.callback_query) {

      const callbackQuery =
        update.callback_query;

      const callbackId =
        callbackQuery.id;

      const chatId =
        callbackQuery.message.chat.id;

      const data =
        String(callbackQuery.data || '');

      console.log('===== CALLBACK =====');
      console.log(
        'callback_data: ' +
        data
      );


      // Убираем индикатор загрузки
      // на нажатой кнопке.

      telegramRequestV1(
        'answerCallbackQuery',
        {
          callback_query_id:
            callbackId
        }
      );

      if (data === 'menu:review') {
        sendDailyReviewNotificationV25();
        return HtmlService.createHtmlOutput('OK');
      }

      if (data.indexOf('menu:language:') === 0) {
        setUserPreferenceV1('language', data.substring('menu:language:'.length));
        setupTelegramCommandsV1();
        sendTelegramMenuV1(chatId);
        return HtmlService.createHtmlOutput('OK');
      }

      if (data.indexOf('menu:gender:') === 0) {
        setUserPreferenceV1('gender', data.substring('menu:gender:'.length));
        sendTelegramMenuV1(chatId);
        return HtmlService.createHtmlOutput('OK');
      }


      // ========================================
      // ➕ ВРЕМЕННОЕ УВЕЛИЧЕНИЕ ЛИМИТА
      // ========================================
      //
      // ВАЖНО:
      // Этот обработчик находится ДО
      // общего обработчика review:.
      //
      // ========================================

      if (
        data === 'review:limit:+5' ||
        data === 'review:limit:+10'
      ) {

        const amount =
          data === 'review:limit:+5'
            ? 5
            : 10;


        console.log(
          'Increasing daily limit by: ' +
          amount
        );


        // ----------------------------------------
        // Увеличиваем временный бонус
        // ----------------------------------------

        const limitResult =
          increaseDailyLimitV1(
            amount,
            callbackId
          );


        console.log(
          'Daily limit result:'
        );

        console.log(
          JSON.stringify(limitResult)
        );


        // ----------------------------------------
        // Повторно доставленный callback
        // ----------------------------------------

        if (
          limitResult.status === 'DUPLICATE'
        ) {

          console.log(
            'Duplicate limit callback ignored.'
          );

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Отправляем обновлённое уведомление
        // ----------------------------------------

        if (
          limitResult.status === 'OK'
        ) {

          sendDailyReviewNotificationV25();

          return HtmlService
            .createHtmlOutput('OK');
        }


        throw new Error(
          'Не удалось увеличить дневной лимит.'
        );
      }


      // ========================================
      // ▶️ НАЧАТЬ ПОВТОРЕНИЕ
      // ========================================

      if (
        data === 'review:start' ||
        data.indexOf('review:start:') === 0
      ) {

        let sheetName;

        if (
          data === 'review:start'
        ) {
          const activeSessions = getActiveReviewSessionsV1();
          const activeSheets = getActiveStudySheetsV1();
          sheetName = activeSessions.length > 0
            ? activeSessions[0].sheetName
            : activeSheets[0];

        } else {

          sheetName =
            decodeURIComponent(
              data.substring(
                'review:start:'.length
              )
            );
        }

        const activeSheets = getActiveStudySheetsV1();
        const activeSessions = getActiveReviewSessionsV1();
        const isActiveSheet = activeSheets.indexOf(sheetName) !== -1;
        const hasSession = activeSessions.some(function(session) {
          return session.sheetName === sheetName;
        });
        if (!sheetName || (!isActiveSheet && !hasSession)) {
          sendDailyReviewNotificationV25();
          return HtmlService.createHtmlOutput('OK');
        }


        const session =
          getOrCreateActiveSessionV22(
            sheetName
          );

        console.log(
          'Active session:'
        );

        console.log(
          JSON.stringify(session)
        );


        // ----------------------------------------
        // Нет повторений
        // ----------------------------------------

        if (
          !session.itemCount ||
          session.itemCount < 1
        ) {
          sendDailyReviewNotificationV25();

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Получаем текущий item
        // ----------------------------------------

        const item =
          getCurrentReviewItemV19(
            session.sessionId
          );

        console.log(
          'Current review item:'
        );

        console.log(
          JSON.stringify(item)
        );


        // ----------------------------------------
        // Сессия уже завершена
        // ----------------------------------------

        if (!item) {

          const preferences = getUserPreferencesV1();

          telegramSendRichMessageV1(
            chatId,

            preferences.language === 'en'
              ? '<h2>✅ Review completed!</h2>'
              : '<h2>✅ Повторение завершено!</h2>'
          );

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Показываем первый кандзи
        // ----------------------------------------

        const html =
          buildReviewRichHtmlV1(
            item,
            session.itemCount,
            session.sessionId
          );

        telegramSendRichMessageV1(
          chatId,
          html
        );

        return HtmlService
          .createHtmlOutput('OK');
      }


      // ========================================
      // РЕЗУЛЬТАТ ПОВТОРЕНИЯ
      // ========================================

      if (
        data.indexOf('review:') === 0 &&
        data.indexOf('review:start') !== 0
      ) {

        const parts =
          data.split(':');

        if (parts.length !== 4 || !/^[1-9]\d*$/.test(parts[2])) {
          return HtmlService.createHtmlOutput('OK');
        }

        const sessionId = parts[1];
        const itemIndex = Number(parts[2]);
        const result = parts[3];


        // ----------------------------------------
        // Проверяем допустимый результат
        // ----------------------------------------

        if (
          result !== 'ok' &&
          result !== 'half' &&
          result !== 'fail'
        ) {

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // ID ответа относится к карточке, на которой нажата кнопка.
        // ----------------------------------------

        const eventId = sessionId + ':' + itemIndex;

        console.log(
          'Processing: ' +
          sessionId +
          ' / item ' +
          itemIndex +
          ' / ' +
          result +
          ' / ' +
          eventId
        );


        // ----------------------------------------
        // Обрабатываем результат
        // ----------------------------------------

        const processed =
          processSessionResultV21(
            sessionId,
            result,
            eventId
          );

        console.log(
          'Processed result:'
        );

        console.log(
          JSON.stringify(processed)
        );


        // ----------------------------------------
        // Повторная обработка
        // ----------------------------------------

        if (
          processed.status === 'DUPLICATE' ||
          processed.status === 'STALE'
        ) {

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Сессия уже завершена
        // ----------------------------------------

        if (processed.status !== 'OK') {

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Если сессия завершена
        // ----------------------------------------

        if (
          processed.sessionCompleted === true
        ) {

          const stats =
            getSessionStatsV23(
              sessionId
            );


          const preferences = getUserPreferencesV1();
          const words = getReviewWordsV1(preferences);
          const html = preferences.language === 'en' ?
            '<h2>🎉 Review completed!</h2>' +
            '<h2>📚 Total: ' + stats.total + '</h2>' +
            '<p>' + words.remembered + ': ' + stats.ok + '<br>' +
              '〰️ 50/50: ' + stats.half + '<br>' +
              words.forgotten + ': ' + stats.fail + '</p>' :
            '<h2>🎉 Повторение завершено!</h2>' +

            '<h2>' +
              '📚 Всего: ' +
              stats.total +
            '</h2>' +

            '<p>' +
              words.remembered + ': ' +
              stats.ok +
              '<br>' +

              '〰️ 50/50: ' +
              stats.half +
              '<br>' +

              words.forgotten + ': ' +
              stats.fail +
            '</p>';


          telegramSendRichMessageV1(
            chatId,
            html
          );

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Получаем следующий item
        // ----------------------------------------

        const nextItem =
          getCurrentReviewItemV19(
            sessionId
          );


        // ----------------------------------------
        // Если следующего item нет
        // ----------------------------------------

        if (!nextItem) {

          const preferences = getUserPreferencesV1();

          telegramSendRichMessageV1(
            chatId,

            preferences.language === 'en'
              ? '<h2>🎉 Review completed!</h2>'
              : '<h2>🎉 Повторение завершено!</h2>'
          );

          return HtmlService
            .createHtmlOutput('OK');
        }


        // ----------------------------------------
        // Показываем следующий кандзи
        // ----------------------------------------

        const html =
          buildReviewRichHtmlV1(
            nextItem,
            processed.itemCount,
            sessionId
          );

        telegramSendRichMessageV1(
          chatId,
          html
        );

        return HtmlService
          .createHtmlOutput('OK');
      }
    }

  } catch (error) {

    console.log(
      'Webhook error: ' +
      error.message
    );


    // ==========================================
    // Сообщаем об ошибке пользователю
    // ==========================================

    try {

      if (
        update &&
        update.callback_query
      ) {

        const chatId =
          update
            .callback_query
            .message
            .chat
            .id;


        telegramSendRichMessageV1(
          chatId,

          '<p>⚠️ <b>Ошибка</b></p>' +

          '<p>' +
            String(error.message)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;') +
          '</p>'
        );
      }

    } catch (telegramError) {

      console.log(
        'Telegram error: ' +
        telegramError.message
      );
    }
  }


  return HtmlService
    .createHtmlOutput('OK');
}


// ===================================
// СБРОС TELEGRAM WEBHOOK
// ===================================

function resetTelegramWebhookV1() {

  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('TELEGRAM_BOT_TOKEN') ||
      !properties.getProperty('TELEGRAM_CHAT_ID')) {
    throw new Error('Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.');
  }

  let secret = properties.getProperty('TELEGRAM_WEBHOOK_SECRET');
  if (!secret) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    properties.setProperty('TELEGRAM_WEBHOOK_SECRET', secret);
  }

  // getUrl() при запуске из редактора может вернуть /dev (@HEAD).
  // Telegram должен вызывать опубликованный /exec deployment.
  const webAppUrl = properties.getProperty('TELEGRAM_WEBAPP_URL') ||
    'https://script.google.com/macros/s/AKfycbyyq8Wvn9OLySo-qnL-69vgQnJTw9LgDWDz22T6L5q9bPUwQNvdPsghLQ2tOLG5IxOO/exec';
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/?]+\/exec$/.test(webAppUrl)) {
    throw new Error('TELEGRAM_WEBAPP_URL должен быть опубликованным URL /exec.');
  }
  const url = webAppUrl +
    (webAppUrl.indexOf('?') === -1 ? '?' : '&') +
    'webhook_key=' + encodeURIComponent(secret);

  const response = telegramRequestV1('setWebhook', { url: url });
  if (!response.ok) {
    throw new Error('Telegram не принял регистрацию webhook.');
  }
  Logger.log('Telegram webhook зарегистрирован.');
  setupTelegramCommandsV1();
}


// ===================================
// ФОРМИРОВАНИЕ RICH-КАРТОЧКИ
// ===================================

function buildReviewRichHtmlV1(item, itemCount, sessionId) {

  const kanji =
    String(item.kanji);


  // =====================================
  // CALLBACK DATA
  // =====================================

  const okCallback =
    'review:' +
    sessionId +
    ':' + item.itemIndex + ':ok';

  const halfCallback =
    'review:' +
    sessionId +
    ':' + item.itemIndex + ':half';

  const failCallback =
    'review:' +
    sessionId +
    ':' + item.itemIndex + ':fail';


  // =====================================
  // ПОСЛЕДНЕЕ ПОВТОРЕНИЕ
  // =====================================

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const studySheet =
    ss.getSheetByName(
      item.sheetName
    );

  if (!studySheet) {

    throw new Error(
      'Учебный лист не найден: ' +
      item.sheetName
    );
  }


  const kanjiColumn =
    columnToNumberV21(
      item.column
    );


  const dateCell =
    studySheet.getRange(
      Number(item.kanjiRow) + 1,
      kanjiColumn
    );


  // Берём отображаемую дату,
  // например "15.09".

  const lastReviewDate =
    String(
      dateCell.getDisplayValue()
    ).trim();


  const displayedDate =
    lastReviewDate
      ? lastReviewDate
      : '—';

  const preferences = getUserPreferencesV1();
  const words = getReviewWordsV1(preferences);
  const isEnglish = preferences.language === 'en';


  // =====================================
  // HTML — БЕЗ ЦЕНТРИРОВАНИЯ
  // =====================================

  const html =

    // -----------------------------------
    // ЗАГОЛОВОК
    // -----------------------------------

    '<h2>' +
      (isEnglish ? '📝 Review ' : '📝 Повторение ') +
      item.itemIndex +
      (isEnglish ? ' of ' : ' из ') +
      itemCount +
    '</h2>' +


    // -----------------------------------
    // КАНДЗИ — КНОПКА КОПИРОВАНИЯ
    // -----------------------------------

    '<tg-button-row>' +

      '<tg-button ' +
        'type="copy_text" ' +
        'text="' +
          kanji +
        '">' +

        kanji +

      '</tg-button>' +

    '</tg-button-row>' +


    // -----------------------------------
    // УРОВЕНЬ + ДАТА
    // -----------------------------------

    '<p>' +
      (isEnglish ? 'Current level: ' : 'Текущий уровень: ') +
      item.score +

      '<br>' +

      (isEnglish ? 'Last review: ' : 'Последнее повторение: ') +
      displayedDate +
    '</p>' +


    // -----------------------------------
    // КНОПКИ РЕЗУЛЬТАТА
    // -----------------------------------

    '<tg-button-row>' +

      '<tg-button ' +
        'type="callback_data" ' +
        'style="success" ' +
        'data="' +
          okCallback +
        '">' +

        words.remembered +

      '</tg-button>' +


      '<tg-button ' +
        'type="callback_data" ' +
        'data="' +
          halfCallback +
        '">' +

        '〰️ 50/50' +

      '</tg-button>' +


      '<tg-button ' +
        'type="callback_data" ' +
        'style="danger" ' +
        'data="' +
          failCallback +
        '">' +

        words.forgotten +

      '</tg-button>' +

    '</tg-button-row>';


  return html;
}


// ===================================
// ПРОВЕРКА TELEGRAM WEBHOOK
// ===================================

function checkTelegramWebhookV1() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('TELEGRAM_BOT_TOKEN');
  const secret = properties.getProperty('TELEGRAM_WEBHOOK_SECRET');
  if (!token) {
    throw new Error('Не найден TELEGRAM_BOT_TOKEN.');
  }

  // Не использовать telegramRequestV1: она записывает полный ответ
  // getWebhookInfo в журнал, включая URL с секретом.
  const response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + token + '/getWebhookInfo',
    { muteHttpExceptions: true }
  );
  const info = JSON.parse(response.getContentText());
  if (!info.ok) {
    throw new Error('Telegram не вернул сведения о webhook.');
  }

  const registeredUrl = String(info.result.url || '');
  const deploymentMatch = /\/s\/([^/?]+)\/(exec|dev)(?:[?&]|$)/.exec(registeredUrl);
  const urlHost = /^https?:\/\/([^/]+)/.exec(registeredUrl);
  const registeredSecret = /[?&]webhook_key=([^&]+)/.exec(registeredUrl);
  const result = {
    hasWebhook: Boolean(registeredUrl),
    deploymentId: deploymentMatch ? deploymentMatch[1] : null,
    urlType: deploymentMatch ? deploymentMatch[2] : 'unknown',
    urlHost: urlHost ? urlHost[1] : null,
    secretMatches: Boolean(secret && registeredSecret &&
      decodeURIComponent(registeredSecret[1]) === secret),
    pendingUpdateCount: info.result.pending_update_count || 0,
    lastErrorDate: info.result.last_error_date || null,
    lastErrorMessage: String(info.result.last_error_message || '')
      .replace(/https?:\/\/\S+/g, '[URL]')
      .replace(/webhook_key=[^\s&]+/g, 'webhook_key=[REDACTED]')
  };
  Logger.log(JSON.stringify(result));
  return result;
}
