const router = require('express').Router();
const User = require('../../models/User');
const auth = require('../auth');
const { ErrorHandler } = require('../../config/error');
const { getNotNullFields } = require('../../utils');
const { upload, getImageName } = require('../../config/storage');
const s3 = require('../../config/s3');
const qr = require('qrcode');

const profileFields = { contacts: 0, blocked: 0, blockedFrom: 0, password: 0 };

const create = async(req, res, next) => {
    try {
        const { name, phone, email, password, languageCode } = req.body;
        const missingFields = [];
        if (!name) missingFields.push('Name');
        if (!password) missingFields.push('Password');

        if (missingFields.length > 0)
            return new ErrorHandler(400, "Missing fields: " + missingFields.toString(), missingFields, res);

        const type = phone ? 'phone' : 'email';
        const query = type === 'phone' ? { phone } : { email };
        const alreadyHave = await User.findOne({...query });
        if (alreadyHave)
            return new ErrorHandler(409, `This ${type} already taken. Please try with a different ${type}`, [], res);

        const user = {...query, name, password, languageCode };
        const finalUser = new User(user);
        finalUser.setPassword(user.password);

        return finalUser
            .save()
            .then(async data => {
                const userWithToken = {...data.toJSON() };
                delete userWithToken['password'];
                userWithToken.token = finalUser.generateJWT();
                return res.status(200).json(userWithToken);
            })
            .catch(async e => {
                return new ErrorHandler(400, "An error occurred during user creation, please try again later.", [], res);
            });
    } catch (e) {
        next(e);
    }
};

const login = async(req, res, next) => {
    try {
        const { email, phone, password } = req.body;
        if ((phone || email) && password) {
            const query = email ? { email } : { phone };
            const user = await User.findOne(query);
            if (!user || !user.validatePassword(password)) return new ErrorHandler(400, (email ? 'email' : 'phone') + " or password is invalid", [], res);
            const finalData = { token: await user.generateJWT(), ...user.toJSON() };
            delete finalData['password'];
            res.status(200).json(finalData);
        } else
            new ErrorHandler(404, "Missing required fields", [], res);
    } catch (e) {
        next(e);
    }
};

const search = async(req, res, next) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(404).send("query is required");
        const user = await User.findOne({ _id: req.payload.id }, { blocked: 1, blockedFrom: 1 });
        const query = { $regex: q, $options: 'i' };
        const data = await User.find({
                $or: [{ name: query }, { phone: query }, { email: query }],
                _id: { $nin: [...user.blocked, ...user.blockedFrom, req.payload.id] }
            },
            profileFields
        );
        res.json(data);
    } catch (e) {
        next(e);
    }
};

const get = async(req, res, next) => {
    try {
        const data = await User.findOne({ _id: req.params.id }, profileFields);
        res.json(data);
    } catch (e) {
        next(e);
    }
};

const getProfile = async(req, res, next) => {
    try {
        const data = await User.findOne({ _id: req.payload.id }, { password: 0 })
            .populate({ path: 'contacts', select: 'name , avatar , phone , email' })
            .populate({ path: 'blocked', select: 'name , avatar' })
            .populate({ path: 'blockedFrom', select: 'name , avatar' });
        res.json(data);
    } catch (e) {
        next(e);
    }
};

const update = async(req, res, next) => {
    try {
        const { name, phone, email } = req.body;
        const data = await User.findOneAndUpdate({ _id: req.payload.id }, { $set: {...getNotNullFields({ name, phone, email }) } }, { new: true }, ).select({ password: 0 });
        res.json(data);
    } catch (e) {
        next(e);
    }
};

const updateAvatar = async(req, res, next) => {
    try {
        const uploaded = await s3.upload(req.file, 'user', getImageName(req.file, req.payload.id));
        await User.updateOne({ _id: req.payload.id }, { $set: { avatar: uploaded.key } });
        res.status(200).json({ path: uploaded.key });
    } catch (e) {
        next(e);
    }
};

const block = async(req, res, next) => {
    try {
        await User.updateOne({ _id: req.params.user }, { $addToSet: { blockedFrom: req.payload.id }, $pull: { contacts: req.payload.id } });
        await User.updateOne({ _id: req.payload.id }, { $addToSet: { blocked: req.params.user }, $pull: { contacts: req.params.user } });
        res.status(200).json({ updated: true });
    } catch (e) {
        next(e);
    }
};

const unblock = async(req, res, next) => {
    try {
        await User.updateOne({ _id: req.params.user }, { $pull: { blockedFrom: req.payload.id } });
        await User.updateOne({ _id: req.payload.id }, { $pull: { blocked: req.params.user } });
        res.status(200).json({ updated: true });
    } catch (e) {
        next(e);
    }
};

const generateQr = async(req, res, next) => {
    try {
        qr.toDataURL(req.body.secret, (err, src) => {
            res.status(200).json({ src });
        });
    } catch (e) {
        next(e);
    }
};

const addDevice = async(req, res, next) => {
    try {
        await User.updateOne({ _id: req.payload.id }, { $push: { devices: req.body.device } });
        res.send('ok')
    } catch (e) {
        next(e);
    }
};

const remove = async(req, res, next) => {
    try {
        await User.deleteOne({ _id: req.payload.id });
        res.json({ ok: 1 });
    } catch (e) {
        next(e);
    }
};

router.post("/createUser", create);
router.post("/login", login);
router.post("/qr", generateQr);
router.put("/device", auth.required, addDevice);
router.get("/", auth.required, getProfile);
router.get("/search", auth.required, search);
router.get("/:id", auth.required, get);
router.put("/", auth.required, update);
router.put("/avatar", [auth.required, upload.single('avatar')], updateAvatar);
router.put("/block/:user", auth.required, block);
router.put("/unblock/:user", auth.required, unblock);
router.delete("/:id", auth.required, remove);

module.exports = router;