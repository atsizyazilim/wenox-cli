import { html } from "htm/react";
import { useState } from "react";
import { App } from "./app.js";
import { Onboarding } from "./screens/onboarding.js";

export function Root({ agent, version, initialModelId, initialAutoApprove = false, session }) {
  const [ready, setReady] = useState(Boolean(agent.apiKey));

  if (!ready) {
    return html`
      <${Onboarding}
        onComplete=${(key) => {
          agent.setApiKey(key);
          setReady(true);
        }}
      />
    `;
  }

  return html`
    <${App}
      agent=${agent}
      version=${version}
      initialModelId=${initialModelId}
      initialAutoApprove=${initialAutoApprove}
      session=${session}
    />
  `;
}
