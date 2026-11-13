import { Notice } from "@/app/_components/dashboard-shell";

/** Mostra a mensagem que uma Server Action deixou na URL (?ok= ou ?error=). */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error)
    return (
      <div className="mb-6">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  if (ok)
    return (
      <div className="mb-6">
        <Notice tone="success">{ok}</Notice>
      </div>
    );
  return null;
}
