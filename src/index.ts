import * as dotenv from 'dotenv';
import { createHandyClient } from 'handy-redis';
import { Region, Subscription } from './db';
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

// Scenes

const statusScene = new BaseScene('status');
statusScene.on('message', async ctx => {
  const regionName = ctx.message?.text;
  const region = await Region.findOne({
    where: { name: regionName || '' },
  });
  if (!region) {
    ctx.reply('Region not found!');
    await ctx.scene.leave();
    return;
  }

  const data = await redisClient.hgetall(`BNO.${ctx.message?.text}`);
  await ctx.reply(
    Object.keys(data)
      .map(key => `*${key}:* ${data[key]}`)
      .join('\n'),
    { parse_mode: 'Markdown' }
  );
  await ctx.scene.leave();
});

const subscribeScene = new BaseScene('subscribe');
subscribeScene.on('message', async ctx => {
  const regionName = ctx.message?.text;
  const region: Region = await Region.findOne({
    where: { name: regionName || '' },
  });
  if (!region) {
    ctx.reply('Region not found!');
    await ctx.scene.leave();
    return;
  }

  const subscription: Subscription = await Subscription.findOrCreate({
    where: {
      chatId: (await ctx.getChat()).id,
      region_id: region.id,
    },
  });

  if (!subscription) {
    ctx.reply('Error subscribing');
    return;
  }

  ctx.reply(`Subscribed to '${regionName}'`);
  await ctx.scene.leave();
});

const stage = new Stage([statusScene, subscribeScene]);
stage.command('cancel', Stage.leave());

bot.use(session());
bot.use(stage.middleware());

// Message handlers
async function displayRegionsKeyboard(
  ctx: ContextMessageUpdate
): Promise<void> {
  const regions = await Region.findAll();

  ctx.reply('Choose a region', {
    reply_markup: {
      one_time_keyboard: true,
      keyboard: regions.map((region: Region) => [region.name]),
    },
  });
}

bot.start((ctx: ContextMessageUpdate) => ctx.reply('wtf'));

bot.command('status', async ctx => {
  await displayRegionsKeyboard(ctx);
  ctx.scene.enter('status');
});

bot.command('subscribe', async ctx => {
  await displayRegionsKeyboard(ctx);
  ctx.scene.enter('subscribe');
});

bot.launch();
