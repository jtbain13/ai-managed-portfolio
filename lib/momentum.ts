// ===================== MOMENTUM ENGINE =====================

export interface StockData {
  ticker: string;
  companyName: string;
  sector: string;
  price: number;
  prices: number[];
  returns: { m1: number; m3: number; m6: number; m12: number };
  volume: number;
}

export function calculateMomentumConsistency(prices: number[]): number {
  if (prices.length < 20) return 0;
  const monthlyReturns: number[] = [];
  const step = Math.max(1, Math.floor(prices.length / 12));
  for (let i = step; i < prices.length; i += step) {
    monthlyReturns.push((prices[i] - prices[i - step]) / prices[i - step]);
  }
  if (monthlyReturns.length === 0) return 0;
  const positiveMonths = monthlyReturns.filter((r) => r > 0).length;
  const consistency = positiveMonths / monthlyReturns.length;
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / monthlyReturns.length;
  const smoothness = 1 / (1 + Math.sqrt(variance) * 10);
  return (consistency * 0.6 + smoothness * 0.4) * 100;
}

export function calculateMomentumScore(
  returns: StockData["returns"],
  consistency: number
): number {
  const r12 = (Math.min(Math.max(returns.m12, -50), 150) / 150) * 100;
  const r6 = (Math.min(Math.max(returns.m6, -30), 80) / 80) * 100;
  const r3 = (Math.min(Math.max(returns.m3, -20), 50) / 50) * 100;
  const r1 = (Math.min(Math.max(returns.m1, -15), 25) / 25) * 100;
  return r12 * 0.3 + r6 * 0.25 + r3 * 0.2 + r1 * 0.1 + consistency * 0.15;
}

export function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export const SECTOR_SCORES: Record<
  string,
  { score: number; rationale: string; trends: string[] }
> = {
  Technology: {
    score: 75,
    rationale:
      "AI infrastructure buildout continues, cloud/SaaS resilient, semiconductor demand elevated",
    trends: ["AI capex cycle", "Cloud migration", "Edge computing"],
  },
  Energy: {
    score: 55,
    rationale:
      "Geopolitical supply risks support prices, energy transition creates selective opportunities",
    trends: ["OPEC+ dynamics", "LNG expansion", "Nuclear renaissance"],
  },
  Healthcare: {
    score: 60,
    rationale: "Aging demographics, GLP-1 revolution, biotech innovation cycle",
    trends: ["GLP-1 drugs", "AI drug discovery", "Medicare expansion"],
  },
  "Financial Services": {
    score: 50,
    rationale:
      "Rate normalization supports net interest margins, capital markets recovery",
    trends: ["Rate cuts impact", "Fintech competition", "Capital markets rebound"],
  },
  Financials: {
    score: 50,
    rationale:
      "Rate normalization supports net interest margins, capital markets recovery",
    trends: ["Rate cuts impact", "Fintech competition", "Capital markets rebound"],
  },
  "Consumer Cyclical": {
    score: 40,
    rationale:
      "Consumer spending moderating, tariff uncertainty weighing on discretionary",
    trends: ["Tariff impact", "Consumer credit stress", "Shift to experiences"],
  },
  "Consumer Defensive": {
    score: 45,
    rationale: "Defensive positioning attractive, pricing power tested",
    trends: ["Inflation pass-through", "Private label growth", "Volume recovery"],
  },
  Industrials: {
    score: 65,
    rationale:
      "Infrastructure spending, reshoring momentum, defense spending surge",
    trends: ["CHIPS Act build", "Defense budgets", "Supply chain reshoring"],
  },
  "Real Estate": {
    score: 30,
    rationale:
      "Higher-for-longer rates pressure valuations, office distress persists",
    trends: ["Office vacancy", "Data center demand", "Rate sensitivity"],
  },
  "Basic Materials": {
    score: 50,
    rationale:
      "China stimulus supportive, critical minerals strategic importance rising",
    trends: ["EV battery metals", "China demand", "Supply constraints"],
  },
  "Communication Services": {
    score: 60,
    rationale: "AI monetization, digital ad recovery, streaming profitability",
    trends: ["AI features", "Ad market strength", "Content monetization"],
  },
  Utilities: {
    score: 55,
    rationale:
      "AI data center power demand creating growth narrative, defensive appeal",
    trends: ["Data center power", "Grid modernization", "Renewable transition"],
  },
};

export const SCREEN_UNIVERSE = [
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

export async function fetchHistoricalData(
  ticker: string
): Promise<{ prices: number[]; volume: number } | null> {
  try {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - 365 * 24 * 60 * 60;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${startDate}&period2=${endDate}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes =
      result.indicators?.quote?.[0]?.close?.filter(
        (p: number | null) => p !== null
      ) || [];
    const volumes =
      result.indicators?.quote?.[0]?.volume?.filter(
        (v: number | null) => v !== null
      ) || [];
    const avgVolume =
      volumes.length > 0
        ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length
        : 0;
    return { prices: closes, volume: avgVolume };
  } catch {
    return null;
  }
}

export async function fetchQuote(
  ticker: string
): Promise<{ price: number; name: string; sector: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
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

export async function fetchSeekingAlphaData(
  tickers: string[],
  rapidApiKey: string
): Promise<Map<string, { quantRating: string; momentumGrade: string }>> {
  const result = new Map<string, { quantRating: string; momentumGrade: string }>();
  if (!rapidApiKey) return result;
  try {
    const slugs = tickers.map((t) => t.toLowerCase()).join(",");
    const res = await fetch(
      `https://seeking-alpha-api.p.rapidapi.com/metrics-grades?slugs=${slugs}`,
      {
        headers: {
          "x-rapidapi-host": "seeking-alpha-api.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
      }
    );
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

export function guessSector(ticker: string): string {
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
