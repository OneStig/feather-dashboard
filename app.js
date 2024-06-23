const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();

// MongoDB setup
let db;
MongoClient.connect(process.env.MONGODB_URI, { useUnifiedTopology: true })
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db('botchicken');
  })
  .catch(error => console.error('MongoDB connection error:', error));

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify', 'connections']
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const steamConnection = profile.connections.find(conn => conn.type === 'steam');
    
    if (!steamConnection) {
      // No Steam account linked
      return done(null, { error: 'no_steam_account' });
    }

    // Prepare the update operation
    let updateOperation = {
      $set: {
        user_id: BigInt(profile.id),
        steam_id: BigInt(steamConnection.id),
      },
      $setOnInsert: {
        value_history: []  // Initialize with empty array only on insert
      }
    };

    // Perform the update operation
    const result = await db.collection('users').updateOne(
      { user_id: BigInt(profile.id) },
      updateOperation,
      { upsert: true }
    );

    // Fetch the updated/inserted user
    const user = await db.collection('users').findOne({ user_id: BigInt(profile.id) });

    done(null, user);
  } catch (error) {
    done(error);
  }
}
));

// Middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


// Routes
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  });
  
  app.get('/auth/discord', passport.authenticate('discord'));
  
  app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/auth-failure' }),
    (req, res) => {
      if (req.user.error === 'no_steam_account') {
        return res.redirect('/no-steam-account');
      }
      res.redirect('/auth-success');
    }
  );
  
  app.get('/auth-success', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'auth-success.html'));
  });
  
  app.get('/auth-failure', (req, res) => {
    res.status(400).sendFile(path.join(__dirname, 'views', 'auth-failure.html'));
  });
  
  app.get('/logout', (req, res) => {
    req.logout((err) => {
      if (err) { return next(err); }
      res.redirect('/');
    });
  });

  app.get('/no-steam-account', (req, res) => {
    res.status(400).sendFile(path.join(__dirname, 'views', 'no-steam-account.html'));
  });

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});