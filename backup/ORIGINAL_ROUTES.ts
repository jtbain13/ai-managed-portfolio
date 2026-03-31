import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";

// ===================== MOMENTUM ENGINE =====================

interface StockData {
  ticker: string;
  companyName: string;
  sector: string;
  price: number;
  prices: number[]; // historical closing prices
  returns: { m1: number; m3: number; m6: number; m12: number };
  volume: number;
}

function calculateMomentumConsistency(prices: number[]): number {
  if (prices.length < 20) return 0;
  // Count positive monthly return periods vs negative
  const monthlyReturns: number[] = [];
  const step = Math.max(1, Math.floor(prices.length / 12));
  for (let i = step; i < prices.length; i += step) {
    monthlyReturns.push((prices[i] - prices[i - step]) / prices[i - step]);
  }
  if (monthlyReturns.length === 0) return 0;
  const positiveMonths = monthlyReturns.filter(r => r > 0).length;
  const consistency = positiveMonths / monthlyReturns.length;
  // Also factor in smoothness (low std dev of returns = smoother momentum)
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance = monthlyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / monthlyReturns.length;
  const smoothness = 1 / (1 + Math.sqrt(variance) * 10);
  return (consistency * 0.6 + smoothness * 0.4) * 100;
}

function calculateMomentumScore(returns: StockData["returns"], consistency: number): number {
  // Weighted: 12m return (30%), 6m (25%), 3m (20%), 1m (10%), consistency (15%)
  const r12 = Math.min(Math.max(returns.m12, -50), 150) / 150 * 100;
  const r6 = Math.min(Math.max(returns.m6, -30), 80) / 80 * 100;
  const r3 = Math.min(Math.max(returns.m3, -20), 50) / 50 * 100;
  const r1 = Math.min(Math.max(returns.m1, -15), 25) / 25 * 100;
  return r12 * 0.30 + r6 * 0.25 + r3 * 0.20 + r1 * 0.10 + consistency * 0.15;
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // annualized vol
}

// Sector scoring based on macro trends
const SECTOR_SCORES: Record<string, { score: number; rationale: string; trends: string[] }> = {
  "Technology": { score: 75, rationale: "AI infrastructure buildout continues, cloud/SaaS resilient, semiconductor demand elevated", trends: ["AI capex cycle", "Cloud migration", "Edge computing"] },
  "Energy": { score: 55, rationale: "Geopolitical supply risks support prices, energy transition creates selective opportunities", trends: ["OPEC+ dynamics", "LNG expansion", "Nuclear renaissance"] },
  "Healthcare": { score: 60, rationale: "Aging demographics, GLP-1 revolution, biotech innovation cycle", trends: ["GLP-1 drugs", "AI drug discovery", "Medicare expansion"] },
  "Financial Services": { score: 50, rationale: "Rate normalization supports net interest margins, capital markets recovery", trends: ["Rate cuts impact", "Fintech competition", "Capital markets rebound"] },
  "Financials": { score: 50, rationale: "Rate normalization supports net interest margins, capital markets recovery", trends: ["Rate cuts impact", "Fintech competition", "Capital markets rebound"] },
  "Consumer Cyclical": { score: 40, rationale: "Consumer spending moderating, tariff uncertainty weighing on discretionary", trends: ["Tariff impact", "Consumer credit stress", "Shift to experiences"] },
  "Consumer Defensive": { score: 45, rationale: "Defensive positioning attractive, pricing power tested", trends: ["Inflation pass-through", "Private label growth", "Volume recovery"] },
  "Industrials": { score: 65, rationale: "Infrastructure spending, reshoring momentum, defense spending surge", trends: ["CHIPS Act build", "Defense budgets", "Supply chain reshoring"] },
  "Real Estate": { score: 30, rationale: "Higher-for-longer rates pressure valuations, office distress persists", trends: ["Office vacancy", "Data center demand", "Rate sensitivity"] },
  "Basic Materials": { score: 50, rationale: "China stimulus supportive, critical minerals strategic importance rising", trends: ["EV battery metals", "China demand", "Supply constraints"] },
  "Communication Services": { score: 60, rationale: "AI monetization, digital ad recovery, streaming profitability", trends: ["AI features", "Ad market strength", "Content monetization"] },
  "Utilities": { score: 55, rationale: "AI data center power demand creating growth narrative, defensive appeal", trends: ["Data center power", "Grid modernization", "Renewable transition"] },
};

