import fs from "fs";

const text = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("missing_env", Boolean(url), Boolean(key));
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const bucketsRes = await fetch(`${url}/storage/v1/bucket`, { headers });
const buckets = await bucketsRes.json();
console.log("buckets_status", bucketsRes.status);
if (Array.isArray(buckets)) {
  console.log(
    "bucket_ids",
    buckets.map((x) => `${x.id}:public=${x.public}`).join(", ") || "(none)",
  );
} else {
  console.log("bucket_err", buckets?.statusCode || buckets?.error || buckets?.message || "unknown");
}

const specRes = await fetch(`${url}/rest/v1/`, {
  headers: { ...headers, Accept: "application/openapi+json" },
});
const spec = await specRes.json();
const def = spec?.definitions?.custom_matches || spec?.components?.schemas?.custom_matches;
const props = def?.properties ? Object.keys(def.properties) : null;
console.log("openapi", specRes.status, "cols", props ? props.join(",") : "none");
if (def?.required) console.log("required", def.required.join(","));

const rowRes = await fetch(`${url}/rest/v1/custom_matches?select=*&limit=1`, {
  headers: { ...headers, Accept: "application/json" },
});
const rows = await rowRes.json();
console.log("select_status", rowRes.status);
if (Array.isArray(rows)) {
  console.log("sample_cols", rows[0] ? Object.keys(rows[0]).join(",") : "empty");
  console.log("count_sample", rows.length);
} else {
  console.log("select_err", rows?.code, rows?.message, rows?.hint || "");
}
