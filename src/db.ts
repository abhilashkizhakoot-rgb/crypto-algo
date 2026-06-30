export interface NewsHeadline {
  id: string;
  time: number;
  headline: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: number; // -1 to 1
}

class DbManager {
  private trades: any[] = [];
  private config: any = null;
  private headlines: NewsHeadline[] = [
    {
      id: "h1",
      time: Date.now() - 30 * 60 * 1000,
      headline: "US SEC Approves First Bitcoin Leveraged ETF",
      impact: "MEDIUM",
      sentiment: 0.35
    },
    {
      id: "h2",
      time: Date.now() - 120 * 60 * 1000,
      headline: "Whale Wallet Moves $50M BTC onto Binance",
      impact: "LOW",
      sentiment: -0.15
    }
  ];

  constructor() {
    // Simple state holding
  }

  getTrades() {
    return this.trades;
  }

  saveTrades(trades: any[]) {
    this.trades = trades;
  }

  getConfig() {
    return this.config;
  }

  saveConfig(config: any) {
    this.config = config;
  }

  getHeadlines() {
    return this.headlines;
  }

  addHeadline(headline: NewsHeadline) {
    this.headlines.unshift(headline);
    if (this.headlines.length > 50) this.headlines.pop();
  }
}

export const dbManager = new DbManager();
export type { DbManager as DbManagerType };
