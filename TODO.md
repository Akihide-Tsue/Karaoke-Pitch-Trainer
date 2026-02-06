# 実装 TODO（plan.md 準拠）

## Phase 1: 土台

- [x] **1-1** ルーティング: practice, playback ルートを追加（React Router 7）
- [x] **1-2** 状態管理: Jotai で練習状態・再生位置・録音メタデータ等の atoms を定義
- [x] **1-3** UI: MUI の ThemeProvider, CssBaseline を root に配置
- [x] **1-4** 保存: `lib/db.ts` で Dexie IndexedDB を定義
- [x] **1-5** 保存: `lib/storage.ts` で getLastSavedRecording / setLastSavedRecording を実装（IndexedDB 不可時はエラー表示のみ）
- [x] **1-6** サンプル曲: `public/BNM_MIDI.mid`, `public/Brand_New_Music_inst.wav`（オケ）, `public/Brand_New_Music.wav`（歌あり）を確認。lyrics.json は `app/constants/songs/brand-new-music/lyrics.json` に配置済み
- [x] **1-7** 型・ユーティリティ: `lib/melody.ts`（MelodyNote, MelodyData, LyricEntry, getTargetPitchAtTime）
- [x] **1-8** 型・ユーティリティ: `lib/pitch.ts`（frequencyToMidi）
- [x] **1-9** 型・ユーティリティ: `lib/midi.ts`（@tonejs/midi で MIDI パース → MelodyData）
- [x] **1-10** 型・ユーティリティ: `lib/lyrics.ts`（lyrics.json 読み込み → LyricEntry[]）

## Phase 2: ホーム・練習画面（ピッチなし）

- [x] **2-1** ホーム: MUI でレイアウト。曲選択（1 曲固定）・曲設定（任意）。「練習する」で /practice へ遷移
- [x] **2-2** 練習画面の骨組み: 「歌唱開始」で伴奏（オケ WAV）と録音・ピッチ検出を同時開始。**ガイドボーカル切替**ボタンでオケ／歌ありを切り替え
- [x] **2-3** 練習画面: 音程バー（五線譜風簡易描画）、歌詞（再生位置に同期）、時間軸・現在位置の縦線
- [x] **2-4** 練習画面: Jotai で再生位置・曲データを保持

## Phase 3: ピッチ検出・歌唱の音程バー

- [x] **3-1** ピッチ検出: Web Audio API + pitchfinder で 50ms 間隔で MIDI 配列に push、Jotai で pitchData を保持
- [x] **3-2** 歌唱の音程バー: 練習画面にリアルタイム描画、一致で色分け（MUI/Emotion）
- [x] **3-3** 録音: MediaRecorder で歌唱中に録音、歌唱終了時に停止
- [x] **3-4** 停止: 伴奏・録音・ピッチ検出を止め、歌唱終了とする

## Phase 4: 結果表示・保存・再生画面

- [ ] **4-1** 音程一致率: 歌唱終了時に computeScore で算出し、「音程一致率 XX%」＋「保存する？」「保存しない」を表示
- [ ] **4-2** 保存: 「保存する」なら録音 Blob とメタデータ（pitchData, score）を Dexie に保存。「今すぐ再生」を表示
- [ ] **4-3** 再生画面: IndexedDB から直近 1 件を読み込み
- [ ] **4-4** 再生画面（空）: 直近 1 件がないときは「まだ録音がありません」＋「練習する」で誘導
- [ ] **4-5** 再生画面（あり）: 伴奏＋歌声を同時再生、**ガイドボーカル切替**ボタンでオケ／歌ありを切り替え、曲の音程バー＋歌唱の音程バー＋歌詞（同期）＋「練習に戻る」

## Phase 5: 仕上げ（Web のみ）

- [ ] **5-1** エラー処理: alert() でマイク拒否・IndexedDB 不可・保存失敗・メタデータ読み込み失敗・MIDI 読み込み失敗を表示
- [ ] **5-2** エラー処理: マイク拒否時は alert 内に「設定を開く」等の導線を 1 つ
- [ ] **5-3** 動作確認: Safari（特に iOS Safari）でピッチ検出・録音・再生を確認

## 補足

- 本プロジェクトは **React Router 7** を使用（plan の TanStack Router の代わり）
- ルート構造: `/`（ホーム）, `/practice`（練習）, `/playback`（再生）
- サンプル曲: songId = `brand-new-music`, unitId = `unit-1`
- PoC に含めない: Capacitor、iOS Photos 保存、Vitest/Playwright