// ===================== API HELPERS =====================

async function fetchHistoricalData(ticker: string): Promise<{ prices: number[]; volume: number } | null> {
  try {
    // Use Yahoo Finance v8 API (free, no key needed)
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - 365 * 24 * 60 * 60; // 1 year
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startDate}&period2=${endDate}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close?.filter((p: any) => p !== null) || [];
    const volumes = result.indicators?.quote?.[0]?.volume?.filter((v: any) => v !== null) || [];
    const avgVolume = volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : 0;
    return { prices: closes, volume: avgVolume };
  } catch {
    return null;
  }
}

async function fetchQuote(ticker: string): Promise<{ price: number; name: string; sector: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    return {
      price: meta.regularMarketPrice || 0,
      name: meta.shortName || meta.longName || ticker,
      sector: "",
    };
  } catch {
    return null;
  }
}

async function fetchSeekingAlphaData(tickers: string[], rapidApiKey: string): Promise<Map<string, { quantRating: string; momentumGrade: string }>> {
  const result = new Map<string, { quantRating: string; momentumGrade: string }>();
  if (!rapidApiKey) return result;
  try {
    const slugs = tickers.map(t => t.toLowerCase()).join(",");
    const res = await fetch(`https://seeking-alpha-api.p.rapidapi.com/metrics-grades?slugs=${slugs}`, {
      headers: {
        "x-rapidapi-host": "seeking-alpha-api.p.rapidapi.com",
        "x-rapidapi-key": rapidApiKey,
      },
    });
    if (!res.ok) return result;
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        const momentumCat = item.momentum_category || 0;
        let momentumGrade = "N/A";
        if (momentumCat >= 10) momentumGrade = "A+";
        else if (momentumCat >= 8) momentumGrade = "A";
        else if (momentumCat >= 6) momentumGrade = "B";
        else if (momentumCat >= 4) momentumGrade = "C";
        else if (momentumCat >= 2) momentumGrade = "D";
        else momentumGrade = "F";
        result.set(item.slug?.toUpperCase() || "", {
          quantRating: `${momentumCat}/12`,
          momentumGrade,
        });
      }
    }
  } catch (e) {
    console.error("Seeking Alpha API error:", e);
  }
  return result;
}

// Universe of stocks to screen
const SCREEN_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "LLY", "JPM",
  "V", "UNH", "MA", "HD", "COST", "NFLX", "CRM", "ABBV", "AMD", "ORCL",
  "PEP", "TMO", "ADBE", "CSCO", "ACN", "MRK", "LIN", "INTC", "WMT", "DIS",
  "QCOM", "TXN", "INTU", "AMAT", "BKNG", "AXP", "ISRG", "PANW", "LRCX", "KLAC",
  "NOW", "MELI", "CRWD", "UBER", "SQ", "COIN", "PLTR", "SNOW", "NET", "DDOG",
  "GE", "CAT", "RTX", "LMT", "NOC", "DE", "ETN", "ITW", "EMR", "HON",
  "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "MPC", "PSX", "VLO", "HES",
  "PFE", "JNJ", "BMY", "GILD", "AMGN", "REGN", "VRTX", "MRNA", "BIIB", "ZTS",
  "NEE", "SO", "DUK", "AEP", "SRE", "D", "EXC", "XEL", "WEC", "ES",
  "GS", "MS", "C", "BAC", "WFC", "SCHW", "BLK", "ICE", "CME", "SPGI",
];

// ===================== ROUTES =====================

