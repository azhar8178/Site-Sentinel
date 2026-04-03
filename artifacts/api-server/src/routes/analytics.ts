import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Public router — only the OAuth callback (no auth required; Google redirects here)
export const analyticsPublicRouter: IRouter = Router();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GA4_DATA_URL = "https://analyticsdata.googleapis.com/v1beta/properties";
const GA4_ADMIN_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

const GA_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "openid",
  "email",
].join(" ");

async function getGoogleCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  try {
    const rows = await db.execute(
      "SELECT client_id, client_secret FROM google_oauth_config ORDER BY id DESC LIMIT 1"
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
    if (row?.client_id) {
      return {
        clientId: row.client_id as string,
        clientSecret: row.client_secret as string,
      };
    }
  } catch {
  }
  return {
    clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
  };
}

function getCallbackUrl(req: any) {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}/api/analytics/google/callback`;
}

async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = await getGoogleCredentials();
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Token refresh failed: ${resp.status}`);
  }
  return resp.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function getValidToken(): Promise<string | null> {
  const rows = await db.execute(
    "SELECT access_token, refresh_token, expires_at FROM google_analytics_tokens ORDER BY id DESC LIMIT 1"
  );
  const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return row.access_token as string;
  }

  if (!row.refresh_token) return null;
  const refreshed = await refreshAccessToken(row.refresh_token as string);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
  await db.execute(
    `UPDATE google_analytics_tokens SET access_token = '${refreshed.access_token}', expires_at = '${newExpiry.toISOString()}' WHERE id = (SELECT id FROM google_analytics_tokens ORDER BY id DESC LIMIT 1)`
  );
  return refreshed.access_token;
}

router.get("/analytics/google/auth-url", requireAuth, async (req, res) => {
  const { clientId } = await getGoogleCredentials();
  if (!clientId) {
    res.status(503).json({ error: "Google OAuth is not configured. Add credentials in Settings → Google Analytics." });
    return;
  }
  const callbackUrl = getCallbackUrl(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: GA_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  res.json({ url: `${GOOGLE_AUTH_URL}?${params}`, callbackUrl });
});

analyticsPublicRouter.get("/analytics/google/callback", async (req, res, next) => {
  try {
    const { code, error } = req.query as Record<string, string>;
    const origin = `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.headers.host}`;

    if (error) {
      res.redirect(`${origin}/analytics?ga_error=${encodeURIComponent(error)}`);
      return;
    }
    if (!code) {
      res.redirect(`${origin}/analytics?ga_error=no_code`);
      return;
    }

    const { clientId, clientSecret } = await getGoogleCredentials();
    const callbackUrl = getCallbackUrl(req);
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      res.redirect(`${origin}/analytics?ga_error=${encodeURIComponent("Token exchange failed: " + err)}`);
      return;
    }

    const tokens = await tokenResp.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db.execute(`DELETE FROM google_analytics_tokens`);
    await db.execute(
      `INSERT INTO google_analytics_tokens (access_token, refresh_token, expires_at) VALUES ('${tokens.access_token.replace(/'/g, "''")}', ${tokens.refresh_token ? `'${tokens.refresh_token.replace(/'/g, "''")}'` : "NULL"}, '${expiresAt.toISOString()}')`
    );

    res.redirect(`${origin}/analytics?ga_connected=1`);
  } catch (err) {
    next(err);
  }
});

