(function () {
  "use strict";

  const APP_CONFIG =
    typeof window !== "undefined" && window.RLS_LENS_CONFIG && typeof window.RLS_LENS_CONFIG === "object"
      ? window.RLS_LENS_CONFIG
      : {};

  const DEMO_SQL = `create table public.todos (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  title text not null,
  is_public boolean default false,
  done boolean default false
);

alter table public.todos enable row level security;

grant select on public.todos to anon;
grant select, insert, update, delete on public.todos to authenticated;

create policy "Users can read their own todos"
on public.todos
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Public todos are visible"
on public.todos
for select
to anon, authenticated
using (is_public = true);

create policy "Users can insert their own todos"
on public.todos
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own todos"
on public.todos
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);`;

  const DEMO_ROWS = [
    {
      id: 1,
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "Owner private task",
      is_public: false,
      done: false,
    },
    {
      id: 2,
      user_id: "22222222-2222-2222-2222-222222222222",
      title: "Someone else public task",
      is_public: true,
      done: false,
    },
    {
      id: 3,
      user_id: "22222222-2222-2222-2222-222222222222",
      title: "Someone else private task",
      is_public: false,
      done: true,
    },
  ];

  const DEMO_NEW_ROW = {
    user_id: "11111111-1111-1111-1111-111111111111",
    title: "New owner task",
    is_public: false,
    done: false,
  };

  const DEMO_JWT = {
    sub: "11111111-1111-1111-1111-111111111111",
    role: "authenticated",
    aal: "aal1",
    app_metadata: {
      teams: ["ops", "billing"],
    },
    user_metadata: {
      plan: "trial",
    },
  };

  const UPSERT_CONFLICT_SQL = `create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text,
  auth text,
  updated_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "Users manage their own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);`;

  const UPSERT_CONFLICT_ROWS = [
    {
      id: 1,
      user_id: "22222222-2222-2222-2222-222222222222",
      endpoint: "https://push.example/device-abc",
      p256dh: "old-user-key",
      auth: "old-user-auth",
    },
  ];

  const UPSERT_CONFLICT_NEW_ROW = {
    user_id: "11111111-1111-1111-1111-111111111111",
    endpoint: "https://push.example/device-abc",
    p256dh: "current-user-key",
    auth: "current-user-auth",
  };

  const STORAGE_AVATAR_SQL = `create table storage.objects (
  bucket_id text not null,
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;

grant insert on storage.objects to authenticated;

create policy "Users upload into their own avatar folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);`;

  const STORAGE_AVATAR_NEW_ROW = {
    bucket_id: "avatars",
    name: "11111111-1111-1111-1111-111111111111-avatar.png",
  };

  const DEFAULT_STATE = {
    operation: "select",
    role: "authenticated",
    table: "public.todos",
    uid: "11111111-1111-1111-1111-111111111111",
    sql: DEMO_SQL,
    rows: DEMO_ROWS,
    newRow: DEMO_NEW_ROW,
    jwt: DEMO_JWT,
  };

  const DEEP_LINK_SCENARIOS = {
    "missing-owner-insert": {
      status: "Scenario loaded: INSERT payload omits user_id while WITH CHECK compares auth.uid() to user_id.",
      tab: "fixes",
      state: {
        ...DEFAULT_STATE,
        operation: "insert",
        newRow: {
          title: "Trip without explicit owner",
          destination: "Kyoto",
          start_date: "2026-07-01",
          end_date: "2026-07-07",
        },
      },
    },
    "upsert-conflict-existing-owner": {
      status: "Scenario loaded: UPSERT conflict takes the UPDATE path, so USING checks the existing row owner first.",
      tab: "matrix",
      state: {
        ...DEFAULT_STATE,
        operation: "update",
        table: "public.push_subscriptions",
        sql: UPSERT_CONFLICT_SQL,
        rows: UPSERT_CONFLICT_ROWS,
        newRow: UPSERT_CONFLICT_NEW_ROW,
      },
    },
    "storage-avatar-folder-mismatch": {
      status: "Scenario loaded: Storage upload path is flat, but the policy expects the first folder to match auth.uid().",
      tab: "fixes",
      state: {
        ...DEFAULT_STATE,
        operation: "insert",
        table: "storage.objects",
        sql: STORAGE_AVATAR_SQL,
        rows: [],
        newRow: STORAGE_AVATAR_NEW_ROW,
      },
    },
  };

  const CUSTOM_SCENARIOS_KEY = "rls-lens-custom-scenarios-v1";

  const SCENARIOS = {
    owner: {
      label: "Owner",
      role: "authenticated",
      uid: "11111111-1111-1111-1111-111111111111",
      jwt: {
        ...DEMO_JWT,
        sub: "11111111-1111-1111-1111-111111111111",
        role: "authenticated",
      },
      newRowPatch: {
        user_id: "11111111-1111-1111-1111-111111111111",
      },
    },
    anon: {
      label: "Anon",
      role: "anon",
      uid: "",
      jwt: {
        role: "anon",
      },
    },
    "other-user": {
      label: "Other user",
      role: "authenticated",
      uid: "22222222-2222-2222-2222-222222222222",
      jwt: {
        ...DEMO_JWT,
        sub: "22222222-2222-2222-2222-222222222222",
        role: "authenticated",
      },
      newRowPatch: {
        user_id: "22222222-2222-2222-2222-222222222222",
      },
    },
    service: {
      label: "Service",
      role: "service_role",
      uid: "",
      jwt: {
        role: "service_role",
      },
    },
  };

  const els = {};
  let lastReport = null;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
      cacheElements();
      bindEvents();
      const deepLink = readDeepLinkScenario();
      loadState(deepLink?.state || DEFAULT_STATE);
      refreshSavedScenarios();
      applyRuntimeMode();
      renderEmpty();
      analyzeFromForm();
      if (deepLink?.tab) activateTab(deepLink.tab);
      if (deepLink?.status) els["file-status"].textContent = deepLink.status;
    });
  }

  function cacheElements() {
    [
      "operation",
      "role",
      "target-table",
      "uid",
      "scenario-name",
      "saved-scenarios",
      "migration-files",
      "sql-input",
      "rows-input",
      "new-row-input",
      "jwt-input",
      "import-sql",
      "file-status",
      "load-demo",
      "save-scenario",
      "load-scenario",
      "delete-scenario",
      "analyze",
      "support-bundle",
      "download-sql",
      "export-report",
      "report-title",
      "report-badge",
      "metrics",
      "panel-matrix",
      "panel-policies",
      "panel-fixes",
      "panel-sql",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els["load-demo"].addEventListener("click", () => {
      loadState(DEFAULT_STATE);
      setActiveScenario("owner");
      analyzeFromForm();
    });

    els["import-sql"].addEventListener("click", () => {
      if (gatePaidFeature("Import migration SQL")) return;
      els["migration-files"].click();
    });

    els["migration-files"].addEventListener("change", handleSqlFileImport);

    document.querySelectorAll(".preset-button").forEach((button) => {
      button.addEventListener("click", () => {
        applyScenario(button.dataset.scenario);
        analyzeFromForm();
      });
    });

    els["save-scenario"].addEventListener("click", () => {
      if (gatePaidFeature("Saved custom scenarios")) return;
      saveCurrentScenario();
    });

    els["load-scenario"].addEventListener("click", () => {
      if (gatePaidFeature("Saved custom scenarios")) return;
      loadSavedScenario();
    });

    els["delete-scenario"].addEventListener("click", () => {
      if (gatePaidFeature("Saved custom scenarios")) return;
      deleteSavedScenario();
    });

    els["saved-scenarios"].addEventListener("change", () => {
      els["scenario-name"].value = els["saved-scenarios"].value;
    });

    els.analyze.addEventListener("click", analyzeFromForm);

    els["support-bundle"].addEventListener("click", () => {
      if (gatePaidFeature("Redacted support bundle")) return;
      if (!lastReport) analyzeFromForm();
      downloadSupportBundle(lastReport);
    });

    els["download-sql"].addEventListener("click", () => {
      if (gatePaidFeature("SQL diagnostic file")) return;
      if (!lastReport) analyzeFromForm();
      downloadSqlDiagnostic(lastReport);
    });

    els["export-report"].addEventListener("click", () => {
      if (gatePaidFeature("Markdown report export")) return;
      if (!lastReport) analyzeFromForm();
      downloadReport(lastReport);
    });

    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });

    document.getElementById("rls-form").addEventListener("submit", (event) => {
      event.preventDefault();
      analyzeFromForm();
    });
  }

  function activateTab(tabName) {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabName);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${tabName}`);
    });
  }

  function applyRuntimeMode() {
    if (!isPublicDemo()) return;

    document.body.classList.add("public-demo-mode");
    lockCustomInputs();
    injectDemoBanner();
    els["file-status"].textContent = "Public demo: try the sample scenarios. Paid download unlocks custom SQL, saved scenarios, imports, exports, and support bundles.";
  }

  function isPublicDemo() {
    return APP_CONFIG.mode === "public-demo" || APP_CONFIG.publicDemo === true;
  }

  function checkoutUrl() {
    return withTrackingParams(APP_CONFIG.checkoutUrl || "https://cowboycodr.github.io/rls-lens-demo/buy.html");
  }

  function withTrackingParams(url) {
    if (typeof window === "undefined" || !window.location) return url;

    try {
      const incoming = new URLSearchParams(window.location.search || "");
      const trackedKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
      const presentKeys = trackedKeys.filter((key) => incoming.has(key));
      if (!presentKeys.length) return url;

      const next = new URL(url, window.location.href);
      for (const key of presentKeys) next.searchParams.set(key, incoming.get(key));

      if (/^[a-z][a-z\d+\-.]*:/i.test(url) || url.startsWith("//")) return next.toString();
      if (url.startsWith("/")) return `${next.pathname}${next.search}${next.hash}`;
      return `${next.pathname.split("/").pop()}${next.search}${next.hash}`;
    } catch (_error) {
      return url;
    }
  }

  function readDeepLinkScenario() {
    if (typeof window === "undefined" || !window.location) return null;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const name = params.get("scenario") || params.get("demo");
      return name ? DEEP_LINK_SCENARIOS[name] || null : null;
    } catch {
      return null;
    }
  }

  function gatePaidFeature(featureName) {
    if (!isPublicDemo()) return false;
    const url = checkoutUrl();
    if (featureName === "Redacted support bundle") {
      els["file-status"].innerHTML = `Redacted support bundles are included in the paid local download. The <a href="${escapeHtml(url)}">RLS Unblock Pass</a> adds one review of a redacted bundle or policy snippet.`;
      return true;
    }
    els["file-status"].innerHTML = `${escapeHtml(featureName)} is included in the paid local download. <a href="${escapeHtml(url)}">Buy RLS Lens</a>.`;
    return true;
  }

  function lockCustomInputs() {
    ["target-table", "uid", "scenario-name", "sql-input", "rows-input", "new-row-input", "jwt-input"].forEach((id) => {
      const input = els[id];
      if (!input) return;
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
    });
  }

  function injectDemoBanner() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || document.querySelector(".demo-banner")) return;
    const banner = document.createElement("div");
    banner.className = "demo-banner";
    banner.innerHTML = `<strong>Public demo</strong><span>Sample data only. Buy the local download to import migrations, save scenarios, paste private rows, export reports, and generate SQL diagnostics.</span><a href="${escapeHtml(checkoutUrl())}">Buy download</a>`;
    topbar.insertAdjacentElement("afterend", banner);
  }

  function loadState(state) {
    els.operation.value = state.operation;
    els.role.value = state.role;
    els["target-table"].value = state.table;
    els.uid.value = state.uid;
    els["sql-input"].value = state.sql;
    els["rows-input"].value = JSON.stringify(state.rows, null, 2);
    els["new-row-input"].value = JSON.stringify(state.newRow, null, 2);
    els["jwt-input"].value = JSON.stringify(state.jwt, null, 2);
  }

  function saveCurrentScenario() {
    const name = els["scenario-name"].value.trim();
    if (!name) {
      els["file-status"].textContent = "Name the scenario before saving.";
      return;
    }

    try {
      const input = readForm();
      const scenario = {
        name,
        savedAt: new Date().toISOString(),
        state: {
          operation: input.operation,
          role: input.role,
          table: input.table,
          uid: input.uid || "",
          sql: input.sql,
          rows: input.rows,
          newRow: input.newRow,
          jwt: input.jwt,
        },
      };
      const next = getSavedScenarios().filter((item) => item.name !== name).concat(scenario);
      setSavedScenarios(next);
      refreshSavedScenarios(name);
      els["file-status"].textContent = `Saved scenario "${name}" locally in this browser.`;
    } catch (error) {
      els["file-status"].textContent = `Could not save scenario: ${error.message}`;
    }
  }

  function loadSavedScenario() {
    const name = els["saved-scenarios"].value || els["scenario-name"].value.trim();
    const scenario = getSavedScenarios().find((item) => item.name === name);
    if (!scenario) {
      els["file-status"].textContent = "Choose a saved scenario to load.";
      return;
    }

    loadState(scenario.state);
    els["scenario-name"].value = scenario.name;
    setActiveScenario("");
    analyzeFromForm();
    els["file-status"].textContent = `Loaded scenario "${scenario.name}".`;
  }

  function deleteSavedScenario() {
    const name = els["saved-scenarios"].value || els["scenario-name"].value.trim();
    if (!name) {
      els["file-status"].textContent = "Choose a saved scenario to delete.";
      return;
    }

    setSavedScenarios(getSavedScenarios().filter((scenario) => scenario.name !== name));
    refreshSavedScenarios("");
    els["scenario-name"].value = "";
    els["file-status"].textContent = `Deleted scenario "${name}" from this browser.`;
  }

  function refreshSavedScenarios(selectedName = "") {
    if (!els["saved-scenarios"]) return;
    const scenarios = getSavedScenarios();
    if (!scenarios.length) {
      els["saved-scenarios"].innerHTML = `<option value="">No saved scenarios</option>`;
      return;
    }

    els["saved-scenarios"].innerHTML = `<option value="">Choose scenario</option>${scenarios
      .map((scenario) => `<option value="${escapeHtml(scenario.name)}">${escapeHtml(scenario.name)}</option>`)
      .join("")}`;
    els["saved-scenarios"].value = selectedName;
  }

  function getSavedScenarios() {
    if (!storageAvailable()) return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_SCENARIOS_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((scenario) => scenario && typeof scenario.name === "string" && scenario.state)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (_error) {
      return [];
    }
  }

  function setSavedScenarios(scenarios) {
    if (!storageAvailable()) {
      throw new Error("localStorage is unavailable in this browser context.");
    }
    window.localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(scenarios));
  }

  function storageAvailable() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      const key = "__rls_lens_storage_test__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function applyScenario(name) {
    const scenario = SCENARIOS[name];
    if (!scenario) return;

    els.role.value = scenario.role;
    els.uid.value = scenario.uid;
    els["jwt-input"].value = JSON.stringify(scenario.jwt, null, 2);

    if (scenario.newRowPatch) {
      try {
        const currentNewRow = parseJsonField(els["new-row-input"].value, "New row JSON", {});
        els["new-row-input"].value = JSON.stringify({ ...normalizeObject(currentNewRow), ...scenario.newRowPatch }, null, 2);
      } catch (_error) {
        els["new-row-input"].value = JSON.stringify(scenario.newRowPatch, null, 2);
      }
    }

    setActiveScenario(name);
  }

  function setActiveScenario(name) {
    document.querySelectorAll(".preset-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.scenario === name);
    });
  }

  async function handleSqlFileImport(event) {
    const files = Array.from(event.target.files || []).sort((a, b) => a.name.localeCompare(b.name));
    if (!files.length) return;

    els["file-status"].textContent = `Reading ${files.length} SQL file${files.length === 1 ? "" : "s"}...`;
    try {
      const chunks = await Promise.all(files.map(async (file) => `-- file: ${file.name}\n${await file.text()}`));
      els["sql-input"].value = chunks.join("\n\n");
      els["file-status"].textContent = `Imported ${files.length} SQL file${files.length === 1 ? "" : "s"}: ${files.map((file) => file.name).join(", ")}`;
      analyzeFromForm();
    } catch (error) {
      els["file-status"].textContent = `Could not import SQL files: ${error.message}`;
    } finally {
      event.target.value = "";
    }
  }

  function readForm() {
    return {
      operation: els.operation.value,
      role: els.role.value.trim() || "authenticated",
      table: normalizeTableName(els["target-table"].value.trim() || "public.todos"),
      uid: els.uid.value.trim() || null,
      sql: els["sql-input"].value,
      rows: parseJsonField(els["rows-input"].value, "Existing rows JSON", []),
      newRow: parseJsonField(els["new-row-input"].value, "New row JSON", {}),
      jwt: parseJsonField(els["jwt-input"].value, "JWT claims JSON", {}),
    };
  }

  function parseJsonField(value, label, fallback) {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const message = `${label} is not valid JSON: ${error.message}`;
      throw new Error(message);
    }
  }

  function analyzeFromForm() {
    try {
      const input = readForm();
      const report = analyzeRls(input);
      lastReport = report;
      renderReport(report);
    } catch (error) {
      lastReport = null;
      renderError(error.message);
    }
  }

  function analyzeRls(input) {
    const sql = stripSqlComments(input.sql);
    const statements = splitSqlStatements(sql);
    const tables = parseTables(statements);
    const policies = parsePolicies(statements);
    const grants = parseGrants(statements);
    const indexes = parseIndexes(statements);
    const matchingPolicies = policies.filter((policy) => policy.table === input.table);
    const matchingGrants = grants.filter((grant) => grant.table === input.table || grant.table === "*");
    const matchingIndexes = indexes.filter((index) => index.table === input.table || index.table === "*");
    const rlsEnabled = tables.get(input.table)?.rlsEnabled === true;

    const context = {
      role: input.role,
      uid: input.role === "anon" ? null : input.uid,
      jwt: input.jwt && typeof input.jwt === "object" ? input.jwt : {},
    };

    const matrix = buildDecisionMatrix({
      input,
      context,
      rlsEnabled,
      matchingPolicies,
    });

    const warnings = buildStaticWarnings(input, rlsEnabled, matchingPolicies, policies, matchingGrants, matchingIndexes, tables).concat(
      buildDecisionWarnings(input, matrix)
    );
    const status = summarizeStatus(input, rlsEnabled, matrix);
    const sqlTests = buildSqlTests(input, rlsEnabled, matchingPolicies, matrix);

    return {
      input,
      rlsEnabled,
      allPolicies: policies,
      grants,
      indexes,
      matchingGrants,
      matchingIndexes,
      matchingPolicies,
      warnings,
      matrix,
      status,
      sqlTests,
      generatedAt: new Date().toISOString(),
    };
  }

  function buildDecisionMatrix({ input, context, rlsEnabled, matchingPolicies }) {
    if (input.role === "service_role") {
      return buildBypassMatrix(input);
    }

    if (!rlsEnabled) {
      return buildRlsDisabledMatrix(input);
    }

    if (input.operation === "insert") {
      return [
        evaluateAttempt({
          operation: input.operation,
          row: normalizeObject(input.newRow),
          newRow: normalizeObject(input.newRow),
          context,
          matchingPolicies,
          label: "new row",
        }),
      ];
    }

    const rows = Array.isArray(input.rows) ? input.rows.map(normalizeObject) : [];
    if (!rows.length) {
      return [];
    }

    return rows.map((row, index) => {
      const newRow =
        input.operation === "update"
          ? { ...row, ...normalizeObject(input.newRow) }
          : normalizeObject(input.newRow);
      return evaluateAttempt({
        operation: input.operation,
        row,
        newRow,
        context,
        matchingPolicies,
        label: `row ${index + 1}`,
      });
    });
  }

  function buildBypassMatrix(input) {
    const attempts = input.operation === "insert" ? [normalizeObject(input.newRow)] : asRows(input.rows);
    return attempts.map((row, index) => ({
      label: input.operation === "insert" ? "new row" : `row ${index + 1}`,
      row,
      newRow: input.operation === "update" ? { ...row, ...normalizeObject(input.newRow) } : normalizeObject(input.newRow),
      allowed: true,
      reason: "service_role bypasses row level security in Supabase/Postgres deployments that grant BYPASSRLS.",
      permissivePassed: [],
      restrictiveFailed: [],
      phaseResults: [],
    }));
  }

  function buildRlsDisabledMatrix(input) {
    const attempts = input.operation === "insert" ? [normalizeObject(input.newRow)] : asRows(input.rows);
    return attempts.map((row, index) => ({
      label: input.operation === "insert" ? "new row" : `row ${index + 1}`,
      row,
      newRow: input.operation === "update" ? { ...row, ...normalizeObject(input.newRow) } : normalizeObject(input.newRow),
      allowed: true,
      reason: "RLS was not detected as enabled for this table, so row policies would not restrict access.",
      permissivePassed: [],
      restrictiveFailed: [],
      phaseResults: [],
    }));
  }

  function asRows(value) {
    if (Array.isArray(value) && value.length) return value.map(normalizeObject);
    return [{}];
  }

  function evaluateAttempt({ operation, row, newRow, context, matchingPolicies, label }) {
    const applicable = matchingPolicies.filter((policy) => policyApplies(policy, operation, context.role));
    const permissive = applicable.filter((policy) => policy.kind === "permissive");
    const restrictive = applicable.filter((policy) => policy.kind === "restrictive");
    const phaseResults = [];

    if (!applicable.length) {
      return {
        label,
        row,
        newRow,
        allowed: false,
        reason: `No ${operation.toUpperCase()} policy applies to role ${context.role}.`,
        permissivePassed: [],
        restrictiveFailed: [],
        phaseResults,
      };
    }

    if (!permissive.length) {
      return {
        label,
        row,
        newRow,
        allowed: false,
        reason: "Only restrictive policies matched. PostgreSQL still needs at least one permissive policy to grant access.",
        permissivePassed: [],
        restrictiveFailed: [],
        phaseResults,
      };
    }

    const phases = policyPhases(operation);
    let everyPhaseAllowed = true;
    const permissivePassed = [];
    const restrictiveFailed = [];

    phases.forEach((phase) => {
      const currentRow = phase.target === "new" ? newRow : row;
      const permissiveResults = permissive.map((policy) => evaluatePolicyPhase(policy, phase, currentRow, context));
      const restrictiveResults = restrictive.map((policy) => evaluatePolicyPhase(policy, phase, currentRow, context));
      const phaseAllowed =
        permissiveResults.some((result) => result.allowed) &&
        restrictiveResults.every((result) => result.allowed);

      if (!phaseAllowed) everyPhaseAllowed = false;

      permissiveResults.filter((result) => result.allowed).forEach((result) => permissivePassed.push(result.policy.name));
      restrictiveResults.filter((result) => !result.allowed).forEach((result) => restrictiveFailed.push(result.policy.name));

      phaseResults.push({
        name: phase.name,
        target: phase.target,
        allowed: phaseAllowed,
        permissiveResults,
        restrictiveResults,
      });
    });

    const reason = everyPhaseAllowed
      ? "At least one permissive policy passed and every restrictive policy passed."
      : explainDeniedPhase(phaseResults, context.role, operation);

    return {
      label,
      row,
      newRow,
      allowed: everyPhaseAllowed,
      reason,
      permissivePassed: unique(permissivePassed),
      restrictiveFailed: unique(restrictiveFailed),
      phaseResults,
    };
  }

  function policyPhases(operation) {
    if (operation === "insert") return [{ name: "WITH CHECK", target: "new" }];
    if (operation === "update") {
      return [
        { name: "USING", target: "existing" },
        { name: "WITH CHECK", target: "new" },
      ];
    }
    return [{ name: "USING", target: "existing" }];
  }

  function evaluatePolicyPhase(policy, phase, row, context) {
    const expression = expressionForPhase(policy, phase);
    if (!expression) {
      return {
        policy,
        allowed: false,
        value: false,
        notes: [`${phase.name} expression is missing for this policy.`],
      };
    }

    const evaluated = evaluateExpression(expression, row, context);
    return {
      policy,
      allowed: evaluated.value === true,
      value: evaluated.value,
      notes: evaluated.notes,
      expression,
    };
  }

  function expressionForPhase(policy, phase) {
    if (phase.name === "USING") return policy.using || null;
    return policy.withCheck || policy.using || null;
  }

  function explainDeniedPhase(phaseResults, role, operation) {
    const failed = phaseResults.find((phase) => !phase.allowed);
    if (!failed) return `${operation.toUpperCase()} denied.`;

    const permissiveFailures = failed.permissiveResults
      .filter((result) => !result.allowed)
      .map((result) => result.policy.name);
    const restrictiveFailures = failed.restrictiveResults
      .filter((result) => !result.allowed)
      .map((result) => result.policy.name);

    if (permissiveFailures.length && restrictiveFailures.length) {
      return `${failed.name} failed: no permissive policy granted access, and restrictive policy ${restrictiveFailures.join(", ")} blocked role ${role}.`;
    }
    if (permissiveFailures.length) {
      return `${failed.name} failed: no matching permissive policy evaluated to true for role ${role}.`;
    }
    if (restrictiveFailures.length) {
      return `${failed.name} failed: restrictive policy ${restrictiveFailures.join(", ")} evaluated to false.`;
    }
    return `${failed.name} failed.`;
  }

  function summarizeStatus(input, rlsEnabled, matrix) {
    if (input.role === "service_role") {
      return {
        badge: "Bypass",
        className: "unknown",
        title: "service_role bypasses policy checks",
      };
    }

    if (!rlsEnabled) {
      return {
        badge: "RLS off",
        className: "unknown",
        title: "RLS is not enabled for this table",
      };
    }

    if (!matrix.length) {
      return {
        badge: "No rows",
        className: "unknown",
        title: "No sample rows to evaluate",
      };
    }

    const allowed = matrix.filter((row) => row.allowed).length;
    if (allowed === matrix.length) {
      return {
        badge: "Allowed",
        className: "allowed",
        title: `${input.operation.toUpperCase()} allowed for all sample attempts`,
      };
    }
    if (allowed === 0) {
      return {
        badge: "Denied",
        className: "denied",
        title: `${input.operation.toUpperCase()} denied for all sample attempts`,
      };
    }
    return {
      badge: "Mixed",
      className: "unknown",
      title: `${input.operation.toUpperCase()} allowed for ${allowed} of ${matrix.length} sample attempts`,
    };
  }

  function buildStaticWarnings(input, rlsEnabled, matchingPolicies, allPolicies, matchingGrants = [], matchingIndexes = [], tables = new Map()) {
    const warnings = [];
    const targetPolicies = matchingPolicies.filter((policy) => policy.command === "all" || policy.command === input.operation);
    warnings.push(...buildSchemaAuditWarnings(tables, allPolicies));

    if (!rlsEnabled) {
      warnings.push({
        level: "danger",
        title: "RLS was not detected for the target table",
        body: `Add: alter table ${input.table} enable row level security;`,
      });
    }

    if (!matchingPolicies.length && allPolicies.length) {
      warnings.push({
        level: "warning",
        title: "No parsed policies target this table",
        body: `Parsed ${allPolicies.length} policies, but none were on ${input.table}. Check the schema/table name.`,
      });
    }

    if (!targetPolicies.some((policy) => policyApplies(policy, input.operation, input.role))) {
      warnings.push({
        level: "danger",
        title: "No policy applies to this operation and role",
        body: `Add a ${input.operation.toUpperCase()} policy with TO ${input.role}, or TO PUBLIC if intentional.`,
      });
    }

    if (input.role !== "service_role" && !grantAllows(matchingGrants, input.operation, input.role)) {
      warnings.push({
        level: "warning",
        title: "No matching table GRANT was parsed",
        body: `Policies do not replace Postgres privileges. If this migration owns grants, add: GRANT ${input.operation.toUpperCase()} ON ${input.table} TO ${input.role};`,
      });
    }

    targetPolicies.forEach((policy) => {
      if (!policy.rolesExplicit) {
        warnings.push({
          level: "warning",
          title: `Policy "${policy.name}" has no TO clause`,
          body: "Supabase recommends specifying TO anon/authenticated so policies do not run for unintended roles.",
        });
      }

      if ((policy.using || policy.withCheck || "").match(/\bauth\.uid\s*\(/i) && !/\bauth\.uid\s*\(\s*\)\s+is\s+not\s+null/i.test(policy.using || policy.withCheck || "")) {
        warnings.push({
          level: "warning",
          title: `Policy "${policy.name}" uses auth.uid() without an explicit null guard`,
          body: "Unauthenticated requests make auth.uid() null. Add auth.uid() is not null when the policy is meant for logged-in users.",
        });
      }

      authUidComparedColumns(policy).forEach((column) => {
        if (!columnIsIndexed(matchingIndexes, column)) {
          warnings.push({
            level: "warning",
            title: `No parsed index for auth.uid() column "${column}"`,
            body: `Policy "${policy.name}" compares auth.uid() to ${column}. For larger tables, add or verify an index such as: CREATE INDEX ON ${input.table} (${column});`,
          });
        }
      });

      if (input.operation === "insert" && policyApplies(policy, "insert", input.role)) {
        const newRow = normalizeObject(input.newRow);
        const expression = policy.withCheck || policy.using || "";
        authUidComparedColumnsInExpression(expression).forEach((column) => {
          if (!Object.prototype.hasOwnProperty.call(newRow, column) || newRow[column] === null || newRow[column] === undefined || newRow[column] === "") {
            warnings.push({
              level: "danger",
              title: `New row omits auth.uid() owner column "${column}"`,
              body: `Policy "${policy.name}" checks auth.uid() against ${column}, but the sample insert row does not include ${column}. Add ${column}: "${input.uid || "USER_ID"}" to the insert payload, or verify the database fills it with DEFAULT auth.uid() before WITH CHECK runs.`,
            });
          }
        });
      }

      warnings.push(...buildStorageFolderWarnings(input, policy));

      if ((policy.using || policy.withCheck || "").match(/\b(user_metadata|raw_user_meta_data)\b/i)) {
        warnings.push({
          level: "warning",
          title: `Policy "${policy.name}" reads user-editable JWT metadata`,
          body: "Use app_metadata/raw_app_meta_data for authorization claims; user metadata can be changed by authenticated users.",
        });
      }

      if (input.operation === "insert" && policy.command === "insert" && !policy.withCheck) {
        warnings.push({
          level: "danger",
          title: `INSERT policy "${policy.name}" has no WITH CHECK expression`,
          body: "INSERT policies need WITH CHECK to validate the row being created.",
        });
      }

      if (input.operation === "update" && !policy.withCheck) {
        warnings.push({
          level: "warning",
          title: `UPDATE policy "${policy.name}" relies on USING as the WITH CHECK fallback`,
          body: "Be explicit with WITH CHECK so users cannot change ownership columns accidentally.",
        });
      }
    });

    if (input.role === "anon" && input.uid) {
      warnings.push({
        level: "warning",
        title: "anon role ignores auth.uid() in this simulator",
        body: "Supabase anon requests are unauthenticated, so auth.uid() is null. Anonymous Auth users are different and use the authenticated role.",
      });
    }

    if (input.role === "service_role") {
      warnings.push({
        level: "danger",
        title: "Never expose service_role in client code",
        body: "The service role bypasses RLS and should only run in trusted server environments.",
      });
    }

    return dedupeWarnings(warnings);
  }

  function buildStorageFolderWarnings(input, policy) {
    if (!policyApplies(policy, input.operation, input.role)) return [];
    const expression = policy.withCheck || policy.using || "";
    const checks = storageFoldernameAuthChecks(expression);
    if (!checks.length) return [];

    const sample =
      input.operation === "insert" || input.operation === "update"
        ? normalizeObject(input.newRow)
        : normalizeObject(input.rows?.[0]);
    const warnings = [];

    checks.forEach((check) => {
      const rawPath = sample[check.column];
      if (rawPath === null || rawPath === undefined || rawPath === "") {
        warnings.push({
          level: "danger",
          title: `Storage path column "${check.column}" is missing`,
          body: `Policy "${policy.name}" checks storage.foldername(${check.column})[${check.index}] against auth.uid(), but the sample row has no ${check.column} value.`,
        });
        return;
      }

      const folders = storageFoldername(rawPath);
      const actual = folders[check.index - 1] || "";
      if (!actual) {
        warnings.push({
          level: "danger",
          title: "Storage object path has no matching owner folder",
          body: `Policy "${policy.name}" expects folder segment ${check.index} of ${check.column} to equal auth.uid(). Use a path like "${input.uid || "USER_ID"}/filename.ext" instead of "${rawPath}".`,
        });
        return;
      }

      if (input.uid && normalizeComparable(actual) !== normalizeComparable(input.uid)) {
        warnings.push({
          level: "danger",
          title: "Storage object path owner folder does not match auth.uid()",
          body: `Policy "${policy.name}" expects ${check.column} folder segment ${check.index} to be "${input.uid}", but the sample path has "${actual}".`,
        });
      }
    });

    return warnings;
  }

  function buildSchemaAuditWarnings(tables, policies) {
    const warnings = [];
    const parsedTables = Array.from(tables.values()).filter((table) => table?.name);
    if (!parsedTables.length) return warnings;

    const withoutRls = parsedTables
      .filter((table) => table.rlsEnabled !== true)
      .map((table) => table.name)
      .sort();
    if (withoutRls.length) {
      warnings.push({
        level: "danger",
        title: "Schema audit found parsed tables without RLS enabled",
        body: `Add or import ALTER TABLE ... ENABLE ROW LEVEL SECURITY for: ${summarizeNames(withoutRls)}.`,
      });
    }

    const policyTables = new Set(policies.map((policy) => policy.table));
    const rlsWithoutPolicies = parsedTables
      .filter((table) => table.rlsEnabled === true && !policyTables.has(table.name))
      .map((table) => table.name)
      .sort();
    if (rlsWithoutPolicies.length) {
      warnings.push({
        level: "danger",
        title: "Schema audit found RLS-enabled tables with no parsed policies",
        body: `These tables will deny normal client access until policies are added: ${summarizeNames(rlsWithoutPolicies)}.`,
      });
    }

    const userScopedRoles = new Set(["anon", "authenticated", "public"]);
    const serverOnlyTables = parsedTables
      .filter((table) => {
        if (table.rlsEnabled !== true || !policyTables.has(table.name)) return false;
        return !policies.some((policy) => policy.table === table.name && policy.roles.some((role) => userScopedRoles.has(role)));
      })
      .map((table) => table.name)
      .sort();
    if (serverOnlyTables.length) {
      warnings.push({
        level: "warning",
        title: "Schema audit found RLS tables without anon/authenticated policies",
        body: `User-scoped Supabase clients will see empty reads or denied writes unless these tables are intentionally server-only: ${summarizeNames(serverOnlyTables)}.`,
      });
    }

    return warnings;
  }

  function summarizeNames(names, limit = 6) {
    const shown = names.slice(0, limit).join(", ");
    return names.length > limit ? `${shown}, and ${names.length - limit} more` : shown;
  }

  function buildDecisionWarnings(input, matrix) {
    const warnings = [];

    if (input.operation === "update") {
      const usingFailures = matrix.filter((attempt) => {
        const usingPhase = attempt.phaseResults.find((phase) => phase.name === "USING");
        const withCheckPhase = attempt.phaseResults.find((phase) => phase.name === "WITH CHECK");
        return usingPhase && !usingPhase.allowed && (!withCheckPhase || withCheckPhase.allowed);
      });

      if (usingFailures.length) {
        warnings.push({
          level: "danger",
          title: "UPDATE is blocked by USING on the existing row",
          body:
            "For upsert/onConflict requests, a conflict takes the UPDATE path. PostgreSQL checks USING against the existing row before WITH CHECK validates the new values, so a row owned by another user cannot be claimed by a normal client update.",
        });
      }
    }

    return dedupeWarnings(warnings);
  }

  function buildSqlTests(input, rlsEnabled, matchingPolicies, matrix) {
    const role = input.role === "service_role" ? "service_role" : input.role;
    const uid = input.role === "anon" ? "" : input.uid || "";
    const claims = {
      ...normalizeObject(input.jwt),
      role,
      sub: uid || normalizeObject(input.jwt).sub,
    };
    const firstRow = input.operation === "insert" ? normalizeObject(input.newRow) : normalizeObject(input.rows?.[0]);
    const jsonRow = JSON.stringify(firstRow, null, 2).replace(/'/g, "''");
    const qualifiedTable = quoteQualifiedName(input.table);
    const operationProbe = buildOperationProbe(input, firstRow, qualifiedTable);

    return `-- RLS Lens smoke test for ${input.table}
