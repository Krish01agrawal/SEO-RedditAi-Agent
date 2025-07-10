import { Page, BrowserContext } from 'playwright';
import fs from 'fs';

export async function loginReddit(page: Page, username: string, password: string) {
  // Go to login page, but if redirected to home, assume already logged in
  await page.goto('https://www.reddit.com/login', { waitUntil: 'domcontentloaded', timeout: 120000 });

  // If we are not on the login page, assume already logged in
  const url = page.url();
  if (!url.includes('/login')) {
    console.log('✅ Already logged in (redirected to home or other page)');
    return;
  }

  // Try to wait for login form, but if it doesn't appear, check again if we're still on /login
  try {
    await page.waitForSelector('input#loginUsername', { timeout: 60000 });
  } catch {
    // If still on /login, it's a real error (CAPTCHA/Cloudflare)
    if (page.url().includes('/login')) {
      throw new Error('Login form did not appear – possible CAPTCHA / Cloudflare challenge.');
    } else {
      // If redirected away, assume logged in
      console.log('✅ Already logged in (redirected after failed login form wait)');
      return;
    }
  }

  await page.fill('input#loginUsername', username);
  await page.fill('input#loginPassword', password);

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle' }),
  ]);

  if (await page.$('text=Incorrect username or password')) {
    throw new Error(`Login failed – bad credentials for ${username}`);
  }

  console.log(`✅ Logged in as ${username}`);
}

export async function loadSession(context: BrowserContext, username: string) {
  const path = `./data/${username}-session.json`;
  if (fs.existsSync(path)) {
    const storage = JSON.parse(fs.readFileSync(path, 'utf-8'));
    await context.addCookies(storage.cookies);
  }
}

export async function saveSession(context: BrowserContext, username: string) {
  const state = await context.storageState();
  fs.writeFileSync(`./data/${username}-session.json`, JSON.stringify(state));
} 