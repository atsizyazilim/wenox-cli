import { render } from "ink";
import type { ReactElement } from "react";
import { Root } from "./root.js";
import type { AppAgent } from "./app.js";
import { UpdateRequired } from "./screens/update.js";
import { resetCancel } from "../cancel.js";
import { saveSession } from "../session.js";
import type { Session } from "../session.js";
import { enterFullScreen, leaveFullScreen, setTitle } from "./screen.js";

// Çıkışta konsol girdi tamponunda bekleyen fare/klavye dizilerini tüket.
// Aksi halde kabuk bunları komut sanıp hata veriyordu (Windows'ta fare
// hareketleri ekrana dökülüyordu).
function drainStdin(ms = 120): Promise<void> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve();
      return;
    }
    const discard = (): void => {};
    try {
      process.stdin.on("data", discard);
      process.stdin.resume();
    } catch {
      // yoksay
    }
    setTimeout(() => {
      try {
        process.stdin.off("data", discard);
        process.stdin.pause();
      } catch {
        // yoksay
      }
      resolve();
    }, ms);
  });
}

async function runTui(node: ReactElement, title?: string): Promise<void> {
  resetCancel();
  enterFullScreen();
  setTitle(title ?? "WenOX CLI");

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    leaveFullScreen();
  };
  const onSignal = (): void => {
    cleanup();
    process.exit(130);
  };

  process.on("exit", cleanup);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("SIGHUP", onSignal);

  const instance = render(node, { exitOnCtrlC: false });

  try {
    await instance.waitUntilExit();
  } finally {
    process.off("exit", cleanup);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("SIGHUP", onSignal);
    cleanup();
    await drainStdin();
  }
}

export async function launchTui({
  agent,
  version,
  modelId,
  autoApprove = false,
  session,
}: {
  agent: AppAgent;
  version: string;
  modelId: string;
  autoApprove?: boolean;
  session?: Session | null;
}): Promise<Session | null | undefined> {
  const title = session?.title ? `WenOX CLI | ${session.title}` : "WenOX CLI";
  try {
    await runTui(
      <Root
        agent={agent}
        version={version}
        initialModelId={modelId}
        initialAutoApprove={autoApprove}
        session={session}
      />,
      title,
    );
  } finally {
    if (session && itemsExist(session)) saveSession(session);
  }

  return session;
}

export async function launchUpdateScreen({
  current,
  latest,
}: {
  current: string;
  latest: string;
}): Promise<void> {
  await runTui(<UpdateRequired current={current} latest={latest} />);
}

function itemsExist(session: Session): boolean {
  return Boolean((session.items ?? []).length || (session.messages ?? []).length);
}
