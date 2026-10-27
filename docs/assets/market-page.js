let fullManifest = null;
let manifest = null;
let currentMarket = document.body.dataset.market;
let indexData = [];
let currentStockData = [];
let currentGapData = [];
let currentPunishData = [];
let filteredStocks = [];
let chart = null;

// Pagination & Sorting State
let currentPage = 1;
let rowsPerPage = 10;
let sortColumn = "id";
let sortDirection = "asc";

async function init() {
  try {
    try {
      const response = await fetch(UIData.dataUrl("manifest.json"));
      fullManifest = await response.json();
    } catch (e) {
      console.error("Manifest load error:", e);
      document.getElementById("stock-loader").style.display = "none";
      // sidebar panels ship with a loading placeholder; clear it
      document.getElementById("gap-list").innerHTML = "";
      document.getElementById("punish-list").innerHTML = "";
      UIData.renderState(document.getElementById("result-state"), "error", {
        message: "資料載入失敗",
        onRetry: init,
      });
      return;
    }
    document.getElementById("result-state").innerHTML = "";

    const urlParams = new URLSearchParams(window.location.search);
    const marketParam = urlParams.get("market");
    if (marketParam === "warrant") {
      window.location.href = "premium-warrant.html";
      return;
    }
    if (
      (marketParam === "twse" || marketParam === "tpex") &&
      marketParam !== currentMarket
    ) {
      window.location.href = marketParam + ".html";
      return;
    }

    updateMarketData();

    document
      .getElementById("stock-search")
      .addEventListener("input", filterStocks);
    document
      .getElementById("price-min")
      .addEventListener("input", filterStocks);
    document
      .getElementById("price-max")
      .addEventListener("input", filterStocks);
    document
      .getElementById("volume-min")
      .addEventListener("input", filterStocks);
    document
      .getElementById("ratio-min")
      .addEventListener("input", filterStocks);
    document
      .getElementById("ratio-max")
      .addEventListener("input", filterStocks);
    document
      .getElementById("rows-per-page")
      .addEventListener("change", (e) => {
        rowsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderStockTable();
      });
    document
      .getElementById("clear-filters")
      .addEventListener("click", () => {
        document.getElementById("stock-search").value = "";
        document.getElementById("price-min").value = "";
        document.getElementById("price-max").value = "";
        document.getElementById("volume-min").value = "";
        document.getElementById("ratio-min").value = "";
        document.getElementById("ratio-max").value = "";
        document.getElementById("rows-per-page").value = "10";
        rowsPerPage = 10;
        filterStocks();
      });

    // Gap Jump sort listener
    document
      .getElementById("gap-sort")
      .addEventListener("change", renderGapList);

    // Gap Type switcher listener
    document
      .getElementById("gap-type-switcher")
      .addEventListener("change", () => {
        const date = document.getElementById("date-picker").value;
        loadGapData(date);
      });

    // Pagination listeners
    document.getElementById("prev-page").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderStockTable();
      }
    });
    document.getElementById("next-page").addEventListener("click", () => {
      const maxPage = Math.ceil(filteredStocks.length / rowsPerPage);
      if (currentPage < maxPage) {
        currentPage++;
        renderStockTable();
      }
    });

    // `/` key focuses search
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("stock-search").focus();
      }
    });
  } catch (error) {
    console.error("Initialization error:", error);
  }
}

async function updateMarketData() {
  manifest = fullManifest[currentMarket];
  if (!manifest) return;

  // Populate date picker
  const datePicker = document.getElementById("date-picker");
  const savedDate = datePicker.value;
  datePicker.innerHTML = "";
  manifest.daily_price.forEach((date, i) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    datePicker.appendChild(option);
  });

  // Try to keep the same date if available in the new market
  if (savedDate && manifest.daily_price.includes(savedDate)) {
    datePicker.value = savedDate;
  }

  datePicker.onchange = (e) => loadStockData(e.target.value);

  // Load initial data
  if (manifest.daily_index.length > 0) {
    await loadIndexData();
  }
  if (manifest.daily_price.length > 0) {
    await loadStockData(datePicker.value);
  }
}

async function loadIndexData() {
  try {
    const response = await fetch(
      UIData.dataUrl(`${currentMarket}/index_history.json`),
    );
    indexData = await response.json();
  } catch (e) {
    console.error("Error loading index_history.json:", e);
    indexData = [];
  }

  if (indexData.length > 0) {
    const selectedDate = document.getElementById("date-picker").value;
    updateSummary(selectedDate);
    renderChart(indexData);
  }
}

