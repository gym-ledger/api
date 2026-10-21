import { UsersInterface } from '../db/schemas/users/users.schemas';
import { AdminUserInterface } from '../db/schemas/admin/admin.schema';


declare global {
    namespace Express {
        interface Request {
            userId?: string;
            user?: UsersInterface;
            /** user_sessions.id of the device making the request. */
            userSessionId?: string;

            adminUserId?: string;
            adminUser?: AdminUserInterface;
            /** admin_sessions.id of the device making the request. */
            adminSessionId?: string;
        }
    }
}