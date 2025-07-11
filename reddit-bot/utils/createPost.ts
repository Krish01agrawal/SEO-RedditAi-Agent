import { Page } from 'playwright';

export async function createRedditPost(page: Page, subreddit: string, title: string, body: string) {
  await page.goto(`https://www.reddit.com/r/${subreddit}/submit`);
  await page.waitForTimeout(3000);
  
  try {
    // Step 1: Dismiss any blocking dialogs/modals
    await dismissBlockingDialogs(page);
    
    // Step 2: Try JavaScript-based form filling (main approach)
    const jsSuccess = await tryPostWithJS(page, title, body);
    if (jsSuccess) {
      console.log(`📝 Posted in r/${subreddit}`);
      return;
    }
    
    // If JavaScript approach didn't work, throw an error
    throw new Error('Could not create post with JavaScript approach');
    
  } catch (e) {
    console.log(`❌ Post failed in r/${subreddit}:`, e);
  }
}

async function tryPostWithJS(page: Page, title: string, body: string): Promise<boolean> {
  try {
    const result = await page.evaluate(({ titleText, bodyText }) => {
      console.log('Starting JavaScript post creation...');
      
      // Find title input - the screenshot shows it's working
      const titleSelectors = [
        'textarea[name="title"]', 
        'input[placeholder*="title" i]', 
        'textarea[placeholder*="title" i]',
        'input[name="title"]',
        '[data-testid*="title"]',
        '.title-input',
        '[aria-label*="title" i]'
      ];
      let titleFilled = false;
      
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
      
      let bodyFilled = false;
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
      setTimeout(() => {
        const submitButtons = Array.from(document.querySelectorAll('button'));
        for (const btn of submitButtons) {
          const btnText = (btn.textContent || '').toLowerCase().trim();
          if (btnText === 'post' && !btn.disabled) {
            console.log(`Clicking Post button`);
            btn.click();
            return;
          }
        }
        console.log('No enabled Post button found');
      }, 2000);
      
      return true;
    }, { titleText: title, bodyText: body });
    
    if (result) {
      console.log('JavaScript post creation initiated');
      await page.waitForTimeout(6000); // Wait for submission
      return true;
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
    '[data-testid="post-content-textarea"]',
    'textarea[name="text"]',
    'div[contenteditable="true"]',
    'textarea:not([name="title"])'
  ];
  
  for (const selector of bodySelectors) {
    const bodyInput = await page.$(selector);
    if (bodyInput) {
      try {
        await bodyInput.scrollIntoViewIfNeeded();
        await bodyInput.click({ force: true });
        await bodyInput.fill(body);
        return;
      } catch (e) {
        // If body field fails, continue - it's optional
        console.log('DEBUG: Body field interaction failed, continuing...');
      }
    }
  }
  
  // If no body field found, it's optional for many subreddits
  console.log('DEBUG: No body field found, continuing without body text.');
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
    await page.waitForSelector('div[role="menuitem"], li[role="option"], .flair-option', { timeout: 10000 });
    
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
    return false;
  }
}

async function submitPost(page: Page, subreddit: string) {
  // Try JavaScript first
  const jsSubmitSuccess = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.textContent?.toLowerCase().includes('post') && !btn.disabled) {
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
    'button[type="submit"]:has-text("Post")',
    'input[type="submit"][value*="Post"]',
    'button[aria-label*="Post"]'
  ];
  
  let submitted = false;
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