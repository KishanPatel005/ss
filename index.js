// Import required modules
const express = require('express');
const puppeteer = require('puppeteer');
const { URL } = require('url');

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (including file:// and direct HTML requests)
const cors = require('cors');
app.use(cors({ origin: '*' }));

// GET /screenshot?url=... endpoint
app.get('/screenshot', async (req, res) => {
  try {
    // Extract the 'url' query parameter
    const targetUrl = req.query.url;

    // Validate that the 'url' parameter exists
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url query parameter.' });
    }

    // Validate that the 'url' parameter is a valid web URL
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL provided.' });
    }

    // Parse and validate optional query parameters
    const delay = req.query.delay ? parseInt(req.query.delay, 10) : 0;
    const width = req.query.width ? parseInt(req.query.width, 10) : undefined;
    const height = req.query.height ? parseInt(req.query.height, 10) : undefined;
    let fullPage = true;
    if (typeof req.query.fullPage !== 'undefined') {
      if (req.query.fullPage === 'false' || req.query.fullPage === '0') {
        fullPage = false;
      } else if (req.query.fullPage === 'true' || req.query.fullPage === '1') {
        fullPage = true;
      } else {
        return res.status(400).json({ error: 'Invalid fullPage value. Use true or false.' });
      }
    }

    // Validate delay
    if (delay < 0 || isNaN(delay)) {
      return res.status(400).json({ error: 'Invalid delay value.' });
    }
    // Validate width and height if provided
    if ((width !== undefined && (isNaN(width) || width <= 0)) ||
        (height !== undefined && (isNaN(height) || height <= 0))) {
      return res.status(400).json({ error: 'Invalid width or height value.' });
    }

    // Launch Puppeteer in headless mode
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Set viewport if width/height provided, else use default desktop
    if (width || height) {
      await page.setViewport({
        width: width || 800,
        height: height || 600,
      });
    } else {
      // Default to desktop
      await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    }

    // Navigate to the target URL
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for the specified delay (if any)
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    // Take a screenshot as a PNG buffer (fullPage or not)
    const screenshotBuffer = await page.screenshot({ fullPage, type: 'png' });

    // Close the browser
    await browser.close();

    // Set response headers for PNG image
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="screenshot.png"',
      'Cache-Control': 'no-store',
    });

    // Send the screenshot buffer as the response
    res.send(screenshotBuffer);
  } catch (error) {
    // Handle errors and send a 500 response
    console.error('Error taking screenshot:', error);
    res.status(500).json({ error: 'Failed to take screenshot.' });
  }
});

// GET /batch-screenshot?urls=url1,url2,... endpoint
app.get('/batch-screenshot', async (req, res) => {
  // Import adm-zip only when needed
  const AdmZip = require('adm-zip');
  try {
    // Extract and validate the 'urls' query parameter
    const urlsParam = req.query.urls;
    if (!urlsParam) {
      return res.status(400).json({ error: 'Missing urls query parameter.' });
    }
    // Split and trim URLs
    const urlList = urlsParam.split(',').map(u => u.trim()).filter(Boolean);
    if (urlList.length === 0) {
      return res.status(400).json({ error: 'No valid URLs provided.' });
    }

    // Validate each URL
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

    // Launch Puppeteer browser once for efficiency
    const browser = await require('puppeteer').launch();

    // Take screenshots in parallel
    const screenshotPromises = validUrls.map(async (url, idx) => {
      const page = await browser.newPage();
      // Set viewport for each page
      await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const buffer = await page.screenshot({ fullPage: true, type: 'png' });
      await page.close();
      return { url, buffer, idx };
    });
    const screenshots = await Promise.all(screenshotPromises);

    // Close the browser
    await browser.close();

    // Create a zip archive and add each screenshot
    const zip = new AdmZip();
    screenshots.forEach(({ url, buffer, idx }) => {
      // Create a safe filename from the URL
      let safeName = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      if (safeName.length > 50) safeName = safeName.slice(0, 50);
      zip.addFile(`screenshot_${idx + 1}_${safeName}.png`, buffer);
    });
    const zipBuffer = zip.toBuffer();

    // Set response headers for zip file
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="screenshots.zip"',
      'Cache-Control': 'no-store',
    });
    // Send the zip file as the response
    res.send(zipBuffer);
  } catch (error) {
    // Handle errors and send a 500 response
    console.error('Error in batch screenshot:', error);
    res.status(500).json({ error: 'Failed to take batch screenshots.' });
  }
});

// Serve static files from the ../public directory (client)
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// Catch-all fallback: send public/index.html for any GET request not starting with /screenshot or /batch-screenshot
app.get(/^\/(?!screenshot|batch-screenshot).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
