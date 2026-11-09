export interface ListedFundRow {
  ticker: string;
  name: string;
  sector: string;
  board: string;
}

export function isPreferredStockName(name: string): boolean;
export function preferredRowsFromMarketValueStocks(
  stocks: Array<{ itemCode?: string; stockName?: string }>,
  board: string,
): ListedFundRow[];
export function fetchNaverEtfEtnRows(): Promise<ListedFundRow[]>;
export function mergeStockAndFunds(
  stockItems: ListedFundRow[],
  fundItems: ListedFundRow[],
  preferredItems?: ListedFundRow[],
): ListedFundRow[];
