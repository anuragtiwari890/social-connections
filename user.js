const db = require('./database');

const searchRecursionLevel = 2

const init = async () => {
  await db.run('CREATE TABLE Users (id INTEGER PRIMARY KEY AUTOINCREMENT, name varchar(32));');
  await db.run('CREATE TABLE Friends (id INTEGER PRIMARY KEY AUTOINCREMENT, userId int, friendId int);');
  await db.run('CREATE INDEX idx_friends_user_friend ON Friends (userId, friendId);');
  await db.run('CREATE INDEX idx_user_name ON Users (name);');
  
  const users = [];
  const names = ['foo', 'bar', 'baz'];
  for (i = 0; i < 27000; ++i) {
    let n = i;
    let name = '';
    for (j = 0; j < 3; ++j) {
      name += names[n % 3];
      n = Math.floor(n / 3);
      name += n % 10;
      n = Math.floor(n / 10);
    }
    users.push(name);
  }
  const friends = users.map(() => []);
  for (i = 0; i < friends.length; ++i) {
    const n = 10 + Math.floor(90 * Math.random());
    const list = [...Array(n)].map(() => Math.floor(friends.length * Math.random()));
    list.forEach((j) => {
      if (i === j) {
        return;
      }
      if (friends[i].indexOf(j) >= 0 || friends[j].indexOf(i) >= 0) {
        return;
      }
      friends[i].push(j);
      friends[j].push(i);
    });
  }

  console.log("Init Users Table...");
  await Promise.all(users.map((un) => db.run(`INSERT INTO Users (name) VALUES ('${un}');`)));
  console.log("Init Friends Table...");
  await Promise.all(friends.map((list, i) => {
      return Promise.all(list.map((j) => db.run(`INSERT INTO Friends (userId, friendId) VALUES (${i + 1}, ${j + 1});`)));
  }));
  console.log("Ready.");
}

const search = async (req, res) => {
  try {
    const query = req.params.query;
    const userId = parseInt(req.params.userId);
    const searchFriendQuery = `
      WITH RECURSIVE FriendLevels AS (
        SELECT
          f.userId,
          f.friendId,
          1 AS connection,
          1 AS level
        FROM Friends f
        WHERE f.userId = ${userId}
        
        UNION
        
        SELECT
          fl.userId,
          f.friendId,
          CASE
            WHEN fl.level = 1 THEN 2
            -- WHEN fl.level = 2 THEN 3   
            -- WHEN fl.level = 3 THEN 4
          END AS connection,
          fl.level + 1 AS level
        FROM FriendLevels fl
        JOIN Friends f ON fl.friendId = f.userId
        WHERE fl.level < ${searchRecursionLevel}  -- Limit the recursion to 4 levels
      )
      SELECT
        u.id,
        u.name,
        COALESCE(MIN(fl.connection), 0) AS connection
      FROM Users u
      LEFT JOIN FriendLevels fl ON u.id = fl.friendId
      WHERE u.name LIKE '${query}%'
      GROUP BY u.id, u.name
      LIMIT 20;
`
    console.time('searchQuery')
    const results = await db.all(searchFriendQuery);
    console.timeLog('searchQuery')
    console.timeEnd('searchQuery')
    res.statusCode = 200;
    res.json({
      success: true,
      users: results
    });
  } catch(err) {
    console.log(err)
    res.statusCode = 500;
    res.json({ success: false, error: err });
  };
}

const addFriend = async (req, res) => {
  try {
    const {userId, friendId} = req.params;
    if (userId === friendId) {
      throw new Error("user Id and friend Id should be different");
    }
    const [user, friend] = await Promise.all([userId, friendId].map(user => getUserById(user)));
    if (!user) {
      throw new Error("Invalid userId provided");
    } else if (!friend) {
      throw new Error("Invalid friendId provided");
    }
  
    const friendRelation = await getFriendsByUserIdAndFriendId(userId, friendId);
    if (!friendRelation || friendRelation.length > 0) {
      throw new Error("Provided userId and friendId are already friends")
    }
  
    const addFriendQuery  = `INSERT INTO Friends (userId, friendId) VALUES (${userId}, ${friendId});`;
  
    result = await db.run(addFriendQuery);
    res.statusCode = 200;
    res.json({
      success: true
    });
  
  } catch(err) {
    console.log(err);
    res.statusCode = 500;
    res.json({ success: false, error: (err || {}).message || err });
  }
}

const removeFriend = async (req, res) => {
  try {
    const {userId, friendId} = req.params;
    const [user, friend] = await Promise.all([userId, friendId].map(user => getUserById(user)));
    if (!user) {
      throw new Error("Invalid userId provided");
    } else if (!friend) {
      throw new Error("Invalid friendId provided");
    }
  
    const friendRelation = await getFriendsByUserIdAndFriendId(userId, friendId);
    if (!friendRelation || friendRelation.length === 0) {
      throw new Error("Provided userId and friendId are not friends")
    }
  
    const removeFriendQuery  = `Delete From Friends where userId = ${userId} and friendId = ${friendId};`;
  
    result = await db.run(removeFriendQuery);
    res.statusCode = 200;
    res.json({
      success: true
    });
  
  } catch(err) {
    console.log(err);
    res.statusCode = 500;
    res.json({ success: false, error: err });
  }
}

async function getFriendsByUserIdAndFriendId(userId, friendId) {
  const isFriend = `SELECT * from Friends where userId = ${userId} and friendId = ${friendId}`
  return await db.all(isFriend)
}

async function getUserById(userId) {
  if (isNaN(userId)) {
    throw new Error("User id should be number");
  }
  const findUserQuery = `SELECT * from Users where id = ${userId}`
  return await db.all(findUserQuery);
}


module.exports = {
  init,
  search,
  addFriend,
  removeFriend,
}