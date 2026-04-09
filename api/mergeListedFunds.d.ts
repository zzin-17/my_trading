export interface ListedFundRow {
  ticker: string;
  name: string;
  sector: string;
  board: string;
}

export function fetchNaverEtfEtnRows(): Promise<ListedFundRow[]>;
export function mergeStockAndFunds(
  stockItems: ListedFundRow[],
  fundItems: ListedFundRow[],
): ListedFundRow[];
