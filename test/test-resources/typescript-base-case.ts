/// <reference path="../../dist/express-promise-router.d.ts"/>
import * as express from 'express';
import promiseRouter from '../../dist/express-promise-router.js';
const router = promiseRouter();

router.get('/', function(req, res) {
    res.send('Hi!');
});

const app = express();
app.use(router);
app.listen(12345);
console.log('START');
