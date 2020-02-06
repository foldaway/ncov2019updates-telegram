import { Page } from 'puppeteer';
import { Article } from './data-model';

// National Health Commission of the People's Republic of China
export async function nhc(page: Page): Promise<Article[]> {
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
