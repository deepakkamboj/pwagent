import prompts, { type PromptObject } from "prompts";

export interface PromptCancelled {
  cancelled: true;
}

/**
 * Wrapper around `prompts` that signals user cancellation (Ctrl+C) explicitly
 * rather than returning an empty object. Callers can branch on `cancelled`.
 */
export async function ask<T extends Record<string, unknown>>(
  questions: PromptObject<keyof T & string> | PromptObject<keyof T & string>[],
): Promise<T | PromptCancelled> {
  let cancelled = false;
  const result = (await prompts(questions, {
    onCancel: () => {
      cancelled = true;
      return false;
    },
  })) as T;

  if (cancelled) return { cancelled: true };
  return result;
}

export async function confirm(message: string, initial = true): Promise<boolean> {
  const r = await ask<{ ok: boolean }>({
    type: "confirm",
    name: "ok",
    message,
    initial,
  });
  if ("cancelled" in r) return false;
  return r.ok === true;
}

export async function selectOne<T extends string>(
  message: string,
  choices: { title: string; value: T; description?: string }[],
): Promise<T | undefined> {
  const r = await ask<{ pick: T }>({
    type: "select",
    name: "pick",
    message,
    choices: choices.map((c) => ({ title: c.title, value: c.value, description: c.description })),
  });
  if ("cancelled" in r) return undefined;
  return r.pick;
}

export async function text(message: string, initial?: string): Promise<string | undefined> {
  const r = await ask<{ value: string }>({
    type: "text",
    name: "value",
    message,
    initial,
  });
  if ("cancelled" in r) return undefined;
  return r.value;
}
