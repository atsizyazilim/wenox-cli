import { render } from "ink";
import { html } from "htm/react";
import { App } from "./app.js";
import { resetCancel } from "../cancel.js";
import { saveSession } from "../session.js";
import { enterFullScreen, leaveFullScreen, setTitle } from "./screen.js";

export async function launchTui({ agent, version, modelId, autoApprove = false, session }) {
  resetCancel();
  enterFullScreen();
  setTitle(session?.title ? `WenOX CLI | ${session.title}` : "WenOX CLI");

  const restore = () => leaveFullScreen();
  process.on("exit", restore);

  const instance = render(
    html`<${App}
      agent=${agent}
      version=${version}
      initialModelId=${modelId}
      initialAutoApprove=${autoApprove}
      session=${session}
    />`,
    { exitOnCtrlC: false },
  );

  try {
    await instance.waitUntilExit();
  } finally {
    process.off("exit", restore);
    leaveFullScreen();
    if (session && itemsExist(session)) saveSession(session);
  }

  return session;
}

function itemsExist(session) {
  return Boolean((session.items ?? []).length || (session.messages ?? []).length);
}
