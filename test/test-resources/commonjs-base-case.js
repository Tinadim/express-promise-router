const express = require('express');
const promiseRouter = require('../../dist/express-promise-router.js').default;
const router = promiseRouter();

router.get('/', function(req, res) {
    res.send('Hi!');
});

const app = express();
app.use(router);
app.listen(12345);
console.log('START');
