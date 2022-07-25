const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const socket = require('./config/socket');

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

const mongoUri = 'mongodb+srv://developer:c7FdftTKjPbVCVj@cluster0.scipv.mongodb.net/?retryWrites=true&w=majority';
mongoose.connect(mongoUri, {
    dbName: 'chatter',
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected with mongodb atlas Succesfully')
})

require('./models/User');
require("./config/passport");

const translateRoute = require('./routes/translate')

app.use(require("./routes"));
app.use('/api', translateRoute)



// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});


const port = process.env.PORT || 5000;
const server = app.listen(port, () => { console.log(`listening on *:${port}`); });
socket(server);

module.exports = app;