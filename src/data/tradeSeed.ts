import type { TradeSeedFile } from '../types/trade';
import seedJson from '../../data/tradeSeed.json';

export const tradeSeed = seedJson as unknown as TradeSeedFile;
