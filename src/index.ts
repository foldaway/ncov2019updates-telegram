import * as dotenv from 'dotenv';
dotenv.config();

import Telegraf, {ContextMessageUpdate} from 'telegraf';

const { TELEGRAM_BOT_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing bot token');
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.start((ctx: ContextMessageUpdate) => ctx.reply('wtf'));
bot.launch();
