import { Page } from 'playwright';

export async function createRedditPost(page: Page, subreddit: string, title: string, body: string) {
  await page.goto(`https://www.reddit.com/r/${subreddit}/submit`);
  // Wait for title input or textarea to appear
  try {
    await page.waitForSelector('textarea[name="title"], input[placeholder="Title"], textarea[placeholder="Title"]', { timeout: 20000 });
  } catch (e) {
    const html = await page.content();
    console.log('DEBUG: Post page HTML snippet:', html.slice(0, 1000));
    throw e;
  }

  // Try multiple selectors for title
  let titleFilled = false;
  if (await page.$('textarea[name="title"]')) {
    await page.fill('textarea[name="title"]', title);
    titleFilled = true;
  } else if (await page.$('input[placeholder="Title"]')) {
    await page.fill('input[placeholder="Title"]', title);
    titleFilled = true;
  } else if (await page.$('textarea[placeholder="Title"]')) {
    await page.fill('textarea[placeholder="Title"]', title);
    titleFilled = true;
  }

  if (!titleFilled) {
    throw new Error('Could not find title input for post creation.');
  }

  // Try to fill the body (optional, may not always be present)
  if (await page.$('[data-testid="post-content-textarea"]')) {
    await page.fill('[data-testid="post-content-textarea"]', body);
  } else if (await page.$('textarea')) {
    // fallback: fill the first textarea (not the title)
    const textareas = await page.$$('textarea');
    if (textareas.length > 1) {
      await textareas[1].fill(body);
    }
  }

  // Handle subreddit rules or flair if present
  if (await page.$('button:has-text("I Agree")')) {
    await page.click('button:has-text("I Agree")');
    await page.waitForTimeout(1000);
  }
  if (await page.$('button:has-text("Got it")')) {
    await page.click('button:has-text("Got it")');
    await page.waitForTimeout(1000);
  }
  if (await page.$('button:has-text("Add flair")')) {
    await page.click('button:has-text("Add flair")');
    await page.waitForTimeout(1000);
    // Try to select a valid, enabled flair option
    const flairOptions = await page.$$('div[role="menuitem"]');
    let flairSelected = false;
    for (const flair of flairOptions) {
      const enabled = await flair.isEnabled();
      if (enabled) {
        await flair.click();
        flairSelected = true;
        await page.waitForTimeout(500);
        break;
      }
    }
    if (flairSelected && await page.$('button:has-text("Apply"):not([disabled])')) {
      await page.click('button:has-text("Apply")');
      await page.waitForTimeout(500);
    } else {
      console.log('DEBUG: No enabled flair could be selected or Apply button was disabled. Skipping post.');
      return;
    }
  }

  // Wait for the Post button to be enabled
  try {
    await page.waitForSelector('button:has-text("Post"):not([disabled])', { timeout: 20000 });
    await page.click('button:has-text("Post")');
    console.log(`📝 Posted in r/${subreddit}`);
  } catch (e) {
    const html = await page.content();
    console.log(`❌ Post failed in r/${subreddit}:`, e);
    console.log('DEBUG: Post page HTML snippet:', html.slice(0, 1000));
  }
} 