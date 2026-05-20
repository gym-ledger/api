import { UsersInterface } from '../db/schemas/users/users.schemas';


declare global {
    namespace Express {
        interface Request {
            userId?: string;
            user?: UsersInterface;
        }
    }
}