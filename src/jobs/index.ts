import { logger } from "../config/logger.js";
import { runAccountDeletionJob } from "./accountDeletion.js";
import { runDataExportJob } from "./dataExport.js";
import { purgeExpiredRequestIssues } from "../infrastructure/metrics/requestIssueLog.js";

/**
 * Runs `job` now and then every `intervalMs`, never two runs of it at once.
 * Every job claims its work with row locks (FOR UPDATE / SKIP LOCKED), so
 * several API instances can run them side by side.
 */
const every = (name: string, intervalMs: number, job: () => Promise<void>) => {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await job();
        } catch (error) {
            logger.error({ error, job: name }, "Background job failed");
        } finally {
            running = false;
        }
    };
    void tick();
    setInterval(tick, intervalMs).unref();
};

/** Background work inside the API process; started once the database is connected. */
export const startBackgroundJobs = () => {
    every("data-export", 30_000, runDataExportJob);
    every("account-deletion", 60 * 60_000, runAccountDeletionJob);
    every("api-request-issues-purge", 60 * 60_000, purgeExpiredRequestIssues);
};
