// server.js (Call Filter Advanced - version à coller telle quelle)
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import Twilio from "twilio";
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());

const {
  OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  FORWARD_NUMBER,
  NOTIFY_PHONE
} = process.env;

const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
  ? Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

async function callOpenAIClassify(transcript, context = "") {
  const prompt = `
Vous êtes un classifieur d'urgence et agent de clarification (français). Répondez STRICTEMENT en JSON:
{ "label":"urgent"|"non-urgent"|"clarify", "confidence":0.00-1.00, "reason":"...", "clarifyQuestion":"..." }
Texte: "${transcript}"
Contexte: "${context}"
`;
  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: "Assistant: classification d'urgence (FR)." },
               { role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.0
  };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  try {
    const jsonStart = text.indexOf("{");
    const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("OpenAI parse error:", e, "raw:", text);
    const low = transcript.toLowerCase();
    const urgentKeys = ["urgence","blessé","incendie","police","ambulance","mort","danger"];
    for (const k of urgentKeys) if (low.includes(k)) return { label: "urgent", confidence: 0.9, reason: `keyword:${k}` };
    return { label: "non-urgent", confidence: 0.6, reason: "fallback" };
  }
}

async function sendSms(to, body) {
  if (!twilioClient) return false;
  try {
    await twilioClient.messages.create({ to, from: TWILIO_PHONE_NUMBER, body });
    return true;
  } catch (e) {
    console.error("Twilio SMS error", e);
    return false;
  }
}

/* Twilio webhook flow */

// 1) A CALL COMES IN -> /answer
app.post("/answer", (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: "/process_gather",
    method: "POST",
    speechTimeout: "auto"
  });
  gather.say({ voice: "alice", language: "fr-FR" }, "Bonjour. Expliquez en une phrase la raison de votre appel.");
  twiml.say("Nous n'avons pas reçu votre message. Au revoir.");
  res.type("text/xml");
  res.send(twiml.toString());
});

// 2) Process initial gather -> classify, maybe clarify, transfer, or record
app.post("/process_gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  const from = req.body.From || "";
  console.log("Process gather transcript:", transcript, "from:", from);

  const classification = await callOpenAIClassify(transcript, `from:${from}`);
  const label = classification.label || "non-urgent";

  const twiml = new Twilio.twiml.VoiceResponse();

  if (label === "clarify") {
    const question = classification.clarifyQuestion || "Pouvez-vous préciser s'il vous plaît ?";
    const gather = twiml.gather({
      input: "speech",
      action: "/process_clarify",
      method: "POST",
      speechTimeout: "auto"
    });
    gather.say({ voice: "alice", language: "fr-FR" }, question);
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  if (label === "urgent" && classification.confidence >= 0.65) {
    twiml.say({ voice: "alice", language: "fr-FR" }, "Cet appel semble urgent. Je vous transfère maintenant.");
    twiml.dial({}, FORWARD_NUMBER);
    if (NOTIFY_PHONE) sendSms(NOTIFY_PHONE, `Appel urgent de ${from}. Transcript: ${transcript}`).catch(()=>{});
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // non-urgent: record voicemail
  twiml.say({ voice: "alice", language: "fr-FR" }, "Ce n'est pas considéré comme urgent. Laissez votre message après le bip.");
  twiml.record({ action: "/voicemail_saved", maxLength: 120, playBeep: true });
  twiml.hangup();
  if (NOTIFY_PHONE) sendSms(NOTIFY_PHONE, `Message non-urgent de ${from}. Transcript: ${transcript}`).catch(()=>{});
  res.type("text/xml");
  return res.send(twiml.toString());
});

// 3) After clarification
app.post("/process_clarify", async (req, res) => {
  const answer = req.body.SpeechResult || "";
  const from = req.body.From || "";
  console.log("Clarify answer:", answer, "from:", from);
  const classification = await callOpenAIClassify(answer, `from:${from}`);
  const twiml = new Twilio.twiml.VoiceResponse();

  if (classification.label === "urgent") {
    twiml.say({ voice: "alice", language: "fr-FR" }, "Merci. Je vous transfère maintenant.");
    twiml.dial({}, FORWARD_NUMBER);
    if (NOTIFY_PHONE) sendSms(NOTIFY_PHONE, `Appel urgent (après clarification) de ${from}.`).catch(()=>{});
  } else {
    twiml.say({ voice: "alice", language: "fr-FR" }, "Ce n'est pas urgent. Laissez votre message après le bip.");
    twiml.record({ action: "/voicemail_saved", maxLength: 120, playBeep: true });
    twiml.hangup();
    if (NOTIFY_PHONE) sendSms(NOTIFY_PHONE, `Message non-urgent (après clarification) de ${from}.`).catch(()=>{});
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// 4) Voicemail saved callback
app.post("/voicemail_saved", (req, res) => {
  const recordingUrl = req.body.RecordingUrl || "";
  const from = req.body.From || "";
  console.log("Voicemail saved", from, recordingUrl);
  if (NOTIFY_PHONE) sendSms(NOTIFY_PHONE, `Nouveau message vocal de ${from}. Écouter: ${recordingUrl}`).catch(()=>{});
  res.sendStatus(204);
});

// 5) Endpoint pour agent OpenAI
app.post("/analyze", async (req, res) => {
  const { transcript, phoneNumber, context } = req.body || {};
  if (!transcript) return res.status(400).json({ error: "transcript required" });
  const classification = await callOpenAIClassify(transcript, context || `from:${phoneNumber || "unknown"}`);
  return res.json({
    spamScore: classification.confidence || 0,
    label: classification.label || "non-urgent",
    reason: classification.reason || "",
    clarifyQuestion: classification.clarifyQuestion || null
  });
});

app.get("/", (req, res) => res.send("Call Filter Advanced running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
