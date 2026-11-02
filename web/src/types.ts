// Shape of data/indicators.json, written by data-pipeline/build.py.

export interface DataRow {
  indicator: string;
  geo: string;
  year: number;
  value: number;
  source: string;
  updated: string;
}

// ranks[indicator][geo][year] = rank among EU27 members (1 = best)
export type RankTable = {
  [indicator: string]: { [geo: string]: { [year: string]: number } };
};

export interface Dataset {
  updated: string;
  source: string;
  records: DataRow[];
  ranks: RankTable;
}
