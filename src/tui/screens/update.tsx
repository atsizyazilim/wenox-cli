import { Box, Text, useApp, useInput, useStdout } from "ink";
import { parseMouse, disableMouse } from "../screen.js";
import { theme } from "../theme.js";
import { UPGRADE_COMMAND } from "../../update.js";
import { t } from "../../i18n/index.js";

export function UpdateRequired({
  current,
  latest,
}: {
  current: string;
  latest: string;
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 30;
  const columns = stdout?.columns ?? 100;
  const boxWidth = Math.min(56, Math.max(34, columns - 8));

  useInput((char, key) => {
    if (parseMouse(char) || /^\[M/.test(char ?? "")) return;

    const isEsc = key.escape || char === "\x1b";
    if (isEsc || (key.ctrl && char === "c") || char === "q") {
      disableMouse();
      exit();
    }
  });

  return (
    <Box
      height={rows}
      width={columns}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.warn}
        paddingX={3}
        paddingY={1}
        width={boxWidth}
        flexShrink={0}
      >
        <Box justifyContent="center">
          <Text bold color={theme.warn}>
            {t("update.title")}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text color={theme.muted}>{t("update.installed")}</Text>
            <Text color="white">{`v${current}`}</Text>
          </Text>
          <Text>
            <Text color={theme.muted}>{t("update.available")}</Text>
            <Text bold color={theme.ok}>{`v${latest}`}</Text>
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.questionLink}>{UPGRADE_COMMAND}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.muted}>{t("update.body")}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.muted}>{t("update.hint")}</Text>
      </Box>
    </Box>
  );
}
