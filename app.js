require('dotenv').config();
const express = require("express");
const ejs = require('ejs');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LocalStrategy = require('passport-local').Strategy;
const findOrCreate = require("mongoose-findorcreate");
const upload = require("express-fileupload");
let currentUser = "";

const app = express();

app.use(upload());
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}))

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect('mongodb://localhost:27017/clientDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.set("useCreateIndex", true)

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  googleId: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/notehome",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      googleId: profile.id
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new LocalStrategy((username, password, done) => {
  User.findOne({
    username: username
  }, (err, user) => {
    if (err) {
      return done(err);
    }
    if (!user) {
      return done(null, false, {
        message: 'Incorrect username'
      });
    }
    if (!user.authenticate(password)) {
      return done(null, false, {
        message: 'Incorrect Password'
      });
    }
    return done(null, user);
  })
}));

const noteSchema = new mongoose.Schema({
  userID: String,
  title: String,
  content: String
})

const Note = new mongoose.model("Note", noteSchema);

app.get("/", (req, res) => {
  res.render("home");
})

app.get("/auth/google",
  passport.authenticate("google", {
    scope: ['profile']
  })
);

app.get('/auth/google/notehome',
  passport.authenticate('google', {
    failureRedirect: '/login'
  }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/notehome');
  });

app.get("/login", (req, res) => {
  res.render("login");
})

app.get("/signup", (req, res) => {
  res.render("signup");
})

app.get("/notehome", (req, res) => {
  if (req.isAuthenticated) {
    Note.find({
      userID: req.user._id
    }, (err, foundUser) => {
      res.render("notehome", {
        foundUsers: foundUser
      });
    })
    currentUser = req.user;
  } else {
    res.redirect("/login");
  }
})

app.get("/compose", (req, res) => {
  if (req.isAuthenticated) {
    res.render("compose");
  } else {
    res.redirect("/login");
  }
})

app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
})

app.get("/fullnote", (req, res) => {
  if (req.isAuthenticated) {
    res.render("fullnote")
  } else {
    res.redirect("/login");
  }
})

app.get("/fullnote/:postid", (req, res) => {
  if (req.isAuthenticated) {
    const reqId = req.params.postid;

    Note.findOne({
      _id: reqId
    }, (err, post) => {
      if (err) {
        console.log(err);
      } else {
        res.render("fullnote", {
          title: post.title,
          content: post.content
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/delete/:postid", (req,res) => {
  if(req.isAuthenticated){
    const reqId = req.params.postid;
    Note.deleteOne({_id: reqId}, (err) => {
      if(err){
        console.log(err);
      }
    })
    res.redirect("/notehome")
  } else {
    res.redirect("/login");
  }
})

app.post("/signup", (req, res) => {
  User.register({
    username: req.body.username
  }, req.body.password, (err, user) => {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      passport.authenticate("local")(req, res, () => {
        res.redirect("notehome");
      })
    }
  })
})

app.post("/login", (req, res) => {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, (err) => {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, () => {
        res.redirect("/notehome");
      })
    }
  })
})

app.post("/compose", (req, res) => {
  const title = req.body.title;
  const content = req.body.content;
  const note = new Note({
    userID: currentUser._id,
    title: title,
    content: content
  })
  note.save();
  res.redirect("/notehome");
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
})
