import { useState } from "react";
import { App } from "./app.js";
import type { AppAgent } from "./app.js";
import { Onboarding } from "./screens/onboarding.js";
import type { Session } from "../session.js";

export function Root({
  agent,
  version,
  initialModelId,
  initialAutoApprove = false,
  session,
}: {
  agent: AppAgent;
  version: string;
  initialModelId: string;
  initialAutoApprove?: boolean;
  session?: Session | null;
}) {
  const [ready, setReady] = useState(Boolean(agent.apiKey));

  if (!ready) {
    return (
      <Onboarding
        onComplete={(key) => {
          agent.setApiKey(key);
          setReady(true);
        }}
      />
    );
  }

  return (
    <App
      agent={agent}
      version={version}
      initialModelId={initialModelId}
      initialAutoApprove={initialAutoApprove}
      session={session}
    />
  );
}
