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

// Main benchmark function - only run if this file is executed directly
async function runBenchmark() {
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
}

// Only run benchmark if this file is executed directly
if (require.main === module) {
	runBenchmark().catch(console.error);
}

// Export functions for testing
module.exports = {
	generateHtml,
	calculateMetricsData,
	calculateCumulativeStats,
	calculateDeltas,
	avg,
	ITERATIONS,
	URLS,
	OUTPUT_JSON,
	OUTPUT_HTML
};

// ----------------------------------------------------------------
//  create enhanced HTML file with embedded Chart.js bar charts
//  showing all metrics, cumulative stats, and deltas
// ----------------------------------------------------------------
function generateHtml(data) {
	// Calculate all metrics data
	const metricsData = calculateMetricsData(data);
	const cumulativeStats = calculateCumulativeStats(data);
	const deltas = calculateDeltas(cumulativeStats);

	// Basic HTML + Chart.js (uses CDN)
	return /* html */ `
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<title>Browser Performance Test - Comprehensive Results</title>
		<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
		<style>
			body{font-family:system-ui,Arial,sans-serif;margin:2rem;background:#f5f7fa;color:#111}
			canvas{max-width:100%;height:400px;margin-bottom:30px}
			.chart-section{margin-bottom:60px}
			.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:60px}
			.stats-table{width:100%;border-collapse:collapse;margin:20px 0}
			.stats-table th, .stats-table td{padding:10px;text-align:left;border:1px solid #ddd}
			.stats-table th{background:#f0f0f0;font-weight:600}
			.positive{color:#28a745}
			.negative{color:#dc3545}
			h1{color:#2c3e50;margin-bottom:30px}
			h2{color:#34495e;margin-top:40px;margin-bottom:20px}
			h3{color:#7f8c8d;margin-bottom:15px}
		</style>
	</head>
	<body>
		<h1>Browser Performance Test Results (${ITERATIONS} iterations)</h1>

		<div class="chart-section">
			<h2>All Metrics Comparison - Cold Cache</h2>
			<canvas id="allMetricsColdChart"></canvas>
		</div>

		<div class="chart-section">
			<h2>All Metrics Comparison - Warm Cache</h2>
			<canvas id="allMetricsWarmChart"></canvas>
		</div>

		<div class="chart-section">
			<h2>Browser Overall Performance Comparison</h2>
			<canvas id="browserComparisonChart"></canvas>
		</div>

		<div class="chart-section">
			<h2>JavaScript Impact Analysis</h2>
			<canvas id="jsImpactChart"></canvas>
		</div>

		<div class="chart-section">
			<h2>Cache Performance Impact</h2>
			<canvas id="cacheImpactChart"></canvas>
		</div>

		<div class="chart-section">
			<h2>Performance Deltas</h2>
			<table class="stats-table">
				<thead>
					<tr>
						<th>Comparison</th>
						<th>Chrome FCP Delta (ms)</th>
						<th>Firefox FCP Delta (ms)</th>
						<th>Chrome Load Delta (ms)</th>
						<th>Firefox Load Delta (ms)</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>JS Off vs JS On</td>
						<td class="${deltas.jsOff.Chrome.fcp < 0 ? 'positive' : 'negative'}">${deltas.jsOff.Chrome.fcp.toFixed(0)}</td>
						<td class="${deltas.jsOff.Firefox.fcp < 0 ? 'positive' : 'negative'}">${deltas.jsOff.Firefox.fcp.toFixed(0)}</td>
						<td class="${deltas.jsOff.Chrome.load < 0 ? 'positive' : 'negative'}">${deltas.jsOff.Chrome.load.toFixed(0)}</td>
						<td class="${deltas.jsOff.Firefox.load < 0 ? 'positive' : 'negative'}">${deltas.jsOff.Firefox.load.toFixed(0)}</td>
					</tr>
					<tr>
						<td>Warm vs Cold Cache</td>
						<td class="${deltas.warmCache.Chrome.fcp < 0 ? 'positive' : 'negative'}">${deltas.warmCache.Chrome.fcp.toFixed(0)}</td>
						<td class="${deltas.warmCache.Firefox.fcp < 0 ? 'positive' : 'negative'}">${deltas.warmCache.Firefox.fcp.toFixed(0)}</td>
						<td class="${deltas.warmCache.Chrome.load < 0 ? 'positive' : 'negative'}">${deltas.warmCache.Chrome.load.toFixed(0)}</td>
						<td class="${deltas.warmCache.Firefox.load < 0 ? 'positive' : 'negative'}">${deltas.warmCache.Firefox.load.toFixed(0)}</td>
					</tr>
					<tr>
						<td>Firefox vs Chrome</td>
						<td class="${deltas.firefoxVsChrome.fcp < 0 ? 'positive' : 'negative'}">${deltas.firefoxVsChrome.fcp.toFixed(0)}</td>
						<td>-</td>
						<td class="${deltas.firefoxVsChrome.load < 0 ? 'positive' : 'negative'}">${deltas.firefoxVsChrome.load.toFixed(0)}</td>
						<td>-</td>
					</tr>
				</tbody>
			</table>
		</div>

		<script>
			// All metrics data
			const metricsData = ${JSON.stringify(metricsData)};
			const cumulativeStats = ${JSON.stringify(cumulativeStats)};

			// Color scheme for different metrics
			const colors = {
				browser_start_time: '#e74c3c',
				fcp: '#3498db',
				dom_interactive: '#f39c12',
				dom_content_loaded: '#2ecc71',
				load: '#9b59b6'
			};

			// Create all metrics charts
			createAllMetricsChart('allMetricsColdChart', metricsData.cold, 'Cold Cache - All Metrics');
			createAllMetricsChart('allMetricsWarmChart', metricsData.warm, 'Warm Cache - All Metrics');
			createBrowserComparisonChart();
			createJSImpactChart();
			createCacheImpactChart();

			function createAllMetricsChart(canvasId, data, title) {
				const ctx = document.getElementById(canvasId).getContext('2d');
				const datasets = Object.keys(colors).map(metric => ({
					label: metric.replace(/_/g, ' ').toUpperCase(),
					data: data.map(item => item[metric]),
					backgroundColor: colors[metric],
					borderColor: colors[metric],
					borderWidth: 1
				}));

				new Chart(ctx, {
					type: 'bar',
					data: {
						labels: data.map(item => item.label),
						datasets: datasets
					},
					options: {
						responsive: true,
						indexAxis: 'y',
						scales: {
							x: { beginAtZero: true, title: { display: true, text: 'Time (ms)' } }
						},
						plugins: {
							title: { display: true, text: title }
						}
					}
				});
			}

			function createBrowserComparisonChart() {
				const ctx = document.getElementById('browserComparisonChart').getContext('2d');
				new Chart(ctx, {
					type: 'bar',
					data: {
						labels: ['Chrome Overall', 'Firefox Overall'],
						datasets: [
							{
								label: 'Average FCP (ms)',
								data: [cumulativeStats.Chrome.overall.fcp, cumulativeStats.Firefox.overall.fcp],
								backgroundColor: '#3498db'
							},
							{
								label: 'Average Load Time (ms)',
								data: [cumulativeStats.Chrome.overall.load, cumulativeStats.Firefox.overall.load],
								backgroundColor: '#9b59b6'
							}
						]
					},
					options: {
						responsive: true,
						scales: { y: { beginAtZero: true } }
					}
				});
			}

			function createJSImpactChart() {
				const ctx = document.getElementById('jsImpactChart').getContext('2d');
				new Chart(ctx, {
					type: 'bar',
					data: {
						labels: ['Chrome JS On', 'Chrome JS Off', 'Firefox JS On', 'Firefox JS Off'],
						datasets: [
							{
								label: 'Average FCP (ms)',
								data: [
									cumulativeStats.Chrome.jsOn.fcp,
									cumulativeStats.Chrome.jsOff.fcp,
									cumulativeStats.Firefox.jsOn.fcp,
									cumulativeStats.Firefox.jsOff.fcp
								],
								backgroundColor: '#3498db'
							},
							{
								label: 'Average Load Time (ms)',
								data: [
									cumulativeStats.Chrome.jsOn.load,
									cumulativeStats.Chrome.jsOff.load,
									cumulativeStats.Firefox.jsOn.load,
									cumulativeStats.Firefox.jsOff.load
								],
								backgroundColor: '#9b59b6'
							}
						]
					},
					options: {
						responsive: true,
						scales: { y: { beginAtZero: true } }
					}
				});
			}

			function createCacheImpactChart() {
				const ctx = document.getElementById('cacheImpactChart').getContext('2d');
				new Chart(ctx, {
					type: 'bar',
					data: {
						labels: ['Chrome Cold', 'Chrome Warm', 'Firefox Cold', 'Firefox Warm'],
						datasets: [
							{
								label: 'Average FCP (ms)',
								data: [
									cumulativeStats.Chrome.cold.fcp,
									cumulativeStats.Chrome.warm.fcp,
									cumulativeStats.Firefox.cold.fcp,
									cumulativeStats.Firefox.warm.fcp
								],
								backgroundColor: '#3498db'
							},
							{
								label: 'Average Load Time (ms)',
								data: [
									cumulativeStats.Chrome.cold.load,
									cumulativeStats.Chrome.warm.load,
									cumulativeStats.Firefox.cold.load,
									cumulativeStats.Firefox.warm.load
								],
								backgroundColor: '#9b59b6'
							}
						]
					},
					options: {
						responsive: true,
						scales: { y: { beginAtZero: true } }
					}
				});
			}
		</script>
	</body>
</html>
`;
}

