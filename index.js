// Import required modules
const express = require('express');
const puppeteer = require('puppeteer');
const { URL } = require('url');
const cors = require('cors');

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors({ origin: '*' }));

// GET /screenshot?url=... endpoint
app.get('/screenshot', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url query parameter.' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL provided.' });
    }

    const delay = req.query.delay ? parseInt(req.query.delay, 10) : 0;
    const width = req.query.width ? parseInt(req.query.width, 10) : undefined;
    const height = req.query.height ? parseInt(req.query.height, 10) : undefined;

    let fullPage = true;
    if (typeof req.query.fullPage !== 'undefined') {
      const fp = req.query.fullPage;
      if (fp === 'false' || fp === '0') fullPage = false;
      else if (fp !== 'true' && fp !== '1') {
        return res.status(400).json({ error: 'Invalid fullPage value. Use true or false.' });
      }
    }

    if (delay < 0 || isNaN(delay)) {
      return res.status(400).json({ error: 'Invalid delay value.' });
    }

    if ((width !== undefined && (isNaN(width) || width <= 0)) ||
        (height !== undefined && (isNaN(height) || height <= 0))) {
      return res.status(400).json({ error: 'Invalid width or height value.' });
    }

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    if (width || height) {
      await page.setViewport({ width: width || 800, height: height || 600 });
    } else {
      await page.setViewport({ width: 1920, height: 1080, isMobile: false });
    }

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    const screenshotBuffer = await page.screenshot({ fullPage, type: 'png' });
    await browser.close();

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="screenshot.png"',
      'Cache-Control': 'no-store',
    });

    res.send(screenshotBuffer);
  } catch (error) {
    console.error('Error taking screenshot:', error);
    res.status(500).json({ error: 'Failed to take screenshot.' });
  }
});

// GET /batch-screenshot?urls=url1,url2,...
app.get('/batch-screenshot', async (req, res) => {
  const AdmZip = require('adm-zip');
  try {
    const urlsParam = req.query.urls;
    if (!urlsParam) {
      return res.status(400).json({ error: 'Missing urls query parameter.' });
    }

    const urlList = urlsParam.split(',').map(u => u.trim()).filter(Boolean);
    if (urlList.length === 0) {
      return res.status(400).json({ error: 'No valid URLs provided.' });
    }

    const validUrls = [];
    for (const u of urlList) {
      try {
        const parsed = new URL(u);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
        validUrls.push(u);
      } catch {
        // Skip invalid URLs
      }
    }

    if (validUrls.length === 0) {
      return res.status(400).json({ error: 'No valid URLs provided.' });
    }

    const browser = await puppeteer.launch();

    const screenshotPromises = validUrls.map(async (url, idx) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080, isMobile: false });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const buffer = await page.screenshot({ fullPage: true, type: 'png' });
      await page.close();
      return { url, buffer, idx };
    });

    const screenshots = await Promise.all(screenshotPromises);
    await browser.close();

    const zip = new AdmZip();
    screenshots.forEach(({ url, buffer, idx }) => {
      let safeName = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      if (safeName.length > 50) safeName = safeName.slice(0, 50);
      zip.addFile(`screenshot_${idx + 1}_${safeName}.png`, buffer);
    });

    const zipBuffer = zip.toBuffer();

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="screenshots.zip"',
      'Cache-Control': 'no-store',
    });

    res.send(zipBuffer);
  } catch (error) {
    console.error('Error in batch screenshot:', error);
    res.status(500).json({ error: 'Failed to take batch screenshots.' });
  }
});

// Optional: fallback route for all other undefined GET requests
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
