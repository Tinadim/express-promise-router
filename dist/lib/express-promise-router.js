"use strict";
const express_1 = require("express");
const lodash_flattendeep_1 = require("lodash.flattendeep");
const is_promise_1 = require("is-promise");
const httpMethods = require("methods");
class PromiseRouter {
    constructor(options = {}) {
        this.router = express_1.Router(options);
        this.responseHandler = options.responseHandler;
        this.errorHandler = options.errorHandler;
        this.wrapMethods(this.router);
        this.wrapRoute(this.router);
    }
    wrapMethods(router) {
        const methods = httpMethods.concat(['use', 'all', 'param']);
        methods.forEach(method => this.wrapMethod(method, router));
    }
    wrapRoute(router) {
        router.__route = router.route;
        router.route = (path) => {
            const route = router.route(path);
            const methods = httpMethods.concat(['all']);
            methods.forEach((method) => this.wrapMethod(method, route));
        };
    }
    wrapMethod(method, instanceToWrap) {
        const original = `__${method}`;
        instanceToWrap[original] = instanceToWrap[method];
        instanceToWrap[method] = () => {
            // Manipulating arguments directly is discouraged
            let args = this.copyArgs(arguments);
            // Grab the first parameter out in case it's a route or array of routes.
            let first = null;
            if (this.shouldRemoveFirstArg(args)) {
                first = args[0];
                args = args.slice(1);
            }
            args = lodash_flattendeep_1.default(args).map((arg) => this.wrapHandler(arg));
            // If we have a route path or something, push it in front
            if (first) {
                args.unshift(first);
            }
            return instanceToWrap[original].apply(instanceToWrap, args);
        };
    }
    wrapHandler(handler) {
        if ('function' !== typeof handler) {
            const type = Object.prototype.toString.call(handler);
            const msg = `Expected a callback function but got a ${type}`;
            throw new Error(msg);
        }
        return (...args) => {
            const handlerArgs = args.slice(0, handler.length);
            const ret = handler.apply(null, handlerArgs);
            if (is_promise_1.default(ret)) {
                const expandedParams = this.expandHandlerArgs(handlerArgs);
                Promise.resolve(ret)
                    .then((result) => this.handleResult(result, expandedParams))
                    .catch((error) => this.handleError(error, expandedParams));
            }
        };
    }
    handleResult(result, { next, res }) {
        if (next !== null) {
            if (result === 'next') {
                next();
            }
            else if (result === 'route') {
                next('route');
            }
        }
        else if (this.responseHandler !== null) {
            this.responseHandler(res, result);
        }
    }
    handleError(error, { next, res }) {
        if (this.errorHandler !== null) {
            this.errorHandler(res, error);
        }
        else {
            next(error);
        }
    }
    /** Helper functions **/
    copyArgs(...args) {
        let copy = new Array(args.length);
        for (let i = 0; i < args.length; ++i) {
            copy[i] = args[i];
        }
        return copy;
    }
    isString(arg) {
        return typeof (arg) === 'string';
    }
    isRegExp(arg) {
        return arg instanceof RegExp;
    }
    firstArgumentIsArray(args) {
        return ((Array.isArray(args[0]) && this.isString(args[0][0])) || this.isRegExp(args[0][0]));
    }
    shouldRemoveFirstArg(args) {
        return this.isString(args[0]) ||
            this.isRegExp(args[0]) ||
            this.firstArgumentIsArray(args);
    }
    expandHandlerArgs(handlerArgs) {
        // args = [req, res]
        if (handlerArgs.length < 3) {
            return { next: null, res: handlerArgs[1] };
        }
        // args = [res, res, next] or [err, req, res, next]
        let next = handlerArgs.slice(-1)[0];
        let res = handlerArgs.slice(-2)[0];
        // When calling router.param, the last parameter is a string, not next.
        // If so, the next should be the one before it. (See https://expressjs.com/en/4x/api.html#router.param)
        // args = [req, res, next, id]
        if ('string' === typeof next) {
            next = handlerArgs.slice(-2)[0];
            res = handlerArgs.slice(-3)[0];
        }
        return { next, res };
    }
}
module.exports = (options) => {
    return new PromiseRouter(options).router;
};
//# sourceMappingURL=express-promise-router.js.map