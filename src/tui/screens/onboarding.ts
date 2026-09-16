import { html } from "htm/react";
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
  toText,
  MAX_INPUT_LINES,
} from "../input-model.js";
import type { Cursor, InputToken } from "../input-model.js";
import { verifyApiKey, verifyFailureMessage } from "../../account.js";
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
  return html`<${Text} color="white">${text.slice(0, shown)}<//>`;
}

export function Onboarding({ onComplete }: { onComplete: (key: string) => void }) {
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

  const submitKey = async () => {
    const key = toText(tokens).trim();
    if (!key) {
      const opened = openUrl(API_KEY_URL);
      setNote(t(opened ? "onboarding.opening" : "onboarding.openFailed", { url: API_KEY_URL }));
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

  return html`
    <${Box} height=${rows} width=${columns} flexDirection="column" alignItems="center" justifyContent="center">
      <${Logo} />

      <${Box} marginTop=${1} flexDirection="column" alignItems="center">
        ${step === "language"
          ? html`
              <${Text} key="langTitle" bold color=${theme.questionLink}>${t("onboarding.chooseLanguage")}<//>
              <${Box} key="langList" marginTop=${1} flexDirection="column">
                ${LANGUAGES.map(
                  (entry, index) => html`
                    <${Box} key=${entry.code}>
                      <${Text} bold=${index === langIndex} color=${index === langIndex ? theme.questionLink : theme.muted}>
                        ${`${index === langIndex ? "❯ " : "  "}${entry.label}`}
                      <//>
                    <//>
                  `,
                )}
              <//>
            `
          : null}

        ${step === "apikey" || step === "verifying"
          ? html`
              <${Text} key="need" color=${theme.muted}>${t("onboarding.needKey")}<//>
              <${Box} key="input" marginTop=${1} width=${boxWidth}>
                <${InputBar}
                  view=${inputView}
                  disabled=${step === "verifying"}
                  blinkOn=${blink}
                  width=${boxWidth}
                  boxed=${true}
                />
              <//>
              <${Box} key="link" marginTop=${1}>
                <${Text} color=${theme.menuDesc}>${t("onboarding.getKeyHere", { url: API_KEY_URL })}<//>
              <//>
              <${Box} key="openHint" marginTop=${1}>
                <${Text} color=${theme.muted}>${t("onboarding.openHint")}<//>
              <//>
            `
          : null}

        ${step === "welcome"
          ? html`<${Box} flexDirection="column"><${Typewriter} text=${welcomeMessage(account)} /><//>`
          : null}
      <//>

      ${note
        ? html`<${Box} marginTop=${1}><${Text} color=${theme.menuDesc}>${note}<//><//>`
        : null}
      ${error
        ? html`<${Box} marginTop=${1}><${Text} color=${theme.err}>✗ ${error}<//><//>`
        : null}

      ${hint
        ? html`<${Box} marginTop=${2}><${Text} color=${theme.muted}>${hint}<//><//>`
        : null}
    <//>
  `;
}
