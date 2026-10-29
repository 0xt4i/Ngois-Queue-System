import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "180" }];
}

/** Icon PWA vẽ bằng code (không cần file ảnh). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = [180, 192, 512].includes(Number(raw)) ? Number(raw) : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e11d48",
          color: "white",
          fontSize: size * 0.5,
          fontWeight: 800,
        }}
      >
        #
      </div>
    ),
    { width: size, height: size },
  );
}
