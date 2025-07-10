import { Page } from 'playwright';

export async function postComment(page: Page, threadUrl: string, commentText: string) {
  // Retry navigation up to 3 times if it fails
  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      success = true;
      break;
    } catch (e) {
      console.log(`Retry ${attempt} for thread navigation failed:`, e);
      if (attempt === 3) throw e;
      await page.waitForTimeout(2000 * attempt);
    }
  }
  if (!success) return;

  await page.waitForTimeout(5000);

  try {
    // If "Join" button is present and visible/enabled, click it
    const joinButtons = await page.$$('button:has-text("Join")');
    let joined = false;
    for (const btn of joinButtons) {
      if (await btn.isVisible() && await btn.isEnabled()) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForTimeout(1000);
        joined = true;
        break;
      }
    }
    if (!joined) {
      console.log('DEBUG: No visible/enabled Join button found or already a member.');
    }
    // If "Log in to comment" button is present, click it
    if (await page.$('button:has-text("Log in to comment")')) {
      await page.click('button:has-text("Log in to comment")');
      await page.waitForTimeout(2000);
    }
    // Try scrolling to the comment area
    const commentAnchor = await page.$('a[href*="#comment"]');
    if (commentAnchor) {
      await commentAnchor.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
    // Find all visible, enabled textareas for comments (try twice: before and after scroll)
    let commentBox = null;
    for (let pass = 0; pass < 2; pass++) {
      const textareas = await page.$$('textarea, div[contenteditable="true"]');
      for (const ta of textareas) {
        const visible = await ta.isVisible();
        const enabled = await ta.isEnabled();
        const box = await ta.boundingBox();
        const placeholder = (await ta.getAttribute('placeholder')) || '';
        if (visible && enabled && box && (placeholder.toLowerCase().includes('comment') || placeholder.toLowerCase().includes('conversation') || placeholder.toLowerCase().includes('reply') || placeholder === '')) {
          await ta.scrollIntoViewIfNeeded();
          commentBox = ta;
          break;
        }
      }
      if (commentBox) break;
      // Try scrolling to bottom and retry
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }
    if (!commentBox) {
      throw new Error('No visible, enabled comment box found after scrolling.');
    }
    await commentBox.click();
    await commentBox.fill(commentText);
    // Wait for the Comment button to be enabled
    await page.waitForSelector('button:has-text("Comment"):not([disabled])', { timeout: 10000 });
    await page.click('button:has-text("Comment")');
    await page.waitForTimeout(3000);
    // Check for rate limit or CAPTCHA
    if (await page.$('text=you are doing that too much') || await page.$('text=try again in')) {
      throw new Error('Rate limited by Reddit. Try again later.');
    }
    if (await page.$('iframe[src*="captcha"]') || await page.$('text=verify you are human')) {
      throw new Error('CAPTCHA detected. Manual intervention required.');
    }
    console.log(`💬 Commented on: ${threadUrl}`);
  } catch (e) {
    const html = await page.content();
    console.log(`❌ Could not comment on ${threadUrl}: ${e}`);
    console.log('DEBUG: Comment page HTML snippet:', html.slice(0, 1000));
  }
} 