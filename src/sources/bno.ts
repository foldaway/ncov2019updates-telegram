import { Page } from 'puppeteer';
import { formatDiff } from '../util';

interface BNOData {
  region: string;
  cases: number;
  deaths: number;
  notes: string;
}

const patchTable: { [key: string]: string } = {
  'Hubei Province (includes Wuhan)': 'Hubei Province (including Wuhan)',
};

function patchRegion(region: string): string {
  return patchTable[region] || region;
}

async function scrape(
  page: Page,
  url: string,

  sourceColumnIndex = 6,
  deathColumnIndex = 2
): Promise<BNOData[]> {
  await page.goto(url);

  const iframe = await page.$('#mvp-content-main > iframe');
  if (!iframe) {
    throw new Error('Could not get iframe');
  }

  const frame = await iframe.contentFrame();

  if (!frame) {
    throw new Error('Could not get iframe content frame');
  }

  const data: BNOData[] = [];

  await frame?.waitForSelector('iframe', { timeout: 5000 });
  const switchContentIFrame = await frame?.$('iframe');
  const switchContentFrame = await switchContentIFrame?.contentFrame();

  const tables = await switchContentFrame?.$$('.waffle');

  if (!tables) {
    throw new Error('Could not get tables');
  }

  for (const table of tables) {
    const tbody = await table.$('tbody');
    const rows = await tbody?.$$('tr');

    if (!rows) {
      throw new Error('Could not get table rows');
    }

    for (const row of rows) {
      const cells = await row.$$eval('td', cells =>
        cells.map(cell => cell.textContent)
      );

      if (cells[sourceColumnIndex] !== 'Source') {
        continue;
      }

      data.push({
        region: patchRegion(cells[0] || ''),
        cases: parseInt(cells[1]?.replace(/,/g, '') || '', 10),
        deaths: parseInt(cells[deathColumnIndex]?.replace(/,/g, '') || '', 10),
        notes: `Serious: ${cells[3]}, Critical: ${cells[4]} Recovered: ${cells[5]}`,
      });
    }
  }

  return data.filter(d => d.region !== 'TOTAL');
}

export async function bnoNews(page: Page): Promise<BNOData[]> {
  const data: BNOData[] = [];
  data.push(
    ...(await scrape(
      page,
      'https://bnonews.com/index.php/2020/02/the-latest-coronavirus-cases/',
      8,
      3
    ))
  );

  data.push(
    ...(await scrape(
      page,
      'https://bnonews.com/index.php/2019/12/tracking-coronavirus-u-s-data/'
    ))
  );

  data.push(
    ...(await scrape(
      page,
      'https://bnonews.com/index.php/2019/12/tracking-coronavirus-china-data/'
    ))
  );

  data.push(
    ...(await scrape(
      page,
      'https://bnonews.com/index.php/2020/01/tracking-coronavirus-canada-data/'
    ))
  );

  data.push(
    ...(await scrape(
      page,
      'https://bnonews.com/index.php/2019/12/tracking-coronavirus-australia-data/'
    ))
  );

  return data;
}

export function formatChanges(oldData: BNOData, newData: BNOData): string {
  return `CASES: *${oldData.cases} → ${newData.cases}* (${formatDiff(
    oldData.cases,
    newData.cases
  )})
DEATHS: *${oldData.deaths} → ${newData.deaths}* (${formatDiff(
    oldData.deaths,
    newData.deaths
  )})
NOTES: *${newData.notes}*`;
}
