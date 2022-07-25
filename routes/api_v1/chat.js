const router = require('express').Router();
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const User = require('../../models/User');
const auth = require('../auth');
const {ErrorHandler} = require('../../config/error');
const {upload, getImageName} = require('../../config/storage');
const s3 = require('../../config/s3');
const {sendNotification} = require('../../config/notification');

const getConversations = async (req, res, next) => {
  try {
    let allConversations = [];
    const conversations = await Conversation.find({users: req.payload.id}).populate({path: "users", select: "name , avatar"});
    if (!conversations.length)
      return res.send({data: []});
    for (let conversation of conversations) {
      const messages = await Message.find({'conversationId': conversation._id}).sort('-createdAt').limit(10).populate({path: "user", select: "name , avatar"});
      allConversations.push({...conversation.toJSON(), message: messages[0], unseenMessageLength: messages.filter(m => !m.seenBy?.includes(req.payload.id)).length});
      if (allConversations.length === conversations.length)
        return res.send({data: allConversations});
    }
  } catch (e) {
    next(e);
  }
};

const getConversation = async (req, res, next) => {
  try {
    const {page = 0} = req.query;
    const conversation = await Conversation.findOne({_id: req.params.id}).populate({path: 'users', select: 'name , avatar'});
    if (!conversation) return new ErrorHandler(404, "Conversation not found", [], res);
    const messages = await Message.find({conversationId: req.params.id}).sort('-createdAt').populate({path: 'user', select: 'name , avatar'})
      .skip(20 * page).limit(20);
    res.status(200).json({...conversation.toJSON(), messages});
  } catch (e) {
    next(e);
  }
};

const getConversationMessages = async (req, res, next) => {
  try {
    const {page = 0} = req.query;
    const messages = await Message.find({conversationId: req.params.id}).sort('-createdAt').populate({path: 'user', select: 'name , avatar'})
      .skip(20 * page).limit(20);
    res.status(200).json({messages});
  } catch (e) {
    next(e);
  }
};

const createConversation = async (req, res, next) => {
  try {
    const conversation = new Conversation({users: [req.payload.id, req.params.recipient]});
    conversation.save(async (err, newConversation) => {
      if (err)
        return new ErrorHandler(404, "Failed to create conversation", [], res);
      const con = await Conversation.populate(newConversation, {path:"users", select: 'name , avatar'});
      await User.updateOne({_id: req.payload.id}, {$addToSet: {contacts: req.params.recipient}});
      await User.updateOne({_id: req.params.recipient}, {$addToSet: {contacts: req.payload.id}});
      res.status(200).json(con);
    });
  } catch (e) {
    next(e);
  }
};

const createGroup = async (req, res, next) => {
  try {
    const {participants, name} = req.body;
    const conversation = new Conversation({name, isGroup: true, admin: req.payload.id, users: [req.payload.id, ...participants]});
    conversation.save(async (err, newConversation) => {
      if (err) return new ErrorHandler(404, "Failed to create conversation", [], res);
      const group = await Conversation.populate(newConversation, {path:"users", select: 'name , avatar'});
      res.status(200).json(group);
    });
  } catch (e) {
    next(e);
  }
};

const conversationExist = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({$or: [{users: [req.payload.id, req.params.recipient]}, {users: [req.params.recipient, req.payload.id]}], isGroup: {$ne: true}}, {_id: 1});
    if (conversation)
      res.send({isExist: true, conversationId: conversation._id});
    else
      res.send({isExist: false});
  } catch (e) {
    next(e);
  }
};

const reply = async (req, res, next) => {
  try {
    const {messageData} = req.body;
    const reply = new Message({conversationId: req.params.conversation, user: req.payload.id, createdAt: new Date(), ...messageData});
    reply.save(async function (err, reply) {
      if (err) return new ErrorHandler(404, "Conversation not found", [], res);
      else {
        const msg = await Message.populate(reply, {path:"user", select: 'name , avatar'});
        const text = messageData.video ? 'Video' : messageData.image ? 'image' : messageData.audio ? 'Sound' : messageData.location ? 'Location' : messageData.text;
        const conversation = await Conversation.findOne({_id: req.params.conversation}, {users: 1, mutedBy: 1});
        const recipients = conversation.users.map(u => u._id.toString()).filter(id => id !== req.payload.id && !conversation.mutedBy.includes(id));
        if (!!recipients.length) await sendNotification(text, recipients, {conversationId: req.params.conversation});
        res.status(200).json({message: {...msg.toJSON()}, name: msg.user.name});
      }
    });
  } catch (e) {
    next(e);
  }
};

