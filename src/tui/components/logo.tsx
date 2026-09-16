import { Box, Text } from "ink";
import { t } from "../../i18n/index.js";

export const LOGO_LINES = [
  " ██╗    ██╗███████╗███╗   ██╗ ██████╗ ██╗  ██╗",
  " ██║    ██║██╔════╝████╗  ██║██╔═══██╗╚██╗██╔╝",
  " ██║ █╗ ██║█████╗  ██╔██╗ ██║██║   ██║ ╚███╔╝ ",
  " ██║███╗██║██╔══╝  ██║╚██╗██║██║   ██║ ██╔██╗ ",
  " ╚███╔███╔╝███████╗██║ ╚████║╚██████╔╝██╔╝ ██╗",
  "  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝",
];

export function Logo() {
  return (
    <Box flexDirection="column" alignItems="center">
      {LOGO_LINES.map((line, index) => (
        <Text key={index} color="white">
          {line}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color="gray">{t("logo.product")}</Text>
        <Text color="gray">{t("logo.tagline")}</Text>
      </Box>
    </Box>
  );
}
