const express = require('express')
const router = express.Router();

const { createTranslatedMessageText } = require('../controller/translate')

router.post('/createTranslatedMessageText/:id', createTranslatedMessageText)


module.exports = router