import { logger } from "../config/logger.js";
import { postNotificationRepository } from "../modules/users/users.notifications/users.notifications.repository.js";
import {
    DATA_EXPORT_TTL_DAYS,
    claimNextDataExportRepository,
    completeDataExportRepository,
    expireDataExportsRepository,
    failDataExportRepository,
    fetchUserDataForExportRepository,
    requeueDataExportRepository,
} from "../modules/users/users.account/users.account.repository.js";

/** Tries per export before it is marked failed. */
const MAX_ATTEMPTS = 3;
/** Exports built per run, so one run can't hold the job for long. */
const MAX_PER_RUN = 5;

/** Opens Settings at "Your data" (section id in the web app). */
const SETTINGS_LINK = "/profile/settings#your-data";

const buildExportFile = async (userId: string) => {
    const data = await fetchUserDataForExportRepository(userId);
    const file = {
        format: "gym-ledger-data-export",
        format_version: 1,
        exported_at: new Date().toISOString(),
        ...data,
    };
    return Buffer.from(JSON.stringify(file, null, 2), "utf8");
}

/**
 * Builds waiting data exports one by one, then tells each user theirs is
 * ready (a notification linking to Settings). Also drops the files of exports
 * past their download window.
 */
export const runDataExportJob = async () => {
    for (let i = 0; i < MAX_PER_RUN; i++) {
        const job = await claimNextDataExportRepository();
        if (!job) break;
        try {
            const content = await buildExportFile(job.user_id);
            await completeDataExportRepository(job.id, content);
            await postNotificationRepository({
                userId: job.user_id,
                type: "data_export_ready",
                groupKey: "data_export",
                dedupeKey: `data_export:${job.id}`,
                title: "Your data is ready to download",
                body: `Download it from Settings within ${DATA_EXPORT_TTL_DAYS} days.`,
                link: SETTINGS_LINK,
            });
            logger.info({ exportId: job.id, bytes: content.length }, "Data export built");
        } catch (error) {
            logger.error({ error, exportId: job.id, attempt: job.attempts }, "Data export failed");
            if (job.attempts < MAX_ATTEMPTS) {
                await requeueDataExportRepository(job.id);
                break;
            }
            await failDataExportRepository(job.id, "Couldn't build the export");
            await postNotificationRepository({
                userId: job.user_id,
                type: "data_export_failed",
                groupKey: "data_export",
                dedupeKey: `data_export_failed:${job.id}`,
                title: "Your data export didn't work",
                body: "Something went wrong while preparing it. Please request it again from Settings.",
                link: SETTINGS_LINK,
            }).catch(() => undefined);
        }
    }
    const expired = await expireDataExportsRepository();
    if (expired) {
        logger.info({ expired }, "Expired data exports removed");
    }
}
