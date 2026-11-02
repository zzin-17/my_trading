export function directionFromNaverIndex(data: {
  compareToPreviousPrice?: { name?: string; text?: string; code?: string };
  compareToPreviousClosePrice?: string;
}): number;

export function parseNaverIndexBasic(
  data: {
    itemCode?: string;
    stockName?: string;
    closePrice?: string;
    compareToPreviousClosePrice?: string;
    fluctuationsRatio?: string;
    compareToPreviousPrice?: { name?: string; text?: string; code?: string };
  },
  fallback?: { id: string; name: string },
): {
  id: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
};

export function fetchKrIndices(): Promise<{
  fetchedAt: string;
  indices: {
    id: string;
    name: string;
    price: number;
    change: number;
    changePct: number;
  }[];
}>;
