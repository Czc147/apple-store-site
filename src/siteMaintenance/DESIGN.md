# Site maintenance contract

```json
{
  "schemaVersion": 1,
  "name": "siteMaintenance",
  "intent": "Temporarily close Zorvin storefront while preserving administrator access; show estimated maintenance completion without promising automatic reopening.",
  "useCases": ["scheduled maintenance", "manual temporary closure", "admin preview without closure"],
  "visual": {
    "reference": "User-supplied coming-soon-3.tsx; centered text and four countdown tiles, no subscription form or launch badge",
    "colors": {"background": "#f5f5f7", "foreground": "#1d1d1f", "secondary": "#6e6e73", "border": "#d2d2d7", "tile": "#ffffff", "unit": "#eeeef0", "focus": "#0066cc"},
    "typography": {"family": "system sans-serif with Chinese fallback", "heading": "26–38px, weight 650, line height 1.3", "body": "15px / 1.9", "digits": "system monospace, tabular numerals, 36px desktop / 28px mobile", "labels": "11px"},
    "spacing": {"viewportPadding": "48px 20px", "contentMaxWidth": "640px", "contentGap": "36px desktop / 30px mobile", "tileWidth": "84px desktop / 62px below 480px / 56px below 350px", "tileGap": "10px desktop / 6px mobile / 4px narrow"}
  },
  "motion": {"animations": [], "easing": null, "durationMs": 0, "stagger": null, "ownership": {"digits": "React, one 1000ms interval", "layout": "CSS only"}, "sequence": "SSR snapshot -> advance serverNow by monotonic client elapsed time -> clamp to zero and stop interval; no enabled-state transition"},
  "api": {
    "component": "MaintenancePage",
    "exports": "src/siteMaintenance/index.ts (does not export server modules)",
    "props": {"title": {"type": "string", "default": "Zorvin 暂时维护中"}, "description": {"type": "string", "default": "网站正在更新维护，暂时无法访问。感谢你的耐心等待。"}, "deadline": {"type": "absolute ISO timestamp | null", "default": null}, "serverNow": {"type": "number milliseconds since epoch", "required": true}, "onCheckStatus": {"type": "optional () => Promise<boolean>", "default": null}},
    "configuration": {"key": "site_maintenance", "storage": "one JSON value in existing app_settings table", "enabledDefault": false, "titleMax": 80, "descriptionMax": 500, "deadlineDefault": null, "deadlinePurpose": "estimate only", "reopen": "explicit authenticated PUT with enabled=false"}
  },
  "accessibility": {"heading": "h1 with labelled section", "countdown": "role timer; aria-live off to avoid per-second announcements", "status": "polite status messages", "controls": "native buttons, min 44px height, visible keyboard focus", "reducedMotion": "no movement or transitions; same static layout", "noJavaScript": "server-rendered title, description and countdown snapshot remain visible; no automatic opening"},
  "performance": {"newDependencies": 0, "timers": "one interval while countdown active; cleared on expiry/unmount", "polling": "none; user-operated status check only", "layout": "fixed-width digit tiles", "network": "one fresh configuration read per gated request; five-second abort; no cross-request cache", "serverSecrets": "readMaintenance is server/Edge-only; never client-exported"},
  "integration": {"AdminMaintenanceSettings": "site-specific editor adapter using existing admin primitives and independent save endpoint", "LiveMaintenance": "site-specific status/reload adapter", "middleware": "503 no-store rewrite for storefront, 503 JSON for business APIs; admin and infrastructure allowlist", "readErrors": "fail closed for configured services; safe default copy; admin stays accessible", "limits": ["does not revoke existing Supabase sessions", "does not revoke direct external storage URLs", "does not erase already-loaded browser content", "CDN cache rules must honor no-store and bypass public HTML/API cache before release"]}
}
```

```tsx
import { MaintenancePage } from '@/siteMaintenance';

// Server component: snapshot passed explicitly so hydration does not reset the deadline.
export default function Example() {
  return <MaintenancePage title="Zorvin 暂时维护中"
    description="网站正在更新维护，感谢你的耐心等待。"
    deadline="2026-11-13T10:00:00+08:00" serverNow={Date.now()} />;
}
```

Core UI and logic are importable independently of demo pages. Admin preview imports the same component; it neither writes configuration nor closes the site. `server.ts` must only be imported from middleware, route handlers and server components.
