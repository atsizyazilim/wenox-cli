import { useEffect, useState } from "react";

export function useBlink(interval = 530) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setOn((value) => !value), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return on;
}
