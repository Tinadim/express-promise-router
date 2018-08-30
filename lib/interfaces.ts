import { RouterOptions, Response } from 'express'

export interface PromiseRouterOptions extends RouterOptions {
    responseHandler? : ResponseHandler
    errorHandler? : ErrorHandler
}

export interface ResponseHandler {
    (res: Response, result?: any) : void 
}

export interface ErrorHandler {
    (res: Response, error: Error) : void
}