function updateSummary(date) {
  if (!indexData || indexData.length === 0) return;

  // Helper to convert index date (e.g. 115/05/04) to ISO (2026-05-04)
  const toISO = (rocDate) => {
    const parts = rocDate.split("/");
    const year = parseInt(parts[0]) + 1911;
    return `${year}-${parts[1]}-${parts[2]}`;
  };

  // Find the index item for the given date, or default to the latest if not found
  let summaryData = indexData.find((item) => toISO(item.date) === date);
  if (!summaryData) {
    summaryData = indexData[indexData.length - 1];
  }

  document.getElementById("last-update").textContent =
    `最後更新: ${toISO(summaryData.date)}`;
  document.getElementById("summary-index").textContent = Math.round(
    summaryData.index,
  ).toLocaleString();

  const changes = parseFloat(summaryData.changes);
  const prevIndex = summaryData.index - changes;
  const percent = prevIndex ? (changes / prevIndex) * 100 : 0;
  const isUp = changes >= 0;
  const changesEl = document.getElementById("summary-changes");
  changesEl.textContent =
    (isUp ? "▲ " : "▼ ") +
    Math.abs(Math.round(changes)) +
    "  (" +
    Math.abs(percent).toFixed(2) +
    "%" +
    ")";
  changesEl.className =
    "stat-change " + (isUp ? "price-up" : "price-down");

  document.getElementById("summary-turnover").textContent =
    Math.round(summaryData.turnover / 100000000) + " 億";
  document.getElementById("summary-volume").textContent =
    Math.round(summaryData.volume / 100000000) + "  億";
  document.getElementById("summary-transactions").textContent =
    Math.round(summaryData.transactions / 10000) + " 萬";
}

// Set when any primary data fetch of the current load fails; the error banner
// (with Retry re-running the load for the CURRENT date-picker value) is shown.
let loadFailed = false;

function markLoadFailed() {
  loadFailed = true;
  // sidebars must not stay on their "載入中..." placeholder
  ["gap-list", "punish-list"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.querySelector(".loader")) {
      el.innerHTML =
        '<div style="padding: 1.5rem; color: var(--text-muted); text-align: center;">—</div>';
    }
  });
  UIData.renderState(document.getElementById("result-state"), "error", {
    message: "資料載入失敗",
    onRetry: () => loadStockData(document.getElementById("date-picker").value),
  });
}

async function loadStockData(date) {
  loadFailed = false;
  document.getElementById("result-state").innerHTML = "";
  updateSummary(date);
  document.getElementById("stock-list").innerHTML = "";
  document.getElementById("stock-loader").style.display = "flex";
  document.getElementById("gap-list").innerHTML =
    '<div class="loader" style="height: 100px">載入中...</div>';
  document.getElementById("punish-list").innerHTML =
    '<div class="loader" style="height: 100px">載入中...</div>';

  try {
    const response = await fetch(
      UIData.dataUrl(`${currentMarket}/daily_price/${date}.json`),
    );
    if (!response.ok) throw new Error("HTTP " + response.status);
    currentStockData = await response.json();

    // Use pre-computed change/change_percent from the API data
    currentStockData.forEach((s) => {
      const hasChange = s.change !== null && s.change !== undefined;
      s.diff = hasChange ? s.change : 0;
      s.ratio = hasChange ? (s.change_percent ?? 0) : 0;
      s.prev_close = hasChange ? s.close - s.change : undefined;
    });

    filterStocks();
    await loadGapData(date);

    if (manifest.daily_punish && manifest.daily_punish.includes(date)) {
      const punishResponse = await fetch(
        UIData.dataUrl(`${currentMarket}/daily_punish/${date}.json`),
      );
      if (!punishResponse.ok) throw new Error("HTTP " + punishResponse.status);
      currentPunishData = await punishResponse.json();
      renderPunishList();
    } else {
      currentPunishData = [];
      document.getElementById("punish-list").innerHTML =
        '<div style="padding: 1.5rem; color: var(--text-muted); text-align: center; font-style: italic;">今日無處置股票</div>';
      document.getElementById("punish-count").textContent = "0";
    }
  } catch (error) {
    console.error("Error loading data:", error);
    currentStockData = [];
    filterStocks();
    markLoadFailed();
  } finally {
    document.getElementById("stock-loader").style.display = "none";
  }
}

