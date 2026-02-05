import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "カラオケ風音程練習アプリ" },
    {
      name: "description",
      content: "音程を練習して採点するカラオケ風アプリ",
    },
  ];
}

export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        カラオケ風音程練習アプリ
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        曲選択・曲設定の後、「練習する」で練習画面へ
      </p>
      {/* Phase 2 で /practice ルート追加予定 */}
    </main>
  );
}
