function testRichReviewCardV1() {

  const chatId =
    PropertiesService
      .getScriptProperties()
      .getProperty('TELEGRAM_CHAT_ID');

  if (!chatId) {
    throw new Error(
      'Не найден TELEGRAM_CHAT_ID в Script Properties.'
    );
  }
const html =
  '<p>📝 Повторение 27 из 27</p>' +
  '<tg-button-row align="center">' +
    '<tg-button type="copy_text" text="命">' +
      '命' +
    '</tg-button>' +
  '</tg-button-row>' +
  '<p>Текущий уровень: 2</p>' +
  '<tg-button-row align="center">' +
    '<tg-button type="copy_text" text="命">' +
      '📋 Скопировать' +
    '</tg-button>' +
  '</tg-button-row>';

  const result =
    telegramRequestV1('sendRichMessage', {
      chat_id: chatId,
      rich_message: {
        html: html
      }
    });

  Logger.log(
    JSON.stringify(result)
  );
}