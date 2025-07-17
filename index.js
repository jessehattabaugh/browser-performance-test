/* benchmark.js
 *
 * Cross-platform Playwright benchmark:
 *   – Chrome vs Firefox
 *   – JavaScript enabled vs disabled
 *   – Cold vs warm cache
 *   – 5 iterations per configuration
 * Results → performance_results.json  (raw)
 *        → results_chart.html         (visual dashboard)
 */
const fs = require('fs');
const { chromium, firefox } = require('playwright');

// ---------------------- Configuration ----------------------
const URLS = [
	'https://youtube.com/',
	'https://github.com/',
	'https://stackoverflow.com/',
	'https://developer.mozilla.org/',
];
const ITERATIONS = 5;
const HEADLESS = false; // headed windows for realism
const OUTPUT_JSON = 'performance_results.json';
const OUTPUT_HTML = 'results_chart.html';
// -----------------------------------------------------------

// Helper → average of numeric array
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

(async () => {
	const results = {};
	const browsers = {
		Chrome: {
			type: chromium,
			launch: { headless: HEADLESS, channel: 'chrome' },
		},
		Firefox: { type: firefox, launch: { headless: HEADLESS } },
	};

	for (const [browserName, cfg] of Object.entries(browsers)) {
		results[browserName] = {};

		for (const jsOn of [true, false]) {
			const jsLabel = jsOn ? 'JS_on' : 'JS_off';
			results[browserName][jsLabel] = {};

			// Pre-seed result structure
			for (const url of URLS) {
				results[browserName][jsLabel][url] = { cold: [], warm: [] };
			}

			for (let iter = 1; iter <= ITERATIONS; iter++) {
				console.log(`\n${browserName} – ${jsLabel} – iteration ${iter}`);

				const launchStart = Date.now();
				const browser = await cfg.type.launch(cfg.launch).catch((err) => {
					console.error(`Failed to launch ${browserName}:`, err);
					process.exit(1);
				});
				const launchTime = Date.now() - launchStart;

				const context = await browser.newContext({ javaScriptEnabled: jsOn });
				const page = await context.newPage();

				for (const url of URLS) {
					console.log(`  ${url} (cold)`);
					// COLD LOAD -------------
					await page.goto(url, { waitUntil: 'load' });
					const coldMetrics = await page.evaluate(() => {
						const nav = performance.getEntriesByType('navigation')[0] || {};
						const paint = Object.fromEntries(
							performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]),
						);
						return {
							browser_start_time: 0, // place-holder, filled below
							fcp: paint['first-contentful-paint'] ?? null,
							dom_interactive: nav.domInteractive ?? null,
							dom_content_loaded: nav.domContentLoadedEventEnd ?? null,
							load: nav.loadEventEnd ?? null,
						};
					});
					coldMetrics.browser_start_time = launchTime;
					results[browserName][jsLabel][url].cold.push(coldMetrics);

					// WARM LOAD -------------
					console.log(`  ${url} (warm)`);
					await page.reload({ waitUntil: 'load' });
					const warmMetrics = await page.evaluate(() => {
						const nav = performance.getEntriesByType('navigation')[0] || {};
						const paint = Object.fromEntries(
							performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]),
						);
						return {
							fcp: paint['first-contentful-paint'] ?? null,
							dom_interactive: nav.domInteractive ?? null,
							dom_content_loaded: nav.domContentLoadedEventEnd ?? null,
							load: nav.loadEventEnd ?? null,
						};
					});
					results[browserName][jsLabel][url].warm.push(warmMetrics);
				}
				await browser.close();
			}
		}
	}

	// ------------ Write raw JSON ------------
	fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
	console.log(`\nFinished! Raw data written to ${OUTPUT_JSON}`);

	// ------------ Generate HTML dashboard (Chart.js) ------------
	const chartHtml = generateHtml(results);
	fs.writeFileSync(OUTPUT_HTML, chartHtml);
	console.log(`Dashboard written to ${OUTPUT_HTML} (open it in a browser)\n`);
})();

// ----------------------------------------------------------------
//  create simple HTML file with embedded Chart.js bar charts
//  showing average First Contentful Paint for each scenario
// ----------------------------------------------------------------
function generateHtml(data) {
	// Flatten to {label: avgFCP} for cold & warm separately
	const coldLabels = [];
	const coldData = [];
	const warmLabels = [];
	const warmData = [];

	for (const [browser, jsBuckets] of Object.entries(data)) {
		for (const [jsLabel, sites] of Object.entries(jsBuckets)) {
			for (const [url, cacheBuckets] of Object.entries(sites)) {
				const coldFCPs = cacheBuckets.cold.map((r) => r.fcp).filter((v) => v != null);
				const warmFCPs = cacheBuckets.warm.map((r) => r.fcp).filter((v) => v != null);

				coldLabels.push(`${browser} ${jsLabel} ${url}`);
				warmLabels.push(`${browser} ${jsLabel} ${url}`);
				coldData.push(avg(coldFCPs));
				warmData.push(avg(warmFCPs));
			}
		}
	}

	// Basic HTML + Chart.js (uses CDN)
	return /* html */ `
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<title>Firefox vs Chrome – FCP Benchmark</title>
		<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
		<style>
			body{font-family:system-ui,Arial,sans-serif;margin:2rem;background:#f5f7fa;color:#111}
			canvas{max-width:100%;height:400px;margin-bottom:50px}
		</style>
	</head>
	<body>
		<h1>First Contentful Paint (average of ${ITERATIONS} runs, ms)</h1>

		<h2>Cold Cache</h2>
		<canvas id="coldChart"></canvas>

		<h2>Warm Cache</h2>
		<canvas id="warmChart"></canvas>

		<script>
			const coldCtx = document.getElementById('coldChart').getContext('2d');
			const warmCtx = document.getElementById('warmChart').getContext('2d');
			new Chart(coldCtx, {
				type: 'bar',
				data: {
					labels: ${JSON.stringify(coldLabels)},
					datasets: [{label: 'FCP (ms)', data: ${JSON.stringify(coldData)}}]
				},
				options: {responsive:true, indexAxis:'y', scales:{x:{beginAtZero:true}}}
			});
			new Chart(warmCtx, {
				type: 'bar',
				data: {
					labels: ${JSON.stringify(warmLabels)},
					datasets: [{label: 'FCP (ms)', data: ${JSON.stringify(warmData)}}]
				},
				options: {responsive:true, indexAxis:'y', scales:{x:{beginAtZero:true}}}
			});
		</script>
	</body>
</html>
`;
}
