import { Page } from 'puppeteer';
import { Article } from './data-model';

interface MOH {
  confirmedCases: number;
  dorscon: string;
  news: Article[];
}

// Ministry of Health, Republic of Singapore
export async function moh(page: Page): Promise<MOH> {
  await page.goto('https://www.moh.gov.sg/covid-19');

  await page.waitForSelector('.sfContentBlock');

  const activeCasesElem = await page.$x(
    '//*[contains(text(), "Active Cases#")]/ancestor::td/ancestor::tr/following-sibling::tr/td/font/span'
  );

  const activeCases = parseInt(
    (await activeCasesElem?.[0]?.$eval('span', elem => elem.textContent)) || '',
    10
  );

  const dischargedCasesElem = await page.$x(
    '//*[contains(text(), "Discharged")]/ancestor::td/ancestor::tr/following-sibling::tr/td/font/span'
  );

  const dischargedCases = parseInt(
    (await dischargedCasesElem?.[0]?.$eval('span', elem => elem.textContent)) ||
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

  return { confirmedCases: activeCases + dischargedCases, dorscon, news };
}
