import Dexie from "dexie"
import type { PitchEntry } from "~/stores/practice"

export interface LastSavedRecording {
  id: string
  songId: string
  songTitle: string
  unitId: string
  unitStartMs: number
  unitEndMs: number
  audioBlob: Blob
  pitchData: PitchEntry[]
  score: number
  totalDurationMs: number
}

const DB_NAME = "pitch-poc"
const STORE_NAME = "recordings"
const LAST_RECORDING_ID = "last"

class PitchPocDB extends Dexie {
  recordings!: Dexie.Table<LastSavedRecording, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      [STORE_NAME]: "id",
    })
    this.version(2)
      .stores({
        [STORE_NAME]: "id",
      })
      .upgrade((tx) => tx.table(STORE_NAME).clear())
  }
}

export const db = new PitchPocDB()
export { LAST_RECORDING_ID, STORE_NAME }
