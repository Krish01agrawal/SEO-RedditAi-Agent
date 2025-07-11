import { Page } from 'playwright';

export async function createRedditPost(page: Page, subreddit: string, title: string, body: string) {
  // Use old.reddit & force self-post composer to avoid mandatory URL
  await page.goto(`https://old.reddit.com/r/${subreddit}/submit?selftext=true`, {
    waitUntil: 'domcontentloaded'
  });
  // If the "choose where to post" radio list is present, pick "Your profile"
  try {
    const profileRadio = page.locator('text="Your profile" >> xpath=.. >> input[type="radio"]');
    if (await profileRadio.count()) {
      await profileRadio.first().check();
    }
  } catch {}
  await page.waitForTimeout(3000);
  
  try {
    // Step 1: Dismiss any blocking dialogs/modals
    await dismissBlockingDialogs(page);
    // Some communities open an interstitial rules popup – handle it early
    await handleSubredditRules(page);
    
    // Step 2: Try JavaScript-based form filling (main approach)
    const jsSuccess = await tryPostWithJS(page, title, body);
    if (jsSuccess) {
      console.log(`📝 Posted in r/${subreddit}`);
      return;
    }

    // Fallback: use Playwright locators step-by-step
    await fillTitle(page, title);
    await fillBody(page, body);
    await handleFlair(page);
    await submitPost(page, subreddit);
    console.log(`📝 Posted in r/${subreddit} (fallback flow)`);
    return;
    
  } catch (e) {
    console.log(`❌ Post failed in r/${subreddit}:`, e);
  }
}

