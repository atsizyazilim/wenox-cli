import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { padTo, sliceByWidth, textWidth } from "../../utils.js";
import { theme } from "../theme.js";
import { toastCard } from "./toast.js";

export interface TextSelection {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

function rangeFor(
  selection: TextSelection | null | undefined,
  lineIndex: number,
  width: number,
): [number, number] | null {
  if (!selection) return null;
  const { startLine, startCol, endLine, endCol } = selection;
  if (lineIndex < startLine || lineIndex > endLine) return null;
  const from = lineIndex === startLine ? startCol : 0;
  const to = lineIndex === endLine ? endCol : width;
  if (to <= from) return null;
  return [Math.max(0, from), Math.min(width, to)];
}

function renderLine(
  line: string,
  range: [number, number] | null,
  key: number,
): ReactNode {
  const text = line === "" ? " " : line;
  if (!range) return <Text key={key}>{text}</Text>;

  const before = sliceByWidth(text, 0, range[0]);
  const selected = sliceByWidth(text, range[0], range[1]);
  const after = sliceByWidth(text, range[1], textWidth(text));

  return (
    <Text key={key}>
      <Text>{before}</Text>
      <Text backgroundColor={theme.selectionBg} color={theme.selectionFg}>
        {selected}
      </Text>
      <Text>{after}</Text>
    </Text>
  );
}

export function Transcript({
  lines,
  offset,
  height,
  selection,
  toast,
  contentWidth,
}: {
  lines: string[];
  offset: number;
  height: number;
  selection?: TextSelection | null;
  toast?: string | null;
  contentWidth: number;
}) {
  const visible = lines.slice(offset, offset + height);
  const card = toast ? toastCard(toast) : null;
  const leftWidth = card ? Math.max(1, contentWidth - card.width) : 0;

  // Hızlı yol: bildirim kartı ve seçim yokken tüm görünür blok TEK metin olarak
  // çizilir. Satır başına düğüm oluşturmak, akış sırasında (saniyede ~20 çizim)
  // Ink'in düzeni yeniden ölçmesine yol açıp arayüzü kilitliyordu.
  if (!card && !selection) {
    return (
      <Box flexDirection="column" height={height} overflow="hidden">
        <Text>{visible.join("\n")}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visible.map((line, i) => {
        const lineIndex = offset + i;

        // Kart üstteki satırların üzerine binler: satırın kart dışında kalan
        // sol kısmı görünür kalır, kart kaybolunca satırın tamamı geri gelir.
        if (card && i < card.rows.length) {
          const left = padTo(sliceByWidth(line, 0, leftWidth), leftWidth);
          return (
            <Box key={lineIndex} flexShrink={0} width={contentWidth}>
              <Text>{left}</Text>
              {card.rows[i]}
            </Box>
          );
        }

        return renderLine(line, rangeFor(selection, lineIndex, textWidth(line)), lineIndex);
      })}
    </Box>
  );
}
