import puppeteer, { Page } from 'puppeteer';
import { createHandyClient } from 'handy-redis';
import { News, NewsSource, Subscription, Region } from './db';
import { Telegram } from 'telegraf';
import { broadcast, formatDiff } from './util';
import { Op } from 'sequelize';
import { nhc } from './sources/nhc';
import { Article } from './sources/data-model';
import { moh } from './sources/moh';
import { bnoNews, formatChanges } from './sources/bno';
import moment from 'moment';
import axios from 'axios';

const tg = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);

const redisClient = createHandyClient({
  url: process.env.REDIS_URL,
});

const isProduction = process.env.NODE_ENV === 'production';

async function scrapeNHC(page: Page): Promise<void> {
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
}

async function scrapeMOH(page: Page): Promise<void> {
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
        writtenAt: moment(article.date, 'DD MMM YYYY').toISOString(),
        news_source_id: mohSource.id,
      },
    });
  }
  /*if (mohPush.length > 0) {
    await broadcast(tg, sgSubscriptions, mohPush.join('\n\n'));
    }*/

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
}
async function scrapeBNO(page: Page): Promise<void> {
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

  // TOTALS
  const totalCases = bnoData.map(data => data.cases).reduce((a, b) => a + b, 0);
  const totalDeaths = bnoData
    .map(data => data.deaths)
    .reduce((a, b) => a + b, 0);

  const totalPush: string[] = [];

  const currentTotalCases = await redisClient.get('BNO.TOTAL_CASES');
  if (currentTotalCases && parseInt(currentTotalCases, 10) !== totalCases) {
    totalPush.push(
      `TOTAL CASES: *${currentTotalCases} → ${totalCases}* (${formatDiff(
        parseInt(currentTotalCases, 10),
        totalCases
      )})`
    );
  }
  await redisClient.set('BNO.TOTAL_CASES', totalCases.toString());

  const currentTotalDeaths = await redisClient.get('BNO.TOTAL_DEATHS');
  if (currentTotalDeaths && parseInt(currentTotalDeaths, 10) !== totalDeaths) {
    totalPush.push(
      `TOTAL DEATHS: *${currentTotalDeaths} → ${totalDeaths}* (${formatDiff(
        parseInt(currentTotalDeaths, 10),
        totalDeaths
      )})`
    );
  }
  await redisClient.set('BNO.TOTAL_DEATHS', totalDeaths.toString());

  /*const allSubs: Subscription[] = await Subscription.findAll({
    attributes: ['chatId'],
    group: 'chatId',
  });

  if (totalPush.length > 0) {
    broadcast(tg, allSubs, totalPush.join('\n'));
    }*/
}

async function reportError(page: Page) {
  try {
    const screenshot = await page.screenshot({ encoding: 'base64' }); // base64
    const resp = await axios.post(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      `image=${encodeURIComponent(screenshot)}&name=${encodeURIComponent(
        page.url()
      )}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'json',
      }
    );
    console.log(`Screenshot captured at: ${resp.data.data.url_viewer}`);
  } catch (e) {
    console.error(e.message);
  }
}

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
    await scrapeNHC(page);
  } catch (e) {
    console.error(e);
    reportError(page);
  }

  // SINGAPORE

  try {
    await scrapeMOH(page);
  } catch (e) {
    console.error(e);
    reportError(page);
  }

  // GLOBAL

  try {
    await scrapeBNO(page);
  } catch (e) {
    console.error(e);
    reportError(page);
  }

  await browser.close();
}

scrape().then(() => process.exit(0));
