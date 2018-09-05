import { IRoute, Router, Response, NextFunction } from 'express';
import * as flattenDeep from 'lodash.flattendeep';
import * as isPromise from 'is-promise';
import * as httpMethods from 'methods';
import { PromiseRouterOptions, ResponseHandler, ErrorHandler } from './interfaces'

class PromiseRouter {
    router: Router
    responseHandler? : ResponseHandler
    errorHandler? : ErrorHandler

    constructor(options: PromiseRouterOptions = {}) {
        this.router = Router(options)
        this.responseHandler = options.responseHandler
        this.errorHandler = options.errorHandler
        this.wrapMethods(this.router);
        this.wrapRoute(this.router)
    }

    /**
     * Wraps the standard http methods exposed in the Router interface, as well as
     * the methods 'use', 'all' and 'param'
     * @param router - An instance of the Express Router
     */
    private wrapMethods(router: Router) {
        const methods = httpMethods.concat(['use', 'all', 'param']);
        methods.forEach(method => this.wrapMethod(method, router));
    }

    /**
     * Wraps the .route method available in the Router interface. We store a reference
     * to the original handler, and create a proxy for the method that invokes the 
     * original handler to obtain the router to be wrapped
     * @param router - An instance of the Express Router
     */
    private wrapRoute(router) {
        router.__route = router.route
        router.route = (path) => {
            const route = router.__route(path);
            const methods = httpMethods.concat(['all'])
            methods.forEach((method) => this.wrapMethod(method, route));
            return route;
        }
    }

    /**
     * Wraps a single method of the instance provided. We store a reference to the original
     * method with a different name and make the original method behave as a proxy. When it's
     * invoked, it gets the arguments passed to the original method, manipulates them to exclude
     * any that are strings (usually identifying the routes to match) and get the remaining ones
     * usually the middlewares or handlers for a route. For each middleware/handler, we do
     * a similar wrapping strategy to make the handler go through a proxy before deferring
     * to the original handler
     * @param method - the method of the instance to stub
     * @param instanceToWrap - instance of the Express Router or of the Router.route method
     */
    private wrapMethod(method: string, instanceToWrap: Router | IRoute) {
        const original = `__${method}`
        instanceToWrap[original] = instanceToWrap[method]
        instanceToWrap[method] = (...args) => {
            // Manipulating arguments directly is discouraged
            let _args = Array.from(args)
            
            // Grab the first parameter out in case it's a route or array of routes.
            let first = null;
            if (this.shouldRemoveFirstArg(_args)) {
                first = _args[0];
                _args = _args.slice(1);
            }

            // Wraps the remaining arguments
            _args = flattenDeep(_args).map((arg) => this.wrapHandler(arg))

            // Re-add the first argument
            if (first) {
                _args.unshift(first);
            }
            
            // Invoke the original method
            return instanceToWrap[original].apply(instanceToWrap, _args);
        };
    }

    /**
     * Wraps a single handler with a custom behavior so we have access to the arguments
     * passed to the handler, as well as the data returned by it
     * @param handler - one of the middleware/handlers provided to the router
     */
    private wrapHandler(handler) {
        if ('function' !== typeof handler) {
            const type = Object.prototype.toString.call(handler);
            const msg = `Expected a callback function but got a ${type}`;
            throw new Error(msg);
        }

        let wrappedHandler

        // Handler is in the format (req, res). Usually the function that de facto handles the request
        // Note that express invokes this handler with (req, res, next). However, we rely on the fact that
        // the user did not provide a next function in the handler signature, to indicate it's where
        // the response will be sent and it's safe to invoke the responseHandler
        if (handler.length === 2) {
            wrappedHandler = (req, res, next) => {
                const ret = handler(...[req, res, next])
                this.handleReturn(ret, res, next, true)
            }
        } 
        // Handler is in the format (err, req, res, next) OR (req, res, next, id). The first case
        // denotates error handlers and the second is used for the .param middleware
        else if (handler.length === 4) {
            wrappedHandler = (err, req, res, next) => {
                const ret = handler(...[err, req, res, next])
                // If the last parameter is a string (instead of a function) we need to adjust where
                // to get the values for res and next from
                if ('string' === typeof next) {
                    next = res
                    res = req
                }
                this.handleReturn(ret, res, next)
            }
        } 
        // Handler is in the format (req, res, next). Usually denotates regular middlewares and no special
        // treatment is required here
        else {
            wrappedHandler = (req, res, next) => {
                const ret = handler(...[req, res, next])
                this.handleReturn(ret, res, next)
            }
        }
        return wrappedHandler;
    }

    /**
     * Handles the data returned by the handler. If it's a promise, resolves it
     * @param ret - the data returned when invoking the original handler for a route
     * @param res - the Response object provided by express
     * @param next - the callback to invoke the next handler in the stack
     */
    private handleReturn(ret: any, res: Response, next: NextFunction, handleResponse: Boolean = false) {
        if (isPromise(ret)) {
            Promise.resolve(ret)
                .then((result: any) => this.handlePromiseResult(result, res, next, handleResponse))
                .catch((error: Error) => this.handleError(error, res, next));
        }
    }

    /**
     * Handles the result of the promise. If the promise resolves with 'next' or 'route', 
     * delegates it to next accordingly. However, if no next function is available, and
     * a response handler was provided, delegates the result to the response handler
     * @param result - the result of the promise
     * @param res - the Response object provided by express
     * @param next  - the callback to invoke the next handler in the stack
     */
    private handlePromiseResult(result: any, res: Response, next: NextFunction, handleResponse: Boolean = false) {
            if (result === 'next') {
                next();
            } else if (result === 'route') {
                next('route');
            } else if (typeof this.responseHandler === 'function' && handleResponse) {
                this.responseHandler(res, result)
            }
    }

    /**
     * Handles errors thrown when resolving the promise.
     * If an error handler was provided, gives priority to it. If not, bubbles the
     * error up to the next error handler. If not next is available, nor an error
     * handler was provided
     * @param error - Error thrown when resolving the promise
     * @param res - the Response object provided by express
     * @param next  - the callback to invoke the next handler in the stack
     */
    private handleError(error: Error, res: Response, next: NextFunction) {
        if (!error) {
            error = new Error('Returned promise was rejected but did not have a reason');
        }
        if (typeof this.errorHandler === 'function') {
            this.errorHandler(res, error);
        } else {
           next(error);
        }
    }

    /** Helper functions **/

    private isString(arg: any): boolean {
        return typeof(arg) === 'string'
    }

    private isRegExp(arg: any): boolean {
        return arg instanceof RegExp
    }

    private firstArgumentIsArray(args: any): boolean {
        return ((Array.isArray(args[0]) && this.isString(args[0][0])) || this.isRegExp(args[0][0]))
    }

    private shouldRemoveFirstArg(args: any): boolean {
        return this.isString(args[0]) ||
            this.isRegExp(args[0]) ||
            this.firstArgumentIsArray(args)
    }
}

export default (options?: PromiseRouterOptions): Router => {
    return new PromiseRouter(options).router
}
