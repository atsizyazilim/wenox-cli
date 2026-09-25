import { useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { parseMouse, disableMouse } from "../screen.js";
import { theme } from "../theme.js";
import { UPGRADE_COMMAND, runUpgrade } from "../../update.js";
import type { UpgradeResult } from "../../update.js";
import { t } from "../../i18n/index.js";

// Zorunlu güncelleme ekranı: kullanıcı ya buradan günceller (npm terminali
// devralır) ya da çıkar. Elle kurulum komutu da görünür kalıyor.
type Phase = "idle" | "running" | "done" | "failed";

export function UpdateRequired({
  current,
  latest,
  upgrade = runUpgrade,
}: {
  current: string;
  latest: string;
  // Testte sahte güncelleyici verilebilsin diye enjekte edilebilir.
  upgrade?: () => Promise<UpgradeResult>;
}) {
  const { exit, suspendTerminal } = useApp();
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 30;
  const columns = stdout?.columns ?? 100;
  const boxWidth = Math.min(56, Math.max(34, columns - 8));
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState<number | null>(null);

  const startUpgrade = async (): Promise<void> => {
    setPhase("running");
    // suspendTerminal dönüş değeri taşımıyor: sonuç closure'dan alınıyor.
    let result: UpgradeResult = { code: null, failed: true };
    try {
      await suspendTerminal(async () => {
        result = await upgrade();
      });
    } catch {
      // Askıya alınamazsa kullanıcı elle kurulum komutunu görüyor.
    }
    setCode(result.code);
    setPhase(result.failed ? "failed" : "done");
  };

  useInput((char, key) => {
    if (parseMouse(char) || /^\[M/.test(char ?? "")) return;
    // Güncelleme sürerken terminal npm'e ait; tuşları biz işlemeyelim.
    if (phase === "running") return;

    // Sonuç ekranında tek tuş yeter: çık.
    if (phase !== "idle") {
      disableMouse();
      exit();
      return;
    }

    const isEsc = key.escape || char === "\x1b";
    if (isEsc || (key.ctrl && char === "c") || char === "q") {
      disableMouse();
      exit();
      return;
    }
    if (char === "u" || char === "U" || key.return) void startUpgrade();
  });

  const status =
    phase === "running"
      ? t("update.upgrading")
      : phase === "done"
        ? t("update.upgraded")
        : phase === "failed"
          ? t("update.upgradeFailed", { code: code ?? "-" })
          : "";
  const statusColor =
    phase === "failed" ? theme.warn : phase === "done" ? theme.ok : theme.muted;

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

        {status ? (
          <Box marginTop={1}>
            <Text color={statusColor}>{status}</Text>
          </Box>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.muted}>
          {phase === "idle" ? t("update.hint") : t("update.exitHint")}
        </Text>
      </Box>
    </Box>
  );
}
