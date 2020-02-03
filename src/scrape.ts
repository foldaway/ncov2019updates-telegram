import puppeteer, { Page } from 'puppeteer';

// National Health Commission of the People's Republic of China
async function nhc(page: Page): Promise<Record<string, any>[]> {
  await page.goto('http://en.nhc.gov.cn/news.html');

  const list = await page.waitForSelector('.list > ul:nth-child(1)');

  return page.evaluate(list => {
    const newsItems = [].slice.call(list.querySelectorAll('li'));
    return newsItems.map((item: HTMLLIElement) => ({
      title: item?.querySelector('a')?.textContent,
      link: item?.querySelector('a')?.href,
      date: item?.querySelector('.list-date')?.textContent,
    }));
  }, list);
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

  await browser.close();
}

scrape().then(console.log);
