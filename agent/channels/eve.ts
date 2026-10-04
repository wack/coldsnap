import {
  type AuthFn,
  localDev,
  vercelOidc,
  withAuthChallenges,
  extractBearerToken,
} from "eve/channels/auth";
import { defaultEveAuth, eveChannel } from "eve/channels/eve";

import { JOB_ATTRIBUTE, withJobAttributes } from "../../lib/agent/job";

/**
 * Optional shared secret for callers outside Vercel (for example a workflow
 * running on another host). On Vercel the workflow uses OIDC instead.
 */
function coldsnapToken(): AuthFn<Request> {
  return withAuthChallenges(
    (request) => {
      const expected = process.env.COLDSNAP_AGENT_TOKEN;
      if (!expected) return null;
      const token = extractBearerToken(request.headers.get("authorization"));
      if (!token || token.length !== expected.length) return null;
      let difference = 0;
      for (let i = 0; i < token.length; i += 1) {
        difference |= token.charCodeAt(i) ^ expected.charCodeAt(i);
      }
      if (difference !== 0) return null;
      return {
        authenticator: "coldsnap",
        principalType: "service",
        principalId: "coldsnap-workflow",
        attributes: {},
      };
    },
    [{ scheme: "Bearer" }],
  );
}

export default eveChannel({
  auth: [
    // Coldsnap's workflows run in this same Vercel project, so their OIDC
    // tokens are accepted with no configuration.
    vercelOidc(),
    coldsnapToken(),
    // `eve dev` and `next dev` only; authenticates nothing in production.
    localDev(),
  ],
  // Copy the build job and model from the (already authenticated) request
  // into the session's auth attributes, where the dynamic model resolver and
  // the build_site tool read them.
  onMessage(ctx) {
    const caller = defaultEveAuth(ctx);
    if (!caller) return { auth: caller };
    const auth = withJobAttributes(caller, ctx.eve.request.headers);
    const job = auth.attributes[JOB_ATTRIBUTE];
    return {
      auth,
      title: typeof job === "string" ? `Coldsnap build ${job.split("/")[2]!.slice(0, 8)}` : undefined,
    };
  },
});
