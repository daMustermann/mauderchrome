import { chromium } from 'playwright';
import fs from 'fs';
 (async () => {
  const out = { console: [], pageErrors: [], modalFound: false };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', (msg) => {
    out.console.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    out.pageErrors.push({ message: err.message, stack: err.stack });
  });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    // Try to open header account dropdown/button
    // Known selectors used in app.js: headerAccountBtn variable refers to element with id 'header-account-btn'
    const headerBtn = await page.$('#header-account-btn') || await page.$('.header-account-btn') || await page.$('[data-action="open-account"]') || await page.$('button[title="Account"]');
    if (headerBtn) {
      await headerBtn.click();
      // wait briefly for dropdown
      await page.waitForTimeout(500);
    }

    // Try to click the connect button inside dropdown
    const connectBtn = await page.$('#header-local-auth') || await page.$('#header-google-auth') || await page.$('#header-email-auth') || await page.$('button:has-text("Connect with Google")') || await page.$('button:has-text("Who is Listening?")') || await page.$('button:has-text("Who\'s listening")');
    if (connectBtn) {
      await connectBtn.click();
      await page.waitForTimeout(500);
    }

    // Check for modal presence and attempt to create a test user
    const modal = await page.$('#local-user-modal') || await page.$('.modal.active') || await page.$('.modal');
    if (modal) {
      out.modalFound = true;
      try {
        const userInput = await page.$('#local-user-new-input');
        const adminInput = await page.$('#local-user-admin-password');
        const createBtn = await page.$('#local-user-create-btn');
        if (userInput && adminInput && createBtn) {
          await userInput.fill('testuser');
          await adminInput.fill('marauder88');
          await createBtn.click();
          // wait for modal to close and state to update
          await page.waitForTimeout(500);

          // read localStorage values
          const usersRaw = await page.evaluate(() => localStorage.getItem('monochrome-local-users'));
          const current = await page.evaluate(() => localStorage.getItem('monochrome-local-current-user'));
          out.localStorage = { usersRaw, current };
        }
      } catch (err) {
        out.pageErrors.push({ message: err.message, stack: err.stack });
      }
    }

    // Capture first 30 console messages
    out.console = out.console.slice(0, 200);
  } catch (e) {
    out.pageErrors.push({ message: e.message, stack: e.stack });
  } finally {
    await browser.close();
    fs.writeFileSync('headless-test-result.json', JSON.stringify(out, null, 2));
    console.log('Headless test finished. Results written to headless-test-result.json');
  }
})();