async function loadGapData(date) {
  const type = document.getElementById("gap-type-switcher").value;
  const sortSelect = document.getElementById("gap-sort");

  // Update sort options based on type
  if (type === "gap_jump") {
    sortSelect.innerHTML = `
          <option value="gap_diff-desc">漲點 ↓</option>
          <option value="gap_diff-asc">漲點 ↑</option>
          <option value="gap_ratio-desc">漲幅 ↓</option>
          <option value="gap_ratio-asc">漲幅 ↑</option>
      `;
  } else {
    sortSelect.innerHTML = `
          <option value="gap_diff-asc">跌點 ↓</option>
          <option value="gap_diff-desc">跌點 ↑</option>
          <option value="gap_ratio-asc">跌幅 ↓</option>
          <option value="gap_ratio-desc">跌幅 ↑</option>
      `;
  }

  if (manifest[type] && manifest[type].includes(date)) {
    try {
      const gapResponse = await fetch(
        UIData.dataUrl(`${currentMarket}/${type}/${date}.json`),
      );
      if (!gapResponse.ok) throw new Error("HTTP " + gapResponse.status);
      currentGapData = await gapResponse.json();
      renderGapList();
    } catch (e) {
      console.error(`Error loading ${type}:`, e);
      currentGapData = [];
      renderGapList();
      markLoadFailed();
    }
  } else {
    currentGapData = [];
    document.getElementById("gap-list").innerHTML =
      '<div style="padding: 1.5rem; color: var(--text-muted); text-align: center; font-style: italic;">無此日期數據</div>';
    document.getElementById("gap-count").textContent = "0";
  }
}

function renderGapList() {
  const container = document.getElementById("gap-list");
  const countLabel = document.getElementById("gap-count");
  const sortVal = document.getElementById("gap-sort").value;
  const type = document.getElementById("gap-type-switcher").value;

  container.innerHTML = "";
  countLabel.textContent = currentGapData.length;

  if (currentGapData.length === 0) {
    container.innerHTML =
      '<div style="padding: 1.5rem; color: var(--text-muted); text-align: center; font-style: italic;">無符合條件股票</div>';
    return;
  }

  // Copy for sorting
  const data = [...currentGapData];
  const [sortKey, sortDir] = sortVal.split("-");

  data.sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    return sortDir === "asc" ? valA - valB : valB - valA;
  });

  data.forEach((stock) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";

    const isUp = type === "gap_jump";
    const priceClass = isUp ? "price-up" : "price-down";
    const diffPrefix = stock.gap_diff > 0 ? "+" : "";

    item.innerHTML = `
              <div>
                  <div style="font-weight: 700; color: var(--text);"><a href="https://www.cnyes.com/twstock/${stock.id}/analysis/performance" target="_blank" class="stock-link">${stock.name}</a> <a href="stock.html?id=${stock.id}" class="stock-link" style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">${stock.id}</a></div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">量: ${(stock.volume / 1000).toFixed(0)} 張</div>
              </div>
              <div style="text-align: right;">
                  <div class="${priceClass}" style="font-size: 1rem;">${stock.today_close}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${diffPrefix}${stock.gap_diff} (${stock.gap_ratio}%)</div>
              </div>
          `;
    container.appendChild(item);
  });
}

