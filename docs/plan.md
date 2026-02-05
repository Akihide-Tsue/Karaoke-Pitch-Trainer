# ネイティブアプリ開発仕様（PoC）— React + Vite + Capacitor 版

カラオケ風音程練習アプリの **React + Vite + ファイルベースルーティング + Capacitor** 版 PoC の、仕様・データ・実装手順を 1 本にまとめたドキュメントです。

**PoC は Web のみ**完成させる。参考: [midikaraoke.app](http://midikaraoke.app/)（曲選択 → 曲設定 → 歌唱開始・一時停止の流れ）。Capacitor・ネイティブビルド・iOS Photos 保存・テストは拡張で対応する。

**実装の前提（AI に任せる際の注意）**  

- 正解メロディは **MIDI ファイルのみ**から得る。  
- **歌詞**は **lyrics.json** から取得する。  
- 練習画面 URL は **/practice のみ**（1 曲固定）。サンプル曲は **BNM_MIDI.mid**（`public/BNM_MIDI.mid`）。  
- **PoC の範囲は Web のみ**。Capacitor・ネイティブビルド・iOS の Photos 保存・テスト（Vitest/Playwright）は PoC に含めない。  
- **音源の責任分け**: **オケ音源**（Brand_New_Music_inst.wav）・**ガイドボーカル音源**（PoC では省略可）・**ガイド用 MIDI**（正解ノートデータのみ）の **3 ファイル**を同時に扱う。MIDI は DTM 用音源で再生する想定のためそのまま再生するとサイン波等になるので、**再生には使わずガイド用のノートデータのみ**使う。  
- **「歌唱開始」ボタン**を押したら**録音も伴奏再生も同時に開始**する。**pitchData の 0ms は「歌唱開始」押下時**とする。  
- **五線譜**: 「五線譜風でよい」**簡易描画**（Canvas/SVG 等）。曲の**最低〜最高ノート**が写っていればよい。調号・拍子は PoC で**省略**。  
- **一時停止**: 一時停止中は**録音も止める**。**停止＝歌唱終了**でよい（停止ボタンで終了し、結果表示へ。再開は PoC で省略可）。  
- **再生画面**: 直近 1 件があるときは**伴奏＋歌声**を鳴らす（録音した歌声に伴奏を重ねて再生）。**直近 1 件がないとき**は**「まだ録音がありません」**を表示し、「練習する」で練習画面へ誘導する。  
- **エラー・UI**: PoC では **alert()** で簡易的に実装してよい（マイク拒否・IndexedDB 不可・保存失敗等）。「設定を開く」導線は alert 内の文言やリンクで 1 つ用意。  
- **IndexedDB が利用できない**場合は保存せず**エラーメッセージを表示するだけ**（alert でよい）。  
- **対象ブラウザ**: PoC は Web。**iOS で Capacitor リリースする前提**のため、**Safari（WebKit）の制約はできるだけ確認したほうがよい**（MP3 再生 / MediaRecorder / ピッチ検出等）。PoC でも Safari（特に iOS Safari）で動作確認を推奨する。

---

## 目次

1. [概要・スコープ](#1-概要スコープ)
2. [参考: midikaraoke.app](#2-参考-midikaraokeapp)
3. [技術スタック](#3-技術スタック)
4. [データ仕様](#4-データ仕様)
5. [画面・フロー](#5-画面フロー)
6. [ピッチ検出・音程一致率](#6-ピッチ検出音程一致率)
7. [実装手順（Phase 1〜5）](#7-実装手順phase-15)
8. [ビルド・実行](#8-ビルド実行)
9. [チェックリスト](#9-チェックリスト)
10. [拡張: 歌唱テクニック検出](#10-拡張歌唱テクニック検出)
11. [拡張: ピッチ変更（キー変更）](#11-拡張ピッチ変更キー変更)
12. [楽曲制作チームとの連携](#12-楽曲制作チームとの連携)

---

## 1. 概要・スコープ

### 1.1 PoC で実装する機能

| # | 機能               | 概要                                                                                                               |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1 | 曲選択             | 曲一覧から 1 曲を選択（PoC では 1 曲固定）。                                                                       |
| 2 | 曲設定・歌唱開始   | 曲の開始位置などを設定。「**歌唱開始**」ボタンで**伴奏再生と録音・ピッチ検出を同時に開始**。midikaraoke.app の「Start Song」に相当。 |
| 3 | カラオケ風 UI      | 曲の音程バー（正解メロディ）と歌唱中の音程バーをリアルタイム表示。**歌詞**を再生位置に同期して表示。必要に応じて**一時停止**。 |
| 4 | 歌唱後の保存選択   | 歌唱終了後、**音程一致率（%）を表示**したうえで「保存する／しない」を選択。                                        |
| 5 | 保存した録音の再生 | 保存後は「今すぐ再生」で再生画面へ。直近 1 件の録音＋**歌唱時の音程バー**＋**歌詞**を再生進行に同期して表示。直近 1 件がないときは**「まだ録音がありません」**を表示し、練習画面へ誘導する。 |

### 1.2 PoC で省くもの

- **ガイド／ボーカル on/off** … PoC では再生は**オケ音源**のみ。**ガイドボーカル音源**は拡張で対応（切り替え UI も拡張で）。
- **保存一覧・削除** … 一覧画面は作らない。保存は**直近 1 件のみ**。保存後に「今すぐ再生」で再生画面へ。

### 1.3 音程一致率のルール

- **50ms 刻み**で、正解ノート（MIDI から得た `MelodyNote[]`）が**ある時刻のみ**カウントする。
- **歌唱開始より前・停止より後の正解ノートは一致率に含めない**。対象は **unitStartMs 〜 unitEndMs** の区間のみ（歌唱開始押下時〜停止時の曲内の区間）。
- 歌唱ピッチと正解ピッチの差が **±1 半音以内**なら一致。一致数／総数で % を算出し、歌唱終了時に表示する。

---

## 2. 参考: midikaraoke.app

参照サイトの主な要素:

- **Select A Song** … 曲を選ぶ。
- **Configure Song** … 曲の設定（開始位置など）。
- **Start Song** … 歌唱開始。
- **Game Paused** … 歌唱中の一時停止。

本 PoC では、ホームで「曲選択（1 曲固定可）→ 曲設定（任意）→ 練習する」の流れとし、練習画面で「伴奏再生・歌唱開始・一時停止」を実装する。Settings・Help は PoC では省いてよい。

---

## 3. 技術スタック

### 3.1 一覧

| 項目             | 技術 |
| ------------------ | ------ |
| フロント         | React 最新バージョン、TypeScript（strict） |
| ビルド           | Vite 5+ |
| パッケージマネージャ | **pnpm** |
| ルーティング     | **TanStack Router**（file-based） |
| 状態管理         | **Jotai** |
| UI ライブラリ    | **MUI**（Material UI） |
| スタイリング     | **CSS-in-JS**（Emotion。MUI 標準のため追加導入不要。Tailwind は使わない） |
| 保存             | **IndexedDB**（**Dexie.js** でラップ）。録音 Blob も IndexedDB に保存可能。Capacitor では WebView の IndexedDB を利用。 |
| ネイティブ配布   | **Capacitor**（iOS / Android）。PoC に含めない（拡張で対応）。 |
| ピッチ検出       | **Web Audio API**（マイク → AudioWorklet / ScriptProcessor）＋ **pitchfinder**（YIN 等） |
| オケ再生         | **オケ音源**（Brand_New_Music_inst.wav）。HTML5 Audio または Tone.js の Player で再生。ガイド用 MIDI はノートデータのみ使用、再生には使わない。HLS は PoC では使わない（単一音声ファイルで十分）。 |
| 録音             | **MediaRecorder API**（Web）。PoC では Web のみ。iOS の Photos 保存は PoC に含めない。 |
| メロディ（正解） | **ガイド用 MIDI**（`@tonejs/midi` でパース → `MelodyNote[]`）。ノートデータのみ。再生には使わない（そのまま再生するとサイン波等になる）。 |
| テスト           | PoC に**含めない**（Vitest・Playwright は拡張で対応）。 |

### 3.2 補足

- **Web で開発**: ブラウザで `pnpm dev` してピッチ検出・再生・録音を確認。マイク権限が必要。
- **目標レイテンシ**: マイク → ピッチ検出 → UI 更新まで **50〜100ms 程度**。
- **メロディ・音程バー**: 正解データは **ガイド用 MIDI**（ノートのみ。再生には使わない）。`@tonejs/midi` でパースし、`MelodyNote[]` に変換。音程バーは**五線譜風の簡易描画**（曲の最低〜最高ノートが写る範囲。調号・拍子は省略）。**歌詞は lyrics.json**、**オケはオケ音源**（Brand_New_Music_inst.wav）を使用する。
- **対象ブラウザ**: PoC は Web。**iOS で Capacitor リリースする前提**のため、**Safari（WebKit）の制約はできるだけ確認**する。PoC でも Safari（特に iOS Safari）で動作確認を推奨。

---

## 4. データ仕様

### 4.1 曲の正解メロディ（ガイド用 MIDI。melody.json は不要）

**正解メロディはガイド用 MIDI ファイル**から得る（ノートデータのみ。再生には使わない）。MIDI は DTM 用音源ライブラリで再生する想定のため、**そのまま再生するとサイン波等**になってしまう。アプリでは**ガイド用**としてノート（音高・開始・終了時刻）のみをパースし、音程バー・一致率に使う。melody.json は使わない。静的アセット（public）に配置。

**音源の責任分け（制作チームと合わせる）**  
曲ごとに **オケ音源**・**ガイドボーカル音源**・**ガイド用 MIDI** の 3 ファイルを同時に扱うのが適切。PoC ではオケ音源＋ガイド用 MIDI＋lyrics.json を使用し、ガイドボーカル音源は拡張で対応する。

**ガイド用 MIDI の中身（楽曲制作チーム・実装者向け）**

| 内容 | 入っている？ | 説明 |
|------|----------------|------|
| **歌詞** | アプリでは使わない | **歌詞は lyrics.json から取得**する。MIDI に Lyrics が含まれていても使わない。形式は `{ time: 秒, lyric }[]`。アプリでは **LyricEntry[]** に変換し**再生位置に同期して表示**する。 |
| **ボーカル（メロディ）の音程・開始/終了時間** | ○ | ボーカルは**音声ではなくノート（音高＋開始・終了時刻）**として格納される。各ノートは「何の音（pitch）を、いつからいつまで鳴らすか」の情報。アプリではこれを **MelodyNote[]**（startMs, endMs, pitch）に変換し、**音程バー描画・一致率算出**に使う。 |
| **オケ** | アプリでは使わない | **オケ音源**（Brand_New_Music_inst.wav）を別ファイルで用意する。ガイド用 MIDI に伴奏トラックが含まれていても再生には使わない。 |

まとめ: **ガイド用 MIDI** には**メロディのノート（音程＋時間）**のみ使う。再生には使わない（そのまま再生するとサイン波等になる）。アプリはノートで正解を表示・採点する。**歌詞は lyrics.json**、**オケはオケ音源（Brand_New_Music_inst.wav）**で別提供。ガイドボーカルを鳴らす場合は**ガイドボーカル音源**を別ファイルで用意する（PoC では省略可）。

**実装の流れ（一意に決める）**  

1. MIDI を `public/songs/<songId>/BNM_MIDI.mid` 等から読み込む  
2. `@tonejs/midi` でパースし、メロディトラックのノートを **MelodyData**（**MelodyNote[]**）に変換する  
3. 歌詞は **lyrics.json**（`app/constants/songs/<songId>/lyrics.json`、形式は `{ time, lyric }[]`、time は秒）から取得し、**LyricEntry[]**（timeMs, text）に変換する  
4. 音程バー描画・一致率算出に MelodyNote[] を、**歌詞表示**に LyricEntry[] を使う。**オケ**は **Brand_New_Music_inst.wav** を HTML5 Audio または Tone.js の Player で再生する  

- **ガイド用 MIDI の配置**: **サンプル曲は BNM_MIDI.mid** を `public/BNM_MIDI.mid` に置く。時刻は tick を BPM でミリ秒に変換。**メロディのノートのみ**使用。歌詞・伴奏トラックはパースしても使わない。**再生には使わない**（ノートデータのみ）。
- **オケ音源**: **Brand_New_Music_inst.wav** を `public/Brand_New_Music_inst.wav` に配置。HTML5 Audio または Tone.Player で再生する。
- **ガイドボーカル音源**: 拡張で「正解の歌を聴く」用に別ファイル（例: guide_vocal.mp3）を用意する。PoC では省略し、再生はオケのみ。

**型定義（MIDI パース結果を格納する型。melody.json は用意しない）**:

```ts
interface MelodyNote {
  startMs: number;
  endMs: number;
  pitch: number;
  frequency?: number;
  noteName?: string;
}
interface MelodyData {
  songId: string;
  totalDurationMs: number;
  trackName?: string;
  notes: MelodyNote[];
  lyrics?: LyricEntry[];  // 歌詞（lyrics.json から取得）。PoC で表示する
}
interface LyricEntry {
  timeMs: number;   // 曲内の表示開始時刻（ms）
  text: string;     // 表示する歌詞（1 フレーズや 1 行など）
}
```

**歌詞（lyrics.json）**  
歌詞は **lyrics.json のみ**から取得する。MIDI に Lyrics が含まれていても使わない。形式は「秒単位の `time` ＋ `lyric`」の配列とする。アプリでは読み込み時に `LyricEntry[]` へ変換する（`timeMs = time * 1000`, `text = lyric`）。`lyric` が空文字の行は「表示をクリアする」またはスキップしてよい。

- **JSON の場所**: `app/constants/songs/<songId>/lyrics.json`。曲ごとに 1 ファイル。constants フォルダに格納する。
- **JSON の型（外部フォーマット）**: `{ time: number; lyric: string }[]`（`time` は曲頭からの秒、小数点可）。
- **変換例**:

```ts
// lyrics.json の 1 要素 → LyricEntry
{ time: 16.6, lyric: "朝焼けの街に置いてかれて" }  →  { timeMs: 16600, text: "朝焼けの街に置いてかれて" }
```

- 歌詞が無い曲では lyrics.json を用意せず、アプリ側で歌詞表示を非表示とする。

Unit 区間で使うときは `note.startMs < unitEndMs && note.endMs > unitStartMs` でフィルタする。歌詞は `timeMs` が現在再生位置に達したら表示し、次の歌詞に切り替える（または一定時間表示して消す等、簡易でよい）。

### 4.2 保存録音（直近 1 件）

- **保存先**: **IndexedDB**（Dexie.js でラップ）。**IndexedDB が利用できない環境**（プライベートモード等）では保存は行わず、**エラーメッセージを表示するだけ**とする。
- **音声**: 録音 Blob を IndexedDB にそのまま保存するか、`audioPath` に Data URL を格納。
- **メタデータ**: IndexedDB の 1 テーブル（例: `lastSavedRecording`）に 1 件だけ保持。保存のたびに上書き。

```ts
interface LastSavedRecording {
  songId: string;
  unitId: string;
  unitStartMs: number;  // 歌唱開始押下時の曲内の再生位置（ms）
  unitEndMs: number;    // 停止した瞬間の曲内の再生位置（ms）
  audioPath: string;    // Data URL、または IndexedDB 内 Blob 参照
  pitchData: number[];
  intervalMs: number;   // 50
  score?: number | null;
}
```

- **pitchData**: 練習画面で 50ms ごとに push した配列。「歌唱開始」押下を 0ms とするので、pitchData[0] は押下直後、pitchData[i] は押下から i×50ms のピッチ。
- **unitStartMs**: 曲内で「歌唱開始」を押した瞬間の**伴奏の再生位置（ms）**。再生画面で**伴奏＋歌声**を鳴らすとき、伴奏はこの位置から再生し、歌声は 0ms から再生する。
- **unitEndMs**: **停止した瞬間の曲内の再生位置（ms）**として保存する。一致率は unitStartMs 〜 unitEndMs の区間のみで計算し、再生画面でもこの区間を対象とする。
- **再生時の歌唱ピッチ表示**: 再生経過を `playbackTimeMs`（歌声の 0ms 起点）とすると、`pitchData[Math.floor(playbackTimeMs / intervalMs)]` で表示する。伴奏は unitStartMs から再生しているので、曲の音程バーは `unitStartMs + playbackTimeMs` の位置の正解を表示する。
- **Dexie**: 例として `recordings` テーブルに `id: 'last'` で 1 件だけ put。または専用ストア名 `lastSavedRecording` で 1 件のみ管理。

### 4.3 録音フォーマット

- **PoC（Web のみ）**: ブラウザの MediaRecorder は主に **WebM** を出力。アプリ内の再生・IndexedDB 保存は WebM のままでよい。
- **拡張**: iOS で Photos に保存する機能は PoC に含めない。将来は MP4（音声トラック付き）で出力し、Capacitor の共有 API で Photos に保存する。

### 4.4 定数・キー（PoC）

- **IndexedDB**: Dexie のストア名（例: `recordings`）およびキー（例: `'last'`）、またはストア名 `lastSavedRecording`。
- **録音ファイル名**（PoC では IndexedDB に Blob 保存のため不要。Filesystem は拡張で使用）: Web は `last_recording.webm`。
- **ピッチ間隔**: `PITCH_INTERVAL_MS = 50`
- **曲・Unit（PoC 固定）**: サンプル曲は **BNM_MIDI.mid** のみ。`songId = 'brand-new-music'`, `unitId = 'unit-1'`。MIDI は `public/BNM_MIDI.mid`、**lyrics.json** は `app/constants/lyrics.json`、オケ音源は **Brand_New_Music_inst.wav** を `public/Brand_New_Music_inst.wav` に配置。**unitStartMs** は「歌唱開始」押下時の曲内の再生位置（ms）、**unitEndMs** は停止した瞬間の曲内の再生位置（ms）を保存する（曲全体なら unitEndMs = totalDurationMs、途中停止時はその時点の再生位置）。melody.json は不要。歌詞は MIDI には不要（lyrics.json のみ）。

### 4.5 拡張: 歌唱区間（セグメント）— フル曲の一部だけ歌唱

**MIDI をフルコーラス（曲全体）で受け取り、必要な秒数ぶんの区間だけユーザーに歌唱させることは可能**である。既存の unitStartMs / unitEndMs の考え方の延長で実現できる。

- **受け取り**: MIDI は 1 ファイルで曲全体（フルコーラス）を渡す。`@tonejs/midi` でパースすると、メロディの全ノートが曲頭からの時刻（ms）で得られる。歌詞は lyrics.json、伴奏は MP3 で別途用意する。
- **区間の指定**: 歌唱させる区間を **segmentStartMs** 〜 **segmentEndMs**（例: 0〜30 秒、またはサビの 60〜90 秒）で指定する。必要な秒数ぶんのデータが MIDI に含まれていればよい。
- **利用方法**:
  - **メロディ・歌詞**: パース済みの MelodyNote[] / LyricEntry[] を `segmentStartMs <= timeMs < segmentEndMs` でフィルタし、その区間だけ音程バー・歌詞表示・一致率算出に使う。
  - **伴奏**: カラオケ音源 MP3 を segmentStartMs から再生開始し、segmentEndMs で停止する（HTML5 Audio の currentTime や Tone.Player の start でシーク）。
  - **録音・採点**: 「歌唱開始」＝区間の開始なので、unitStartMs = segmentStartMs、unitEndMs = ユーザーが停止した時点の曲内位置（最大 segmentEndMs）として既存の保存・一致率ロジックをそのまま使える。
- **UI**: 練習画面では区間内のノート・歌詞だけ表示する。曲設定やホームで「何秒〜何秒を歌うか」「サビだけ」等の選択を用意する拡張が考えられる。

PoC では 1 曲を曲頭から歌唱する想定だが、拡張で「フル MIDI ＋ 区間指定」にすれば、フルコーラス配布のまま一部だけ歌唱させる運用が可能になる。

---

## 5. 画面・フロー

### 5.0 ルーティング（PoC）

- **練習画面 URL**: **/practice のみ**（1 曲固定）。曲 ID・区間は URL に含めない。
- **再生画面**: `/playback` 等。ホームは `/`。直近 1 件がないときは**「まだ録音がありません」**を表示し、「練習する」で練習画面へ誘導する（[5.4](#54-再生画面の-ui) 参照）。

### 5.1 画面一覧

| 画面         | 役割                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ホーム**   | 曲選択（1 曲固定可）・曲設定（任意）。「練習する」で練習画面へ。midikaraoke.app の Select A Song / Configure Song に相当。                                                |
| **練習画面** | 伴奏再生・歌唱開始・**一時停止**。曲の音程バー＋歌唱の音程バー＋**歌詞**（再生位置に同期）をリアルタイム表示。歌唱終了で**音程一致率**を表示し、「保存する／しない」→ 保存時は「今すぐ再生」を表示。 |
| **再生画面** | 直近 1 件があれば**伴奏＋歌声**で再生。曲の音程バー＋歌唱時の音程バー＋**歌詞**を再生位置に同期表示。「練習に戻る」で練習画面へ。直近 1 件がないときは**「まだ録音がありません」**を表示し、練習画面へ誘導（[5.4](#54-再生画面の-ui)）。 |

### 5.2 フロー図

```
[ホーム] → 曲選択・曲設定（任意）→ 「練習する」→ [練習画面]
    → 「歌唱開始」ボタンで **伴奏再生と録音・ピッチ検出を同時に開始**（pitchData の 0ms はこの押下時）
    → 一時停止（または停止）で **録音も止め、歌唱終了**（停止＝終了。再開は PoC で省略可）
    → 音程一致率（%）を算出・表示
    → 「保存する？」→「保存しない」なら練習画面のまま
    → 「保存する」→ 録音＋メタデータを直近 1 件として保存 → 「今すぐ再生」表示
    → 「今すぐ再生」タップ → [再生画面]
    → 直近 1 件の**伴奏＋歌声**再生 ＋ 曲・歌唱の音程バー＋歌詞表示（直近 1 件がないときは [5.4](#54-再生画面の-ui) の空状態表示）
    → 「練習に戻る」→ [練習画面]
```

### 5.3 練習画面の UI

- **「歌唱開始」ボタン**: 押下で**伴奏再生（カラオケ MP3）と録音・ピッチ検出を同時に開始**。**pitchData の 0ms はこの押下時**。**停止**ボタンで録音・伴奏を止め、歌唱終了（停止＝終了）。
- **音程バー**: ピッチ（MIDI）を**五線譜風に簡易描画**。曲の**最低〜最高ノート**が写る範囲。調号・拍子は省略。曲（MIDI から得た notes）＋ 歌唱（50ms 刻み MIDI 配列）。一致なら緑・不一致ならグレー等。
- **歌詞**: **lyrics.json** から取得した歌詞を**再生位置に同期して表示**する。現在の再生位置に対応する歌詞を 1 行（または数行）表示。歌詞が無い曲（lyrics.json が無い）では非表示でよい。
- 現在位置の縦線（再生経過に合わせて移動）
- 歌唱終了後: 「音程一致率 XX%」＋「保存する」「保存しない」＋（保存した場合）「今すぐ再生」

### 5.4 再生画面の UI

- **直近 1 件がないとき**: **「まだ録音がありません」**を表示し、**「練習する」**ボタン等で練習画面へ誘導する。リダイレクトせず、画面内でメッセージ＋誘導でよい。
- **直近 1 件があるとき**: **伴奏＋歌声**を同時に再生（カラオケ MP3 で伴奏、録音した歌声を重ねて再生）。再生／一時停止。曲の音程バー＋歌唱の音程バー＋**歌詞**（再生位置に同期）＋現在位置の縦線。「練習に戻る」
- 歌唱ピッチ: `index = Math.floor(playbackTimeMs / intervalMs)` → `pitchData[index]` を表示（歌声の 0ms 起点）。曲の音程バーは unitStartMs + playbackTimeMs の位置の正解を表示。
- 歌詞: 曲の再生位置（unitStartMs + playbackTimeMs）に対応する **LyricEntry** を表示。**lyrics.json** から取得した歌詞を使う。

---

## 6. ピッチ検出・音程一致率

### 6.1 パイプライン（Web）

1. **Web Audio API** でマイク → **AudioWorklet**（または ScriptProcessor）→ PCM。コールバック間隔を約 50ms に。
2. **pitchfinder**（YIN 等）で PCM → 周波数（Hz）。
3. **Hz → MIDI**: `12 * Math.log2(frequency / 440) + 69`。50ms 間隔で 1 件ずつ配列に push。
4. コールバックが 50ms より細かい場合は「最後に push した時刻」を覚え、50ms 以上経過したときだけ push する。

### 6.2 正解ピッチの取得

```ts
function getTargetPitchAtTime(notes: MelodyNote[], timeMs: number): number | null {
  const note = notes.find((n) => timeMs >= n.startMs && timeMs < n.endMs);
  return note ? note.pitch : null;
}
```

### 6.3 一致判定・音程一致率（%）

- **対象区間**: **unitStartMs 〜 unitEndMs**（歌唱開始押下時〜停止時の曲内の再生位置）のみ。**歌唱開始より前・停止より後の正解ノートは一致率に含めない**。
- 一致: `targetPitch !== null` かつ `Math.abs(userPitch - targetPitch) <= 1`（±1 半音）。
- 音程一致率: 上記区間内で 50ms 刻みに「正解ノートがある時刻」のみカウントし、そのうち一致した割合（%）を算出。

```ts
function computeScore(
  recordedPitches: number[],
  unitNotes: MelodyNote[],
  unitStartMs: number,
  unitEndMs: number,
  intervalMs: number
): number {
  let matchCount = 0, totalCount = 0;
  for (let i = 0; i < recordedPitches.length; i++) {
    const timeMs = unitStartMs + i * intervalMs;
    if (timeMs >= unitEndMs) break;
    const targetPitch = getTargetPitchAtTime(unitNotes, timeMs);
    if (targetPitch === null) continue;
    totalCount++;
    if (Math.abs(recordedPitches[i] - targetPitch) <= 1) matchCount++;
  }
  return totalCount > 0 ? Math.round((matchCount / totalCount) * 100) : 0;
}
```

---

## 7. 実装手順（Phase 1〜5）

### Phase 1: 土台

1. **プロジェクト作成**: `pnpm create vite@latest <名前> --template react-ts`
2. **パッケージ**: `pnpm add pitchfinder jotai dexie @mui/material @emotion/react @emotion/styled @tonejs/midi`、`pnpm add -D @biomejs/biome`。**伴奏はカラオケ音源の WAV** を HTML5 Audio または Tone.js の Player で再生（`tone` は再生に使う場合のみ追加）。Lint/フォーマットに **Biome** を使用。テスト（Vitest/Playwright）は PoC に含めない。Web Audio API は標準で利用。
3. **ルーティング**: **TanStack Router** の file-based を導入（`@tanstack/router-vite-plugin` で `src/routes/` をルートに）。
4. **状態管理**: **Jotai** で練習状態・再生位置・録音メタデータ等を管理。
5. **UI**: **MUI**（ThemeProvider, CssBaseline）と必要コンポーネントを配置。
6. **保存**: **Dexie.js** で IndexedDB をラップ。`lib/db.ts` で DB 定義、`lib/storage.ts` で getLastSavedRecording / setLastSavedRecording を実装。**IndexedDB 不可時は保存せずエラー表示のみ**。
7. **サンプル曲**: **BNM_MIDI.mid** を `public/BNM_MIDI.mid`、**Brand_New_Music_inst.wav** を `public/Brand_New_Music_inst.wav` に配置。**lyrics.json** は `app/constants/lyrics.json` に配置（constants フォルダに格納）。`lib/midi.ts` で MIDI をパースし `MelodyData`（MelodyNote[]）に変換する。歌詞は **lyrics.json** から import または読み込みで **LyricEntry[]** に変換する。**オケ**は Brand_New_Music_inst.wav を HTML5 Audio または Tone.Player で再生する。
8. **型・ユーティリティ**: `lib/melody.ts`（MelodyNote, MelodyData, LyricEntry, getTargetPitchAtTime）、`lib/pitch.ts`（frequencyToMidi）、`lib/midi.ts`（MIDI パース → MelodyData）、`lib/lyrics.ts` 等（lyrics.json 読み込み → LyricEntry[]）。

### Phase 2: ホーム・練習画面（ピッチなし）

1. **ホーム**: MUI でレイアウト。曲選択（1 曲固定可）・曲設定（任意）。「練習する」で TanStack Router の練習画面へ遷移。
2. **練習画面の骨組み**: **「歌唱開始」で伴奏（カラオケ MP3）と録音・ピッチ検出を同時開始**（pitchData の 0ms は歌唱開始押下時）。音程バーは**五線譜風の簡易描画**（曲の最低〜最高ノートが写る範囲。調号・拍子は省略）。**歌詞**を **lyrics.json** から読み込み、再生位置に同期して表示。Unit 区間の曲の音程バー、時間軸・現在位置の縦線。Jotai で再生位置・曲データを保持。

### Phase 3: ピッチ検出・歌唱の音程バー

1. **ピッチ検出**: Web Audio API + pitchfinder で 50ms 間隔で MIDI 配列に push。Jotai で pitchData を保持。
2. **歌唱の音程バー**を練習画面に追加（リアルタイム描画、一致で色分け。MUI または Emotion でスタイル）。
3. **録音**: MediaRecorder で歌唱中に録音し、歌唱終了時に停止。
4. **停止**: 伴奏・録音・ピッチ検出を止め、**歌唱終了**とする（停止＝終了。一時停止中は録音も止める。再開は PoC で省略可）。

### Phase 4: 結果表示・保存・再生画面

1. **音程一致率**: 歌唱終了時に `computeScore` で算出し、「音程一致率 XX%」＋「保存する？」「保存しない」を表示（MUI のダイアログやボタン利用可）。
2. **保存**: 「保存する」なら録音 Blob とメタデータ（pitchData, score 含む）を **Dexie（IndexedDB）** に保存（直近 1 件で上書き）。「今すぐ再生」を表示。
3. **再生画面**: IndexedDB から直近 1 件を読み込む。**直近 1 件がない**ときは**「まだ録音がありません」**を表示し、**「練習する」**で練習画面へ誘導。あるときは**伴奏（カラオケ MP3）＋歌声**を同時に再生し、曲の音程バー＋歌唱の音程バー＋**歌詞**（再生位置に同期）＋「練習に戻る」を表示する。

### Phase 5: 仕上げ（Web のみ）

1. **エラー処理**: PoC では **alert()** で簡易的に実装。マイク拒否・IndexedDB 不可・保存失敗・メタデータ読み込み失敗・MIDI 読み込み失敗は **alert** でメッセージを表示。マイク拒否時は alert 内に「設定を開く」などの導線を 1 つ書く（リンクや文言で誘導）。

**PoC に含めない（拡張で対応）**: Capacitor 導入、iOS で Photos に保存、Vitest・Playwright によるテスト。PoC は **Web のみ**完成させる。

### 推奨ディレクトリ構造（Vite + TanStack Router + Jotai + MUI + Dexie）

```
<プロジェクト名>/
├── src/
│   ├── routes/                    # TanStack Router file-based
│   │   ├── __root.tsx
│   │   ├── index.tsx              # ホーム
│   │   ├── practice.tsx            # 練習画面
│   │   └── playback.tsx            # 再生画面
│   ├── components/
│   │   └── PitchBarCanvas.tsx
│   ├── hooks/
│   │   ├── usePitchDetection.ts
│   │   └── useRecording.ts
│   ├── lib/
│   │   ├── db.ts                    # Dexie IndexedDB 定義
│   │   ├── melody.ts
│   │   ├── midi.ts                  # MIDI パース（@tonejs/midi）→ MelodyData
│   │   ├── pitch.ts
│   │   └── storage.ts               # getLastSavedRecording, setLastSavedRecording（Dexie 利用）
│   ├── stores/                     # Jotai atoms（任意）
│   ├── theme.ts                    # MUI createTheme（任意）
│   ├── App.tsx
│   └── main.tsx
├── app/
│   ├── constants/
│   │           └── lyrics.json     # 歌詞（time: 秒, lyric の配列）。constants に格納
│   └── ...
├── public/
│           ├── BNM_MIDI.mid        # サンプル曲 MIDI（メロディ用。歌詞・伴奏トラックは使わない）
│           └── Brand_New_Music_inst.wav  # オケ音源
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 8. ビルド・実行

### Web 開発

```bash
pnpm install
pnpm dev
```

ブラウザで開き、マイク権限を許可してピッチ検出・録音・再生を確認。

### Capacitor ネイティブビルド（拡張。PoC に含めない）

```bash
pnpm build
npx cap sync
npx cap open ios    # または android
```

Xcode / Android Studio で実機またはシミュレータにインストールして確認。PoC では Web のみ完成させる。

### 本番ビルド（Web）

```bash
pnpm build
```

`dist/` を任意のホストにデプロイ。

---

## 9. チェックリスト

- [ ] Node.js 18+、**pnpm** が使える
- [ ] Vite + React (TS) でプロジェクト作成済み
- [ ] **TanStack Router**（file-based）を導入済み
- [ ] **Jotai** で状態管理を導入済み
- [ ] **MUI**（ThemeProvider, 必要コンポーネント）を導入済み
- [ ] **Dexie.js** で IndexedDB を導入し、直近 1 件の保存・読み込みが動作する
- [ ] pitchfinder、Web Audio API でピッチ検出を実装済み
- [ ] **サンプル曲** BNM_MIDI.mid を `public/BNM_MIDI.mid`、**Brand_New_Music_inst.wav** を `public/Brand_New_Music_inst.wav`、**lyrics.json** を `app/constants/lyrics.json` に配置済み（オケ音源で再生。MIDI の伴奏トラックは使わない）
- [ ] **「歌唱開始」**で伴奏再生と録音・ピッチ検出が同時に開始する
- [ ] 音程バーが**五線譜**で表示される
- [ ] **pitchData の 0ms** が「歌唱開始」押下時になっている
- [ ] **停止**で録音も止まり、歌唱終了として結果表示される
- [ ] **再生画面**で**伴奏＋歌声**が同時に鳴る（直近 1 件があるとき）
- [ ] **直近 1 件がない**ときに再生画面へ行くと**「まだ録音がありません」**が表示され、「練習する」等で練習画面へ誘導できる
- [ ] **五線譜**は簡易描画で、曲の最低〜最高ノートが写る（調号・拍子は省略）
- [ ] **歌詞**が **lyrics.json** から取得され、**再生位置に同期して**練習画面・再生画面に表示される（歌詞が無い曲では非表示でよい）
- [ ] **エラー**は PoC では **alert()** で簡易表示（マイク拒否時は「設定を開く」等の導線を 1 つ）
- [ ] **IndexedDB 不可**時は保存せず alert でエラー表示
- [ ] Web で `pnpm dev` からマイク・再生・録音・保存・再生画面まで確認済み。**iOS / Capacitor リリース前提**のため **Safari（特に iOS Safari）でできるだけ確認**する
- [ ] （拡張）Capacitor・iOS Photos 保存・Vitest/Playwright は PoC に含めない

---

## 10. 拡張: 歌唱テクニック検出

PoC 完了後、**しゃくり・ornament（こぶし）・ビブラート・フォール**などを検出して表示・採点に使う機能を追加できる。いずれも**既に蓄積している 50ms 刻みのピッチ配列（pitchData）**から算出可能。

- **ビブラート**: 持続音でピッチが周期的に上下（4〜7 Hz 程度）。自己相関や極大・極小の間隔で判定。
- **しゃくり**: ノート立ち上がりで低い音から滑らかに正解へ。開始 100〜200ms が正解より低く単調増加ならしゃくりとみなす。
- **ornament（こぶし）**: 短い窓（100〜300ms）でピッチが局所的に「上がり→下がり」等。ゼロ交差や極値で検出。
- **フォール**: ノート終了付近でピッチが単調減少。

実装時は、歌唱終了時に `pitchData` と **MIDI から得た MelodyNote[]** のノート区間でノート単位に切り出し、上記パターンで判定。必要なら `LastSavedRecording` に `techniques?: { vibrato?: number; scoop?: number; ornament?: number; fall?: number }` を追加して保存・表示する。

---

## 11. 拡張: ピッチ変更（キー変更）

PoC では含めないが、将来的に**ピッチ変更**（オケ音源などを±N半音でシフトし、歌手の声域に合わせる）が必要になった場合を想定。**テンポ維持でピッチのみ変更**できるため、**SoundTouch (WebAssembly)** を採用する。

- **ライブラリ**: `soundtouch-js` または `soundtouch-wasm` を検討。
- **実行環境**: ブラウザ / Capacitor 上で動作可能。
- **機能**: MP3 等をデコードして PCM にし、SoundTouch で**テンポを変えずにピッチのみ変更**（キー変更 UI 例: ±2 半音と連携）。

---

## 12. 楽曲制作チームとの連携

アプリは **ガイド用 MIDI**（ノートデータのみ。再生には使わない）、**lyrics.json**（歌詞）、**オケ音源**（Brand_New_Music_inst.wav）を扱う。**ガイドボーカル音源**は拡張で対応（PoC では省略可）。  
MIDI は DTM 用音源で再生する想定のためそのまま再生するとサイン波等になるので、**オケ音源・ガイドボーカル音源・ガイド用 MIDI の 3 ファイルを同時に扱う**責任分けが適切。以下を制作チームに依頼・確認する。

### 12.1 依頼・質問のまとめ

| 種別 | 内容 |
|------|------|
| **ガイド用 MIDI で必要なもの** | メロディ用トラック 1 本（各ノート: 音高・開始・終了時刻）。**再生には使わない**（ノートデータのみ。そのまま再生するとサイン波等になる）。複数トラック時は識別ルールを決める（例: 1 本目／トラック名 "Vocal" や "Melody"）。BPM（固定なら値、可変ならテンポトラックの仕様を共有）。 |
| **別提供するもの** | **オケ音源** → Brand_New_Music_inst.wav（曲頭 0 秒がガイド用 MIDI と一致）。**歌詞** → lyrics.json（`{ time: 秒, lyric }[]`）。**ガイドボーカル音源** → 拡張で「正解の歌を聴く」用（PoC では省略可）。MIDI の Lyrics・伴奏トラックは使わない。 |
| **確認したいこと** | BPM は曲中で変わるか？ メロディに和音がある場合の正解ピッチの扱い（一番高い音／無視 等）？ オケ音源とガイド用 MIDI の曲頭 0ms は一致しているか？ |

### 12.2 命名規則

| 項目 | ルール |
|------|--------|
| フォルダ（音源・MIDI） | `public/songs/<songId>/`（songId は kebab-case。例: `brand-new-music`） |
| フォルダ（歌詞） | `app/constants/songs/<songId>/`。lyrics.json は constants に格納する。 |
| ガイド用 MIDI | 1 曲 1 ファイル。例: `BNM_MIDI.mid` または `<songId>.mid`。ノートデータのみ使用、再生には使わない。 |
| オケ音源 | `Brand_New_Music_inst.wav`。曲頭がガイド用 MIDI と一致。 |
| ガイドボーカル音源 | 拡張で使用（例: `guide_vocal.mp3`）。PoC では省略可。 |
| 歌詞 | `app/constants/songs/<songId>/lyrics.json`（`{ time: number; lyric: string }[]`）。`time` は曲頭からの秒。歌詞が無い曲は用意しない。 |
| メロディ識別 | ガイド用 MIDI 内でトラック名 "Vocal"／"Melody" または 1 本目＝メロディ。 |

### 12.3 アプリ側で使う情報

- **メロディ**: ガイド用 MIDI の指定トラックのノート → `startMs`, `endMs`, `pitch`。tick→ms は BPM で変換。音程バー・一致率に使用。**再生には使わない**。
- **歌詞**: lyrics.json → `LyricEntry[]`。再生位置に同期表示。
- **オケ**: Brand_New_Music_inst.wav（オケ音源）を再生。歌唱開始位置（unitStartMs）からシーク。
- **ガイドボーカル**: 拡張で別音源（例: guide_vocal.mp3）を再生。PoC では省略。
- **曲長**: ガイド用 MIDI の `totalDurationMs`。オケ音源の長さは曲長と一致の想定。

---

この 1 ファイルで、React + Vite + ファイルベースルーティング + Capacitor 版 PoC の仕様・データ・実装手順を一通り参照できます。midikaraoke.app を参考に「曲選択 → 曲設定 → 歌唱開始・一時停止」の流れを入れつつ、音程一致率・保存・再生は従来仕様を維持しています。PoC 後に保存一覧・ガイド／ボーカル on/off や**歌唱テクニック検出**を追加する場合は、本ドキュメントの該当節を拡張してタスクに落とし込んでください。
