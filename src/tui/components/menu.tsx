import { Box, Text } from "ink";
import { theme } from "../theme.js";

const MAX_VISIBLE = 10;

export interface MenuItem {
  value: string;
  left: string;
  right?: string;
}

export function Menu({
  items,
  index,
  nameWidth = 16,
  hint,
}: {
  items: MenuItem[];
  index: number;
  nameWidth?: number;
  hint?: string | null;
}) {
  if (items.length === 0) return null;

  const total = items.length;
  let start = 0;
  if (total > MAX_VISIBLE) {
    start = Math.min(
      Math.max(0, index - Math.floor(MAX_VISIBLE / 2)),
      total - MAX_VISIBLE,
    );
  }
  const visible = items.slice(start, start + MAX_VISIBLE);

  return (
    <Box flexDirection="column" width="100%" flexShrink={0}>
      {visible.map((item, offset) => {
        const i = start + offset;
        const active = i === index;
        const fg = active ? theme.menuSelectedFg : undefined;
        return (
          <Box
            key={item.value}
            width="100%"
            paddingX={2}
            backgroundColor={active ? theme.menuSelectedBg : undefined}
          >
            <Text color={active ? fg : theme.menuText}>
              {String(item.left).padEnd(nameWidth)}
            </Text>
            <Text color={active ? fg : theme.menuDesc}>{item.right}</Text>
          </Box>
        );
      })}
      {hint ? (
        <Box paddingX={2} marginTop={1}>
          <Text color={theme.muted}>{hint}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