router.get("/analytics/google/status", requireAuth, async (_req, res, next) => {
  try {
    const { clientId } = await getGoogleCredentials();
    let row: any = null;
    try {
      const rows = await db.execute(
        "SELECT id, expires_at, ga_property_id, email FROM google_analytics_tokens ORDER BY id DESC LIMIT 1"
      );
      row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
    } catch {
      // Table may not exist yet — migrations pending on this install
    }
    if (!row) {
      res.json({ connected: false, configured: !!clientId });
      return;
    }
    res.json({
      connected: true,
      email: row.email ?? null,
      selectedPropertyId: row.ga_property_id ?? null,
      expiresAt: row.expires_at,
      configured: !!clientId,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/analytics/google/disconnect", requireAuth, async (_req, res, next) => {
  try {
    const rows = await db.execute(
      "SELECT access_token FROM google_analytics_tokens ORDER BY id DESC LIMIT 1"
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
    if (row?.access_token) {
      try {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(row.access_token as string)}`, { method: "POST" });
      } catch {
      }
    }
    await db.execute(`DELETE FROM google_analytics_tokens`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/analytics/google/select-property", requireAuth, async (req, res, next) => {
  try {
    const { propertyId, email } = req.body;
    await db.execute(
      `UPDATE google_analytics_tokens SET ga_property_id = '${String(propertyId).replace(/'/g, "''")}', email = '${String(email ?? "").replace(/'/g, "''")}' WHERE id = (SELECT id FROM google_analytics_tokens ORDER BY id DESC LIMIT 1)`
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/analytics/google/properties", requireAuth, async (_req, res, next) => {
  try {
    const token = await getValidToken();
    if (!token) {
      res.status(401).json({ error: "Not connected to Google Analytics" });
      return;
    }

    const resp = await fetch(`${GA4_ADMIN_URL}?pageSize=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const body = await resp.text();
      res.status(resp.status).json({ error: `Google API error: ${body}` });
      return;
    }

    const data = await resp.json() as any;
    const properties: { id: string; name: string; displayName: string }[] = [];

    for (const account of data.accountSummaries ?? []) {
      for (const prop of account.propertySummaries ?? []) {
        properties.push({
          id: prop.property,
          name: prop.property,
          displayName: prop.displayName ?? prop.property,
        });
      }
    }

    res.json({ properties });
  } catch (err) {
    next(err);
  }
});

router.post("/analytics/google/data", requireAuth, async (req, res, next) => {
  try {
    const token = await getValidToken();
    if (!token) {
      res.status(401).json({ error: "Not connected to Google Analytics" });
      return;
    }

    const rows = await db.execute(
      "SELECT ga_property_id FROM google_analytics_tokens ORDER BY id DESC LIMIT 1"
    );
    const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
    const propertyId = req.body.propertyId ?? row?.ga_property_id;

    if (!propertyId) {
      res.status(400).json({ error: "No property selected" });
      return;
    }

    const propName = String(propertyId).replace(/^properties\//, "");
    const fullPropName = `properties/${propName}`;

    const [reportResp, realtimeResp] = await Promise.all([
      fetch(`${GA4_DATA_URL}/${propName}:runReport`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          metrics: [
            { name: "sessions" },
            { name: "newUsers" },
            { name: "totalUsers" },
            { name: "engagementRate" },
            { name: "bounceRate" },
            { name: "screenPageViews" },
            { name: "averageSessionDuration" },
          ],
        }),
      }),
      fetch(`${GA4_DATA_URL}/${propName}:runRealtimeReport`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metrics: [{ name: "activeUsers" }],
        }),
      }),
    ]);

    if (!reportResp.ok) {
      const body = await reportResp.text();
      res.status(reportResp.status).json({ error: `GA4 Data API error: ${body}` });
      return;
    }

    const [reportData, realtimeData] = await Promise.all([
      reportResp.json() as Promise<any>,
      realtimeResp.ok ? (realtimeResp.json() as Promise<any>) : Promise.resolve(null),
    ]);

    const metricValues = reportData.rows?.[0]?.metricValues ?? [];
    const metricHeaders = reportData.metricHeaders ?? [];
    const metricsMap: Record<string, number> = {};
    for (let i = 0; i < metricHeaders.length; i++) {
      metricsMap[metricHeaders[i].name] = parseFloat(metricValues[i]?.value ?? "0");
    }

    const activeUsers = realtimeData?.rows?.[0]?.metricValues?.[0]?.value
      ? parseInt(realtimeData.rows[0].metricValues[0].value)
      : 0;

    res.json({
      propertyId: fullPropName,
      activeUsers,
      sessions: Math.round(metricsMap["sessions"] ?? 0),
      newUsers: Math.round(metricsMap["newUsers"] ?? 0),
      totalUsers: Math.round(metricsMap["totalUsers"] ?? 0),
      engagementRate: parseFloat(((metricsMap["engagementRate"] ?? 0) * 100).toFixed(1)),
      bounceRate: parseFloat(((metricsMap["bounceRate"] ?? 0) * 100).toFixed(1)),
      pageViews: Math.round(metricsMap["screenPageViews"] ?? 0),
      avgSessionDurationSec: Math.round(metricsMap["averageSessionDuration"] ?? 0),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
