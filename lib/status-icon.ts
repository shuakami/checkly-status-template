import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { SystemStatus } from "@/lib/status-page-types";

const CANVAS_SIZE = 64;
const AVATAR_SIZE = 48;
const AVATAR_OFFSET = 8;

function getBadgeStyles(status: SystemStatus) {
  if (status === "outage") {
    return {
      color: "#ef4444",
      icon: '<path d="M12 7v6" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17" r="1.6" fill="#ffffff"/>',
    };
  }

  if (status === "degraded" || status === "maintenance") {
    return {
      color: "#f59e0b",
      icon: '<path d="M12 4.5 20 19H4L12 4.5Z" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.2v4.6" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2" fill="#ffffff"/>',
    };
  }

  return {
    color: "#1fa382",
    icon: '<path d="m6.7 12.4 3.2 3.3 7.5-7.8" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
  };
}

function createCircularMask(size: number) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/></svg>`,
  );
}

function createBadgeSvg(status: SystemStatus) {
  const badge = getBadgeStyles(status);

  return Buffer.from(
    `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="48" r="10" fill="#ffffff"/>
      <circle cx="16" cy="48" r="8" fill="${badge.color}"/>
      <g transform="translate(4 36)">${badge.icon}</g>
    </svg>`,
  );
}

function createAvatarRingSvg() {
  return Buffer.from(
    `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="25" fill="#ffffff"/>
    </svg>`,
  );
}

export async function buildStatusIconBuffer(
  logoPath: string,
  status: SystemStatus,
) {
  const logoBuffer = await readFile(logoPath);
  const avatarBuffer = await sharp(logoBuffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .composite([
      {
        input: createCircularMask(AVATAR_SIZE),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    },
  })
    .composite([
      {
        input: createAvatarRingSvg(),
      },
      {
        input: avatarBuffer,
        left: AVATAR_OFFSET,
        top: AVATAR_OFFSET,
      },
      {
        input: createBadgeSvg(status),
      },
    ])
    .png()
    .toBuffer();
}
