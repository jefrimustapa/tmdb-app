import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const apiId = parseInt(process.env.TG_API_ID, 10);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error('Missing TG_API_ID or TG_API_HASH in .env');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('\n=== Telegram MTProto Session Generator ===\n');
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await askQuestion('Enter Telegram phone number (+60...): '),
    password: async () => await askQuestion('Enter 2FA password (leave empty if none): '),
    phoneCode: async () => await askQuestion('Enter the login code sent to your Telegram app: '),
    onError: (err) => console.error('Telegram start error:', err),
  });

  const sessionString = client.session.save();
  console.log('\n======================================================');
  console.log('✅ NEW TG_SESSION GENERATED SUCCESSFULLY:');
  console.log('======================================================\n');
  console.log(sessionString);
  console.log('\n======================================================\n');

  await client.disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