function renderPunishList() {
  const container = document.getElementById("punish-list");
  const countLabel = document.getElementById("punish-count");

  container.innerHTML = "";
  countLabel.textContent = currentPunishData.length;

  if (currentPunishData.length === 0) {
    container.innerHTML =
      '<div style="padding: 1.5rem; color: var(--text-muted); text-align: center; font-style: italic;">今日無處置股票</div>';
    return;
  }

  currentPunishData.forEach((stock) => {
    const item = document.createElement("div");
    item.className = "list-item";

    item.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.25rem;">
                  <div style="font-weight: 700; color: var(--text);"><a href="https://www.cnyes.com/twstock/${stock.id}/analysis/performance" target="_blank" class="stock-link">${stock.name}</a> <a href="stock.html?id=${stock.id}" class="stock-link" style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">${stock.id}</a></div>
                  <span class="tag" style="margin: 0; background: transparent; border: 1px solid rgba(185, 28, 28, 0.35); color: rgba(185, 28, 28, 0.9);">${stock.measure}</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                  <span>期間: ${stock.from} ~ ${stock.to}</span>
                  <span>次數: ${stock.accumulated}</span>
              </div>
          `;
    container.appendChild(item);
  });
}

function setSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortColumn = column;
    sortDirection = "asc";
  }
  currentPage = 1;
  renderStockTable();
}

function renderStockTable() {
  const stocks = filteredStocks;
  const tbody = document.getElementById("stock-list");
  tbody.innerHTML = "";
  document.getElementById("stock-count").textContent = stocks.length;

  stocks.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    // Handle n/a cases for sorting
    if (sortColumn === "ratio") {
      valA = a.prev_close ? a.ratio : -Infinity;
      valB = b.prev_close ? b.ratio : -Infinity;
    } else if (sortColumn === "diff") {
      valA = a.prev_close ? a.close - a.prev_close : -Infinity;
      valB = b.prev_close ? b.close - b.prev_close : -Infinity;
    }

    if (typeof valA === "string") {
      return sortDirection === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    } else {
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }
  });

  ["id", "name", "close", "diff", "ratio", "volume"].forEach((col) => {
    const span = document.getElementById(`sort-${col}`);
    if (span) {
      span.textContent =
        col === sortColumn ? (sortDirection === "asc" ? "↑" : "↓") : "";
      span.style.color = col === sortColumn ? "var(--text)" : "";
    }
  });

  const maxPage = Math.ceil(stocks.length / rowsPerPage) || 1;
  if (currentPage > maxPage) currentPage = maxPage;
  document.getElementById("page-info").textContent =
    `第 ${currentPage} / ${maxPage} 頁`;
  document.getElementById("prev-page").disabled = currentPage === 1;
  document.getElementById("next-page").disabled = currentPage === maxPage;

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageData = stocks.slice(start, end);

  pageData.forEach((stock) => {
    const hasPrev = stock.prev_close !== undefined;
    const diff = stock.diff;
    const diffClass =
      diff > 0 ? "price-up" : diff < 0 ? "price-down" : "";
    const diffPrefix = diff > 0 ? "+" : "";
    const diffText = hasPrev ? diff.toFixed(2) : "n/a";

    const ratioText = hasPrev
      ? (stock.ratio >= 0 ? "+" : "") + stock.ratio.toFixed(2) + "%"
      : "n/a";
    const ratioClass =
      stock.ratio > 0 ? "price-up" : stock.ratio < 0 ? "price-down" : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
              <td style="font-weight: 500;"><a href="stock.html?id=${stock.id}" class="stock-link">${stock.id}</a></td>
              <td style="font-weight: 600;"><a href="https://www.cnyes.com/twstock/${stock.id}/analysis/performance" target="_blank" class="stock-link">${stock.name}</a></td>
              <td style="font-weight: 600;">${stock.close}</td>
              <td class="${diffClass}" style="font-weight: 700;">${diff !== null ? diffPrefix + diffText : "n/a"}</td>
              <td class="${ratioClass}" style="font-weight: 700;">${ratioText}</td>
              <td style="color: var(--text-muted);">${(stock.volume / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} 張</td>
          `;
    tbody.appendChild(tr);
  });
}

function filterStocks() {
  const query = document
    .getElementById("stock-search")
    .value.toLowerCase();
  const minPrice =
    parseFloat(document.getElementById("price-min").value) || 0;
  const maxPrice =
    parseFloat(document.getElementById("price-max").value) || Infinity;
  const minVolume =
    (parseInt(document.getElementById("volume-min").value) || 0) * 1000;
  const minRatio = parseFloat(document.getElementById("ratio-min").value);
  const maxRatio = parseFloat(document.getElementById("ratio-max").value);
  const hasMinRatio = !isNaN(minRatio);
  const hasMaxRatio = !isNaN(maxRatio);

  filteredStocks = currentStockData.filter((s) => {
    const matchesSearch =
      s.id.toLowerCase().includes(query) ||
      s.name.toLowerCase().includes(query);
    const matchesPrice = s.close >= minPrice && s.close <= maxPrice;
    const matchesVolume = s.volume >= minVolume;
    const matchesRatio =
      (!hasMinRatio || s.ratio >= minRatio) &&
      (!hasMaxRatio || s.ratio <= maxRatio);
    return matchesSearch && matchesPrice && matchesVolume && matchesRatio;
  });

  currentPage = 1;
  renderStockTable();
}

function renderChart(data) {
  const ctx = document.getElementById("indexChart").getContext("2d");

  if (chart) chart.destroy();

  const labels = data.map((d) => d.date);
  const prices = data.map((d) => d.index);

  const c = ChartTheme.colors();
  const monoFont = { family: '"Inter", "Noto Sans TC", sans-serif', size: 10 };

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "大盤指數",
          data: prices,
          borderColor: c.seriesA,
          backgroundColor: c.seriesA,
          borderWidth: 1.5,
          fill: false,
          tension: 0.15,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: c.seriesA,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg,
          borderColor: c.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          titleFont: { family: '"Inter", "Noto Sans TC", sans-serif', size: 11 },
          bodyFont: { family: '"Inter", "Noto Sans TC", sans-serif', size: 11 },
          titleColor: c.tooltipText,
          bodyColor: c.tooltipText,
          displayColors: false,
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: c.gridH },
          border: { color: c.gridH },
          ticks: { font: monoFont, color: c.tick },
        },
        x: {
          grid: { color: c.gridV },
          border: { color: c.gridH },
          ticks: {
            font: monoFont,
            color: c.tick,
            maxRotation: 45,
            minRotation: 45,
          },
        },
      },
    },
  });
}

init();
