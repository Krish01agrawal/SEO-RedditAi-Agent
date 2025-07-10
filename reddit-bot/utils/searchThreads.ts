import { Page } from 'playwright';

export async function searchThreads(page: Page, keyword: string): Promise<string[]> {
  await page.goto(`https://www.reddit.com/search/?q=${encodeURIComponent(keyword)}`);
  // Wait for any post link to appear (Reddit may change data-testid or use article tags)
  try {
    await page.waitForSelector('a[data-click-id="body"], a[data-testid="post-title"], article a', { timeout: 15000 });
  } catch (e) {
    const html = await page.content();
    console.log('DEBUG: Search page HTML snippet:', html.slice(0, 1000));
    throw e;
  }

  // Try multiple selectors for post links
  let postLinks: string[] = [];
  postLinks = await page.$$eval('a[data-click-id="body"]', anchors => anchors.map(a => (a as HTMLAnchorElement).href).filter(Boolean));
  if (postLinks.length === 0) {
    postLinks = await page.$$eval('a[data-testid="post-title"]', anchors => anchors.map(a => (a as HTMLAnchorElement).href).filter(Boolean));
  }
  if (postLinks.length === 0) {
    postLinks = await page.$$eval('article a', anchors => anchors.map(a => (a as HTMLAnchorElement).href).filter(Boolean));
  }

  console.log(`🔍 Found ${postLinks.length} threads for keyword: "${keyword}"`);
  return postLinks.slice(0, 5); // return top 5
} 