const express = require("express");
const { VoiceResponse } = require("twilio").twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Route GET "/" -> juste pour tester si ça marche
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Route POST "/voice" pour Twilio
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Bonjour, cet appel est filtré par l’intelligence artificielle d’Alexandre.");
  res.type("text/xml");
  res.send(twiml.toString());
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server running on port " + port));
