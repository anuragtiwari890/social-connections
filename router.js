const express = require('express');

const user = require('./user');

const router = express.Router();

router.get('/friend/:userId/:friendId', user.addFriend);
router.get('/unfriend/:userId/:friendId', user.removeFriend);
router.get('/search/:userId/:query', user.search);

module.exports = router;