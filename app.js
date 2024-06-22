const express = require('express');
const session = require('express-session');
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
      
      // Prepare the update operation
      let updateOperation = {
        $setOnInsert: {
          user_id: BigInt(profile.id),
          currency: 'USD',  // Default currency, change as needed
          cooldown: 0,      // Default cooldown, change as needed
          value_history: []  // Initialize with empty array
        }
      };

      // Only set steam_id if a Steam connection is found
      if (steamConnection) {
        updateOperation.$set = {
          steam_id: BigInt(steamConnection.id)
        };
      }

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
app.get('/', (req, res) => {
  res.send('Welcome to Discord Steam Auth');
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/profile');
  }
);

app.get('/profile', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.redirect('/auth/discord');
  }
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});