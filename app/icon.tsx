import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getStatusPageDataSafe } from "@/lib/checkly";
import { siteConfig } from "@/lib/site-config";
import type { SystemStatus } from "@/lib/status-page-types";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";
export const revalidate = 300;

let logoDataUriPromise: Promise<string> | null = null;

function getLogoMimeType(fileName: string) {
  if (fileName.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "image/png";
}

function getBadgeConfig(status: SystemStatus) {
  if (status === "outage") {
    return {
      color: "#ef4444",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path
            d="M12 7v6"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17" r="1.6" fill="#ffffff" />
        </svg>
      ),
    };
  }

  if (status === "degraded" || status === "maintenance") {
    return {
      color: "#f59e0b",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24">
          <path
            d="M12 4.5 20 19H4L12 4.5Z"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M12 9.2v4.6"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17.2" r="1.2" fill="#ffffff" />
        </svg>
      ),
    };
  }

  return {
    color: "#1fa382",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24">
        <path
          d="m6.7 12.4 3.2 3.3 7.5-7.8"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  };
}

async function getLogoDataUri() {
  if (!logoDataUriPromise) {
    const logoFile = siteConfig.brand.logoFile;
    const mimeType = getLogoMimeType(logoFile);

    logoDataUriPromise = readFile(join(process.cwd(), "public", logoFile)).then(
      (buffer) => `data:${mimeType};base64,${buffer.toString("base64")}`,
    );
  }

  return logoDataUriPromise;
}

export default async function Icon() {
  await connection();
  const data = await getStatusPageDataSafe();
  const status: SystemStatus = data.systemStatus;

  const badge = getBadgeConfig(status);
  const logoDataUri = await getLogoDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <img
          src={logoDataUri}
          alt={siteConfig.brand.shortName}
          width="48"
          height="48"
          style={{
            width: "48px",
            height: "48px",
            objectFit: "contain",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "6px",
            bottom: "6px",
            width: "20px",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "9999px",
            background: "#ffffff",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.25)",
          }}
        >
          <div
            style={{
              width: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "9999px",
              background: badge.color,
            }}
          >
            {badge.icon}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
