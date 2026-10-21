import { logger } from "../config/logger.js";
import { fetchAccountsDueForDeletionRepository, purgeAccountRepository } from "../modules/users/users.account/users.account.repository.js";

/** Accounts deleted per run. */
const MAX_PER_RUN = 20;

/**
 * Deletes the accounts whose deletion date has passed (see
 * purgeAccountRepository). Logs only counts and ids, never personal data.
 */
export const runAccountDeletionJob = async () => {
    const due = await fetchAccountsDueForDeletionRepository(MAX_PER_RUN);
    let deleted = 0;
    for (const userId of due) {
        try {
            if (await purgeAccountRepository(userId)) {
                deleted++;
            }
        } catch (error) {
            // The account stays whole and is tried again on the next run.
            logger.error({ error, userId }, "Account deletion failed");
        }
    }
    if (deleted) {
        logger.info({ deleted }, "Scheduled account deletions completed");
    }
}
