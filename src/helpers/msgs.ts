"use strict";

const message: Record<number, IMessageObject> = {
    200: {
        message: "Success",
        httpCode: 200,
        status: true,
    },
    201: {
        message: "Created",
        httpCode: 201,
        status: true,
    },
    400: {
        message: "Failure",
        httpCode: 400,
        status: false,
    },
    401: {
        message: "Auth Failure",
        httpCode: 401,
        status: false,
    },
    403: {
        message: "Auth Failure",
        httpCode: 400,
        status: false,
    },
    404: {
        message: "Not Found",
        httpCode: 400,
        status: false,
    },
    //auth
    601: {
        message: "Auth success",
        httpCode: 200,
        status: true,
    },
    602: {
        message: "Auth fail",
        httpCode: 400,
        status: false,
        errorCode: 602,
    },
    603: {
        message: "Auth fail",
        httpCode: 400,
        status: false,
        errorCode: 603,
    },
    // user crud operations
};

export interface IMessageObject {
    message: string;
    httpCode: number;
    status: boolean;
    errorCode?: number;
}
export default message;
