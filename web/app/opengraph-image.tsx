import { ImageResponse } from "next/og";

export const alt = "Notely — Study at warp speed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px", background: "#060c1c", color: "#f4f6ff", fontFamily: "Arial, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "16px", background: "#8fe8f8", color: "#060c1c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", fontWeight: 800 }}>N</div>
          <span style={{ fontSize: "30px", fontWeight: 700, letterSpacing: "-1px" }}>Notely</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "940px" }}>
          <div style={{ fontSize: "76px", lineHeight: 1.02, fontWeight: 800, letterSpacing: "-4px" }}>Study at warp speed.</div>
          <div style={{ fontSize: "27px", lineHeight: 1.4, color: "#c8d2e9" }}>Write. Practice. Ask.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "18px", color: "#8fe8f8" }}>
          <div style={{ width: "56px", height: "3px", background: "#8fe8f8" }} />
          Notes · Recall · Study planning
        </div>
      </div>
    ),
    { ...size }
  );
}