export function registerRoutes(server: Server, app: Express) {
  
  // ----- Settings -----
  app.get("/api/settings", (_req, res) => {
    let settings = storage.getSettings();
    if (!settings) {
      settings = storage.upsertSettings({});
    }
    // Mask API keys for frontend
    res.json({
      ...settings,
      alpacaApiKey: settings.alpacaApiKey ? "••••" + settings.alpacaApiKey.slice(-4) : "",
      alpacaSecretKey: settings.alpacaSecretKey ? "••••" + settings.alpacaSecretKey.slice(-4) : "",
      seekingAlphaApiKey: settings.seekingAlphaApiKey ? "••••" + settings.seekingAlphaApiKey.slice(-4) : "",
      rapidApiKey: settings.rapidApiKey ? "••••" + settings.rapidApiKey.slice(-4) : "",
    });
  });

  app.patch("/api/settings", (req, res) => {
    const updated = storage.upsertSettings(req.body);
    storage.createActivityLog({
      type: "settings",
      message: "Portfolio settings updated",
      details: JSON.stringify({ fields: Object.keys(req.body) }),
      createdAt: new Date().toISOString(),
    });
    res.json(updated);
  });

  // ----- Holdings -----
  app.get("/api/holdings", (_req, res) => {
    res.json(storage.getHoldings());
  });

  app.post("/api/holdings", (req, res) => {
    const holding = storage.createHolding({
      ...req.body,
      addedAt: new Date().toISOString(),
    });
    storage.createActivityLog({
      type: "trade",
      message: `Added ${holding.ticker} to portfolio at ${holding.targetWeight}% weight`,
      createdAt: new Date().toISOString(),
    });
    res.json(holding);
  });

  app.patch("/api/holdings/:id", (req, res) => {
    const updated = storage.updateHolding(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Holding not found" });
    res.json(updated);
  });

  app.delete("/api/holdings/:id", (req, res) => {
    const holding = storage.getHolding(Number(req.params.id));
    if (holding) {
      storage.deleteHolding(Number(req.params.id));
      storage.createActivityLog({
        type: "trade",
        message: `Removed ${holding.ticker} from portfolio`,
        createdAt: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  });

  // ----- Trades -----
  app.get("/api/trades", (_req, res) => {
    res.json(storage.getTrades());
  });

  // ----- Screened Stocks -----
  app.get("/api/screened", (_req, res) => {
    res.json(storage.getScreenedStocks());
  });

  // Run momentum screen
  app.post("/api/screen", async (_req, res) => {
    storage.createActivityLog({
      type: "screen",
      message: "Starting momentum screen on 100-stock universe...",
      createdAt: new Date().toISOString(),
    });

    const settings = storage.getSettings();
    const rapidApiKey = settings?.rapidApiKey || "";

    try {
      storage.clearScreenedStocks();
      const results: any[] = [];

      // Process in batches of 10
      for (let i = 0; i < SCREEN_UNIVERSE.length; i += 10) {
        const batch = SCREEN_UNIVERSE.slice(i, i + 10);
        const batchResults = await Promise.all(
          batch.map(async (ticker) => {
            const hist = await fetchHistoricalData(ticker);
            if (!hist || hist.prices.length < 60) return null;

            const prices = hist.prices;
            const len = prices.length;
            const currentPrice = prices[len - 1];
            const m1Idx = Math.max(0, len - 21);
            const m3Idx = Math.max(0, len - 63);
            const m6Idx = Math.max(0, len - 126);

            const returns = {
              m1: ((currentPrice - prices[m1Idx]) / prices[m1Idx]) * 100,
              m3: ((currentPrice - prices[m3Idx]) / prices[m3Idx]) * 100,
              m6: ((currentPrice - prices[m6Idx]) / prices[m6Idx]) * 100,
              m12: ((currentPrice - prices[0]) / prices[0]) * 100,
            };

            const consistency = calculateMomentumConsistency(prices);
            const momentumScore = calculateMomentumScore(returns, consistency);
            const volatility = calculateVolatility(prices);

            const quote = await fetchQuote(ticker);
            const sector = quote?.sector || guessSector(ticker);
            const sectorData = SECTOR_SCORES[sector] || { score: 50 };
            const sectorScore = sectorData.score;

            // Composite: 70% momentum, 30% sector
            const compositeScore = momentumScore * 0.70 + sectorScore * 0.30;

            return {
              ticker,
              companyName: quote?.name || ticker,
              sector,
              price: currentPrice,
              return1m: Math.round(returns.m1 * 100) / 100,
              return3m: Math.round(returns.m3 * 100) / 100,
              return6m: Math.round(returns.m6 * 100) / 100,
              return12m: Math.round(returns.m12 * 100) / 100,
              momentumScore: Math.round(momentumScore * 100) / 100,
              momentumConsistency: Math.round(consistency * 100) / 100,
              volatility: Math.round(volatility * 100) / 100,
              volume: hist.volume,
              sectorScore,
              compositeScore: Math.round(compositeScore * 100) / 100,
              saQuantRating: "",
              saMomentumGrade: "",
              screenedAt: new Date().toISOString(),
            };
          })
        );
        results.push(...batchResults.filter(Boolean));
      }

      // Enrich with Seeking Alpha data if API key available
      if (rapidApiKey && !rapidApiKey.startsWith("••••")) {
        const top30 = results.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 30);
        const saData = await fetchSeekingAlphaData(top30.map(s => s.ticker), rapidApiKey);
        for (const stock of results) {
          const sa = saData.get(stock.ticker);
          if (sa) {
            stock.saQuantRating = sa.quantRating;
            stock.saMomentumGrade = sa.momentumGrade;
          }
        }
      }

      // Save to DB
      for (const stock of results) {
        storage.createScreenedStock(stock);
      }

      storage.createActivityLog({
        type: "screen",
        message: `Momentum screen complete: ${results.length} stocks analyzed`,
        details: JSON.stringify({ topPicks: results.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 5).map(s => s.ticker) }),
        createdAt: new Date().toISOString(),
      });

      res.json({ count: results.length, stocks: results.sort((a, b) => b.compositeScore - a.compositeScore) });
    } catch (err: any) {
      storage.createActivityLog({
        type: "error",
        message: `Screen failed: ${err.message}`,
        createdAt: new Date().toISOString(),
      });
      res.status(500).json({ error: err.message });
    }
  });

  // ----- Sector Outlook -----
  app.get("/api/sectors", (_req, res) => {
    // Seed if empty
    const existing = storage.getSectorOutlook();
    if (existing.length === 0) {
      for (const [sector, data] of Object.entries(SECTOR_SCORES)) {
        if (sector === "Financials") continue; // skip duplicate
        storage.upsertSectorOutlook({
          sector,
          score: data.score,
          rationale: data.rationale,
          keyTrends: JSON.stringify(data.trends),
          updatedAt: new Date().toISOString(),
        });
      }
      return res.json(storage.getSectorOutlook());
    }
    res.json(existing);
  });

  app.patch("/api/sectors/:id", (req, res) => {
    const updated = storage.upsertSectorOutlook({
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    res.json(updated);
  });

  // ----- Activity Log -----
  app.get("/api/activity", (_req, res) => {
    res.json(storage.getActivityLog());
  });

  // ----- Portfolio Summary -----
  app.get("/api/portfolio/summary", async (_req, res) => {
    const holdingsData = storage.getHoldings();
    const settings = storage.getSettings();
    let totalValue = 0;
    let totalCost = 0;
    const hasRealShares = holdingsData.some(h => h.shares > 0);

    // Update live prices for all holdings
    for (const h of holdingsData) {
      const quote = await fetchQuote(h.ticker);
      if (quote) {
        storage.updateHolding(h.id, { currentPrice: quote.price });
      }
    }

    if (hasRealShares) {
      // Real portfolio mode: calculate from actual shares
      for (const h of holdingsData) {
        const updated = storage.getHolding(h.id);
        if (!updated) continue;
        const mktValue = updated.shares * updated.currentPrice;
        const cost = updated.shares * updated.avgCostBasis;
        totalValue += mktValue;
        totalCost += cost;
        storage.updateHolding(h.id, {
          marketValue: Math.round(mktValue * 100) / 100,
          gainLoss: Math.round((mktValue - cost) * 100) / 100,
          gainLossPercent: cost > 0 ? Math.round(((mktValue - cost) / cost) * 10000) / 100 : 0,
        });
      }
    } else {
      // Model portfolio mode: calculate hypothetical values from target weights
      // Use stored portfolioValue or default to $10,000
      const modelValue = (settings?.portfolioValue && settings.portfolioValue > 0) ? settings.portfolioValue : 10000;
      totalValue = modelValue;
      const totalTargetWeight = holdingsData.reduce((sum, h) => sum + h.targetWeight, 0);

      for (const h of holdingsData) {
        const updated = storage.getHolding(h.id);
        if (!updated) continue;
        const allocatedValue = modelValue * (updated.targetWeight / Math.max(totalTargetWeight, 1));
        const modelShares = updated.currentPrice > 0 ? allocatedValue / updated.currentPrice : 0;
        // Use the price at add time as cost basis if no real cost basis
        const costBasis = updated.avgCostBasis > 0 ? updated.avgCostBasis : updated.currentPrice;
        const cost = modelShares * costBasis;
        totalCost += cost;
        storage.updateHolding(h.id, {
          shares: Math.round(modelShares * 10000) / 10000,
          avgCostBasis: costBasis,
          marketValue: Math.round(allocatedValue * 100) / 100,
          gainLoss: Math.round((allocatedValue - cost) * 100) / 100,
          gainLossPercent: cost > 0 ? Math.round(((allocatedValue - cost) / cost) * 10000) / 100 : 0,
        });
      }
    }

    // Update current weights based on actual market values
    const updatedHoldings = storage.getHoldings();
    for (const h of updatedHoldings) {
      if (totalValue > 0) {
        storage.updateHolding(h.id, {
          currentWeight: Math.round((h.marketValue / totalValue) * 10000) / 100,
        });
      }
    }

    if (settings) {
      storage.upsertSettings({ portfolioValue: Math.round(totalValue * 100) / 100 });
    }

    res.json({
      totalValue: Math.round(totalValue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalGainLoss: Math.round((totalValue - totalCost) * 100) / 100,
      totalGainLossPercent: totalCost > 0 ? Math.round(((totalValue - totalCost) / totalCost) * 10000) / 100 : 0,
      positionCount: updatedHoldings.length,
      holdings: storage.getHoldings(),
      isModelPortfolio: !hasRealShares,
    });
  });

  // Set model portfolio value
  app.post("/api/portfolio/set-value", (req, res) => {
    const { value } = req.body;
    if (!value || value <= 0) return res.status(400).json({ error: "Value must be positive" });
    storage.upsertSettings({ portfolioValue: value });
    // Reset shares so they recalculate on next summary refresh
    const holdings = storage.getHoldings();
    for (const h of holdings) {
      storage.updateHolding(h.id, { shares: 0, avgCostBasis: 0 });
    }
    storage.createActivityLog({
      type: "settings",
      message: `Model portfolio value set to $${value.toLocaleString()}`,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true, value });
  });

  // ----- Alpaca Integration -----
  app.post("/api/alpaca/connect", async (req, res) => {
    const { apiKey, secretKey, isPaper } = req.body;
    try {
      const baseUrl = isPaper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const acctRes = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": secretKey,
        },
      });
      if (!acctRes.ok) {
        return res.status(401).json({ error: "Invalid Alpaca credentials" });
      }
      const account = await acctRes.json();
      storage.upsertSettings({
        alpacaApiKey: apiKey,
        alpacaSecretKey: secretKey,
        isPaperTrading: isPaper,
        portfolioValue: parseFloat(account.portfolio_value || "0"),
      });
      storage.createActivityLog({
        type: "settings",
        message: `Connected to Alpaca ${isPaper ? "paper" : "live"} trading. Account value: $${parseFloat(account.portfolio_value).toLocaleString()}`,
        createdAt: new Date().toISOString(),
      });
      res.json({
        status: account.status,
        buyingPower: account.buying_power,
        portfolioValue: account.portfolio_value,
        cash: account.cash,
        accountNumber: account.account_number,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/alpaca/account", async (_req, res) => {
    const settings = storage.getSettings();
    if (!settings?.alpacaApiKey || settings.alpacaApiKey.startsWith("••••")) {
      return res.status(400).json({ error: "Alpaca not configured" });
    }
    try {
      const baseUrl = settings.isPaperTrading ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const acctRes = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          "APCA-API-KEY-ID": settings.alpacaApiKey,
          "APCA-API-SECRET-KEY": settings.alpacaSecretKey || "",
        },
      });
      if (!acctRes.ok) return res.status(401).json({ error: "Alpaca auth failed" });
      const account = await acctRes.json();
      res.json(account);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/alpaca/positions", async (_req, res) => {
    const settings = storage.getSettings();
    if (!settings?.alpacaApiKey || settings.alpacaApiKey.startsWith("••••")) {
      return res.status(400).json({ error: "Alpaca not configured" });
    }
    try {
      const baseUrl = settings.isPaperTrading ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const posRes = await fetch(`${baseUrl}/v2/positions`, {
        headers: {
          "APCA-API-KEY-ID": settings.alpacaApiKey,
          "APCA-API-SECRET-KEY": settings.alpacaSecretKey || "",
        },
      });
      if (!posRes.ok) return res.status(401).json({ error: "Alpaca auth failed" });
      res.json(await posRes.json());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Execute a trade through Alpaca
  app.post("/api/alpaca/trade", async (req, res) => {
    const settings = storage.getSettings();
    if (!settings?.alpacaApiKey || settings.alpacaApiKey.startsWith("••••")) {
      return res.status(400).json({ error: "Alpaca not configured" });
    }
    const { ticker, side, notional, qty, reason } = req.body;
    try {
      const baseUrl = settings.isPaperTrading ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const orderBody: any = {
        symbol: ticker,
        side: side,
        type: "market",
        time_in_force: "day",
      };
      if (notional) orderBody.notional = String(notional);
      else if (qty) orderBody.qty = String(qty);

      const orderRes = await fetch(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers: {
          "APCA-API-KEY-ID": settings.alpacaApiKey,
          "APCA-API-SECRET-KEY": settings.alpacaSecretKey || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderBody),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json();
        return res.status(orderRes.status).json({ error: err.message || JSON.stringify(err) });
      }

      const order = await orderRes.json();
      const trade = storage.createTrade({
        ticker,
        side,
        qty: parseFloat(order.qty || qty || "0"),
        price: 0, // will be updated when filled
        totalValue: parseFloat(notional || "0"),
        reason: reason || "Manual trade",
        status: order.status,
        alpacaOrderId: order.id,
        createdAt: new Date().toISOString(),
      });

      storage.createActivityLog({
        type: "trade",
        message: `${side.toUpperCase()} order placed: ${ticker} ${notional ? `$${notional}` : `${qty} shares`}`,
        details: JSON.stringify({ orderId: order.id, reason }),
        createdAt: new Date().toISOString(),
      });

      res.json({ trade, order });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-rebalance
  app.post("/api/rebalance", async (_req, res) => {
    const settings = storage.getSettings();
    if (!settings?.alpacaApiKey || settings.alpacaApiKey.startsWith("••••")) {
      return res.status(400).json({ error: "Alpaca not configured. Connect your Alpaca account first." });
    }

    try {
      const baseUrl = settings.isPaperTrading ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const headers = {
        "APCA-API-KEY-ID": settings.alpacaApiKey,
        "APCA-API-SECRET-KEY": settings.alpacaSecretKey || "",
        "Content-Type": "application/json",
      };

      // Get account value
      const acctRes = await fetch(`${baseUrl}/v2/account`, { headers });
      if (!acctRes.ok) return res.status(401).json({ error: "Alpaca auth failed" });
      const account = await acctRes.json();
      const portfolioValue = parseFloat(account.portfolio_value);
      const cashReserve = (settings.cashReserve || 5) / 100;
      const investable = portfolioValue * (1 - cashReserve);

      const holdingsData = storage.getHoldings();
      if (holdingsData.length === 0) {
        return res.status(400).json({ error: "No holdings in portfolio to rebalance" });
      }

      const orderResults: any[] = [];

      // First close positions not in target portfolio
      const posRes = await fetch(`${baseUrl}/v2/positions`, { headers });
      const currentPositions = posRes.ok ? await posRes.json() : [];
      const targetTickers = new Set(holdingsData.map(h => h.ticker));

      for (const pos of currentPositions) {
        if (!targetTickers.has(pos.symbol)) {
          // Close position not in target
          const closeRes = await fetch(`${baseUrl}/v2/positions/${pos.symbol}`, {
            method: "DELETE",
            headers,
          });
          if (closeRes.ok) {
            orderResults.push({ ticker: pos.symbol, action: "closed", reason: "Not in target portfolio" });
            storage.createTrade({
              ticker: pos.symbol,
              side: "sell",
              qty: parseFloat(pos.qty),
              price: parseFloat(pos.current_price),
              totalValue: parseFloat(pos.market_value),
              reason: "Rebalance: removed from portfolio",
              status: "filled",
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      // Then place orders for target weights
      for (const holding of holdingsData) {
        const targetValue = investable * (holding.targetWeight / 100);
        const currentPos = currentPositions.find((p: any) => p.symbol === holding.ticker);
        const currentValue = currentPos ? parseFloat(currentPos.market_value) : 0;
        const diff = targetValue - currentValue;

        if (Math.abs(diff) < 10) continue; // skip tiny adjustments

        const side = diff > 0 ? "buy" : "sell";
        const notional = Math.abs(Math.round(diff * 100) / 100);

        try {
          const orderRes = await fetch(`${baseUrl}/v2/orders`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              symbol: holding.ticker,
              side,
              type: "market",
              time_in_force: "day",
              notional: String(notional),
            }),
          });

          if (orderRes.ok) {
            const order = await orderRes.json();
            orderResults.push({ ticker: holding.ticker, action: side, notional, orderId: order.id });
            storage.createTrade({
              ticker: holding.ticker,
              side,
              qty: 0,
              price: 0,
              totalValue: notional,
              reason: `Rebalance: ${side} to reach ${holding.targetWeight}% target`,
              status: order.status,
              alpacaOrderId: order.id,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (e: any) {
          orderResults.push({ ticker: holding.ticker, error: e.message });
        }
      }

      storage.upsertSettings({ lastRebalance: new Date().toISOString() });
      storage.createActivityLog({
        type: "rebalance",
        message: `Portfolio rebalanced: ${orderResults.length} orders placed`,
        details: JSON.stringify(orderResults),
        createdAt: new Date().toISOString(),
      });

      res.json({ orders: orderResults, portfolioValue });
    } catch (err: any) {
      storage.createActivityLog({
        type: "error",
        message: `Rebalance failed: ${err.message}`,
        createdAt: new Date().toISOString(),
      });
      res.status(500).json({ error: err.message });
    }
  });

  // ----- Quick Add from Screen -----
  app.post("/api/portfolio/add-from-screen", async (req, res) => {
    const { tickers, equalWeight } = req.body; // tickers: string[], equalWeight: boolean
    if (!tickers || !Array.isArray(tickers)) {
      return res.status(400).json({ error: "tickers array required" });
    }

    const maxPos = 5;
    const existingHoldings = storage.getHoldings();
    const existingTickers = new Set(existingHoldings.map(h => h.ticker));
    const newTickers = tickers.filter((t: string) => !existingTickers.has(t)).slice(0, maxPos - existingHoldings.length);

    if (newTickers.length === 0) {
      return res.status(400).json({ error: "Portfolio full or tickers already held" });
    }

    const allTickers = [...existingHoldings.map(h => h.ticker), ...newTickers];
    const weight = equalWeight ? Math.round(100 / allTickers.length * 100) / 100 : 20;

    // Update existing holding weights
    for (const h of existingHoldings) {
      storage.updateHolding(h.id, { targetWeight: weight });
    }

    const screened = storage.getScreenedStocks();
    const added: any[] = [];

    for (const ticker of newTickers) {
      const screenData = screened.find(s => s.ticker === ticker);
      const quote = await fetchQuote(ticker);
      const holding = storage.createHolding({
        ticker,
        companyName: screenData?.companyName || quote?.name || ticker,
        sector: screenData?.sector || guessSector(ticker),
        targetWeight: weight,
        currentWeight: 0,
        shares: 0,
        avgCostBasis: 0,
        currentPrice: quote?.price || screenData?.price || 0,
        marketValue: 0,
        gainLoss: 0,
        gainLossPercent: 0,
        momentumScore: screenData?.momentumScore || 0,
        sectorScore: screenData?.sectorScore || 0,
        compositeScore: screenData?.compositeScore || 0,
        addedAt: new Date().toISOString(),
        status: "active",
      });
      added.push(holding);
    }

    storage.createActivityLog({
      type: "trade",
      message: `Added ${added.length} stocks to portfolio: ${newTickers.join(", ")}`,
      createdAt: new Date().toISOString(),
    });

    res.json({ added, allHoldings: storage.getHoldings() });
  });
}

// Helper: guess sector from ticker
function guessSector(ticker: string): string {
  const sectorMap: Record<string, string> = {
    AAPL: "Technology", MSFT: "Technology", NVDA: "Technology", GOOGL: "Technology",
    AMZN: "Technology", META: "Technology", TSLA: "Consumer Cyclical", AVGO: "Technology",
    AMD: "Technology", ORCL: "Technology", CRM: "Technology", ADBE: "Technology",
    CSCO: "Technology", INTC: "Technology", QCOM: "Technology", TXN: "Technology",
    INTU: "Technology", AMAT: "Technology", LRCX: "Technology", KLAC: "Technology",
    NOW: "Technology", PANW: "Technology", CRWD: "Technology", SNOW: "Technology",
    NET: "Technology", DDOG: "Technology", PLTR: "Technology", SQ: "Technology",
    COIN: "Technology", UBER: "Technology", MELI: "Technology", NFLX: "Communication Services",
    DIS: "Communication Services", BKNG: "Consumer Cyclical",
    LLY: "Healthcare", UNH: "Healthcare", ABBV: "Healthcare", MRK: "Healthcare",
    TMO: "Healthcare", PFE: "Healthcare", JNJ: "Healthcare", BMY: "Healthcare",
    GILD: "Healthcare", AMGN: "Healthcare", REGN: "Healthcare", VRTX: "Healthcare",
    MRNA: "Healthcare", BIIB: "Healthcare", ZTS: "Healthcare", ISRG: "Healthcare",
    JPM: "Financial Services", V: "Financial Services", MA: "Financial Services",
    GS: "Financial Services", MS: "Financial Services", C: "Financial Services",
    BAC: "Financial Services", WFC: "Financial Services", SCHW: "Financial Services",
    BLK: "Financial Services", ICE: "Financial Services", CME: "Financial Services",
    SPGI: "Financial Services", AXP: "Financial Services",
    XOM: "Energy", CVX: "Energy", COP: "Energy", SLB: "Energy", EOG: "Energy",
    OXY: "Energy", MPC: "Energy", PSX: "Energy", VLO: "Energy", HES: "Energy",
    GE: "Industrials", CAT: "Industrials", RTX: "Industrials", LMT: "Industrials",
    NOC: "Industrials", DE: "Industrials", ETN: "Industrials", ITW: "Industrials",
    EMR: "Industrials", HON: "Industrials",
    HD: "Consumer Cyclical", COST: "Consumer Cyclical", WMT: "Consumer Defensive",
    PEP: "Consumer Defensive", LIN: "Basic Materials", ACN: "Technology",
    NEE: "Utilities", SO: "Utilities", DUK: "Utilities", AEP: "Utilities",
    SRE: "Utilities", D: "Utilities", EXC: "Utilities", XEL: "Utilities",
    WEC: "Utilities", ES: "Utilities",
  };
  return sectorMap[ticker] || "Technology";
}
