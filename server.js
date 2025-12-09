import express from "express";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Route GET de test
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Route POST pour Twilio
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Bonjour, cet appel est filtré par l'intelligence artificielle.");

  res.type("text/xml");
  res.send(twiml.toString());
});

// Port Render
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
