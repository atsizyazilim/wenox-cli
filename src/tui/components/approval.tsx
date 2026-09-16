import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { t } from "../../i18n/index.js";

function Option({
  label,
  selected,
  color,
}: {
  label: string;
  selected: boolean;
  color: string;
}) {
  if (selected) {
    return (
      <Text bold color="white" backgroundColor={color}>
        {`  ❯ ${label}  `}
      </Text>
    );
  }
  return <Text color={theme.muted}>{`    ${label}  `}</Text>;
}

export function Approval({
  command,
  allow = true,
}: {
  command: string;
  allow?: boolean;
}) {
  return (
    <Box flexDirection="column" flexShrink={0} paddingX={2} marginBottom={1}>
      <Text color={theme.warn} bold>
        {t("approval.title")}
      </Text>
      <Text color={theme.warn} bold>{`  ${command}`}</Text>
      <Box marginTop={1}>
        <Option label="Allow" selected={allow} color={theme.ok} />
        <Text>{"  "}</Text>
        <Option label="Disallow" selected={!allow} color={theme.err} />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>{t("approval.hint")}</Text>
      </Box>
    </Box>
  );
}
