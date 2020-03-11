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

export async function bnoNews(page: Page): Promise<BNOData[]> {
  await page.goto(
    'https://bnonews.com/index.php/2020/02/the-latest-coronavirus-cases/'
  );

  const iframe = await page.$('#mvp-content-main > iframe');
  if (!iframe) {
    throw new Error('Could not get iframe');
  }

  const frame = await iframe.contentFrame();

  if (!frame) {
    throw new Error('Could not get iframe content frame');
  }

  const switchItems = await frame.$$('.switcherContent td');
  const data: BNOData[] = [];

  if (!switchItems) {
    throw new Error('Could not get switch items');
  }
  let firstSwitchItem = true;

  for (const switchItem of switchItems) {
    await switchItem.click();
    if (!firstSwitchItem) {
      await frame.waitForNavigation();
    }
    firstSwitchItem = false;

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

        if (cells[6] !== 'Source') {
          continue;
        }

        data.push({
          region: patchRegion(cells[0] || ''),
          cases: parseInt(cells[1]?.replace(/,/g, '') || '', 10),
          deaths: parseInt(cells[2]?.replace(/,/g, '') || '', 10),
          notes: `Serious: ${cells[3]}, Critical: ${cells[4]} Recovered: ${cells[5]}`,
        });
      }
    }
  }

  return data.filter(d => d.region !== 'TOTAL');
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
