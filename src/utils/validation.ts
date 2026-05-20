import { z } from "zod";
export const isValidUUID = (id: string | undefined) => {
    if (!id) {
        return false;
    }
    return z.string().uuid().safeParse(id).success;
}