// Helper function to calculate metrics data for charts
function calculateMetricsData(data) {
	const coldData = [];
	const warmData = [];

	for (const [browser, jsBuckets] of Object.entries(data)) {
		for (const [jsLabel, sites] of Object.entries(jsBuckets)) {
			for (const [url, cacheBuckets] of Object.entries(sites)) {
				const label = `${browser} ${jsLabel} ${url.replace('https://', '').replace('/', '')}`;
				
				// Cold cache data
				const coldMetrics = {
					label: label,
					browser_start_time: avg(cacheBuckets.cold.map(r => r.browser_start_time).filter(v => v != null)),
					fcp: avg(cacheBuckets.cold.map(r => r.fcp).filter(v => v != null)),
					dom_interactive: avg(cacheBuckets.cold.map(r => r.dom_interactive).filter(v => v != null)),
					dom_content_loaded: avg(cacheBuckets.cold.map(r => r.dom_content_loaded).filter(v => v != null)),
					load: avg(cacheBuckets.cold.map(r => r.load).filter(v => v != null))
				};
				coldData.push(coldMetrics);

				// Warm cache data (no browser_start_time)
				const warmMetrics = {
					label: label,
					browser_start_time: null,
					fcp: avg(cacheBuckets.warm.map(r => r.fcp).filter(v => v != null)),
					dom_interactive: avg(cacheBuckets.warm.map(r => r.dom_interactive).filter(v => v != null)),
					dom_content_loaded: avg(cacheBuckets.warm.map(r => r.dom_content_loaded).filter(v => v != null)),
					load: avg(cacheBuckets.warm.map(r => r.load).filter(v => v != null))
				};
				warmData.push(warmMetrics);
			}
		}
	}

	return { cold: coldData, warm: warmData };
}

