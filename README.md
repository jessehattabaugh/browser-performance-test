# Browser Performance Test

Benchmark the real‑world loading performance of your favorite sites in **Chrome** and **Firefox** under four conditions:

1. **JavaScript ON** + **Cold Cache**  (first visit)
2. **JavaScript ON** + **Warm Cache** (reload without clearing cache)
3. **JavaScript OFF** + **Cold Cache**
4. **JavaScript OFF** + **Warm Cache**

For each scenario the script records key web‑performance metrics five times (default) and outputs raw JSON plus an interactive bar‑chart dashboard.

---

## Features 

* **Browsers:** Real Google Chrome (via Playwright’s `channel="chrome"`) and Playwright‑bundled Firefox.
* **Metrics:**

  * Browser start‑up time (cold loads only)
  * First Contentful Paint (FCP)
  * DOM Interactive
  * DOMContentLoaded
  * Load Event End
* **Iterations:** 5 per scenario (configurable).
  Averages are displayed in the HTML dashboard.
* **Visible windows:** `headless:false` to emulate interactive browsing.
* **Cross‑platform:** Works on Windows 10/11, macOS, and Ubuntu 22.04+.
  (If you run inside WSL2 you’ll need an X server or switch to `headless:true`.)

---

## Quick Start

### 1 · Install prerequisites

```bash
# Node 14 or newer
node --version

# Add Playwright
npm install -g playwright@latest        # or: npm init -y && npm i playwright

# Download browser binaries (≈200 MB)
npx playwright install
```

> **Tip for Chrome users:** If Google Chrome is already on your system, Playwright’s `channel:"chrome"` will pick it up automatically. Otherwise it falls back to bundled Chromium.

### 2 · Download the repo / files

```bash
# Clone or copy benchmark.js and this README
```

### 3 · Run the benchmark

```bash
node benchmark.js
```

The script will open and close Chrome and Firefox windows repeatedly.
Duration depends on network speed; four sites × four scenarios × five iterations ≈ 5–10 minutes on a typical connection.

---

## Output Files

| File                          | What’s inside                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **performance\_results.json** | Raw timing data for every iteration, structured by browser → JS setting → URL → cache state → metrics.                              |
| **results\_chart.html**       | Interactive Chart.js dashboard showing average First Contentful Paint for each scenario. Open it in any browser to compare results. |

### Sample JSON structure

```jsonc
{
  "Chrome": {
    "JS_on": {
      "https://youtube.com/": {
        "cold": [ { "browser_start_time": 1234, "fcp": 1720, ... } ],
        "warm": [ { "fcp": 800, ... } ]
      },
      "https://github.com/": { ... }
    },
    "JS_off": { ... }
  },
  "Firefox": { ... }
}
```

---

## Interpreting the Dashboard

* **Cold vs Warm:** Expect warm‑cache loads to be dramatically faster as resources come from disk cache instead of the network.
* **JS OFF tests:** Show how much script execution contributes to load time. Some sites (e.g. GitHub) serve a simplified page when JS is disabled.
* **Browser comparison:** Chrome’s V8 engine often outperforms Firefox’s SpiderMonkey on script‑heavy pages, but results vary by site.

Hover over any bar to see the average FCP in ms.

---

## Customisation

| Setting           | Where to change                | Default                             |
| ----------------- | ------------------------------ | ----------------------------------- |
| Test URLs         | `URLS` array in `benchmark.js` | YouTube, GitHub, StackOverflow, MDN |
| Iterations        | `ITERATIONS` constant          | 5                                   |
| Headless/headed   | `HEADLESS` constant            | **false** (headed)                  |
| Metrics collected | `page.evaluate()` blocks       | FCP, DOM events                     |

Add additional metrics (e.g. Largest Contentful Paint, Total Blocking Time) via `PerformanceObserver` inside the `page.evaluate()` function.

---

## Troubleshooting

| Problem                                                   | Fix                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Chrome fails to launch**                                | Install desktop Chrome or remove `channel:"chrome"` to use bundled Chromium. |
| **Error: "browserType.launch: Executable doesn’t exist"** | Run `npx playwright install` to download missing binaries.                   |
| **No GUI in WSL2**                                        | Install an X server (VcXsrv / Xming) *or* set `HEADLESS=true`.               |
| **Firewall prompts**                                      | Allow outbound connections for Playwright browsers so pages load.            |

---

## License

MIT — do whatever you want, but performance results may vary. ✌️

---

## Enhanced Dashboard Features

The results dashboard now includes:

1. **All Metrics Visualization**: 
   - Browser Start Time (cold loads only)
   - First Contentful Paint (FCP)
   - DOM Interactive
   - DOM Content Loaded
   - Load Event End

2. **Comprehensive Comparisons**:
   - Browser Overall Performance (Chrome vs Firefox)
   - JavaScript Impact Analysis (JS On vs JS Off)
   - Cache Performance Impact (Cold vs Warm)

3. **Performance Deltas Table**: Shows exact differences between configurations:
   - JS Off vs JS On performance impact
   - Warm vs Cold cache performance boost
   - Firefox vs Chrome overall comparison
   - Color-coded values (green = improvement, red = degradation)

4. **Visual Analytics**: Multiple interactive charts showing different perspectives of the same data for comprehensive analysis.
