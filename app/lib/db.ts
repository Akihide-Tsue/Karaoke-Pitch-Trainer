import Dexie from "dexie";

export interface LastSavedRecording {
  id: string;
  songId: string;
  unitId: string;
  unitStartMs: number;
  unitEndMs: number;
  audioPath: string;
  pitchData: number[];
  intervalMs: number;
  score?: number | null;
}

const DB_NAME = "pitch-poc";
const STORE_NAME = "recordings";
const LAST_RECORDING_ID = "last";

class PitchPocDB extends Dexie {
  recordings!: Dexie.Table<LastSavedRecording, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      [STORE_NAME]: "id",
    });
  }
}

export const db = new PitchPocDB();
export { LAST_RECORDING_ID, STORE_NAME };
