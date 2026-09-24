import path from "node:path";

// --- Kullanıcı tanımlı izin kalıpları (config.permissions) ------------------
//
// Her kural bir aracı ve kalıbı eşler: allow (izin sormadan çalıştır), ask
// (her zaman sor), deny (reddet). İlk eşleşen kural kazanır; hiçbiri eşleşmezse
// varsayılan davranış (proje içi serbest, dışı sor) geçerlidir.

export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionRule {
  tool: string;
  pattern: string;
  action: PermissionAction;
}

const ACTIONS: ReadonlySet<string> = new Set(["allow", "ask", "deny"]);

// `*` tek yol parçası, `**` her şey. Yol kurallarında dosya adı da denenir,
// böylece `*.env` için tam yolu yazmak gerekmez.
function patternToRegExp(pattern: string): RegExp | null {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        i += 1;
        out += ".*";
      } else {
        out += "[^/\\\\]*";
      }
      continue;
    }
    out += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  try {
    return new RegExp(`^${out}$`, "i");
  } catch {
    return null;
  }
}

function matches(pattern: string, value: string): boolean {
  const regex = patternToRegExp(pattern);
  if (!regex) return false;
  return regex.test(value) || regex.test(path.basename(value));
}

export function normalizeRules(raw: unknown): PermissionRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: PermissionRule[] = [];
  for (const entry of raw) {
    const item = entry as Partial<PermissionRule> | null;
    const tool = String(item?.tool ?? "").trim();
    const pattern = String(item?.pattern ?? "").trim();
    const action = String(item?.action ?? "").trim().toLowerCase();
    if (!tool || !pattern || !ACTIONS.has(action)) continue;
    rules.push({ tool, pattern, action: action as PermissionAction });
  }
  return rules;
}

export function evaluateRules(
  rules: PermissionRule[],
  tool: string,
  value: string | null | undefined,
): PermissionAction | null {
  if (!value) return null;
  for (const rule of rules) {
    if (rule.tool !== tool && rule.tool !== "*") continue;
    if (matches(rule.pattern, value)) return rule.action;
  }
  return null;
}

// Salt okunur araçlar için kontrol edilen değer yol, komutlar için komuttur.
export function permissionTarget(tool: string, args: Record<string, unknown>): string | null {
  if (tool === "run_command") return String(args.command ?? "") || null;
  const target = args.path;
  return target == null ? null : String(target);
}

// .env dosyaları sır taşır: proje içinde olsa bile izin istenir.
export function isSecretFile(target: string | null | undefined): boolean {
  if (!target) return false;
  const name = path.basename(String(target)).toLowerCase();
  return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
}
