import { Page } from 'playwright';

export async function login(page: Page, username: string, password: string) {
  try {
    // First check if already logged in by going to Reddit home
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Check if already logged in by looking for user-specific elements
    const loggedInIndicators = [
      'button[aria-label*="User account menu"]',
      'button[id*="UserDropdown"]',
      'a[href*="/user/"]',
      'div[data-testid*="user-menu"]',
      'button:has-text("Create Post")',
      '[data-testid="header-profile-button"]'
    ];
    
    for (const indicator of loggedInIndicators) {
      if (await page.$(indicator)) {
        console.log(`✅ Already logged in (found: ${indicator})`);
        return;
      }
    }
    
    // If not logged in, try to navigate to login page
    await page.goto('https://www.reddit.com/login/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Check if redirected to home page (another sign of being logged in)
    const currentUrl = page.url();
    if (currentUrl.includes('reddit.com') && !currentUrl.includes('login')) {
      console.log('✅ Already logged in (redirected from login page)');
      return;
    }
    
    // Try to find and fill login form
    const usernameField = await page.$('input[name="username"], input[id="loginUsername"]');
    const passwordField = await page.$('input[name="password"], input[id="loginPassword"]');
    
    if (!usernameField || !passwordField) {
      // If no login form found, assume already logged in
      console.log('✅ Already logged in (no login form found)');
      return;
    }
    
    await usernameField.fill(username);
    await passwordField.fill(password);
    
    // Find and click login button
    const loginButton = await page.$('button:has-text("Log In"), button[type="submit"]');
    if (!loginButton) {
      throw new Error('Could not find login button');
    }
    
    await loginButton.click();
    
    // Wait for navigation or error
    await page.waitForTimeout(5000);
    
    // Check for successful login
    const finalUrl = page.url();
    if (finalUrl.includes('reddit.com') && !finalUrl.includes('login')) {
      console.log('✅ Login successful');
      return;
    }
    
    // Check for login errors
    const errorMessages = await page.$$('text=Incorrect username or password, text=Please try again');
    if (errorMessages.length > 0) {
      throw new Error('Login failed: Incorrect credentials');
    }
    
    console.log('✅ Login completed');
    
  } catch (error) {
    console.log(`❌ Login failed: ${error}`);
    throw error;
  }
} 