-- Run in a local Supabase SQL editor or psql transaction, then rollback.
-- This script is intentionally wrapped in a transaction.
begin;

set local role ${quoteIdent(role)};
set local request.jwt.claims = '${JSON.stringify(claims).replace(/'/g, "''")}';

-- Expected sample result from this simulator: ${matrix.filter((row) => row.allowed).length}/${matrix.length} allowed.
-- RLS detected: ${rlsEnabled ? "yes" : "no"}
-- Matching parsed policies: ${matchingPolicies.map((policy) => policy.name).join(", ") || "none"}
-- Expected table privilege: GRANT ${input.operation.toUpperCase()} ON ${input.table} TO ${role};

select current_user as simulated_role;
select has_table_privilege(current_user, ${quoteLiteral(input.table)}, ${quoteLiteral(input.operation)}) as role_has_table_privilege;

-- Replace this JSON with one of your real rows when validating.
select '${jsonRow}'::jsonb as sample_row;

-- Operation-specific probe generated from the current sample input.
${operationProbe}

rollback;`;
  }

  function buildOperationProbe(input, firstRow, qualifiedTable) {
    const operation = input.operation;
    if (operation === "select") {
      return buildSelectProbe(firstRow, qualifiedTable);
    }
    if (operation === "insert") {
      return buildInsertProbe(normalizeObject(input.newRow), qualifiedTable);
    }
    if (operation === "update") {
      return buildUpdateProbe(normalizeObject(firstRow), normalizeObject(input.newRow), qualifiedTable);
    }
    if (operation === "delete") {
      return buildDeleteProbe(normalizeObject(firstRow), qualifiedTable);
    }
    return "-- Unsupported operation.";
  }

  function buildSelectProbe(row, qualifiedTable) {
    const where = buildWhereClause(normalizeObject(row));
    const exactProbe = where
      ? `\n-- Exact sample-row probe. Edit the WHERE clause if these columns are not unique.\nselect * from ${qualifiedTable}\nwhere ${where}\nlimit 5;`
      : "";
    return `select * from ${qualifiedTable} limit 5;${exactProbe}`;
  }

  function buildInsertProbe(row, qualifiedTable) {
    const entries = Object.entries(normalizeObject(row));
    if (!entries.length) {
      return `-- Add insert columns before running.\n-- insert into ${qualifiedTable} (column_name) values ('value') returning *;`;
    }
    const columns = entries.map(([key]) => quoteIdent(key)).join(", ");
    const values = entries.map(([, value]) => sqlLiteral(value)).join(", ");
    return `insert into ${qualifiedTable} (${columns})\nvalues (${values})\nreturning *;`;
  }

  function buildUpdateProbe(existingRow, newRow, qualifiedTable) {
    const setEntries = Object.entries(newRow);
    if (!setEntries.length) {
      return `-- Add update values before running.\n-- update ${qualifiedTable} set column_name = 'value' where ${buildWhereClause(existingRow) || "false"} returning *;`;
    }
    const setClause = setEntries.map(([key, value]) => `${quoteIdent(key)} = ${sqlLiteral(value)}`).join(", ");
    const where = buildWhereClause(existingRow);
    if (!where) {
      return `-- Add a safe WHERE clause before running.\n-- update ${qualifiedTable} set ${setClause} where false returning *;`;
    }
    return `update ${qualifiedTable}\nset ${setClause}\nwhere ${where}\nreturning *;`;
  }

  function buildDeleteProbe(row, qualifiedTable) {
    const where = buildWhereClause(row);
    if (!where) {
      return `-- Add a safe WHERE clause before running.\n-- delete from ${qualifiedTable} where false returning *;`;
    }
    return `delete from ${qualifiedTable}\nwhere ${where}\nreturning *;`;
  }

  function buildWhereClause(row) {
    const entries = Object.entries(normalizeObject(row))
      .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
      .slice(0, 3);
    if (!entries.length) return "";
    return entries.map(([key, value]) => `${quoteIdent(key)} = ${sqlLiteral(value)}`).join(" and ");
  }

  function parseTables(statements) {
    const tables = new Map();

    statements.forEach((statement) => {
      const createMatch = statement.match(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)/i);
      if (createMatch) {
        const name = normalizeTableName(createMatch[1]);
        tables.set(name, { ...(tables.get(name) || {}), name });
      }

      const alterMatch = statement.match(/\balter\s+table\s+(?:if\s+exists\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?).*\benable\s+row\s+level\s+security\b/i);
      if (alterMatch) {
        const name = normalizeTableName(alterMatch[1]);
        tables.set(name, { ...(tables.get(name) || {}), name, rlsEnabled: true });
      }
    });

    return tables;
  }

  function parsePolicies(statements) {
    return statements
      .map(parsePolicy)
      .filter(Boolean);
  }

  function parseGrants(statements) {
    return statements.flatMap((statement) => {
      const compact = normalizeWhitespace(statement);
      const match = compact.match(/\bgrant\s+(.+?)\s+on\s+(?:table\s+)?(.+?)\s+to\s+(.+?)(?:\s+with\s+grant\s+option)?$/i);
      if (!match) return [];

      const privileges = parseGrantPrivileges(match[1]);
      const tables = parseGrantTables(match[2]);
      const roles = match[3]
        .split(",")
        .map((role) => unquoteSqlName(role.trim()).toLowerCase())
        .filter(Boolean);

      return tables.map((table) => ({
        privileges,
        table,
        roles,
        raw: statement.trim(),
      }));
    });
  }

  function parseIndexes(statements) {
    return statements.flatMap((statement) => {
      const compact = normalizeWhitespace(statement);
      const indexes = [];

      const createIndex = compact.match(/\bcreate\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:(?:"[^"]+"|\w+)\s+)?on\s+(?:only\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)\s*(?:using\s+\w+\s*)?\((.+)\)/i);
      if (createIndex) {
        indexes.push({
          table: normalizeTableName(createIndex[2]),
          columns: parseIndexedColumns(createIndex[3]),
          kind: createIndex[1] ? "unique index" : "index",
          raw: statement.trim(),
        });
      }

      const alterConstraint = compact.match(/\balter\s+table\s+(?:only\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?).*\b(primary\s+key|unique)\s*\((.+)\)/i);
      if (alterConstraint) {
        indexes.push({
          table: normalizeTableName(alterConstraint[1]),
          columns: parseIndexedColumns(alterConstraint[3]),
          kind: alterConstraint[2].toLowerCase(),
          raw: statement.trim(),
        });
      }

      const createTable = compact.match(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)/i);
      if (createTable) {
        const table = normalizeTableName(createTable[1]);
        indexes.push(...parseCreateTableIndexes(statement, table));
      }

      return indexes.filter((index) => index.columns.length);
    });
  }

  function parseCreateTableIndexes(statement, table) {
    const openIndex = statement.indexOf("(");
    if (openIndex < 0) return [];
    const closeIndex = findMatchingParen(statement, openIndex);
    if (closeIndex < 0) return [];

    return splitTopLevelCommas(statement.slice(openIndex + 1, closeIndex)).flatMap((item) => {
      const compact = normalizeWhitespace(item);
      const tableConstraint = compact.match(/^(?:constraint\s+(?:"[^"]+"|\w+)\s+)?(primary\s+key|unique)\s*\((.+)\)/i);
      if (tableConstraint) {
        return [
          {
            table,
            columns: parseIndexedColumns(tableConstraint[2]),
            kind: tableConstraint[1].toLowerCase(),
            raw: item.trim(),
          },
        ];
      }

      const columnMatch = compact.match(/^("[^"]+"|\w+)\s+.+\b(primary\s+key|unique)\b/i);
      if (columnMatch) {
        return [
          {
            table,
            columns: [unquoteSqlName(columnMatch[1]).toLowerCase()],
            kind: columnMatch[2].toLowerCase(),
            raw: item.trim(),
          },
        ];
      }

      return [];
    });
  }

  function parseIndexedColumns(value) {
    return splitTopLevelCommas(value)
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return "";
        if (trimmed.startsWith('"')) {
          const end = trimmed.indexOf('"', 1);
          return end > 0 ? unquoteSqlName(trimmed.slice(0, end + 1)).toLowerCase() : "";
        }
        const match = trimmed.match(/^(\w+)/);
        if (!match) return "";
        if (trimmed.slice(match[0].length).trim().startsWith("(")) return "";
        return match[1].toLowerCase();
      })
      .filter(Boolean);
  }

  function splitTopLevelCommas(value) {
    const parts = [];
    let current = "";
    let depth = 0;
    let quote = null;

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];
      const next = value[i + 1];

      if (quote) {
        current += char;
        if (char === quote && next === quote) {
          current += next;
          i += 1;
          continue;
        }
        if (char === quote) quote = null;
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        current += char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function authUidComparedColumns(policy) {
    const expression = prepareExpression([policy.using, policy.withCheck].filter(Boolean).join(" and "));
    return authUidComparedColumnsInExpression(expression);
  }

  function authUidComparedColumnsInExpression(expression) {
    const prepared = prepareExpression(expression || "");
    const columns = [];
    const left = /\bauth\.uid\s*\(\s*\)\s*=\s*("?[\w]+"?)/gi;
    const right = /("?[\w]+"?)\s*=\s*\bauth\.uid\s*\(\s*\)/gi;
    let match;

    while ((match = left.exec(prepared))) {
      columns.push(unquoteSqlName(match[1]).toLowerCase());
    }
    while ((match = right.exec(prepared))) {
      columns.push(unquoteSqlName(match[1]).toLowerCase());
    }

    return unique(columns.filter((column) => !["null", "true", "false"].includes(column)));
  }

  function storageFoldernameAuthChecks(expression) {
    const prepared = prepareExpression(expression || "");
    const checks = [];
    const folderExpr = String.raw`\(?\s*storage\.foldername\s*\(\s*("?[\w]+"?)\s*\)\s*\)?\s*\[\s*(\d+)\s*\]`;
    const left = new RegExp(`${folderExpr}\\s*=\\s*\\bauth\\.uid\\s*\\(\\s*\\)`, "gi");
    const right = new RegExp(`\\bauth\\.uid\\s*\\(\\s*\\)\\s*=\\s*${folderExpr}`, "gi");
    let match;

    while ((match = left.exec(prepared))) {
      checks.push({
        column: unquoteSqlName(match[1]).toLowerCase(),
        index: Number(match[2]),
      });
    }
    while ((match = right.exec(prepared))) {
      checks.push({
        column: unquoteSqlName(match[1]).toLowerCase(),
        index: Number(match[2]),
      });
    }

    return uniqueBy(
      checks.filter((check) => Number.isInteger(check.index) && check.index > 0),
      (check) => `${check.column}:${check.index}`
    );
  }

  function columnIsIndexed(indexes, column) {
    const normalized = column.toLowerCase();
    return indexes.some((index) => index.columns.map((item) => item.toLowerCase()).includes(normalized));
  }

  function parseGrantPrivileges(value) {
    const lower = value.toLowerCase();
    if (lower.includes("all")) return ["select", "insert", "update", "delete"];
    return lower
      .split(",")
      .map((privilege) => privilege.trim())
      .map((privilege) => privilege.split(/\s+/)[0])
      .filter((privilege) => ["select", "insert", "update", "delete"].includes(privilege));
  }

  function parseGrantTables(value) {
    const lower = value.toLowerCase();
    if (lower.startsWith("all tables in schema")) return ["*"];
    return value
      .split(",")
      .map((table) => normalizeTableName(table.trim()))
      .filter(Boolean);
  }

  function grantAllows(grants, operation, role) {
    return grants.some((grant) => {
      const roleMatches = grant.roles.includes("public") || grant.roles.includes(role.toLowerCase());
      const operationMatches = grant.privileges.includes(operation);
      return roleMatches && operationMatches;
    });
  }

  function parsePolicy(statement) {
    if (!/\bcreate\s+policy\b/i.test(statement)) return null;

    const compact = normalizeWhitespace(statement);
    const nameMatch = compact.match(/\bcreate\s+policy\s+("[^"]+"|'[^']+'|\w+)/i);
    const onMatch = compact.match(/\bon\s+((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)/i);
    if (!nameMatch || !onMatch) return null;

    const name = unquoteSqlName(nameMatch[1]);
    const table = normalizeTableName(onMatch[1]);
    const afterOn = compact.slice(onMatch.index + onMatch[0].length);
    const commandMatch = afterOn.match(/\bfor\s+(all|select|insert|update|delete)\b/i);
    const kindMatch = compact.match(/\bas\s+(permissive|restrictive)\b/i);
    const roles = parsePolicyRoles(afterOn);
    const using = extractParenthesizedClause(compact, "using");
    const withCheck = extractParenthesizedClause(compact, "with check");

    return {
      name,
      table,
      command: commandMatch ? commandMatch[1].toLowerCase() : "all",
      kind: kindMatch ? kindMatch[1].toLowerCase() : "permissive",
      roles: roles.values,
      rolesExplicit: roles.explicit,
      using,
      withCheck,
      raw: statement.trim(),
    };
  }

  function parsePolicyRoles(afterOn) {
    const toMatch = afterOn.match(/\bto\s+(.+?)(?=\s+(using|with\s+check)\s*\(|\s+as\s+(permissive|restrictive)\b|$)/i);
    if (!toMatch) {
      return { explicit: false, values: ["public"] };
    }

    const values = toMatch[1]
      .split(",")
      .map((role) => unquoteSqlName(role.trim()))
      .map((role) => role.toLowerCase())
      .filter(Boolean);

    return {
      explicit: true,
      values: values.length ? values : ["public"],
    };
  }

  function policyApplies(policy, operation, role) {
    const commandMatches = policy.command === "all" || policy.command === operation;
    const roleMatches = policy.roles.includes("public") || policy.roles.includes(role.toLowerCase());
    return commandMatches && roleMatches;
  }

  function extractParenthesizedClause(statement, clause) {
    const escaped = clause.replace(/\s+/g, "\\s+");
    const match = new RegExp(`\\b${escaped}\\s*\\(`, "i").exec(statement);
    if (!match) return null;

    const start = match.index + match[0].lastIndexOf("(");
    const end = findMatchingParen(statement, start);
    if (end < 0) return null;
    return statement.slice(start + 1, end).trim();
  }

  function findMatchingParen(text, openIndex) {
    let depth = 0;
    let quote = null;
    for (let i = openIndex; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quote) {
        if (char === quote && next === quote) {
          i += 1;
          continue;
        }
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0) return i;
    }
    return -1;
  }

  function splitSqlStatements(sql) {
    const statements = [];
    let current = "";
    let quote = null;
    let dollarTag = null;

    for (let i = 0; i < sql.length; i += 1) {
      const char = sql[i];
      const rest = sql.slice(i);

      if (dollarTag) {
        current += char;
        if (rest.startsWith(dollarTag)) {
          current += dollarTag.slice(1);
          i += dollarTag.length - 1;
          dollarTag = null;
        }
        continue;
      }

      if (!quote) {
        const dollarMatch = rest.match(/^\$[A-Za-z0-9_]*\$/);
        if (dollarMatch) {
          dollarTag = dollarMatch[0];
          current += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      }

      if (quote) {
        current += char;
        if (char === quote && sql[i + 1] === quote) {
          current += sql[i + 1];
          i += 1;
          continue;
        }
        if (char === quote) quote = null;
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        current += char;
        continue;
      }

      if (char === ";") {
        if (current.trim()) statements.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    if (current.trim()) statements.push(current.trim());
    return statements;
  }

  function stripSqlComments(sql) {
    return sql
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function normalizeTableName(value) {
    const parts = value
      .split(".")
      .map((part) => unquoteSqlName(part.trim()))
      .filter(Boolean);
    if (parts.length === 1) return `public.${parts[0].toLowerCase()}`;
    return `${parts[0].toLowerCase()}.${parts[1].toLowerCase()}`;
  }

  function quoteIdent(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function quoteQualifiedName(value) {
    return String(value)
      .split(".")
      .filter(Boolean)
      .map((part) => quoteIdent(unquoteSqlName(part.trim())))
      .join(".");
  }

  function quoteLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  function sqlLiteral(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return `${quoteLiteral(JSON.stringify(value))}::jsonb`;
    return quoteLiteral(value);
  }

  function unquoteSqlName(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1).replace(/""/g, '"').replace(/''/g, "'");
    }
    return trimmed;
  }

  function evaluateExpression(expression, row, context) {
    const prepared = prepareExpression(expression);
    try {
      const parser = new ExpressionParser(tokenize(prepared), row, context);
      const value = parser.parse();
      const notes = parser.notes.slice();
      if (parser.hasRemainingTokens()) {
        notes.push(`Unsupported trailing SQL near "${parser.peek()?.raw || ""}".`);
      }
      return {
        value: value === true,
        notes,
      };
    } catch (error) {
      return {
        value: false,
        notes: [`Could not evaluate "${expression}": ${error.message}`],
      };
    }
  }

  function prepareExpression(expression) {
    return expression
      .replace(/\(\s*select\s+auth\.uid\s*\(\s*\)\s*\)/gi, "auth.uid()")
      .replace(/\(\s*select\s+auth\.jwt\s*\(\s*\)\s*\)/gi, "auth.jwt()")
      .replace(/\bselect\s+auth\.uid\s*\(\s*\)/gi, "auth.uid()")
      .replace(/\bselect\s+auth\.jwt\s*\(\s*\)/gi, "auth.jwt()")
      .replace(/::\s*(?:"[^"]+"|\w+)(?:\s*\[\s*\])?/g, "");
  }

  function tokenize(expression) {
    const tokens = [];
    let i = 0;
    while (i < expression.length) {
      const char = expression[i];
      const rest = expression.slice(i);

      if (/\s/.test(char)) {
        i += 1;
        continue;
      }

      if (char === "'") {
        let value = "";
        i += 1;
        while (i < expression.length) {
          if (expression[i] === "'" && expression[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          if (expression[i] === "'") {
            i += 1;
            break;
          }
          value += expression[i];
          i += 1;
        }
        tokens.push({ type: "string", value, raw: `'${value}'` });
        continue;
      }

      if (char === '"') {
        let value = "";
        i += 1;
        while (i < expression.length && expression[i] !== '"') {
          value += expression[i];
          i += 1;
        }
        i += 1;
        tokens.push({ type: "identifier", value, raw: `"${value}"` });
        continue;
      }

      const multiOp = rest.match(/^(->>|->|<>|!=|<=|>=)/);
      if (multiOp) {
        tokens.push({ type: "operator", value: multiOp[1].toLowerCase(), raw: multiOp[1] });
        i += multiOp[1].length;
        continue;
      }

      if ("(),=<>.[]".includes(char)) {
        tokens.push({ type: "symbol", value: char, raw: char });
        i += 1;
        continue;
      }

      const numberMatch = rest.match(/^-?\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: "number", value: Number(numberMatch[0]), raw: numberMatch[0] });
        i += numberMatch[0].length;
        continue;
      }

      const identifierMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/);
      if (identifierMatch) {
        const raw = identifierMatch[0];
        const lower = raw.toLowerCase();
        tokens.push({ type: "identifier", value: lower, raw });
        i += raw.length;
        continue;
      }

      throw new Error(`Unexpected token "${char}".`);
    }
    return tokens;
  }

  class ExpressionParser {
    constructor(tokens, row, context) {
      this.tokens = tokens;
      this.index = 0;
      this.row = normalizeObject(row);
      this.context = context;
      this.notes = [];
    }

    parse() {
      if (!this.tokens.length) return false;
      return this.parseOr();
    }

    hasRemainingTokens() {
      return this.index < this.tokens.length;
    }

    peek(offset = 0) {
      return this.tokens[this.index + offset];
    }

    consume(value) {
      const token = this.peek();
      if (!token) return null;
      if (token.value === value || token.raw.toLowerCase() === value) {
        this.index += 1;
        return token;
      }
      return null;
    }

    expect(value) {
      const token = this.consume(value);
      if (!token) throw new Error(`Expected ${value}.`);
      return token;
    }

    parseOr() {
      let left = this.parseAnd();
      while (this.consume("or")) {
        const right = this.parseAnd();
        left = sqlBool(left) || sqlBool(right);
      }
      return left;
    }

    parseAnd() {
      let left = this.parseNot();
      while (this.consume("and")) {
        const right = this.parseNot();
        left = sqlBool(left) && sqlBool(right);
      }
      return left;
    }

    parseNot() {
      if (this.consume("not")) {
        return !sqlBool(this.parseNot());
      }
      return this.parseComparison();
    }

    parseComparison() {
      let left = this.parsePrimary();
      left = this.parsePostfix(left);
      const token = this.peek();
      if (!token) return left;

      if (this.consume("is")) {
        const negated = Boolean(this.consume("not"));
        this.expect("null");
        const isNull = left === null || left === undefined;
        return negated ? !isNull : isNull;
      }

      if (this.consume("in")) {
        this.expect("(");
        const values = [];
        while (!this.consume(")")) {
          let value = this.parsePrimary();
          value = this.parsePostfix(value);
          values.push(value);
          this.consume(",");
          if (!this.peek()) throw new Error("Unclosed IN list.");
        }
        return values.some((value) => sqlCompare("=", left, value));
      }

      if (this.consume("like")) {
        let right = this.parsePrimary();
        right = this.parsePostfix(right);
        return sqlLike(left, right, false);
      }

      if (this.consume("ilike")) {
        let right = this.parsePrimary();
        right = this.parsePostfix(right);
        return sqlLike(left, right, true);
      }

      if (token.type === "operator" || ["=", "<", ">"].includes(token.value)) {
        const op = token.value;
        this.index += 1;
        let right = this.parsePrimary();
        right = this.parsePostfix(right);
        return sqlCompare(op, left, right);
      }

      return left;
    }

    parsePrimary() {
      const token = this.peek();
      if (!token) throw new Error("Unexpected end of expression.");

      if (this.consume("(")) {
        const value = this.parseOr();
        this.expect(")");
        return value;
      }

      if (token.type === "string" || token.type === "number") {
        this.index += 1;
        return token.value;
      }

      if (token.value === "true" || token.value === "false" || token.value === "null") {
        this.index += 1;
        if (token.value === "true") return true;
        if (token.value === "false") return false;
        return null;
      }

      if (token.type === "identifier") {
        return this.parseIdentifierOrFunction();
      }

      throw new Error(`Unexpected token "${token.raw}".`);
    }

    parsePostfix(value) {
      let current = value;
      let changed = true;
      while (changed) {
        changed = false;
        const beforeJson = this.index;
        current = this.parseJsonPostfix(current);
        if (this.index !== beforeJson) changed = true;

        while (this.consume("[")) {
          const index = this.parseOr();
          this.expect("]");
          if (Array.isArray(current)) {
            current = current[Number(index) - 1] ?? null;
          } else if (current && typeof current === "object") {
            current = current[index] ?? null;
          } else {
            current = null;
          }
          changed = true;
        }
      }
      return current;
    }

    parseIdentifierOrFunction() {
      const parts = [this.peek().value];
      this.index += 1;
      while (this.consume(".")) {
        const part = this.peek();
        if (!part || part.type !== "identifier") throw new Error("Expected identifier after dot.");
        parts.push(part.value);
        this.index += 1;
      }

      const name = parts.join(".");
      if (this.consume("(")) {
        const args = [];
        while (!this.consume(")")) {
          if (!this.peek()) throw new Error(`Unclosed function call ${name}.`);
          args.push(this.parseOr());
          this.consume(",");
        }
        return this.evaluateFunction(name, args);
      }

      if (Object.prototype.hasOwnProperty.call(this.row, name)) return this.row[name];
      if (parts.length === 2 && Object.prototype.hasOwnProperty.call(this.row, parts[1])) return this.row[parts[1]];
      this.notes.push(`Column or value "${name}" was not present in the sample row; treated as null.`);
      return null;
    }

    parseJsonPostfix(value) {
      let current = value;
      while (this.peek()?.value === "->" || this.peek()?.value === "->>") {
        const op = this.peek().value;
        this.index += 1;
        const keyToken = this.peek();
        if (!keyToken || !["string", "identifier", "number"].includes(keyToken.type)) {
          throw new Error(`Expected key after ${op}.`);
        }
        this.index += 1;
        const key = keyToken.value;
        if (current && typeof current === "object") {
          current = current[key];
        } else {
          current = null;
        }
        if (op === "->>" && current !== null && current !== undefined) current = String(current);
      }
      return current;
    }

    evaluateFunction(name, args) {
      if (name === "auth.uid") return this.context.uid;
      if (name === "auth.role") return this.context.role;
      if (name === "auth.jwt") return this.context.jwt;
      if (name === "current_user" || name === "current_role") return this.context.role;
      if (name === "storage.foldername") return storageFoldername(args[0]);
      if (name === "coalesce") {
        return args.find((arg) => arg !== null && arg !== undefined) ?? null;
      }
      if (name === "lower") return args[0] === null || args[0] === undefined ? null : String(args[0]).toLowerCase();
      if (name === "upper") return args[0] === null || args[0] === undefined ? null : String(args[0]).toUpperCase();
      this.notes.push(`Function "${name}" is not simulated; treated as null.`);
      return null;
    }
  }

  function sqlBool(value) {
    return value === true;
  }

  function sqlCompare(op, left, right) {
    if (left === null || left === undefined || right === null || right === undefined) return false;
    const normalizedLeft = normalizeComparable(left);
    const normalizedRight = normalizeComparable(right);

    if (op === "=") return normalizedLeft === normalizedRight;
    if (op === "!=" || op === "<>") return normalizedLeft !== normalizedRight;
    if (op === "<") return normalizedLeft < normalizedRight;
    if (op === ">") return normalizedLeft > normalizedRight;
    if (op === "<=") return normalizedLeft <= normalizedRight;
    if (op === ">=") return normalizedLeft >= normalizedRight;
    return false;
  }

  function normalizeComparable(value) {
    if (typeof value === "string") return value.toLowerCase();
    return value;
  }

  function sqlLike(left, right, caseInsensitive) {
    if (left === null || left === undefined || right === null || right === undefined) return false;
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `^${escapeRegExp(String(right)).replace(/%/g, ".*").replace(/_/g, ".")}$`;
    const flags = caseInsensitive ? "i" : "";
    return new RegExp(pattern, flags).test(String(left));
  }

  function storageFoldername(value) {
    if (value === null || value === undefined) return [];
    const parts = String(value).split("/").filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1) : [];
  }

  function normalizeObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    return {};
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function uniqueBy(values, getKey) {
    const seen = new Set();
    return values.filter((value) => {
      const key = getKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function dedupeWarnings(warnings) {
    const seen = new Set();
    return warnings.filter((warning) => {
      const key = `${warning.level}:${warning.title}:${warning.body}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderEmpty() {
    els["panel-matrix"].innerHTML = `<div class="empty-state">Paste policies and sample rows, then run the analyzer.</div>`;
    els["panel-policies"].innerHTML = `<div class="empty-state">Parsed policies will appear here.</div>`;
    els["panel-fixes"].innerHTML = `<div class="empty-state">Warnings and next fixes will appear here.</div>`;
    els["panel-sql"].innerHTML = `<div class="empty-state">Generated SQL checks will appear here.</div>`;
  }

  function renderError(message) {
    els["report-title"].textContent = "Input error";
    els["report-badge"].textContent = "Error";
    els["report-badge"].className = "status-pill denied";
    els.metrics.innerHTML = "";
    els["panel-matrix"].innerHTML = `<div class="notice danger"><strong>Could not analyze.</strong><br>${escapeHtml(message)}</div>`;
    els["panel-policies"].innerHTML = "";
    els["panel-fixes"].innerHTML = "";
    els["panel-sql"].innerHTML = "";
  }

  function renderReport(report) {
    els["report-title"].textContent = report.status.title;
    els["report-badge"].textContent = report.status.badge;
    els["report-badge"].className = `status-pill ${report.status.className}`;

    const allowedCount = report.matrix.filter((row) => row.allowed).length;
    els.metrics.innerHTML = [
      metric("Allowed", `${allowedCount}/${report.matrix.length || 0}`),
      metric("Policies", String(report.matchingPolicies.length)),
      metric("Grants", String(report.matchingGrants.length)),
      metric("Indexes", String(report.matchingIndexes.length)),
      metric("Warnings", String(report.warnings.length)),
      metric("RLS", report.rlsEnabled ? "On" : "Off"),
    ].join("");

    renderMatrix(report);
    renderPolicies(report);
    renderFixes(report);
    renderSql(report);
  }

  function metric(label, value) {
    return `<div class="metric"><span class="value">${escapeHtml(value)}</span><span class="label">${escapeHtml(label)}</span></div>`;
  }

  function renderMatrix(report) {
    if (!report.matrix.length) {
      els["panel-matrix"].innerHTML = `<div class="empty-state">No sample rows were provided for this operation.</div>`;
      return;
    }

    const rows = report.matrix
      .map((attempt) => {
        const status = attempt.allowed
          ? `<span class="status-pill allowed">Allowed</span>`
          : `<span class="status-pill denied">Denied</span>`;
        const policies = attempt.phaseResults.length
          ? renderPolicyResultList(attempt.phaseResults)
          : `<span class="code">${escapeHtml(attempt.reason)}</span>`;
        const rowJson = report.input.operation === "update"
          ? `Before:\n${JSON.stringify(attempt.row, null, 2)}\n\nAfter:\n${JSON.stringify(attempt.newRow, null, 2)}`
          : JSON.stringify(attempt.row, null, 2);

        return `<tr>
          <td><strong>${escapeHtml(attempt.label)}</strong></td>
          <td>${status}</td>
          <td>${escapeHtml(attempt.reason)}</td>
          <td>${policies}</td>
          <td><pre class="row-json">${escapeHtml(rowJson)}</pre></td>
        </tr>`;
      })
      .join("");

    els["panel-matrix"].innerHTML = `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Attempt</th>
            <th>Result</th>
            <th>Why</th>
            <th>Policy checks</th>
            <th>Row</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function renderPolicyResultList(phaseResults) {
    const items = [];
    phaseResults.forEach((phase) => {
      phase.permissiveResults.concat(phase.restrictiveResults).forEach((result) => {
        const badge = result.allowed ? "allowed" : "denied";
        const notes = result.notes.length ? `: ${result.notes.join("; ")}` : "";
        items.push(`<li><span class="status-pill ${badge}">${result.allowed ? "Pass" : "Fail"}</span> ${escapeHtml(phase.name)} <span class="code">${escapeHtml(result.policy.name)}</span>${escapeHtml(notes)}</li>`);
      });
    });
    return `<ul class="reason-list">${items.join("")}</ul>`;
  }

  function renderPolicies(report) {
    if (!report.allPolicies.length && !report.grants.length && !report.indexes.length) {
      els["panel-policies"].innerHTML = `<div class="empty-state">No CREATE POLICY, GRANT, or index statements were parsed.</div>`;
      return;
    }

    const policyCards = report.allPolicies
      .map((policy) => {
        const selected = policy.table === report.input.table ? "green" : "";
        return `<article class="policy-card">
          <div class="policy-meta">
            <span class="chip ${selected}">${escapeHtml(policy.table)}</span>
            <span class="chip violet">${escapeHtml(policy.command.toUpperCase())}</span>
            <span class="chip">${escapeHtml(policy.kind)}</span>
            <span class="chip amber">TO ${escapeHtml(policy.roles.join(", "))}</span>
          </div>
          <h3>${escapeHtml(policy.name)}</h3>
          ${policy.using ? `<div><strong>USING</strong> <span class="code">${escapeHtml(policy.using)}</span></div>` : ""}
          ${policy.withCheck ? `<div><strong>WITH CHECK</strong> <span class="code">${escapeHtml(policy.withCheck)}</span></div>` : ""}
        </article>`;
      })
      .join("");

    const grantCards = report.grants
      .map((grant) => {
        const selected = grant.table === report.input.table || grant.table === "*" ? "green" : "";
        return `<article class="policy-card">
          <div class="policy-meta">
            <span class="chip ${selected}">${escapeHtml(grant.table === "*" ? "all tables in schema" : grant.table)}</span>
            <span class="chip violet">GRANT</span>
            <span class="chip">${escapeHtml(grant.privileges.join(", ").toUpperCase())}</span>
            <span class="chip amber">TO ${escapeHtml(grant.roles.join(", "))}</span>
          </div>
          <h3>Table privilege</h3>
          <div><span class="code">${escapeHtml(grant.raw)}</span></div>
        </article>`;
      })
      .join("");

    const indexCards = report.indexes
      .map((index) => {
        const selected = index.table === report.input.table || index.table === "*" ? "green" : "";
        return `<article class="policy-card">
          <div class="policy-meta">
            <span class="chip ${selected}">${escapeHtml(index.table)}</span>
            <span class="chip violet">${escapeHtml(index.kind.toUpperCase())}</span>
            <span class="chip">${escapeHtml(index.columns.join(", "))}</span>
          </div>
          <h3>Parsed index</h3>
          <div><span class="code">${escapeHtml(index.raw)}</span></div>
        </article>`;
      })
      .join("");

    els["panel-policies"].innerHTML = `<div class="stack">${policyCards}${grantCards}${indexCards}</div>`;
  }

  function renderFixes(report) {
    const warnings = report.warnings.length
      ? report.warnings
      : [
          {
            level: "notice",
            title: "No obvious first-pass warnings",
            body: "Validate against a local Supabase database before trusting this for production. This simulator covers common policy shapes, not the full PostgreSQL planner.",
          },
        ];

    els["panel-fixes"].innerHTML = `<div class="stack">${warnings
      .map((warning) => `<div class="notice ${warning.level === "danger" ? "danger" : warning.level === "warning" ? "warning" : ""}">
        <strong>${escapeHtml(warning.title)}</strong><br>${escapeHtml(warning.body)}
      </div>`)
      .join("")}</div>`;
  }

  function renderSql(report) {
    els["panel-sql"].innerHTML = `<pre>${escapeHtml(report.sqlTests)}</pre>`;
  }

  function downloadReport(report) {
    if (!report) return;
    const markdown = toMarkdownReport(report);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rls-lens-${report.input.table.replace(/[^a-z0-9]+/gi, "-")}-${report.input.operation}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadSupportBundle(report) {
    if (!report) return;
    const markdown = toSupportBundle(report);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rls-lens-support-${report.input.table.replace(/[^a-z0-9]+/gi, "-")}-${report.input.operation}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadSqlDiagnostic(report) {
    if (!report) return;
    const blob = new Blob([report.sqlTests], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rls-lens-diagnostic-${report.input.table.replace(/[^a-z0-9]+/gi, "-")}-${report.input.operation}.sql`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function toMarkdownReport(report) {
    const allowed = report.matrix.filter((row) => row.allowed).length;
    const rows = report.matrix
      .map((attempt) => `| ${attempt.label} | ${attempt.allowed ? "allowed" : "denied"} | ${attempt.reason.replace(/\|/g, "\\|")} |`)
      .join("\n");
    const warnings = report.warnings
      .map((warning) => `- ${warning.level.toUpperCase()}: ${warning.title} - ${warning.body}`)
      .join("\n") || "- No first-pass warnings.";
    const grants = report.matchingGrants
      .map((grant) => `- ${grant.privileges.join(", ").toUpperCase()} ON ${grant.table} TO ${grant.roles.join(", ")}`)
      .join("\n") || "- None parsed for this table.";
    const indexes = report.matchingIndexes
      .map((index) => `- ${index.kind.toUpperCase()} ON ${index.table} (${index.columns.join(", ")})`)
      .join("\n") || "- None parsed for this table.";

    return `# RLS Lens Report

Generated: ${report.generatedAt}

Table: ${report.input.table}
Operation: ${report.input.operation}
Role: ${report.input.role}
RLS detected: ${report.rlsEnabled ? "yes" : "no"}
Result: ${allowed}/${report.matrix.length} allowed

## Matrix

| Attempt | Result | Reason |
|---|---|---|
${rows}

## Warnings

${warnings}

## Parsed Policies

${report.matchingPolicies.map((policy) => `- ${policy.name}: ${policy.command.toUpperCase()} ${policy.kind} TO ${policy.roles.join(", ")}`).join("\n") || "- None"}

## Parsed Grants

${grants}

## Parsed Indexes

${indexes}

## SQL Smoke Test

\`\`\`sql
${report.sqlTests}
\`\`\`
`;
  }

  function toSupportBundle(report) {
    const allowed = report.matrix.filter((row) => row.allowed).length;
    const warningLines = report.warnings
      .map((warning) => `- ${warning.level.toUpperCase()}: ${redactSensitiveText(warning.title)} - ${redactSensitiveText(warning.body)}`)
      .join("\n") || "- No first-pass warnings.";
    const matrixLines = report.matrix
      .map((attempt) => `| ${redactSensitiveText(attempt.label)} | ${attempt.allowed ? "allowed" : "denied"} | ${redactSensitiveText(attempt.reason).replace(/\|/g, "\\|")} |`)
      .join("\n") || "| none | n/a | No sample rows were provided. |";
    const phaseLines = report.matrix
      .flatMap((attempt) =>
        attempt.phaseResults.flatMap((phase) =>
          phase.permissiveResults.concat(phase.restrictiveResults).map((result) =>
            `- ${redactSensitiveText(attempt.label)} / ${phase.name} / ${redactSensitiveText(result.policy.name)}: ${result.allowed ? "pass" : "fail"} (${redactSensitiveText(result.expression || "missing expression")})`
          )
        )
      )
      .join("\n") || "- No policy phase details were generated.";

    return `# RLS Lens Support Bundle

Generated: ${report.generatedAt}

This bundle is redacted by the browser before download. Review it before sending.

## RLS Unblock Pass

Use this bundle when requesting the RLS Unblock Pass:

- Buy/request page: ${checkoutUrl()}
- Scope: one table or Storage bucket policy path, one operation, one expected result.
- Do not include production JWTs, service-role keys, API keys, customer rows, or secrets.
- If anything below is still sensitive, delete it before sending.

## Scenario

- Table: ${redactSensitiveText(report.input.table)}
- Operation: ${report.input.operation}
- Role: ${report.input.role}
- Result: ${allowed}/${report.matrix.length} allowed
- RLS detected: ${report.rlsEnabled ? "yes" : "no"}

## What I expected

Write the expected result here.

## What happened

Write the actual Supabase client result or error here.

## Question for review

Write the one concrete question you want answered, for example:

- Why does this SELECT return an empty array for an authenticated user?
- Why does this INSERT fail with a row-level security error?
- Why does this upsert fail on UPDATE USING?

## Warnings

${warningLines}

## Decision Matrix

| Attempt | Result | Reason |
|---|---|---|
${matrixLines}

## Policy Phase Details

${phaseLines}

## Redacted SQL

\`\`\`sql
${redactSensitiveText(report.input.sql)}
\`\`\`

## Redacted Existing Rows

\`\`\`json
${redactSensitiveText(JSON.stringify(report.input.rows, null, 2))}
\`\`\`

## Redacted New Row

\`\`\`json
${redactSensitiveText(JSON.stringify(report.input.newRow, null, 2))}
\`\`\`

## Redacted JWT Claims

\`\`\`json
${redactSensitiveText(JSON.stringify(report.input.jwt, null, 2))}
\`\`\`
`;
  }

  function redactSensitiveText(value) {
    return String(value)
      .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[1-5][A-Fa-f0-9]{3}-[89ABab][A-Fa-f0-9]{3}-[A-Fa-f0-9]{12}/g, "[uuid]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[jwt]")
      .replace(/\b(sk|sbp|sb_secret|service_role)_[A-Za-z0-9_-]{16,}\b/g, "[secret]")
      .replace(/(password|secret|token|apikey|api_key|authorization)\s*[:=]\s*['"][^'"]+['"]/gi, "$1: [redacted]");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (typeof window !== "undefined") {
    window.RlsLens = {
      analyzeRls,
      parsePolicies,
      parseGrants,
      parseIndexes,
      evaluateExpression,
      toSupportBundle,
      redactSensitiveText,
      splitSqlStatements,
    };
  }
})();
