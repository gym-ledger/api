import message, { IMessageObject } from "./msgs.js";
import { Response } from 'express';

export const responseSend = (res: Response, code: number, msg: string, data?: unknown) => {
    const result: Record<string, unknown> = {};
    const n_code = code ? code : 455 as number;
    const m = message[n_code as unknown as keyof typeof message] as IMessageObject;

    result.success = m ? m.status : n_code;
    result.message = msg ? msg : m.message;
    result.data = data ?? null;
    res.status(m ? m.httpCode : 280).send(result);
};
