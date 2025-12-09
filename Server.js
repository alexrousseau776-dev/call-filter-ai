import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import { pipeline } from "@xenova/transformers";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: false }));

// Load the AI model
const classifier = await pipeline("text-classification", "Xenova/distilbert-base-uncased-finetuned-sst-2-english");

// Twilio webhook
app.post("/call-filter", async (req, res) => {
  const transcript = req.body.SpeechResult || "";

  const result = await classifier(transcript);
  const label = result[0].label;

  let response = new twilio.twiml.VoiceResponse();

  if (label === "NEGATIVE") {
    response.say("Désolé, cet appel ne peut pas être complété.");
    response.hangup();
  } else {
    response.say("Merci. L’appel sera transféré.");
    response.dial(process.env.FORWARD_NUMBER);
  }

  res.type("text/xml");
  res.send(response.toString());
});

// Port for Render.com
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
