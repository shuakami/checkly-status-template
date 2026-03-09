export const siteConfig = {
  locale: "en-US",
  rssLanguage: "en-us",
  brand: {
    siteName: "Acme Status",
    shortName: "Acme",
    description: "A fast status page for your Checkly-monitored services.",
    websiteUrl: "https://example.com",
    logoFile: "logo.svg",
    logoPath: "/logo.svg",
    footerText: "Copyright © Acme. All rights reserved.",
  },
  monitoring: {
    timeZone: "UTC",
    timeZoneLabel: "UTC",
    timeZoneOffsetMinutes: 0,
    clientRefreshSeconds: 60,
    historyLookbackDays: 90,
    dailyOperationalThresholdMinutes: 30,
    degradedHistoryThresholdMinutes: 30,
    outageHistoryThresholdMinutes: 5,
    hiddenExternalLinkKeywords: ["worker", "cdn"],
    hiddenExternalLinkFragments: ["/api/", "/v1"],
    cache: {
      staleSeconds: 300,
      revalidateSeconds: 600,
      expireSeconds: 3600,
    },
  },
  services: {
    fallbackName: "Monitored service",
    nameOverrides: {} as Record<string, string>,
  },
  copy: {
    headlines: {
      operational: {
        title: "We're fully operational",
        body: "We're not aware of any issues affecting our systems.",
      },
      degraded: {
        title: "Degraded Performance",
        body: "We are currently investigating degraded performance affecting part of the platform and working to restore full service.",
      },
      outage: {
        title: "Major Service Outage",
        body: "We are currently investigating an issue affecting one or more services. Updates will be posted here as soon as we confirm more details.",
      },
      maintenance: {
        title: "Scheduled Maintenance",
        body: "We are currently performing scheduled maintenance. Some services may be briefly affected during this window.",
      },
    },
  },
} as const;
