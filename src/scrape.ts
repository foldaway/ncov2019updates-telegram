import puppeteer, { Page } from 'puppeteer';

// National Health Commission of the People's Republic of China
async function nhc(page: Page): Promise<Record<string, any>[]> {
  await page.goto('http://en.nhc.gov.cn/news.html');

  const list = await page.waitForSelector('.section-list > .list > ul');

  return page.evaluate(list => {
    const newsItems = [].slice.call(list.querySelectorAll('li'));
    return newsItems.map((item: HTMLLIElement) => ({
      title: item?.querySelector('a')?.textContent,
      link: item?.querySelector('a')?.href,
      date: item?.querySelector('.list-date')?.textContent,
    }));
  }, list);
}

// Ministry of Health, Republic of Singapore
async function moh(page: Page) {
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

  const dorscon = await dorsconElem?.[0]?.$eval(
    'span',
    elem => elem.textContent
  );

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
        date: cells[0].textContent,
        title: cells[1].textContent,
        link: cells[1].querySelector('a')?.href,
      });
    }
    return data;
  }, newsTable);

  return { confirmedCases, dorscon, news };
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
  console.log(nhcData);

  const mohData = await moh(page);
  console.log(mohData);

  await browser.close();
}

scrape().then(console.log);
