import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');

// Start a simple HTTP server
const server = http.createServer((req, res) => {
    console.log(`Request: ${req.url}`);
    let decodedUrl = decodeURIComponent(req.url);
    let filePath = path.join(projectRoot, decodedUrl);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`File error: ${filePath} - ${err.message}`);
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.mjs': 'application/javascript',
            '.json': 'application/json',
            '.txt': 'text/plain',
            '.wasm': 'application/wasm'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(8080, async () => {
    console.log('Server started at http://localhost:8080');
    let failures = 0;

    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('Browser:', msg.text());
    });

    page.on('pageerror', err => {
        console.log('Page error:', err.message);
    });

    try {
        await page.goto('http://localhost:8080/src/js/__tests__/index.html', {
            waitUntil: 'load',
            timeout: 30000
        });

        // Wait for tests to complete
        await page.waitForFunction(() => {
            return window.testResults && (window.testResults.passed > 0 || window.testResults.failed > 0);
        }, { timeout: 60000 });

        // Check results
        const results = await page.evaluate(() => window.testResults);
        console.log('Test results:', results);

        if (results.failed > 0) {
            console.log('Failed tests:', results.errors);
            failures = 1;
        } else {
            console.log('All browser tests passed!');
        }
    } catch (e) {
        console.error('Error:', e.message);
        failures = 1;
    } finally {
        await browser.close();
        server.close();
    }

    process.exitCode = failures > 0 ? 1 : 0;
});
