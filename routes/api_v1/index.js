const express = require("express");
const router = express.Router();

router.use("/user", require("./user"));
router.use("/chat", require("./chat"));

module.exports = router;
