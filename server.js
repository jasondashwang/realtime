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

app.get('/:chat_id/messages', (req, res) => {
  conn.query(`SELECT message_id, message, author FROM messages WHERE chat_id="${req.params.chat_id}" ORDER BY message_id;`, function (err, data) {
    if (err) {
      console.error(err);
      res.status(500).end();
    } else {

      res.json({
        messages: data.rows
      });
    }
  })
})

app.post('/:chat_id/messages', (req, res) => {
  console.log(req.body.message)
  conn.query('INSERT INTO messages VALUES($1, $2, NULL, $3)', [req.body.message, req.body.author, req.params.chat_id], (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).end();
    } else {
      res.status(201).end();
    }
  })
});

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

app.listen(8080, () => {
  console.log('Server running on port 8080');
})
