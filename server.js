import express from "express";
import { VoiceResponse } from "twilio";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Test GET
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Twilio voice webhook
app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Bonjour, cet appel est filtré.");
  
  res.type("text/xml");
  res.send(twiml.toString());
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server running on port " + port));
