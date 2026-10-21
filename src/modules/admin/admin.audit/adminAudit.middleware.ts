import type { NextFunction, Request, Response } from "express";
import { pg } from "../../../infrastructure/postgres/index.js";
import { logger } from "../../../config/logger.js";
import { isValidUUID } from "../../../utils/validation.js";

export type AdminAuditAction = "create" | "update" | "delete" | "import" | "password_change" | "sign_out" | "retry";

/**
 * Records a successful admin write in admin_audit_log (migration 040): who
 * (admin and session), what (action, entity type and id, which fields were
 * sent), from where (IP) and when. The row is written once the response has
 * gone out with a 2xx status; a failure to write it is logged, never turned
 * into a failed request.
 */
export const auditAdminAction = (entityType: string, action: AdminAuditAction) =>
    (req: Request, res: Response, next: NextFunction) => {
        let createdId: string | undefined;
        const json = res.json.bind(res);
        res.json = (body: unknown) => {
            const id = (body as { data?: { id?: unknown } } | null)?.data?.id;
            if (typeof id === "string") {
                createdId = id;
            }
            return json(body);
        };

        res.on("finish", () => {
            if (res.statusCode >= 300 || !req.adminUserId) {
                return;
            }
            const pathId = typeof req.params.id === "string" ? req.params.id : undefined;
            const entityId = [pathId, createdId].find((id) => id && isValidUUID(id)) ?? null;
            const fields = req.body && typeof req.body === "object" ? Object.keys(req.body).slice(0, 50) : [];
            pg.query(`
            INSERT INTO admin_audit_log (
                admin_user_id, admin_session_id, action, entity_type, entity_id, fields, file_name, ip_address
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                req.adminUserId,
                req.adminSessionId ?? null,
                action,
                entityType,
                entityId,
                fields,
                req.file?.originalname?.slice(0, 255) ?? null,
                req.ip ? req.ip.replace(/^::ffff:/, "").slice(0, 64) : null,
            ]).catch((error) => {
                logger.error({ error, entityType, action, entityId }, "Failed to write admin audit log");
            });
        });
        next();
    };
