import { Page } from 'playwright';

export async function postComment(page: Page, threadUrl: string, commentText: string) {
  // Retry navigation up to 3 times if it fails
  let success = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Navigating to thread (attempt ${attempt}): ${threadUrl}`);
      
      // Clear any existing navigation state
      await page.evaluate(() => {
        window.stop();
      });
      
      // Prefer old.reddit.com to avoid Reddit's new UI bot protection
      const oldUrl = threadUrl.replace('https://www.reddit.com', 'https://old.reddit.com')
                               .replace('https://reddit.com', 'https://old.reddit.com');

      // Navigate to the (old) thread first
      await page.goto(oldUrl, { 
        waitUntil: 'networkidle', 
        timeout: 60000 
      });

      // If the navigation ended on a block page, retry the modern URL once
      const blocked = await page.$('text="blocked by network security"');
      if (blocked) {
        console.log('🔒 Block page detected on old.reddit.com. Trying modern URL...');
        await page.goto(threadUrl, { waitUntil: 'networkidle', timeout: 60000 });
      }
      
      // Wait longer for page to fully load and settle
      await page.waitForTimeout(5000);
      
      // Check if we're actually on the thread page
      const currentUrl = page.url();
      console.log(`Current URL after navigation: ${currentUrl}`);
      
      if (currentUrl.includes('/search/') || currentUrl.includes('?q=')) {
        console.log(`❌ Redirected to search page, trying direct navigation...`);
        
        // Try clicking on the thread link instead of direct navigation
        await page.goto('https://www.reddit.com/search/?q=best%20finance%20app');
        await page.waitForTimeout(3000);
        
        // Find and click the specific thread link
        const clickSuccess = await page.evaluate((targetUrl) => {
          const links = Array.from(document.querySelectorAll('a[href*="/comments/"]'));
          for (const link of links) {
            const anchor = link as HTMLAnchorElement;
            if (anchor.href.includes(targetUrl.split('/comments/')[1]?.split('/')[0] || '')) {
              console.log(`Found and clicking thread link: ${anchor.href}`);
              anchor.click();
              return true;
            }
          }
          return false;
        }, threadUrl);
        
        if (clickSuccess) {
          await page.waitForTimeout(5000);
          const newUrl = page.url();
          console.log(`URL after clicking link: ${newUrl}`);
        }
      }
      
      // Final verification
      const finalUrl = page.url();
      if (finalUrl.includes('/comments/') && !finalUrl.includes('/search/')) {
        console.log(`✅ Successfully on thread page: ${finalUrl}`);
        success = true;
        break;
      } else {
        throw new Error(`Still not on thread page. Final URL: ${finalUrl}`);
      }
      
    } catch (e) {
      console.log(`Attempt ${attempt} failed:`, e);
      if (attempt === 3) {
        console.log(`❌ Failed to navigate to thread after 3 attempts`);
        return;
      }
      await page.waitForTimeout(3000 * attempt);
    }
  }
  
  if (!success) return;

  try {
    // Step 1: Dismiss any blocking dialogs/modals
    await dismissBlockingDialogs(page);
    
    // Step 2: Handle Join button if needed
    await handleJoinButton(page);
    
    // Step 3: Handle "Log in to comment" if present
    const loginButton = await page.$('button:has-text("Log in to comment")');
    if (loginButton) {
      await loginButton.click();
      await page.waitForTimeout(2000);
    }
    
    // Step 4: Try JavaScript-based commenting (main approach)
    const commentSuccess = await tryCommentWithJS(page, commentText);
    if (commentSuccess) {
      console.log(`💬 Commented on: ${threadUrl}`);
      return;
    }
    
    // If JavaScript approach didn't work, throw an error
    throw new Error('Could not find or interact with comment box');
    
  } catch (e) {
    console.log(`❌ Could not comment on ${threadUrl}: ${e}`);
  }
}

async function tryCommentWithJS(page: Page, commentText: string): Promise<boolean> {
  try {
    console.log('Starting comment interaction on thread page...');
    
    // First, verify we're on a thread page
    const pageVerification = await page.evaluate(() => {
      const url = window.location.href;
      const hasComments = url.includes('/comments/');
      const pageTitle = document.title;
      
      return {
        isThreadPage: hasComments,
        url: url,
        title: pageTitle
      };
    });
    
    console.log(`Page verification - Thread page: ${pageVerification.isThreadPage}, URL: ${pageVerification.url}`);
    
    if (!pageVerification.isThreadPage) {
      console.log('❌ Not on a thread page - cannot comment');
      return false;
    }
    
    // Step 0: Try a straightforward Playwright locator flow first
    try {
      // Scroll near the bottom to bring comment UI into view
      await page.keyboard.press('End');
      await page.waitForTimeout(1000);

      // Look for the visible "Join the conversation" element and click it if present
      const joinLocator = page.locator('text="Join the conversation"');
      if (await joinLocator.count()) {
        await joinLocator.first().scrollIntoViewIfNeeded();
        await joinLocator.first().click({ timeout: 5000 });
      }

      // Now wait for an editable comment box to appear
      const boxLocator = page.locator('[data-testid="comment-textarea"], textarea, div[contenteditable="true"], div[role="textbox"][contenteditable="true"]').first();
      await boxLocator.waitFor({ state: 'visible', timeout: 5000 });

      // Focus the box and type the comment text
      await boxLocator.scrollIntoViewIfNeeded();
      await boxLocator.click({ force: true });
      await boxLocator.type(commentText, { delay: 40 });

      // Look for an enabled Comment submit button and click it
      const submitBtn = page.locator('button:has-text("Comment" i):not([disabled]), button:has-text("save" i):not([disabled]), input[type="submit"][value="save" i]').first();
      if (await submitBtn.count()) {
        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click();
        await page.waitForTimeout(3000);
        console.log('✅ Comment submitted using locator flow');
        return true;
      }
    } catch (e) {
      console.log('Locator flow did not succeed, falling back to JS evaluation...');
    }
    
    // Step 1: Look for the comment input area on the thread page
    const clickResult = await page.evaluate(() => {
      console.log('Looking for comment input area on thread page...');
      
      // Look for the "Join the conversation" area specifically
      const allElements = Array.from(document.querySelectorAll('*'));
      
      for (const el of allElements) {
        const element = el as HTMLElement;
        const text = (element.textContent || '').toLowerCase().trim();
        const rect = element.getBoundingClientRect();
        
        // Look for "Join the conversation" text with reasonable size
        if (text === 'join the conversation' && rect.width > 200 && rect.height > 30) {
          console.log(`Found "Join the conversation" area: ${element.tagName}`);
          element.click();
          element.focus();
          
          // Also click parent elements to ensure activation
          let parent = element.parentElement;
          while (parent && parent.tagName !== 'BODY') {
            parent.click();
            parent = parent.parentElement;
          }
          
          return true;
        }
      }
      
      // Alternative: Look for large clickable areas that might be comment boxes
      const potentialCommentAreas = Array.from(document.querySelectorAll('div, textarea, [contenteditable], [role="textbox"]'));
      
      for (const el of potentialCommentAreas) {
        const element = el as HTMLElement;
        const rect = element.getBoundingClientRect();
        const text = (element.textContent || '').toLowerCase();
        
        // Look for large areas that might be comment input
        if (rect.width > 400 && rect.height > 40 && rect.height < 200) {
          // Check if it's likely a comment area
          if (text.includes('comment') || text.includes('conversation') || 
              element.getAttribute('placeholder')?.toLowerCase().includes('comment')) {
            console.log(`Found potential comment area: ${element.tagName} - size: ${rect.width}x${rect.height}`);
            element.click();
            element.focus();
            return true;
          }
        }
      }
      
      console.log('❌ No comment input area found on thread page');
      return false;
    });
    
    if (!clickResult) {
      console.log('❌ Could not find comment input area');
      return false;
    }
    
    // Step 2: Wait for the comment box to become active
    await page.waitForTimeout(3000);
    
    // Step 3: Find and fill the comment box
    const fillResult = await page.evaluate((text) => {
      console.log('Looking for active comment input...');
      
      // Look for textareas that appeared after clicking
      const textareas = Array.from(document.querySelectorAll('textarea'));
      console.log(`Found ${textareas.length} textareas`);
      
      for (const textarea of textareas) {
        const element = textarea as HTMLTextAreaElement;
        const rect = element.getBoundingClientRect();
        const placeholder = element.placeholder || '';
        
        console.log(`Textarea - size: ${rect.width}x${rect.height}, placeholder: "${placeholder}"`);
        
        // Try textareas that have reasonable size and might be for comments
        if (rect.width > 200 && rect.height > 30) {
          console.log('Attempting to fill textarea...');
          
          // Ensure it's visible and focusable
          element.style.display = 'block';
          element.style.visibility = 'visible';
          element.style.opacity = '1';
          
          // Focus and fill
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
          element.click();
          
          // Clear and set value
          element.value = '';
          element.value = text;
          
          // Trigger events
          element.dispatchEvent(new Event('focus', { bubbles: true }));
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log(`✅ Filled textarea with: "${element.value}"`);
          return true;
        }
      }
      
      // Try contenteditable divs
      const editableDivs = Array.from(document.querySelectorAll('div[contenteditable="true"], [contenteditable="true"]'));
      console.log(`Found ${editableDivs.length} contenteditable elements`);
      
      for (const div of editableDivs) {
        const element = div as HTMLElement;
        const rect = element.getBoundingClientRect();
        
        if (rect.width > 200 && rect.height > 30) {
          console.log('Attempting to fill contenteditable...');
          
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
          element.click();
          
          element.innerHTML = '';
          element.textContent = text;
          
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log(`✅ Filled contenteditable with: "${element.textContent}"`);
          return true;
        }
      }
      
      console.log('❌ No suitable input element found');
      return false;
    }, commentText);
    
    if (!fillResult) {
      console.log('❌ Failed to fill comment text');
      return false;
    }
    
    // Step 4: Wait and then submit
    await page.waitForTimeout(2000);
    
    // Step 5: Find and click the Comment button
    const submitResult = await page.evaluate(() => {
      console.log('Looking for Comment button...');
      
      const buttons = Array.from(document.querySelectorAll('button'));
      console.log(`Found ${buttons.length} buttons`);
      
      for (const btn of buttons) {
        const btnText = (btn.textContent || '').toLowerCase().trim();
        const isDisabled = btn.disabled;
        const rect = btn.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        console.log(`Button: "${btnText}" - disabled: ${isDisabled}, visible: ${isVisible}`);
        
        if ((btnText === 'comment' || btnText === 'save') && !isDisabled && isVisible) {
          console.log('✅ Found and clicking Comment button');
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          btn.click();
          return true;
        }
      }
      
      console.log('❌ No enabled Comment button found');
      return false;
    });
    
    if (submitResult) {
      console.log('✅ Comment submitted successfully');
      await page.waitForTimeout(3000);
      return true;
    } else {
      console.log('❌ Failed to submit comment');
      return false;
    }
    
  } catch (e) {
    console.log('❌ Comment interaction failed:', e);
    return false;
  }
}

async function dismissBlockingDialogs(page: Page) {
  // Use JavaScript to dismiss dialogs that might be blocking
  await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[class*="rpl-dialog"], [id*="community-guide"], [role="dialog"], .modal'));
    for (const dialog of dialogs) {
      const closeButtons = Array.from(dialog.querySelectorAll('button[aria-label="Close"], button:has-text("Close"), button:has-text("Continue"), button:has-text("Got it")'));
      for (const btn of closeButtons) {
        (btn as HTMLElement).click();
      }
    }
  });
  
  // Also try keyboard escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
}

async function handleJoinButton(page: Page) {
  const joinButtons = await page.$$('button:has-text("Join")');
  for (const btn of joinButtons) {
    if (await btn.isVisible() && await btn.isEnabled()) {
      try {
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ force: true });
        await page.waitForTimeout(1000);
        break;
      } catch (e) {
        console.log('DEBUG: Join button click failed, continuing...');
      }
    }
  }
}

async function findCommentBox(page: Page) {
  // Strategy 1: Try standard selectors
  const selectors = [
    'textarea[placeholder*="comment" i]',
    'textarea[placeholder*="conversation" i]',
    'div[contenteditable="true"][data-testid*="comment"]',
    'div[contenteditable="true"]',
    'textarea',
    '[data-testid="commentTextarea"]',
    'textarea[name="comment"]'
  ];
  
  for (const selector of selectors) {
    const elements = await page.$$(selector);
    for (const el of elements) {
      const placeholder = (await el.getAttribute('placeholder') || '').toLowerCase();
      const box = await el.boundingBox();
      
      if (box && box.width > 100 && box.height > 20) {
        return el;
      }
    }
  }
  
  return null;
}

async function submitComment(page: Page) {
  // Try JavaScript first to click submit button
  const jsSubmitSuccess = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.textContent?.toLowerCase().includes('comment') && !btn.disabled) {
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
  const commentButtonSelectors = [
    'button:has-text("Comment"):not([disabled])',
    'button:has-text("save" i):not([disabled])',
    'input[type="submit"][value="save" i]',
    'button[type="submit"]:has-text("Comment")',
    'button[aria-label*="Comment"]',
    'input[type="submit"][value*="Comment"]'
  ];
  
  let submitted = false;
  for (const selector of commentButtonSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector, { force: true });
      submitted = true;
      break;
    } catch (e) {
      continue;
    }
  }
  
  if (!submitted) {
    // Try pressing Enter as fallback
    await page.keyboard.press('Enter');
  }
  
  await page.waitForTimeout(3000);
  
  // Check for rate limit or CAPTCHA
  if (await page.$('text=you are doing that too much') || await page.$('text=try again in')) {
    throw new Error('Rate limited by Reddit. Try again later.');
  }
  if (await page.$('iframe[src*="captcha"]') || await page.$('text=verify you are human')) {
    throw new Error('CAPTCHA detected. Manual intervention required.');
  }
} 