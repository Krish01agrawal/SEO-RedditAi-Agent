# Reddit Automation Bot

A TypeScript-based Reddit automation bot built with Playwright for product SEO increase through strategic commenting.

## Features

- 🔐 Multi-account Reddit login with session management
- 🔍 Keyword-based thread search
- 💬 Automated commenting on relevant threads
- 🛡️ Anti-spam measures with random delays
- 📊 Session persistence for faster subsequent runs

## Project Structure

```
reddit-bot/
│
├── data/
│   └── accounts.json            # Reddit login credentials
│
├── utils/
│   ├── login.ts                 # Login and save session
│   ├── searchThreads.ts         # Search Reddit posts by keyword
│   ├── comment.ts               # Post a comment on a thread
│   └── createPost.ts            # (Optional) Create new Reddit post
│
├── main.ts                      # Entry point (orchestrator)
├── package.json
├── playwright.config.ts
└── README.md
```

## Setup

### 1. Install Dependencies

```bash
cd reddit-bot
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install
```

### 3. Configure Accounts

Edit `data/accounts.json` with your Reddit credentials:

```json
[
  {
    "username": "yourusername1",
    "password": "yourpassword1"
  },
  {
    "username": "yourusername2",
    "password": "yourpassword2"
  }
]
```

### 4. Customize Keywords and Comments

Edit `main.ts` to modify:
- `keywords` array: Search terms to find relevant threads
- `promotionalComment`: Your promotional message

## Usage

### Run the Bot

```bash
npm start
```

Or directly with ts-node:

```bash
npx ts-node main.ts
```

### Development Mode

```bash
npm run dev
```

## How It Works

1. **Login**: Each account logs into Reddit and saves session cookies
2. **Search**: Searches for threads using specified keywords
3. **Comment**: Posts promotional comments on found threads
4. **Anti-spam**: Implements random delays between actions

## Configuration

### Keywords
Modify the `keywords` array in `main.ts`:
```typescript
const keywords = ['best budgeting app', 'save money app', 'investment tips'];
```

### Promotional Comment
Update the comment text in `main.ts`:
```typescript
const promotionalComment = "Your promotional message here";
```

### Anti-spam Settings
Adjust delays in `main.ts`:
```typescript
await page.waitForTimeout(3000 + Math.random() * 2000); // 3-5 second delay
```

## Safety Features

- ✅ Session management to avoid repeated logins
- ✅ Random delays between actions
- ✅ Error handling for failed logins
- ✅ Limited to top 5 threads per keyword
- ✅ Graceful error handling for comment failures

## Important Notes

⚠️ **Use Responsibly**: 
- Respect Reddit's terms of service
- Don't spam or post irrelevant comments
- Use realistic delays between actions
- Monitor your accounts for any issues

⚠️ **Security**: 
- Never commit real credentials to version control
- Use environment variables for production
- Regularly rotate account credentials

## Troubleshooting

### Common Issues

1. **Login Failed**: Check credentials in `accounts.json`
2. **No Threads Found**: Verify keywords and Reddit's search functionality
3. **Comment Failed**: Reddit may have changed selectors - update `comment.ts`

### Debug Mode

Run with headless: false to see browser actions:
```typescript
const browser = await chromium.launch({ headless: false });
```

## License

ISC License - Use at your own risk and responsibility. 