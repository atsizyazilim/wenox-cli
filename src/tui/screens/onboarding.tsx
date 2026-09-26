import { useEffect, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { Logo } from "../components/logo.js";
import { InputBar } from "../components/input-bar.js";
import { useBlink } from "../hooks.js";
import { parseMouse, disableMouse } from "../screen.js";
import { theme } from "../theme.js";
import {
  buildView,
  insertText,
  backspace,
  deleteForward,
  moveLeft,
  moveRight,
  moveLineStart,
  moveLineEnd,
  deleteRange,
  deleteWordBack,
  endCursor,
  toText,
  MAX_INPUT_LINES,
} from "../input-model.js";
import type { Cursor, InputToken } from "../input-model.js";
import { verifyApiKey, verifyFailureMessage } from "../../account.js";
import { readClipboardText } from "../../images.js";
import type { AccountInfo } from "../../account.js";
import { API_KEY_URL, saveConfig } from "../../config.js";
import { openUrl } from "../../utils.js";
import { welcomeMessage } from "../../ui.js";
import { t, setLocale, getLocale, LANGUAGES } from "../../i18n/index.js";

type Step = "language" | "apikey" | "verifying" | "welcome";

function Typewriter({ text, interval = 24 }: { text: string; interval?: number }) {
  const [shown, setShown] = useState(0);
  // Her tick bir Ink yeniden çizimi tetiklediği için çok uzun metinlerde parça
  // parça yazıyoruz; normal uzunlukta karakter karakter ilerliyor.
  const step = Math.max(1, Math.ceil(text.length / 150));
  useEffect(() => {
    if (shown >= text.length) return undefined;
    const timer = setTimeout(
      () => setShown((value) => Math.min(text.length, value + step)),
      interval,
    );
    return () => clearTimeout(timer);
  }, [shown, text, interval, step]);
  return <Text color="white">{text.slice(0, shown)}</Text>;
}

export function Onboarding({
  onComplete,
  clipboard = readClipboardText,
}: {
  onComplete: (key: string) => void;
  // Testte panoyu taklit edebilmek için enjekte edilebilir.
  clipboard?: () => Promise<string>;
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 30;
  const columns = stdout?.columns ?? 100;
  const blink = useBlink(530);

  const [step, setStep] = useState<Step>("language");
  const [langIndex, setLangIndex] = useState(() => {
    const index = LANGUAGES.findIndex((entry) => entry.code === getLocale());
    return index < 0 ? 0 : index;
  });
  const [tokens, setTokens] = useState<InputToken[]>([]);
  const [caret, setCaret] = useState<Cursor>({ i: 0, o: 0 });
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const inputView = buildView(tokens, Math.max(12, columns - 14), caret, {
    maxLines: MAX_INPUT_LINES,
  });
  const boxWidth = Math.min(72, Math.max(32, columns - 10));

  const chooseLanguage = () => {
    const picked = LANGUAGES[langIndex];
    setLocale(picked.code);
    saveConfig({ language: picked.code });
    setStep("apikey");
  };

  // Tarayıcı kendiliğinden açılmıyor: kullanıcı istediğinde ctrl+o'ya basıyor.
  const openKeyPage = () => {
    const opened = openUrl(API_KEY_URL);
    setNote(t(opened ? "onboarding.opening" : "onboarding.openFailed", { url: API_KEY_URL }));
  };

  // Ctrl+V: yeni terminaller yapıştırmayı kendileri gönderiyor, ama eski
  // cmd/conhost Ctrl+V'yi yalnızca tuş olarak iletiyor (yapıştırma yok). O
  // yüzden panoyu kendimiz okuyup yazıyoruz. Anahtar tek satır olduğu için
  // boşluklar/satır sonları atılır.
  const pasteKey = async (): Promise<void> => {
    const text = (await clipboard()).replace(/\s+/g, "");
    if (!text) {
      setNote(t("onboarding.pasteEmpty"));
      return;
    }
    const next = insertText(tokens, caret, text);
    setTokens(next.tokens);
    setCaret(next.cursor);
    setNote("");
  };

  const submitKey = async () => {
    const key = toText(tokens).trim();
    if (!key) {
      setNote(t("onboarding.pasteKey"));
      return;
    }
    setNote("");
    setError("");
    setStep("verifying");
    const result = await verifyApiKey(key);
    if (result.ok) {
      saveConfig({ apiKey: key });
      setAccount(result.account);
      setStep("welcome");
      return;
    }
    setError(verifyFailureMessage(result.reason));
    setStep("apikey");
  };

  useInput((char, key) => {
    // Fare takibi açık: tıklama/sürükleme dizilerini yoksay, input'a sızmasın
    if (parseMouse(char) || /^\[M/.test(char ?? "")) return;

    const isEsc = key.escape || char === "\x1b";

    if (isEsc || (key.ctrl && char === "c")) {
      disableMouse();
      exit();
      return;
    }

    if (step === "language") {
      if (key.upArrow) setLangIndex((value) => (value - 1 + LANGUAGES.length) % LANGUAGES.length);
      else if (key.downArrow) setLangIndex((value) => (value + 1) % LANGUAGES.length);
      else if (key.return) chooseLanguage();
      return;
    }

    if (step === "apikey") {
      if (key.return) {
        void submitKey();
      } else if (key.ctrl && (char === "o" || char === "O")) {
        openKeyPage();
      } else if (key.ctrl && (char === "v" || char === "V")) {
        void pasteKey();
      } else if (key.ctrl && (char === "a" || char === "A")) {
        setCaret(moveLineStart(tokens, caret));
      } else if (key.ctrl && (char === "e" || char === "E")) {
        setCaret(moveLineEnd(tokens, caret));
      } else if (key.ctrl && (char === "u" || char === "U")) {
        const next = deleteRange(tokens, { i: 0, o: 0 }, endCursor(tokens));
        setTokens(next.tokens);
        setCaret(next.cursor);
        setNote("");
      } else if (key.ctrl && (char === "w" || char === "W")) {
        const next = deleteWordBack(tokens, caret);
        setTokens(next.tokens);
        setCaret(next.cursor);
      } else if (key.leftArrow) {
        setCaret((current) => moveLeft(tokens, current));
      } else if (key.rightArrow) {
        setCaret((current) => moveRight(tokens, current));
      } else if (key.backspace) {
        const next = backspace(tokens, caret);
        setTokens(next.tokens);
        setCaret(next.cursor);
      } else if (key.delete) {
        const next = deleteForward(tokens, caret);
        setTokens(next.tokens);
        setCaret(next.cursor);
      } else if (char && !key.ctrl && !key.meta) {
        const next = insertText(tokens, caret, char.replace(/\r?\n/g, ""));
        setTokens(next.tokens);
        setCaret(next.cursor);
        if (note) setNote("");
      }
      return;
    }

    if (step === "welcome" && key.return) {
      onComplete(toText(tokens).trim());
    }
  });

  const hint =
    step === "language"
      ? t("onboarding.langHint")
      : step === "apikey"
        ? t("onboarding.verifyHint")
        : step === "welcome"
          ? t("onboarding.continueHint")
          : "";

  return (
    <Box
      height={rows}
      width={columns}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Logo />

      <Box marginTop={1} flexDirection="column" alignItems="center">
        {step === "language" ? (
          <>
            <Text bold color={theme.questionLink}>
              {t("onboarding.chooseLanguage")}
            </Text>
            <Box marginTop={1} flexDirection="column">
              {LANGUAGES.map((entry, index) => (
                <Box key={entry.code}>
                  <Text
                    bold={index === langIndex}
                    color={index === langIndex ? theme.questionLink : theme.muted}
                  >
                    {`${index === langIndex ? "❯ " : "  "}${entry.label}`}
                  </Text>
                </Box>
              ))}
            </Box>
          </>
        ) : null}

        {step === "apikey" || step === "verifying" ? (
          <>
            <Text color={theme.muted}>{t("onboarding.needKey")}</Text>
            <Box marginTop={1} width={boxWidth}>
              <InputBar
                view={inputView}
                disabled={step === "verifying"}
                blinkOn={blink}
                width={boxWidth}
                boxed={true}
              />
            </Box>
            <Box marginTop={1}>
              <Text color={theme.menuDesc}>
                {t("onboarding.getKeyHere", { url: API_KEY_URL })}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.muted}>{t("onboarding.openHint")}</Text>
            </Box>
          </>
        ) : null}

        {step === "welcome" ? (
          <Box flexDirection="column">
            <Typewriter text={welcomeMessage(account)} />
          </Box>
        ) : null}
      </Box>

      {note ? (
        <Box marginTop={1}>
          <Text color={theme.menuDesc}>{note}</Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text color={theme.err}>✗ {error}</Text>
        </Box>
      ) : null}

      {hint ? (
        <Box marginTop={2}>
          <Text color={theme.muted}>{hint}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
