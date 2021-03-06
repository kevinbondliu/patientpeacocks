var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var passport = require('passport');
var models = require('./models');
var LocalStrategy = require('passport-local').Strategy;
var auth = require('passport-local-authenticate');
var db = require('./database');
var bcrypt = require('bcrypt');
var app = express();
var rp = require('request-promise');



app.set('views', `${__dirname}/views`);
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(__dirname + '/../react-client/dist'));

var database = {
  username: 'david',
  password: 'sucks'
};

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

passport.use(new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password',
  session: false
},
  function (username, password, done) {
    console.log(username, password);
    if (username === database.username) {
      return done(null, database);
    }
  }
));

app.get('/', function (req, res) {
  res.sendStatus(200);
})

app.get('/register', function (req, res) {
  res.render('register');
})

app.post('/register', function (req, res) {
  var salt = bcrypt.genSaltSync(10);
  var hash = bcrypt.hashSync(req.body.password, salt);

  db.query(`select * from users where name = '${req.body.name}'`).
    then((users) => {
      console.log('this is the user', users);
      if (users.length) {
        res.end('User already exists!');
      } else {
        db.query(`INSERT INTO users (name, password, salt) VALUES ('${req.body.name}', '${hash}', '${salt}')`).
          then((users) => {
            res.end();
            //where we will pass the token back inside res.end
          })
          .catch(error => {
            res.end(JSON.stringify(error));
          })
      }
    })
    .catch(error => {
      console.log(error);
      res.end();
    });
});

app.get('/', function (req, res) {
  res.sendStatus(200);
});

app.post('/login', function (req, res) {

  // console.log(hash);
  db.query(`select salt from users where name = '${req.body.name}'`)
    .then((saltlogin) => {
      var hashlogin = bcrypt.hashSync(req.body.password, saltlogin);
      db.query(`select * from users where name = '${req.body.name}'`).
        then((user) => {
          if (user) {
            if (user[0].password === hashlogin) {
              res.write(req.body);
              res.end('successful login');
            }
          } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'user doesn\'t exist or password is incorrect' }));
          }
        })
    })
})

app.get('/login', function (req, res) {
  res.render('login');
})


/*
verifies password: this will return a boolean (true if pswd matches)
auth.hash('password', function (err, hashed) {
  auth.verify('password', hashed, function(err, verified) {
    console.log(verified);
  })
})
*/
// passport.authenticate('local', {
//                                 successRedirect: '/',
//                                 failureRedirect: '/login',
//                                 failureFlash: 'Invalid username or password.',
//                                 successFlash: 'Welcome!' })
// );


app.post('/eventful', function (req, res) {
  // var data = JSON.parse(req.body);
  console.log(req.body);
  var loc = req.body.location;
  var topic = req.body.topic;
  var returnData;
  var eventfulOptions = {
    method: 'GET',
    url: 'http://api.eventful.com/json/events/search',
    qs: { app_key: 'CwcF9Lt3qkKh4gWB', l: loc, c: topic },
    headers:
    { date: 'future' }
  };

  rp(eventfulOptions).then(function (data) {
    var eventData;
    if (data) {
      eventData = JSON.parse(data).events.event.map((singleEvent) => {
        var item = {
          name: singleEvent.title,
          time: singleEvent.start_time,
          category: topic,
          url: singleEvent.url,
          image: singleEvent.image,
          description: singleEvent.description,
          location: singleEvent.venue_address,
          lat: singleEvent.lat,
          lon: singleEvent.lon
        };
        return item;
      })
    }
    eventData = JSON.stringify(eventData);
    returnData += eventData.substring(0, eventData.length - 1);
    res.write(eventData.substring(0, eventData.length - 1));
    return;
  }).then(() => {
    var meetupCategories =
      {
        // meetup searches catagories by numbers
        // it is weird but functional
        music: 21,
        food: 10,
        art: 1,
        books: 18,
        animals: 26,
      }

    var meetupOptions = {
      method: 'GET',
      url: 'https://api.meetup.com//find/groups',
      qs:
      {
        sign: 'true',
        key: '2771396637a6981749467c7663e19',
        category: meetupCategories[topic]
      }
    }

    rp(meetupOptions).then(function (data) {
      if (data) {
        var eventData = JSON.parse(data).map((singleEvent) => {
          var checkTime;
          if (singleEvent.next_event) {
            checkTime = singleEvent.next_event.time;
          }
          var item = {
            name: singleEvent.name,
            time: checkTime,
            category: topic,
            url: singleEvent.link,
            image: singleEvent.image,
            description: singleEvent.description,
            location: singleEvent.city + ', ' + singleEvent.state,
            lat: singleEvent.latitude,
            long: singleEvent.longitude
          };
          return item;
        })
      }
      eventData = JSON.stringify(eventData);
      returnData += ',' + eventData.substring(1, eventData.length);
      res.write(',' + eventData.substring(1, eventData.length));
      res.end();
    })
  })
});

app.post('/save', function (req, res) {
  var data = req.body;
  var event = data.event;
  var username = data.username;
  console.log('USERNAME', username, 'Event', event);
  db.query(`INSERT INTO events (name, dateAndTime, category, url, description, location) VALUES ('${event.name}', '${event.time}', '${event.category}', '${event.url}', '${event.description}', '${event.location}')`)
    .then(() => {
      db.query(`INSERT INTO users_events (userId, eventId) VALUES ( (SELECT id from users WHERE name = '${username}') , (SELECT id from events WHERE name = '${event.name}') )`)
    }).catch(function (err) {
      console.log(err);
    })
});

app.post('/savedEvents', function (req, res) {
  var username = req.body.username;
  console.log(username);
  db.query(`SELECT e.name, e.dateAndTime, e.category, e.description, e.location from events e INNER JOIN users_events ue ON e.id = ue.eventId INNER JOIN users u ON u.id = ue.userId where u.name = '${username}'`)
    .then(function (events) {
      res.write(JSON.stringify(events));
      res.end();
    });

})

var port = process.env.PORT || 3000;

app.listen(port, function () {
  console.log('listening on port !' + port);
});

