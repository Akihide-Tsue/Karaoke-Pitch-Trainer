import { db, LAST_RECORDING_ID, type LastSavedRecording } from "~/lib/db"

const isIndexedDBAvailable = (): boolean => {
  try {
    return typeof indexedDB !== "undefined"
  } catch {
    return false
  }
}

/**
 * 直近 1 件の録音を取得
 * IndexedDB 不可時は null を返す（呼び出し側でエラー表示）
 */
export const getLastSavedRecording = async (): Promise<LastSavedRecording | null> => {
  if (!isIndexedDBAvailable()) return null
  try {
    const record = await db.recordings.get(LAST_RECORDING_ID)
    return record ?? null
  } catch {
    return null
  }
}

/**
 * 直近 1 件の録音を保存（上書き）
 * IndexedDB 不可時は false を返す（呼び出し側でエラー表示）
 */
export const setLastSavedRecording = async (
  data: Omit<LastSavedRecording, "id">,
): Promise<boolean> => {
  if (!isIndexedDBAvailable()) return false
  try {
    await db.recordings.put({
      ...data,
      id: LAST_RECORDING_ID,
    })
    return true
  } catch {
    return false
  }
}
