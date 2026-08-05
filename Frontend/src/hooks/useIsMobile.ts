import { useEffect, useState } from "react";

// Drives layout decisions (off-canvas sidebar, hamburger visibility, etc.) via
// plain JS + inline styles rather than Tailwind responsive utility classes
// (md:hidden, translate-x-*, ...) — this app has unlayered legacy CSS (antd's
// global reset) that has previously been found to silently beat Tailwind's
// own layered utilities in the cascade, so a class-based breakpoint could
// compile correctly and still visibly do nothing. Inline styles computed from
// this hook always win short of an actual `!important` rule.
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
