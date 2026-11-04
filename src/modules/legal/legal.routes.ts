import { Router, Request, Response } from "express";
import { noInput, validate } from "../../middleware/validate.js";
import { responseSend } from "../../helpers/response-send.js";
import { CURRENT_POLICY, POLICY_VERSIONS } from "../../config/policyVersions.js";

/**
 * Public (no sign-in): the current terms + privacy version and its history,
 * so the web app shows "Last updated" and "What changed" without keeping its
 * own copy of the version. Defined in src/config/policyVersions.ts.
 */
const legalRouter = Router();

legalRouter.get("/policy", validate({ query: noInput, body: noInput }), (_req: Request, res: Response) => {
    responseSend(res, 200, "Policy version", {
        current: CURRENT_POLICY,
        // Newest first; `reconsent` is internal, users only need what changed.
        history: [...POLICY_VERSIONS].reverse().map(({ version, effective_date, summary }) => ({ version, effective_date, summary })),
    });
});

export default legalRouter;
