import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import accounts from './data/accounts.json';
import { loginReddit, saveSession } from './utils/login';
import { searchThreads } from './utils/searchThreads';
import { postComment } from './utils/comment';
import { getProxy } from './utils/proxy';
import { getRandomComment } from './utils/random';
import { createRedditPost } from './utils/createPost';

const keywords = ['best finance app', 'best app to save money'];
const subreddits = ['personalfinance', 'IndiaInvestments'];
const postTitle = 'This app helped me save 15% of my income without stress';
const postBody = 'Pluto Money is a goal-based savings app that actually worked for me. Thought I’d share it here if anyone’s looking for a simple way to save.';

(async () => {
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const proxyConfig = getProxy(i);

    // Use your real Chrome profile for persistent context
    const userDataDir = path.resolve(process.env.HOME || process.env.USERPROFILE || '',
      'Library/Application Support/Google/Chrome/Default');
    let context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
    });
    const page = await context.newPage();

    try {
      console.log(`[${account.username}] Starting login...`);
      await loginReddit(page, account.username, account.password);
      console.log(`[${account.username}] Login step complete.`);

      for (const keyword of keywords) {
        console.log(`[${account.username}] Searching for threads with keyword: ${keyword}`);
        let threads: string[] = [];
        try {
          threads = await searchThreads(page, keyword);
          console.log(`[${account.username}] Threads found:`, threads);
        } catch (e) {
          console.log(`[${account.username}] Error searching threads for keyword '${keyword}':`, e);
          continue;
        }
        for (const thread of threads) {
          const comment = getRandomComment();
          console.log(`[${account.username}] Posting comment to thread: ${thread}`);
          try {
            await postComment(page, thread, comment);
            console.log(`[${account.username}] Comment posted to: ${thread}`);
          } catch (e) {
            console.log(`[${account.username}] Error posting comment to ${thread}:`, e);
          }
          await page.waitForTimeout(3000 + Math.random() * 2000);
        }
      }

      for (const subreddit of subreddits) {
        console.log(`[${account.username}] Creating post in subreddit: ${subreddit}`);
        try {
          await createRedditPost(page, subreddit, postTitle, postBody);
          console.log(`[${account.username}] Post created in subreddit: ${subreddit}`);
        } catch (e) {
          console.log(`[${account.username}] Error creating post in ${subreddit}:`, e);
        }
        await page.waitForTimeout(5000);
      }

    } catch (e) {
      console.log(`[${account.username}] Fatal error:`, e);
    }

    await context.close();
    await new Promise(r => setTimeout(r, 10000)); // cooldown between accounts
  }
})(); 