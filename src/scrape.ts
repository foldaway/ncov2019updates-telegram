import puppeteer, { Page } from 'puppeteer';
import { createHandyClient } from 'handy-redis';
import { sequelize, News, NewsSource } from './db';
import { FindOrCreateOptions } from 'sequelize/types';

const redisClient = createHandyClient({
  db: 2,
});

interface Article {
  title: string;
  link: string;
  date: string;
}

interface MOH {
  confirmedCases: number;
  dorscon: string;
  news: Article[];
}

interface BNOData {
  region: string;
  cases: number;
  deaths: number;
  notes: string;
}

// National Health Commission of the People's Republic of China
async function nhc(page: Page): Promise<Article[]> {
  await page.goto('http://en.nhc.gov.cn/news.html');

  const list = await page.waitForSelector('.section-list > .list > ul');

  return page.evaluate(list => {
    const newsItems = [].slice.call(list.querySelectorAll('li'));
    return newsItems.map((item: HTMLLIElement) => ({
      title: item?.querySelector('a')?.textContent || '',
      link: item?.querySelector('a')?.href || '',
      date: item?.querySelector('.list-date')?.textContent || '',
    }));
  }, list);
}

// Ministry of Health, Republic of Singapore
async function moh(page: Page): Promise<MOH> {
  await page.goto('https://www.moh.gov.sg/2019-ncov-wuhan');

  await page.waitForSelector('.sfContentBlock');

  const confirmedCasesElem = await page.$x(
    '//*[contains(text(), "Confirmed cases")]/ancestor::td/following-sibling::td'
  );

  const confirmedCases = parseInt(
    (await confirmedCasesElem?.[0]?.$eval('span', elem => elem.textContent)) ||
      '',
    10
  );

  const dorsconElem = await page.$x(
    '//*[contains(text(), "DORSCON Level")]/ancestor::td/following-sibling::td'
  );

  const dorscon =
    (await dorsconElem?.[0]?.$eval('span', elem => elem.textContent)) || '';

  const newsTable = (
    await page.$x(
      '//*[contains(text(), "Latest Updates")]/ancestor::h3/../div/table'
    )
  )?.[0];

  const news = await page.evaluate((table: HTMLTableElement) => {
    const data = [];
    const rows: HTMLTableRowElement[] = [].slice.call(
      table.querySelectorAll('tr'),
      1
    );

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      data.push({
        date: cells[0].textContent || '',
        title: cells[1].textContent || '',
        link: cells[1].querySelector('a')?.href || '',
      });
    }
    return data;
  }, newsTable);

  return { confirmedCases, dorscon, news };
}

async function bnoNews(page: Page): Promise<BNOData[]> {
  await page.goto(
    'https://bnonews.com/index.php/2020/02/the-latest-coronavirus-cases/'
  );

  return page.evaluate(() => {
    const tables: HTMLTableElement[] = [].slice.call(
      document.querySelectorAll('.wp-block-table')
    );

    const data: BNOData[] = [];

    for (const table of tables) {
      const rows: HTMLTableRowElement[] = [].slice.call(
        table.querySelectorAll('tr'),
        1
      );

      for (const row of rows) {
        const cells: HTMLTableCellElement[] = [].slice.call(
          row.querySelectorAll('td')
        );

        data.push({
          region: cells[0].textContent || '',
          cases: parseInt(cells[1].textContent?.replace(/,/g, '') || '', 10),
          deaths: parseInt(cells[2].textContent?.replace(/,/g, '') || '', 10),
          notes: cells[3].textContent || '',
        });
      }
    }

    return data.filter(d => d.region !== 'TOTAL');
  });
}

async function scrape() {
  console.log('Scraping');
  const browser = await puppeteer.launch({
    headless: process.env.NODE_ENV === 'production',
    defaultViewport: null,
  });
  const page = await browser.newPage();

  // Disable navigator.webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  const nhcData = await nhc(page);
  const [nhcSource] = await NewsSource.findOrCreate({
    where: {
      name: 'NHC',
    },
  });

  for (const article of nhcData) {
    await News.findOrCreate({
      where: {
        title: article.title,
        link: article.link,
        writtenAt: article.date,
        NewsSourceId: nhcSource.id,
      },
    });
  }
  console.log(nhcData);

  const mohData = await moh(page);
  const [mohSource] = await NewsSource.findOrCreate({
    where: {
      name: 'MOH',
    },
  });
  for (const article of mohData.news) {
    await News.findOrCreate({
      where: {
        title: article.title,
        link: article.link,
        writtenAt: article.date,
        NewsSourceId: mohSource.id,
      },
    });
  }

  await redisClient.set('MOH.DORSCON', mohData.dorscon);
  await redisClient.set(
    'MOH.CONFIRMED_CASES',
    mohData.confirmedCases.toString()
  );
  console.log(mohData);

  const bnoData = await bnoNews(page);

  // List of regions
  await redisClient.del('REGIONS');
  await redisClient.rpush('REGIONS', ...bnoData.map(data => data.region));

  for (const data of bnoData) {
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