// Helper function to calculate cumulative statistics
function calculateCumulativeStats(data) {
	const stats = {};

	for (const [browser, jsBuckets] of Object.entries(data)) {
		stats[browser] = {
			overall: { fcp: 0, load: 0 },
			jsOn: { fcp: 0, load: 0 },
			jsOff: { fcp: 0, load: 0 },
			cold: { fcp: 0, load: 0 },
			warm: { fcp: 0, load: 0 }
		};

		const allFcps = [];
		const allLoads = [];
		const jsOnFcps = [];
		const jsOnLoads = [];
		const jsOffFcps = [];
		const jsOffLoads = [];
		const coldFcps = [];
		const coldLoads = [];
		const warmFcps = [];
		const warmLoads = [];

		for (const [jsLabel, sites] of Object.entries(jsBuckets)) {
			for (const [url, cacheBuckets] of Object.entries(sites)) {
				// Collect all data points
				const coldFcpVals = cacheBuckets.cold.map(r => r.fcp).filter(v => v != null);
				const coldLoadVals = cacheBuckets.cold.map(r => r.load).filter(v => v != null);
				const warmFcpVals = cacheBuckets.warm.map(r => r.fcp).filter(v => v != null);
				const warmLoadVals = cacheBuckets.warm.map(r => r.load).filter(v => v != null);

				allFcps.push(...coldFcpVals, ...warmFcpVals);
				allLoads.push(...coldLoadVals, ...warmLoadVals);
				coldFcps.push(...coldFcpVals);
				coldLoads.push(...coldLoadVals);
				warmFcps.push(...warmFcpVals);
				warmLoads.push(...warmLoadVals);

				if (jsLabel === 'JS_on') {
					jsOnFcps.push(...coldFcpVals, ...warmFcpVals);
					jsOnLoads.push(...coldLoadVals, ...warmLoadVals);
				} else {
					jsOffFcps.push(...coldFcpVals, ...warmFcpVals);
					jsOffLoads.push(...coldLoadVals, ...warmLoadVals);
				}
			}
		}

		stats[browser].overall.fcp = avg(allFcps);
		stats[browser].overall.load = avg(allLoads);
		stats[browser].jsOn.fcp = avg(jsOnFcps);
		stats[browser].jsOn.load = avg(jsOnLoads);
		stats[browser].jsOff.fcp = avg(jsOffFcps);
		stats[browser].jsOff.load = avg(jsOffLoads);
		stats[browser].cold.fcp = avg(coldFcps);
		stats[browser].cold.load = avg(coldLoads);
		stats[browser].warm.fcp = avg(warmFcps);
		stats[browser].warm.load = avg(warmLoads);
	}

	return stats;
}

// Helper function to calculate deltas
function calculateDeltas(stats) {
	return {
		jsOff: {
			Chrome: {
				fcp: stats.Chrome.jsOff.fcp - stats.Chrome.jsOn.fcp,
				load: stats.Chrome.jsOff.load - stats.Chrome.jsOn.load
			},
			Firefox: {
				fcp: stats.Firefox.jsOff.fcp - stats.Firefox.jsOn.fcp,
				load: stats.Firefox.jsOff.load - stats.Firefox.jsOn.load
			}
		},
		warmCache: {
			Chrome: {
				fcp: stats.Chrome.warm.fcp - stats.Chrome.cold.fcp,
				load: stats.Chrome.warm.load - stats.Chrome.cold.load
			},
			Firefox: {
				fcp: stats.Firefox.warm.fcp - stats.Firefox.cold.fcp,
				load: stats.Firefox.warm.load - stats.Firefox.cold.load
			}
		},
		firefoxVsChrome: {
			fcp: stats.Firefox.overall.fcp - stats.Chrome.overall.fcp,
			load: stats.Firefox.overall.load - stats.Chrome.overall.load
		}
	};
}
