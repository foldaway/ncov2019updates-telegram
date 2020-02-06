import Subscription from './models/subscription';
import { Telegram } from 'telegraf';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function broadcast(
  tg: Telegram,
  subs: Subscription[],
  message: string
): Promise<void> {
  for (const sub of subs) {
    await tg.sendMessage(sub.chatId, message, {
      parse_mode: 'Markdown',
    });
    await sleep(1000);
  }
}
