# Plan: 1000 — Implementation steps

Deliverable: one Next.js page + `POST` API that accepts **user instructions only** (no system prompt in v1), returns one agent reply, developed **without auth**, run locally via **`docker-compose.local.yml`** per `.claude/skills/docker-compose-local/SKILL.md`.

**References:** `spec.md`, `approach.md`, `.claude/skills/docker-compose-local/SKILL.md`.

**Compose scope:** App service only for now. Do **not** wire Postgres or Redis into the app for this phase.

---

## Phase 1 — Vertical slice: runnable stack + UI + stub agent

_End-to-end path works in the browser; API returns a deterministic stub instead of OpenAI._

1. **Pick app directory** for the Next app (e.g. repository root or `apps/web`). Every later step assumes this single directory as the Compose bind-mount target.
2. **Author `docker-compose.local.yml`** at the repo root:
   1. **App service only** — `ports:` published for browser access; bind mount app source; anonymous volume for `node_modules`; `env_file: .env`; command installs deps if needed then **`npm run dev`**.
   2. **No Postgres/Redis app wiring** — no DB/Redis environment variables, services, or `depends_on` entries for this phase.
3. **Scaffold Next.js** (App Router, TypeScript, Tailwind, ESLint) in the chosen directory.
4. **Init shadcn/ui** and add **Button**, **Textarea**, **Card**, **Alert** (min set for form + feedback).
5. **Add `.env.example`** with `OPENAI_API_KEY=` and `OPENAI_MODEL=` (empty placeholders). Ensure `.env` stays gitignored (repo `.gitignore` already covers `.env`).
6. **Implement Route Handler** `POST /api/agent` (path adjustable—keep client and docs in sync):
   1. Parse JSON `{ instructions: string }`.
   2. Reject empty/missing `instructions` with **400** and stable error shape.
   3. Return **200** with `{ reply: string }` using a **stub** (e.g. echo prefix or fixed string) — **no** OpenAI SDK dependency in Phase 1 yet.
7. **Implement client page** (default route **`/`** unless you prefer `/agent`): shadcn textarea + submit; loading state; `fetch` POST to `/api/agent`; show **reply** or **Alert** on error.
8. **Run**: `docker compose -f docker-compose.local.yml up` (add `--build` first time if Dockerfile/build step exists). Manual smoke: submit text → see stub reply.

**Phase 1 exit:** Compose up, UI → API → stub response verified manually.

---

## Phase 2 — Vertical slice: real OpenAI SDK + hardening

_Same URLs and UI; backend calls OpenAI via SDK with **user-only** payload._

1. **Add OpenAI SDK** dependency; ensure Route Handler uses **Node** runtime (not Edge).
2. **Implement `runInstructions`** (or equivalent module): accept trimmed user string; invoke SDK with **no separate system prompt** in v1 (SDK defaults only unless docs require explicit minimal args—keep behavior “user payload only”).
3. **Wire Route Handler** to call `runInstructions` instead of stub; map failures to **safe** HTTP responses (no stack traces or key material to client) per `spec.md` AC3.
4. **Validate secrets**: `OPENAI_API_KEY` and `OPENAI_MODEL` read server-side only; confirm no `NEXT_PUBLIC_` OpenAI vars.
5. **Tests:** handler/unit coverage for **400** on bad body; optional test for thrown SDK error → stable **5xx** body (mock SDK).
6. **Docs:** README snippet — copy `.env.example` → `.env`, run Compose command, open page URL.

**Phase 2 exit:** Manual smoke with real key returns model output; `npm run tsc` / lint clean for touched code.

---

## Verification checklist

1. Phase 1: stub flow works through Compose.
2. Phase 2: live SDK flow works; empty input **400**; error responses safe for browser.
3. No SDK imports under `"use client"` trees.
4. `spec.md` acceptance criteria AC1–AC6 satisfied after Phase 2.
