// ===================================
// TELEGRAM SERVICE
// ===================================

function telegramRequestV1(method, payload) {

  const token =
    PropertiesService
      .getScriptProperties()
      .getProperty('TELEGRAM_BOT_TOKEN');

  if (!token) {
    throw new Error(
      'Не найден TELEGRAM_BOT_TOKEN в Script Properties.'
    );
  }

  const url =
    'https://api.telegram.org/bot' +
    token +
    '/' +
    method;

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

  const statusCode = response.getResponseCode();
  let result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('Telegram вернул некорректный ответ для ' + method +
      ' (HTTP ' + statusCode + ').');
  }

  Logger.log('Telegram ' + method + ': HTTP ' + statusCode +
    ', ok=' + String(result.ok === true));

  if (statusCode < 200 || statusCode >= 300 || result.ok !== true) {
    throw new Error('Ошибка Telegram API при ' + method +
      ' (HTTP ' + statusCode + ').');
  }

  return result;
}


// ===================================
// ОТПРАВКА СООБЩЕНИЯ
// ===================================

function telegramSendMessageV1(chatId, text) {

  return telegramRequestV1(
    'sendMessage',
    {
      chat_id: chatId,
      text: text
    }
  );
}

function telegramSendRichMessageV1(chatId, html) {

  return telegramRequestV1('sendRichMessage', {
    chat_id: chatId,
    rich_message: {
      html: html
    }
  });
}
