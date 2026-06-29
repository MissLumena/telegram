import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SPREADSHEET_ID = "1H7d1lXi5hUlgL-LLtGeg2NTTQ89D1KHhH4b-iWZEk0c";
const SHEET_NAME = "Appointments";

const HEADERS = [
  "id", "created_at", "status",
  "service_id", "service_title", "master_id", "master_name",
  "date", "time", "client_name", "phone", "telegram_user_id",
];

// --- Fetch Service Account JSON from vault via service-role SQL ----------
async function getServiceAccount(): Promise<Record<string, string>> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/query_vault_secret`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ secret_name: "GOOGLE_SERVICE_ACCOUNT_JSON" }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`vault fetch failed (${res.status}): ${t}`);
  }
  const data = await res.json();
  if (!data) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not found in vault");
  return JSON.parse(data);
}

// --- Google JWT (Service Account → access token) -------------------------
async function getGoogleAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const enc = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${enc(header)}.${enc(payload)}`;

  const pem = sa.private_key.replace(/\\n/g, "\n");
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token error ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.access_token;
}

// --- Sheets API helpers --------------------------------------------------
async function sheetsAppend(token: string, values: (string | number)[][]) {
  const range = `${SHEET_NAME}!A1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets append error ${res.status}: ${t}`);
  }
  return res.json();
}

async function sheetsFindRowByPhone(token: string, phone: string) {
  const range = `${SHEET_NAME}!A2:L`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets read error ${res.status}: ${t}`);
  }
  const data = await res.json();
  const rows: string[][] = data.values ?? [];
  const matches: { rowNumber: number; id: string; serviceTitle: string; masterName: string; date: string; time: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const status = r[2] ?? "";
    const rowPhone = (r[10] ?? "").replace(/\D/g, "");
    const target = phone.replace(/\D/g, "");
    if (status === "active" && rowPhone === target) {
      matches.push({
        rowNumber: i + 2,
        id: r[0] ?? "",
        serviceTitle: r[4] ?? "",
        masterName: r[6] ?? "",
        date: r[7] ?? "",
        time: r[8] ?? "",
      });
    }
  }
  return matches;
}

async function sheetsUpdateStatus(token: string, rowNumber: number, status: string) {
  const cell = `${SHEET_NAME}!C${rowNumber}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(cell)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [[status]] }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets update error ${res.status}: ${t}`);
  }
  return res.json();
}

async function sheetsEnsureSheet(token: string) {
  // Check if the sheet exists; create it if not.
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    const t = await metaRes.text();
    throw new Error(`Sheets metadata error ${metaRes.status}: ${t}`);
  }
  const meta = await metaRes.json();
  const titles: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title);
  if (titles.includes(SHEET_NAME)) return;

  // Create the sheet via batchUpdate.
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`;
  const batchRes = await fetch(batchUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
    }),
  });
  if (!batchRes.ok) {
    const t = await batchRes.text();
    throw new Error(`Sheets addSheet error ${batchRes.status}: ${t}`);
  }
}

async function sheetsEnsureHeader(token: string) {
  const range = `${SHEET_NAME}!A1:L1`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  if (!data.values || data.values.length === 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [HEADERS] }),
      }
    );
  }
}

// --- Main handler ----------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const sa = await getServiceAccount();
    const token = await getGoogleAccessToken(sa);

    const body = await req.json();
    const action = body.action;

    if (action === "ensure_header") {
      await sheetsEnsureSheet(token);
      await sheetsEnsureHeader(token);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const a = body.appointment;
      const row = [
        a.id,
        a.created_at,
        "active",
        a.service_id,
        a.service_title,
        a.master_id,
        a.master_name,
        a.date,
        a.time,
        a.client_name,
        a.phone,
        String(a.telegram_user_id ?? ""),
      ];
      await sheetsAppend(token, [row]);
      return new Response(JSON.stringify({ ok: true, id: a.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_by_phone") {
      const matches = await sheetsFindRowByPhone(token, body.phone);
      return new Response(JSON.stringify({ ok: true, appointments: matches }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel") {
      const matches = await sheetsFindRowByPhone(token, body.phone);
      const target = matches.find((m) => m.id === body.id);
      if (!target) {
        return new Response(JSON.stringify({ error: "Appointment not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await sheetsUpdateStatus(token, target.rowNumber, "cancelled");
      return new Response(JSON.stringify({ ok: true, id: target.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