async function tryPostWithJS(page: Page, title: string, body: string): Promise<boolean> {
  try {
    const result = await page.evaluate(({ titleText, bodyText }) => {
      console.log('Starting JavaScript post creation...');
      
      // Find title input - the screenshot shows it's working
      let titleFilled = false;
      let bodyFilled = false;
      const titleSelectors = [
        'textarea[name="title"]', 
        'input[placeholder*="title" i]', 
        'textarea[placeholder*="title" i]',
        'input[name="title"]',
        '[data-testid*="title"]',
        '.title-input',
        '[aria-label*="title" i]'
      ];
      
      for (const selector of titleSelectors) {
        const titleEl = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
        if (titleEl) {
          console.log(`Found title field: ${selector}`);
          titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          titleEl.focus();
          titleEl.click();
          titleEl.value = titleText;
          titleEl.dispatchEvent(new Event('input', { bubbles: true }));
          titleEl.dispatchEvent(new Event('change', { bubbles: true }));
          titleEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          titleFilled = true;
          break;
        }
      }
      
      if (!titleFilled) {
        console.log('No title field found');
        return false;
      }
      
      // Find body input - look for the rich text editor shown in screenshot
      // Also try to find a URL input (link posts on old.reddit)
      const urlInput = document.querySelector('input[name="url"]') as HTMLInputElement | null;
      if (urlInput) {
        urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        urlInput.focus();
        urlInput.value = 'https://plutomoney.in/';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        urlInput.dispatchEvent(new Event('change', { bubbles: true }));
        bodyFilled = true; // treat URL as body for flow purposes
      }

      const bodySelectors = [
        'div[contenteditable="true"]', // Rich text editor in screenshot
        '[data-testid="post-content-textarea"]', 
        'textarea[name="text"]', 
        'textarea:not([name="title"])',
        '.post-body-textarea',
        '.post-content',
        '[aria-label*="body" i]',
        '[aria-label*="content" i]',
        'textarea[placeholder*="text" i]',
        'div[data-testid*="text-input"]',
        // Rich text editor specific selectors
        'div[class*="DraftEditor"]',
        'div[class*="public-DraftEditor"]'
      ];
      
      for (const selector of bodySelectors) {
        const bodyEl = document.querySelector(selector) as HTMLElement;
        if (bodyEl && bodyEl.getBoundingClientRect().height > 30) { // Must be reasonably sized
          console.log(`Found body field: ${selector}`);
          bodyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          bodyEl.focus();
          bodyEl.click();
          
          // Wait for any dynamic loading
          setTimeout(() => {
            if (bodyEl.tagName === 'TEXTAREA') {
              const textarea = bodyEl as HTMLTextAreaElement;
              textarea.value = bodyText;
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.dispatchEvent(new Event('change', { bubbles: true }));
              textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            } else if (bodyEl.contentEditable === 'true') {
              // For rich text editors
              bodyEl.innerHTML = '';
              bodyEl.textContent = bodyText;
              bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
              bodyEl.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Also try setting innerHTML for rich text
              if (bodyEl.innerHTML === '') {
                bodyEl.innerHTML = `<p>${bodyText}</p>`;
                bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            bodyFilled = true;
            console.log(`Filled body with: "${bodyText}"`);
          }, 300);
          break;
        }
      }
      
      if (!bodyFilled) {
        console.log('No suitable body field found, continuing without body...');
      }
      
      // Skip flair for now since it's causing issues - the screenshot shows "Add flair and tags" button
      // which suggests it's optional
      
      // Try to submit the post after a reasonable delay
      let clicked = false;
      setTimeout(() => {
        const submitButtons = Array.from(document.querySelectorAll('button'));
        for (const btn of submitButtons) {
          const btnText = (btn.textContent || '').toLowerCase().trim();
          if ((btnText === 'post' || btnText === 'submit' || btnText === 'save') && !btn.disabled) {
            console.log(`Clicking submit button: ${btnText}`);
            (btn as HTMLElement).click();
            clicked = true;
            break;
          }
        }
        if (!clicked) {
          console.log('No enabled Post/Submit button found');
        }
      }, 2000);

      return true; // indicate we attempted to click
    }, { titleText: title, bodyText: body });
    
    if (result) {
      console.log('JavaScript submit button clicked, waiting for navigation');
      try {
        await page.waitForURL(url => /\/comments\//.test(url.href), { timeout: 10000 });
        return true; // Landed on the new post URL
      } catch {
        console.log('Navigation to the new post did not happen in time – will fall back.');
        return false;
      }
    }
    return false;
  } catch (e) {
    console.log('JavaScript post creation failed:', e);
    return false;
  }
}

async function dismissBlockingDialogs(page: Page) {
  await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[class*="rpl-dialog"], [id*="community-guide"], [role="dialog"], .modal'));
    for (const dialog of dialogs) {
      const closeButtons = Array.from(dialog.querySelectorAll('button[aria-label="Close"], button:has-text("Close"), button:has-text("Continue"), button:has-text("Got it")'));
      for (const btn of closeButtons) {
        (btn as HTMLElement).click();
      }
    }
  });
  
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
}

async function fillTitle(page: Page, title: string) {
  const titleSelectors = [
    'textarea[name="title"]',
    'input[placeholder*="Title" i]',
    'textarea[placeholder*="Title" i]',
    'input[name="title"]',
    '[data-testid*="title"]'
  ];
  
  for (const selector of titleSelectors) {
    const titleInput = await page.$(selector);
    if (titleInput) {
      await titleInput.scrollIntoViewIfNeeded();
      await titleInput.click({ force: true });
      await titleInput.fill(title);
      return;
    }
  }
  
  throw new Error('Could not find title input for post creation.');
}

async function fillBody(page: Page, body: string) {
  const bodySelectors = [
    'textarea[name="text"]',               // old.reddit textarea
    'textarea#text',                        // id variant
    '[data-testid="post-content-textarea"]',
    'div[role="textbox"][contenteditable="true"]',
    'div.public-DraftEditor-content[contenteditable="true"]',
    'div[role="textbox"]',
    'div[aria-label="Body text" i]',
    'div[contenteditable="true"]',
    'textarea:not([name="title"])'
  ];
  
  for (const selector of bodySelectors) {
    const bodyInput = await page.$(selector);
    if (bodyInput) {
      try {
        await bodyInput.scrollIntoViewIfNeeded();
        await bodyInput.click({ force: true });
        if (await bodyInput.getAttribute('contenteditable') === 'true') {
          await bodyInput.type(body, { delay: 30 });
        } else {
          await bodyInput.fill(body);
        }
        return;
      } catch (e) {
        // If body field fails, continue - it's optional
        console.log('DEBUG: Body field interaction failed, continuing...');
      }
    }
  }
  
  // If no body field found, it's optional for many subreddits
  console.log('DEBUG: No body field found via selectors, trying keyboard navigation...');
  try {
    await page.keyboard.press('Tab'); // move focus from title to body
    await page.keyboard.type(body, { delay: 30 });
    console.log('Typed body via keyboard navigation');
    return;
  } catch {
    console.log('DEBUG: Keyboard body fill failed, continuing without body text.');
  }
}

async function handleSubredditRules(page: Page) {
  const ruleButtons = [
    'button:has-text("I Agree")',
    'button:has-text("Got it")',
    'button:has-text("Accept")',
    'button:has-text("Continue")',
    'input[type="checkbox"]'
  ];
  
  for (const selector of ruleButtons) {
    const button = await page.$(selector);
    if (button && await button.isVisible()) {
      await button.click({ force: true });
      await page.waitForTimeout(1000);
    }
  }
}

async function handleFlair(page: Page) {
  // Check if flair is required
  const flairButton = await page.$('button:has-text("Add flair"), button[aria-label*="flair" i]');
  if (!flairButton) {
    return true; // No flair required
  }
  
  try {
    await flairButton.click({ force: true });
    await page.waitForTimeout(2000);
    
    // Wait for flair options to load
    const flairOptionLocator = page.locator('div[role="menuitem"], li[role="option"], .flair-option');
    await flairOptionLocator.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
 
    // Try to select any available flair
    const flairSelectors = [
      'div[role="menuitem"]:not([aria-disabled="true"])',
      'li[role="option"]:not([aria-disabled="true"])',
      '.flair-option:not(.disabled)',
      'button[data-flair-text]'
    ];
    
    let flairSelected = false;
    for (const selector of flairSelectors) {
      const flairOptions = await page.$$(selector);
      for (const option of flairOptions) {
        if (await option.isVisible() && await option.isEnabled()) {
          await option.click({ force: true });
          flairSelected = true;
          break;
        }
      }
      if (flairSelected) break;
    }
    
    if (flairSelected) {
      // Apply the flair
      const applyButton = await page.$('button:has-text("Apply"):not([disabled]), button:has-text("Save"):not([disabled])');
      if (applyButton) {
        await applyButton.click({ force: true });
        await page.waitForTimeout(1000);
      }
      return true;
    }
    
    return false; // Could not select flair
  } catch (e) {
    console.log('DEBUG: Flair selection failed:', e);
    // Close the flair dialog if it's open and continue without flair
    await page.keyboard.press('Escape').catch(() => {});
    return true;
  }
}

async function submitPost(page: Page, subreddit: string) {
  // Try JavaScript first
  const jsSubmitSuccess = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (!btn.disabled && /(post|submit|save)/i.test(btn.textContent || '')) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  
  if (jsSubmitSuccess) {
    await page.waitForTimeout(3000);
    return;
  }
  
  // Fallback to Playwright methods
  const postButtonSelectors = [
    'button:has-text("Post"):not([disabled])',
    'button:has-text("Submit" i):not([disabled])',
    'button[type="submit"]:has-text("Post")',
    'button[type="submit"]:has-text("Submit" i)',
    'input[type="submit"][value*="Post" i]',
    'input[type="submit"][value*="Submit" i]',
    'button[aria-label*="Post"]',
    'button:has-text("save" i):not([disabled])',
    'input[type="submit"][value="save" i]'
  ];
  
  let submitted = false;
  // If no button found yet, maybe reCAPTCHA needs ticking – try that once
  if (!submitted) {
    try {
      const recaptchaFrame = await page.frameLocator('iframe[src*="recaptcha"], iframe[title*="recaptcha" i]').first();
      await recaptchaFrame.locator('#recaptcha-anchor').click({ timeout: 5000, force: true });
      await page.waitForTimeout(3000); // give captcha time
    } catch {}
  }

  // Retry finding the button after captcha tick
  for (const selector of postButtonSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      const button = await page.$(selector);
      if (button && await button.isEnabled()) {
        await button.click({ force: true });
        submitted = true;
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!submitted) {
    throw new Error('Could not find enabled Post button');
  }
  
  await page.waitForTimeout(3000);
} 