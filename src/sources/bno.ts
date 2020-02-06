import { Page } from 'puppeteer';

interface BNOData {
  region: string;
  cases: number;
  deaths: number;
  notes: string;
}

export async function bnoNews(page: Page): Promise<BNOData[]> {
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
