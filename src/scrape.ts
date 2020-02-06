import puppeteer from 'puppeteer';
import { createHandyClient } from 'handy-redis';
import { News, NewsSource, Subscription, Region } from './db';
import { Telegram } from 'telegraf';
import { broadcast } from './util';
import { Op } from 'sequelize';
import { nhc } from './sources/nhc';
import { Article } from './sources/data-model';
import { moh } from './sources/moh';
import { bnoNews, formatChanges } from './sources/bno';

const tg = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);

const redisClient = createHandyClient({
  url: process.env.REDIS_URL,
});

const isProduction = process.env.NODE_ENV === 'production';

async function scrape(): Promise<void> {
  console.log('Scraping');
  const browser = await puppeteer.launch({
    headless: isProduction,
    defaultViewport: null,
    args: isProduction ? ['--no-sandbox'] : [],
  });
  const page = await browser.newPage();

  // Disable navigator.webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  // CHINA

  try {
    const nhcData = await nhc(page);
    const [nhcSource] = await NewsSource.findOrCreate({
      where: {
        name: 'NHC',
      },
    });

    const existingNHCArticles: Article[] = await News.findAll({
      where: {
        news_source_id: nhcSource.id,
      },
    });
    const nhcPush: string[] = [];

    const chinaRegions: Region[] = await Region.findAll({
      where: {
        name: {
          [Op.iLike]: '%province%',
        },
      },
    });

    for (const article of nhcData) {
      if (!existingNHCArticles.find(a => a.link === article.link)) {
        nhcPush.push(`[${article.title}](${article.link})`);
      }

      await News.findOrCreate({
        where: {
          title: article.title,
          link: article.link,
          writtenAt: article.date,
          news_source_id: nhcSource.id,
        },
      });
    }

    const chinaSubscriptions = await Subscription.findAll({
      attributes: ['chatId'],
      where: {
        region_id: chinaRegions.map(r => r.id),
      },
      group: 'chatId',
    });

    console.log(nhcData);

    if (nhcPush.length > 0) {
      broadcast(tg, chinaSubscriptions, nhcPush.join('\n\n'));
    }
  } catch (e) {
    console.error(e);
  }

  // SINGAPORE

  const mohData = await moh(page);
  const [mohSource] = await NewsSource.findOrCreate({
    where: {
      name: 'MOH',
    },
  });

  const [sgRegion] = await Region.findOrCreate({
    where: { name: 'Singapore' },
  });

  const sgSubscriptions: Subscription[] = await Subscription.findAll({
    where: {
      region_id: sgRegion.id,
    },
  });

  const existingMOHArticles: Article[] = await News.findAll({
    where: {
      news_source_id: mohSource.id,
    },
  });
  const mohPush: string[] = [];
  for (const article of mohData.news) {
    if (!existingMOHArticles.find(a => a.link === article.link)) {
      mohPush.push(`[${article.title}](${article.link})`);
    }
    await News.findOrCreate({
      where: {
        title: article.title,
        link: article.link,
        writtenAt: article.date,
        news_source_id: mohSource.id,
      },
    });
  }
  if (mohPush.length > 0) {
    await broadcast(tg, sgSubscriptions, mohPush.join('\n\n'));
  }

  const currentDorscon = await redisClient.get('MOH.DORSCON');
  if (currentDorscon !== mohData.dorscon) {
    await broadcast(
      tg,
      sgSubscriptions,
      `*UPDATE:* The DORSCON level changed from \`${currentDorscon}\` → \`${mohData.dorscon}\``
    );
  }
  await redisClient.set('MOH.DORSCON', mohData.dorscon);

  const currentMOHConfirmedCases = parseInt(
    (await redisClient.get('MOH.CONFIRMED_CASES')) || '',
    10
  );
  if (currentMOHConfirmedCases !== mohData.confirmedCases) {
    await broadcast(
      tg,
      sgSubscriptions,
      `*UPDATE:* The MOH's number of confirmed cases changed from \`${currentMOHConfirmedCases}\` → \`${mohData.confirmedCases}\``
    );
  }
  await redisClient.set(
    'MOH.CONFIRMED_CASES',
    mohData.confirmedCases.toString()
  );
  console.log(mohData);

  // GLOBAL

  const bnoData = await bnoNews(page);

  // List of regions
  await redisClient.del('REGIONS');
  await redisClient.rpush('REGIONS', ...bnoData.map(data => data.region));

  for (const data of bnoData) {
    const [region] = await Region.findOrCreate({
      where: {
        name: data.region,
      },
    });

    const currentData = await redisClient.hgetall(`BNO.${data.region}`);
    if (currentData) {
      // Patch numbers
      currentData.cases = parseInt(currentData.cases || '', 10);
      currentData.deaths = parseInt(currentData.deaths || '', 10);

      if (
        currentData.cases !== data.cases ||
        currentData.deaths !== data.deaths ||
        currentData.notes !== data.notes
      ) {
        const subscriptions: Subscription[] = await Subscription.findAll({
          where: {
            region_id: region.id,
          },
        });

        await broadcast(
          tg,
          subscriptions,
          `REGION: *${data.region}*\n${formatChanges(currentData, data)}`
        );
      }
    }

    await redisClient.hmset(
      `BNO.${data.region}`,
      ['region', data.region],
      ['cases', data.cases.toString()],
      ['deaths', data.deaths.toString()],
      ['notes', data.notes]
    );
  }
  console.log(bnoData);

  await browser.close();
}

scrape().then(() => process.exit(0));
