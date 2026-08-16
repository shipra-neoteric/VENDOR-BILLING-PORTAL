import { useCallback, useState } from "react";

// Lightweight replacement for antd Form's validation engine, for pages built
// on ui/Field and ui/SField (both take a plain `error?: string` prop). Pages
// write their own synchronous validate() that calls setError per field
// (including cross-field checks, e.g. confirm-password vs. password) and run
// it before submitting — no schema, no validation-rule DSL, just strings.
export function useFormErrors<T extends string>() {
  const [errors, setErrors] = useState<Partial<Record<T, string>>>({});

  const setError = useCallback((field: T, message: string | null) => {
    setErrors((prev) => {
      if (message === null) {
        if (!(field in prev)) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: message };
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  return { errors, setError, clearAll };
}
