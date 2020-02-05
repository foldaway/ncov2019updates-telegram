import * as dotenv from 'dotenv';
import { createHandyClient } from 'handy-redis';
dotenv.config();

import Telegraf, {
  ContextMessageUpdate,
  BaseScene,
  Stage,
  session,
  SceneContextMessageUpdate,
} from 'telegraf';

const { TELEGRAM_BOT_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing bot token');
}

const redisClient = createHandyClient({
  db: 2,
});

const bot: Telegraf<SceneContextMessageUpdate> = new Telegraf(
  TELEGRAM_BOT_TOKEN
);

const statusScene = new BaseScene('status');
statusScene.on('message', async ctx => {
  const data = await redisClient.hgetall(`BNO.${ctx.message?.text}`);
  await ctx.reply(
    Object.keys(data)
      .map(key => `*${key}:* ${data[key]}`)
      .join('\n'),
    { parse_mode: 'MarkdownV2' }
  );
  await ctx.scene.leave();
});

const stage = new Stage([statusScene]);
stage.command('cancel', Stage.leave());

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx: ContextMessageUpdate) => ctx.reply('wtf'));
bot.command('status', async ctx => {
  const regions = await redisClient.lrange('REGIONS', 0, -1);

  ctx.reply('Choose a region', {
    reply_markup: {
      one_time_keyboard: true,
      keyboard: regions.map(region => [region]),
    },
  });

  ctx.scene.enter('status');
});

bot.launch();
