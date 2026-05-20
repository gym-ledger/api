import { UsersInterface } from '../db/schemas/users/users.schemas';
import { AdminUserInterface } from '../db/schemas/admin/admin.schema';


declare global {
    namespace Express {
        interface Request {
            userId?: string;
            user?: UsersInterface;

            adminUserId?: string;
            adminUser?: AdminUserInterface;
        }
    }
}