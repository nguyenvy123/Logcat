/**
 * get-telegram-chat-id.js
 * Helper script: fetch recent Telegram updates to find your Chat ID.
 * Usage: node get-telegram-chat-id.js <BOT_TOKEN>
 */

const token = process.argv[2];

if (!token) {
  console.error('Usage: node get-telegram-chat-id.js <BOT_TOKEN>');
  process.exit(1);
}

async function getUpdates() {
  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok) {
    console.error('❌ Telegram API error:', data.description);
    process.exit(1);
  }

  if (!data.result || data.result.length === 0) {
    console.log('⚠️  Chưa có updates nào.');
    console.log('👉 Hãy gửi bất kỳ tin nhắn gì cho bot của anh trên Telegram, rồi chạy lại script này.');
    return;
  }

  console.log('\n✅ Tìm thấy các chat:\n');
  const seen = new Set();
  data.result.forEach(update => {
    const msg = update.message || update.channel_post;
    if (!msg) return;
    const chatId = msg.chat.id;
    if (seen.has(chatId)) return;
    seen.add(chatId);

    const type = msg.chat.type;
    const name = msg.chat.title || `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`.trim();
    console.log(`  Chat ID : ${chatId}`);
    console.log(`  Type    : ${type}`);
    console.log(`  Name    : ${name}`);
    console.log('');
  });

  console.log('👉 Copy Chat ID vào file .env:');
  console.log('   TELEGRAM_CHAT_ID=<số_ở_trên>');
}

getUpdates().catch(err => {
  console.error('❌ Network error:', err.message);
});
