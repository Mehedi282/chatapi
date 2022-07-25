const axios = require('axios')
const User = require('../models/User')
const Message = require('../models/Message')

exports.createTranslatedMessageText = (req, res) => {
    User.findOne({ _id: req.params.id })
        .exec((error, user) => {
            if (error) {
                console.log(error)
            }

            if (user) {
                const code = user.languageCode

                const { messagetext } = req.body

                const options = {
                    method: 'GET',
                    url: 'https://nlp-translation.p.rapidapi.com/v1/translate',
                    params: { text: messagetext, to: code, from: 'en' },
                    headers: {
                        'X-RapidAPI-Key': 'aedd2d7807msh18fd21347cb9891p15e38fjsn089627126412',
                        'X-RapidAPI-Host': 'nlp-translation.p.rapidapi.com'
                    }
                };

                axios.request(options).then(function(response) {
                    console.log(response.data);

                    const translatedTextMessage = response.data.translated_text

                    const newtext = new Message({
                        text: translatedTextMessage
                    })
                    newtext.save
                })





            }
        })
};