const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('any-db');
const conn = db.createConnection('sqlite3://chatroom.db', (err) => {
  if (err) console.error(err);
  else console.log('sqlite3 db connected');
});

conn.query('CREATE TABLE IF NOT EXISTS chatrooms(chat_id TEXT PRIMARY KEY);', function (err) {
  if (err) console.error(err);
  else {
    conn.query('CREATE TABLE IF NOT EXISTS messages(message TEXT, author TEXT, message_id INTEGER PRIMARY KEY, chat_id TEXT, FOREIGN KEY (chat_id) references chatrooms(chat_id));', function (err) {
      if (err) console.error(err);
    })
  }
});

const app = express();

// set the view engine to ejs
app.set('view engine', 'ejs')

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// static serving middleware for anything in public folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('home');
})

app.get('/:chat_id', (req, res) => {
  res.render('chatroom', {
    name: req.params.chat_id
  });
})

function generateRoomIdentifier() {
  // make a list of legal characters
  // we're intentionally excluding 0, O, I, and 1 for readability
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  var result = '';
  for (var i = 0; i < 6; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));

  return result;
}

function uniqId () {

  let id = generateRoomIdentifier();

  return new Promise(function(resolve, reject) {
    conn.query(`SELECT * FROM chatrooms WHERE chat_id="${id}"`, function (err, data) {
      if (err) {
        reject(err);
      } else if (data.rowCount) {
        uniqId()
        .then(finalId => {
          resolve(finalId);
        })
        .catch(err2 => {
          reject(err2);
        });
      } else {
        resolve(id);
      }
    })
  })

}

app.post('/create', (req, res) => {
  uniqId()
  .then(id => {
    conn.query(`INSERT INTO chatrooms VALUES("${id}");`, function (err, data) {
      if (err) console.error(err);
      res.json({
        room: id
      });
    })
  })
  .catch(err => {
    console.error(err);
    res.status(500).end();
  })

})

const server = app.listen(8080, () => {
  console.log('Server running on port 8080');
})

// Room ID to array of socket names
const rooms = {

}

const io = require('socket.io')(server);

io.on('connection', (socket) => {

  socket.on('join', (room, name) => {

    socket.join(room);
    // bind name to socket object
    socket.name = name;
    socket.room = room;

    // add socket to new room
    if (rooms[room]) {
      rooms[room].push(name);
    } else {
      rooms[room] = [name];
    }

    socket.emit('users', rooms[room]);

    conn.query(`SELECT message_id, message, author FROM messages WHERE chat_id="${room}" ORDER BY message_id;`, function (err, data) {
      if (err) {
        console.error(err);
      } else {
        socket.emit('messages', data.rows);
      }
    })

    socket.to(room).broadcast.emit('join', name);

  })

  socket.on('message', (data) => {

    conn.query('INSERT INTO messages VALUES($1, $2, NULL, $3)', [data.message, data.author, socket.room], (err) => {
      if (err) {
        console.error(err);
      } else {
        socket.to(socket.room).broadcast.emit('message', data);
      }
    })
  })

  socket.on('name-change', (oldName, newName) => {

    // change the name in the rooms list
    for (let i = 0; i < rooms[socket.room].length; i++ ) {

      if (rooms[socket.room][i] === oldName) {
        rooms[socket.room][i] = newName;
        break;
      }
    }

    socket.name = newName;

    socket.to(socket.room).broadcast.emit('name-change', oldName, newName);
  })

  socket.on('disconnect', () => {
    if (socket.room) {
      rooms[socket.room] = rooms[socket.room].filter(socketName => {
        return socketName !== socket.name;
      })
    }

    socket.to(socket.room).broadcast.emit('leave', socket.name);
  })

  socket.on('error', (err) => {
    console.error(err);
  })
})
