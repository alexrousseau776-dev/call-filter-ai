import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { pipeline } from "@xenova/transformers";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

let classifier;

// Load model BEFORE starting server
async function loadModel() {
  console.log("Loading AI model...");
  classifier = await pipeline("text-classification");
  console.log("Model loaded.");
}

app.post("/call-filter", async (req, res) => {
  const transcript = req.body.SpeechResult || "";

  const result = await classifier(transcript);
  const label = result[0].label;

  const response = new twilio.twiml.VoiceResponse();

  if (label === "NEGATIVE") {
    response.say("Désolé, cet appel ne peut pas être transféré.");
    response.hangup();
  } else {
    response.say("Merci. L’appel sera transféré.");
    response.dial(process.env.FORWARD_NUMBER);
  }

  res.type("text/xml");
  res.send(response.toString());
});

// Start server AFTER model is loaded
loadModel().then(() => {
  app.listen(process.env.PORT || 3000, () => {
    console.log("Server running");
  });
});