const uploadMessageFile = async (req, res, next) => {
  try {
    const uploaded = await s3.upload(req.file, 'chat', getImageName(req.file));
    res.status(200).json({path: uploaded.key});
  } catch (e) {
    next(e);
  }
};

const setSeenMessages = async (req, res, next) => {
  try {
    await Message.updateMany({_id: {$in: req.body.messageIds}}, {$push: {seenBy: req.payload.id}});
    res.status(200).json({updated: true});
  } catch (e) {
    next(e);
  }
};

const removeGroupUser = async (req, res, next) => {
  try {
    await Conversation.updateOne({_id: req.params.conversation}, {$pull: {users: req.params.user}});
    res.status(200).json({updated: true});
  } catch (e) {
    next(e);
  }
};

const addGroupParticipant = async (req, res, next) => {
  try {
    await Conversation.updateOne({_id: req.params.conversation}, {$push: {users: req.body.participants}});
    res.status(200).json({updated: true});
  } catch (e) {
    next(e);
  }
};

const updateGroupImage = async (req, res, next) => {
  try {
    const uploaded = await s3.upload(req.file, 'chat', getImageName(req.file, req.params.conversation));
    await Conversation.updateOne({_id: req.params.conversation}, {$set: {image: uploaded.key}});
    res.status(200).json({path: uploaded.key});
  } catch (e) {
    next(e);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    await Conversation.updateOne({_id: req.params.conversation}, {$set: {name: req.body.name}});
    res.status(200).json({updated: true});
  } catch (e) {
    next(e);
  }
};

const groupExit = async (req, res, next) => {
  try {
    await Conversation.updateOne({_id: req.params.conversation}, {$pull: {users: req.payload.id}});
    res.status(200).json({updated: true});
  } catch (e) {
    next(e);
  }
};

const getMedia = async (req, res, next) => {
  try {
    const filter = {conversationId: req.params.conversation, image: {$exists: true, $ne: null}};
    const data = await Message.find(filter, {image: 1});
    res.status(200).json({data});
  } catch (e) {
    next(e);
  }
};

const muteUnmute = async (req, res, next) => {
  try {
    const {isMuted} = req.body;
    await Conversation.updateOne({_id: req.params.conversation}, {[isMuted ? '$pull' : '$push']: {mutedBy: req.payload.id}});
    res.status(200).json({updated: true});
  } catch (e) {
    next(e);
  }
};

const deleteConversation = async (req, res, next) => {
  try {
    await Conversation.deleteOne({_id: req.params.conversation});
    await Message.deleteMany({conversationId: req.params.conversation});
    res.status(200).json({deleted: true});
  } catch (e) {
    next(e);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    await Message.deleteOne({_id: req.params.message});
    res.status(200).json({deleted: true});
  } catch (e) {
    next(e);
  }
};

router.get("/conversation", auth.required, getConversations);
router.get("/conversation/:id", auth.required, getConversation);
router.get("/conversation/:id/messages", auth.required, getConversationMessages);
router.post("/conversation/:recipient", auth.required, createConversation);
router.post("/group-conversation/", auth.required, createGroup);
router.get("/conversation-exist/:recipient", auth.required, conversationExist);
router.post("/conversation/reply/:conversation", auth.required, reply);
router.put("/conversation/set-seen-messages", auth.required, setSeenMessages);
router.put("/conversation/group/:conversation/exit", auth.required, groupExit);
router.put("/conversation/group/:conversation/participant", auth.required, addGroupParticipant);
router.put("/conversation/group/:conversation/image", [auth.required, upload.single('image')], updateGroupImage);
router.put("/conversation/group/:conversation", auth.required, updateGroup);
router.put("/conversation/group/:conversation/remove/:user", auth.required, removeGroupUser);
router.put("/conversation/:conversation/muteUnmute", auth.required, muteUnmute);
router.post("/file", [auth.required, upload.single('file')], uploadMessageFile);
router.get("/:conversation/media", auth.required, getMedia);
router.delete("/conversation/:conversation", auth.required, deleteConversation);
router.delete("/conversation/message/:message", auth.required, deleteMessage);

module.exports = router;
