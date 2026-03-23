import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const out = { console: [], pageErrors: [], actions: [] };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', (msg) => out.console.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => out.pageErrors.push({ message: err.message, stack: err.stack }));

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Try to find a video card in the DOM
    const videoCard =
      (await page.$('.video-card')) || (await page.$('[data-video-id]')) || (await page.$('.card[data-video-id]'));
    if (!videoCard) {
      out.actions.push('No video card found on page');
    } else {
      out.actions.push('Video card found');
      // try clicking play button inside card
      const playBtn = (await videoCard.$('.card-play-btn')) || (await videoCard.$('.play-btn'));
      if (playBtn) {
        out.actions.push('Clicking play button');
        await playBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
      } else {
        out.actions.push('No play button inside video card; clicking card image/container');
        const img = (await videoCard.$('.card-image-container')) || (await videoCard.$('img'));
        if (img) {
          await img.click({ timeout: 5000 });
          await page.waitForTimeout(1500);
        }
      }

      // Capture video element state
      const videoState = await page.evaluate(() => {
        const v = document.getElementById('video-player');
        if (!v) return { exists: false };
        return {
          exists: true,
          src: v.currentSrc || v.src || null,
          paused: v.paused,
          readyState: v.readyState,
          muted: v.muted,
          display: v.style.display,
        };
      });
      out.videoState = videoState;

      // Also capture any now-playing track info
      const nowPlaying = await page.evaluate(() => {
        const title = document.querySelector('.now-playing-bar .title')?.textContent || null;
        const artist = document.querySelector('.now-playing-bar .artist')?.textContent || null;
        return { title, artist };
      });
      out.nowPlaying = nowPlaying;
    }
  } catch (e) {
    out.pageErrors.push({ message: e.message, stack: e.stack });
  } finally {
    await browser.close();
    fs.writeFileSync('headless-video-test-result.json', JSON.stringify(out, null, 2));
    console.log('Headless video test finished. Results written to headless-video-test-result.json');
  }
})();
